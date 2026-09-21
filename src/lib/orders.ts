// 주문 · 배송 · 설치 (PRD §4 배송 및 설치 추적 P0 + P1).
//
// 이 모듈의 핵심은 **상태머신**이다. 계획 §4 가 "불가능한 전이 차단"을 명시했고,
// 그중에서도 '배송 완료 전 설치 완료' 는 서버에서 반드시 거부해야 한다.
// 화면에서 버튼을 숨기는 것으로는 부족하다 — 전이 판정은 전부 여기 한 곳에 모은다.

import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { AuthContext } from "./auth";
import { scopeToStore } from "./auth";
import { prisma } from "./prisma";
import type { DeliveryStatus, InstallStatus, OrderStatus } from "./enums";

// ------------------------------------------------------------------ 상태머신

/**
 * 배송 전이표. 앞으로만 간다 — 뒤로 가려면 `rescheduleDeliveryAction`(이력 기록)을 쓴다.
 * SCHEDULED 에서 IN_TRANSIT 로 건너뛰는 것은 허용한다 (준비 단계를 별도로 찍지 않는 매장).
 */
export const DELIVERY_TRANSITIONS: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  SCHEDULED: ["PREPARING", "IN_TRANSIT", "FAILED", "CANCELLED"],
  PREPARING: ["IN_TRANSIT", "FAILED", "CANCELLED"],
  IN_TRANSIT: ["DELIVERED", "FAILED", "CANCELLED"],
  DELIVERED: [],
  FAILED: [],
  CANCELLED: [],
};

/** 설치 전이표. COMPLETED 는 배송 완료 여부를 **추가로** 확인한다 (canCompleteInstall). */
export const INSTALL_TRANSITIONS: Record<InstallStatus, readonly InstallStatus[]> = {
  SCHEDULED: ["ASSIGNED", "IN_PROGRESS", "FAILED", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "FAILED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export const DELIVERY_TERMINAL: readonly DeliveryStatus[] = ["DELIVERED", "FAILED", "CANCELLED"];
export const INSTALL_TERMINAL: readonly InstallStatus[] = ["COMPLETED", "FAILED", "CANCELLED"];

export function canTransitionDelivery(from: string, to: string): boolean {
  const allowed = DELIVERY_TRANSITIONS[from as DeliveryStatus];
  return allowed != null && (allowed as readonly string[]).includes(to);
}

export function canTransitionInstall(from: string, to: string): boolean {
  const allowed = INSTALL_TRANSITIONS[from as InstallStatus];
  return allowed != null && (allowed as readonly string[]).includes(to);
}

export interface TransitionRejection {
  reason: string;
}

/**
 * 설치 완료의 선행 조건: **대응하는 배송이 이미 완료되어 있어야 한다.**
 *
 * 대응 관계는 두 가지다 — 설치 작업이 특정 배송 작업을 가리키거나(`deliveryJobId`),
 * 같은 품목(`orderItemId`)의 배송 작업이 있거나. 품목 지정이 없는 주문 전체 설치라면
 * 주문의 모든 배송 작업이 완료되어야 한다. 대응하는 배송 작업이 하나도 없으면
 * 배송 없는 설치로 보고 통과시킨다 (설치만 별도 접수되는 경우).
 */
export function canCompleteInstall(
  job: { orderItemId: string | null; deliveryJobId: string | null },
  deliveryJobs: { id: string; orderItemId: string | null; status: string }[],
): TransitionRejection | null {
  const related = job.deliveryJobId
    ? deliveryJobs.filter((delivery) => delivery.id === job.deliveryJobId)
    : job.orderItemId
      ? deliveryJobs.filter((delivery) => delivery.orderItemId === job.orderItemId)
      : deliveryJobs;

  // 취소된 배송은 선행 조건에서 제외한다 (그 품목은 배송 자체가 없던 일이 된 것).
  const blocking = related.filter((delivery) => delivery.status !== "CANCELLED");
  if (blocking.length === 0) return null;

  const unfinished = blocking.filter((delivery) => delivery.status !== "DELIVERED");
  if (unfinished.length === 0) return null;

  return {
    reason: `배송이 완료되지 않았습니다 (현재 ${unfinished.length}건 진행중). 설치 완료는 배송 완료 이후에만 가능합니다.`,
  };
}

// ------------------------------------------------------------------ 지연 (P1)

/**
 * P1 배송·설치 지연. 저장하지 않고 조회 시점에 계산한다 (계획 §1).
 * 스키마의 `delayed` 컬럼은 Phase 0 이 "파생 계산 보조"로 넣어 둔 것이라 쓰지 않는다 —
 * 컬럼을 신뢰하면 배치 없이는 항상 낡은 값이 된다.
 */
export function isJobDelayed(
  job: { scheduledAt: Date | null; status: string },
  terminal: readonly string[],
  at: Date = new Date(),
): boolean {
  if (job.scheduledAt == null) return false;
  if (terminal.includes(job.status)) return false;
  return job.scheduledAt < at;
}

export function isDeliveryDelayed(
  job: { scheduledAt: Date | null; status: string },
  at?: Date,
): boolean {
  return isJobDelayed(job, DELIVERY_TERMINAL, at);
}

export function isInstallDelayed(
  job: { scheduledAt: Date | null; status: string },
  at?: Date,
): boolean {
  return isJobDelayed(job, INSTALL_TERMINAL, at);
}

// -------------------------------------------------------------- 주문 진행도

/** 배송 단계 서열 — 주문 전체 상태는 **가장 덜 진행된** 작업이 결정한다 (부분 배송). */
const DELIVERY_RANK: Record<DeliveryStatus, number> = {
  SCHEDULED: 0,
  PREPARING: 1,
  IN_TRANSIT: 2,
  DELIVERED: 3,
  FAILED: 0,
  CANCELLED: 3,
};

export interface OrderProgress {
  /** Order.status 컬럼에 동기화되는 파생 상태. */
  status: OrderStatus;
  deliveryTotal: number;
  deliveryDone: number;
  installTotal: number;
  installDone: number;
  delayedCount: number;
  failedCount: number;
  /** 배송을 기다리느라 완료할 수 없는 설치 작업 수. */
  blockedInstalls: number;
}

interface ProgressInput {
  status: string;
  deliveryJobs: { orderItemId: string | null; id: string; status: string; scheduledAt: Date | null }[];
  installJobs: {
    orderItemId: string | null;
    deliveryJobId: string | null;
    status: string;
    scheduledAt: Date | null;
  }[];
}

/**
 * 주문 전체 상태를 작업들에서 파생한다.
 *
 * **부분 배송을 전제로 가장 덜 진행된 작업을 따른다** — 냉장고가 도착했어도 TV 가 아직
 * 준비중이면 그 주문은 '배송중' 이다. 취소된 작업은 집계에서 빠진다.
 *
 * `INSTALLED` 는 이 파생에서 만들어지지 않는다. 설치 완료가 우리 모델의 마지막 단계라
 * `COMPLETED` 와 구분되지 않기 때문이다 (Phase 10/11 참고).
 */
export function orderProgress(order: ProgressInput, at: Date = new Date()): OrderProgress {
  const deliveries = order.deliveryJobs.filter((job) => job.status !== "CANCELLED");
  const installs = order.installJobs.filter((job) => job.status !== "CANCELLED");

  const deliveryDone = deliveries.filter((job) => job.status === "DELIVERED").length;
  const installDone = installs.filter((job) => job.status === "COMPLETED").length;

  const delayedCount =
    order.deliveryJobs.filter((job) => isDeliveryDelayed(job, at)).length +
    order.installJobs.filter((job) => isInstallDelayed(job, at)).length;
  const failedCount =
    order.deliveryJobs.filter((job) => job.status === "FAILED").length +
    order.installJobs.filter((job) => job.status === "FAILED").length;

  const blockedInstalls = installs.filter(
    (job) => job.status !== "COMPLETED" && canCompleteInstall(job, order.deliveryJobs) != null,
  ).length;

  const base: Omit<OrderProgress, "status"> = {
    deliveryTotal: deliveries.length,
    deliveryDone,
    installTotal: installs.length,
    installDone,
    delayedCount,
    failedCount,
    blockedInstalls,
  };

  if (order.status === "CANCELLED") return { ...base, status: "CANCELLED" };
  if (deliveries.length === 0 && installs.length === 0) return { ...base, status: "PLACED" };

  const allDelivered = deliveries.length > 0 && deliveryDone === deliveries.length;
  const allInstalled = installs.length === 0 || installDone === installs.length;

  if (allDelivered && allInstalled) return { ...base, status: "COMPLETED" };
  if (allDelivered) return { ...base, status: "DELIVERED" };

  const leastAdvanced = Math.min(
    ...deliveries.map((job) => DELIVERY_RANK[job.status as DeliveryStatus] ?? 0),
  );
  return { ...base, status: leastAdvanced >= 2 ? "SHIPPING" : "PREPARING" };
}

// ---------------------------------------------------------------------- 조회

export const orderInclude = {
  contract: {
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      store: { select: { id: true, name: true, phone: true } },
      quote: { select: { id: true, quoteNo: true } },
    },
  },
  items: { include: { product: { include: { category: true } } } },
  deliveryJobs: { orderBy: { createdAt: "asc" } },
  installJobs: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.OrderInclude;

export type OrderDetail = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/**
 * 매장 스코프 조회. `Order` 에는 `storeId` 가 없으므로 계약을 통해 좁힌다
 * (Phase 8 handoff 가 정한 규칙).
 */
export function findOrder(ctx: AuthContext, orderId: string): Promise<OrderDetail | null> {
  return prisma.order.findFirst({
    where: { id: orderId, contract: scopeToStore(ctx) },
    include: orderInclude,
  });
}

export function orderScope(ctx: AuthContext): Prisma.OrderWhereInput {
  return { contract: scopeToStore(ctx) };
}

/** P1 일정변경 이력. 배송/설치 작업 어느 쪽이든 같은 테이블에 쌓인다. */
export function scheduleHistory(jobIds: { deliveryJobIds: string[]; installJobIds: string[] }) {
  return prisma.scheduleChange.findMany({
    where: {
      OR: [
        { deliveryJobId: { in: jobIds.deliveryJobIds } },
        { installJobId: { in: jobIds.installJobIds } },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: { changedBy: { select: { name: true } } },
  });
}

/**
 * `/track/[token]` 전용 조회 — **의도적으로 인증이 없다.**
 *
 * 고객은 계정이 없다. 접근 제어는 난수 토큰의 소지이며, Phase 8 의 `/sign/[token]` 과 같은
 * 설계다. 매장 스코프를 걸지 않는 것은 누락이 아니다. 다만 이 경로가 돌려주는 정보는
 * **고객에게 보여도 되는 것만** 이어야 하므로 select 를 좁게 유지한다 (금액·매니저·내부 메모 제외).
 */
export function findOrderByTrackingToken(token: string) {
  return prisma.order.findUnique({
    where: { publicTrackingToken: token },
    select: {
      id: true,
      orderNo: true,
      status: true,
      placedAt: true,
      contract: {
        select: {
          contractNo: true,
          deliveryAddressSnapshotJson: true,
          store: { select: { name: true, phone: true } },
        },
      },
      items: {
        select: {
          id: true,
          qty: true,
          product: { select: { name: true, modelCode: true, category: { select: { name: true } } } },
        },
      },
      deliveryJobs: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          orderItemId: true,
          status: true,
          scheduledAt: true,
          completedAt: true,
          carrier: true,
          trackingNo: true,
        },
      },
      installJobs: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          orderItemId: true,
          deliveryJobId: true,
          status: true,
          scheduledAt: true,
          completedAt: true,
        },
      },
    },
  });
}

export type TrackedOrder = NonNullable<Awaited<ReturnType<typeof findOrderByTrackingToken>>>;

/** 공개 추적 링크 토큰. 추측 불가능해야 하므로 난수 24바이트를 쓴다. */
export function newTrackingToken(): string {
  return randomBytes(24).toString("base64url");
}

// ---------------------------------------------------------------------- 라벨

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  SCHEDULED: "배송예정",
  PREPARING: "배송준비",
  IN_TRANSIT: "배송중",
  DELIVERED: "배송완료",
  FAILED: "배송실패",
  CANCELLED: "배송취소",
};

export const INSTALL_STATUS_LABEL: Record<InstallStatus, string> = {
  SCHEDULED: "설치예정",
  ASSIGNED: "기사배정",
  IN_PROGRESS: "설치중",
  COMPLETED: "설치완료",
  FAILED: "설치실패",
  CANCELLED: "설치취소",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PLACED: "접수",
  PREPARING: "준비중",
  SHIPPING: "배송중",
  DELIVERED: "배송완료",
  INSTALLED: "설치완료",
  COMPLETED: "완료",
  CANCELLED: "취소",
};
