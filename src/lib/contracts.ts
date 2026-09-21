// 계약 · 전자서명 조회와 파생 상태 (PRD §4 계약확인 및 전자서명 P0 + P1).
//
// 계약은 서명 시점의 사실을 통째로 얼려 둔다 — 고객정보·배송지·금융조건은 전부 JSON
// 스냅샷이고, 금액은 계약 생성 시점의 PaymentPlan.totalPayable 을 복사한 Int 다.
// 원본 Customer/FinanceProduct/Product 가 나중에 바뀌어도 계약서는 움직이지 않는다.

import { randomBytes } from "node:crypto";
import type { Prisma, SignatureRequest } from "@prisma/client";
import type { AuthContext } from "./auth";
import { scopeToStore } from "./auth";
import { prisma } from "./prisma";
import type { PaymentPlanDetail } from "./payments";
import type { ContractStatus, SignatureStatus } from "./enums";

const DAY_MS = 86_400_000;

/** 서명 링크 유효기간. 만료되면 재전송으로 새 요청을 만든다. */
export const SIGNATURE_EXPIRY_DAYS = 7;
/** P1 전자서명 미완료 알림 기준 — 요청 후 이 일수를 넘기면 화면에 띄운다. */
export const SIGNATURE_STALE_DAYS = 3;

// ---------------------------------------------------------------- 스냅샷

export interface CustomerSnapshot {
  customerId: string;
  name: string;
  phone: string;
  memberNo: string | null;
  email: string | null;
}

export interface DeliveryAddressSnapshot {
  address: string | null;
  addressDetail: string | null;
  recipientName: string;
  recipientPhone: string;
}

export interface FinanceSnapshot {
  financeProductId: string;
  code: string;
  name: string;
  type: string;
  months: number;
  /** basis point (590 = 5.90%). */
  apr: number;
  principal: number;
  downPayment: number;
  interestTotal: number;
  monthlyAmount: number;
  lastMonthAmount: number;
  totalPayable: number;
  approvalCode: string | null;
  snapshotAt: string;
}

type CustomerLike = {
  id: string;
  name: string;
  phone: string;
  memberNo: string | null;
  email: string | null;
  address: string | null;
  addressDetail: string | null;
};

export function buildCustomerSnapshot(customer: CustomerLike): CustomerSnapshot {
  return {
    customerId: customer.id,
    name: customer.name,
    phone: customer.phone,
    memberNo: customer.memberNo,
    email: customer.email,
  };
}

export function buildDeliveryAddressSnapshot(customer: CustomerLike): DeliveryAddressSnapshot {
  return {
    address: customer.address,
    addressDetail: customer.addressDetail,
    recipientName: customer.name,
    recipientPhone: customer.phone,
  };
}

export function buildFinanceSnapshot(plan: PaymentPlanDetail): FinanceSnapshot {
  return {
    financeProductId: plan.financeProductId,
    code: plan.financeProduct.code,
    name: plan.financeProduct.name,
    type: plan.financeProduct.type,
    months: plan.months,
    apr: plan.financeProduct.apr,
    principal: plan.principal,
    downPayment: plan.downPayment,
    interestTotal: plan.interestTotal,
    monthlyAmount: plan.monthlyAmount,
    lastMonthAmount: plan.lastMonthAmount,
    totalPayable: plan.totalPayable,
    approvalCode: plan.approvalCode,
    snapshotAt: new Date().toISOString(),
  };
}

/** 깨진 JSON 에도 던지지 않는다 — 스냅샷은 과거 데이터라 형태를 신뢰할 수 없다. */
export function parseSnapshot<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? (parsed as T) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ 서명 파생 상태

export type SignaturePhase = "SIGNABLE" | "SIGNED" | "EXPIRED" | "INVALIDATED";

export interface SignatureState {
  phase: SignaturePhase;
  /** 지금 이 토큰으로 서명할 수 있는가. */
  isSignable: boolean;
  /** P1 미완료 알림 — 대기 중이고 요청 후 SIGNATURE_STALE_DAYS 를 넘겼다. */
  isStale: boolean;
  daysPending: number;
  expiresInDays: number | null;
}

type SignatureLike = Pick<
  SignatureRequest,
  "status" | "requestedAt" | "expiresAt" | "signedAt" | "invalidatedAt"
>;

/**
 * 서명 요청의 실제 상태. `status` 컬럼과 시각을 합쳐 파생한다 — 만료는 배치가 아니라
 * 조회 시점 계산이다 (계획 §1: 알림/만료는 파생, 별도 인프라 없음).
 */
export function signatureState(request: SignatureLike, at: Date = new Date()): SignatureState {
  const daysPending = Math.floor((at.getTime() - request.requestedAt.getTime()) / DAY_MS);

  let phase: SignaturePhase;
  if (request.invalidatedAt != null || request.status === "INVALIDATED") phase = "INVALIDATED";
  else if (request.signedAt != null || request.status === "SIGNED") phase = "SIGNED";
  else if (request.expiresAt <= at) phase = "EXPIRED";
  else phase = "SIGNABLE";

  return {
    phase,
    isSignable: phase === "SIGNABLE",
    isStale: phase === "SIGNABLE" && daysPending >= SIGNATURE_STALE_DAYS,
    daysPending,
    expiresInDays:
      phase === "SIGNABLE"
        ? Math.ceil((request.expiresAt.getTime() - at.getTime()) / DAY_MS)
        : null,
  };
}

/** 서명 요청 토큰. 추측 불가능해야 하므로 난수 32바이트를 쓴다. */
export function newSignatureToken(): string {
  return randomBytes(32).toString("base64url");
}

export function signatureExpiry(at: Date = new Date()): Date {
  return new Date(at.getTime() + SIGNATURE_EXPIRY_DAYS * DAY_MS);
}

// ---------------------------------------------------------------------- 조회

export const contractInclude = {
  quote: {
    include: {
      items: { orderBy: { sortOrder: "asc" }, include: { product: { include: { category: true } } } },
    },
  },
  customer: { select: { id: true, name: true, phone: true, memberNo: true } },
  manager: { select: { id: true, name: true, employeeNo: true } },
  store: { select: { id: true, name: true, code: true, phone: true, address: true } },
  signatureRequests: { orderBy: { requestedAt: "desc" } },
  order: { include: { items: true } },
} satisfies Prisma.ContractInclude;

export type ContractDetail = Prisma.ContractGetPayload<{ include: typeof contractInclude }>;

export function findContract(ctx: AuthContext, contractId: string): Promise<ContractDetail | null> {
  return prisma.contract.findFirst({
    where: { id: contractId, ...scopeToStore(ctx) },
    include: contractInclude,
  });
}

/**
 * 지금 살아 있는 서명 요청 = 무효화되지 않은 가장 최근 것.
 * 재전송하면 이전 요청은 INVALIDATED 가 되므로 목록의 맨 앞이 곧 현재 요청이다.
 */
export function currentSignatureRequest(contract: {
  signatureRequests: SignatureRequest[];
}): SignatureRequest | null {
  return (
    contract.signatureRequests.find(
      (request) => request.invalidatedAt == null && request.status !== "INVALIDATED",
    ) ?? null
  );
}

/**
 * `/sign/[token]` 전용 조회 — **의도적으로 인증이 없다.**
 *
 * 고객은 로그인 계정이 없다 (계획 §1: 토큰 기반 공개 링크). 접근 제어는 32바이트 난수
 * 토큰의 소지 자체이며, 토큰은 unique 인덱스로 단건 조회된다. 매장 스코프를 걸지 않는
 * 것은 누락이 아니라 이 라우트의 설계다 — 리뷰 시 스코프 누락으로 오인하지 말 것.
 */
export function findSignatureByToken(token: string) {
  return prisma.signatureRequest.findUnique({
    where: { token },
    include: {
      contract: {
        include: {
          quote: {
            include: { items: { orderBy: { sortOrder: "asc" }, include: { product: true } } },
          },
          store: { select: { name: true, phone: true } },
        },
      },
    },
  });
}

export type SignatureWithContract = NonNullable<
  Awaited<ReturnType<typeof findSignatureByToken>>
>;

// ------------------------------------------------------------------- 번호 발번

async function nextSequentialNo(
  tx: Prisma.TransactionClient,
  model: "contract" | "order",
  prefix: string,
  storeCode: string,
  at: Date,
): Promise<string> {
  const kst = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  const stamp = kst.toISOString().slice(2, 10).replace(/-/g, "");
  const head = `${prefix}-${storeCode}-${stamp}-`;

  const count =
    model === "contract"
      ? await tx.contract.count({ where: { contractNo: { startsWith: head } } })
      : await tx.order.count({ where: { orderNo: { startsWith: head } } });

  return `${head}${String(count + 1).padStart(3, "0")}`;
}

export function nextContractNo(
  tx: Prisma.TransactionClient,
  storeCode: string,
  at: Date = new Date(),
): Promise<string> {
  return nextSequentialNo(tx, "contract", "C", storeCode, at);
}

export function nextOrderNo(
  tx: Prisma.TransactionClient,
  storeCode: string,
  at: Date = new Date(),
): Promise<string> {
  return nextSequentialNo(tx, "order", "O", storeCode, at);
}

// --------------------------------------------------------------- 계약 파생

/** 계약이 더 이상 진행되지 않는 상태인가. */
export function isContractClosed(contract: { status: string }): boolean {
  return contract.status === "CANCELLED";
}

/** 서명이 끝난 계약인가 (주문이 만들어졌다). */
export function isContractSigned(contract: { status: string }): boolean {
  return contract.status === "SIGNED";
}

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  DRAFT: "작성",
  PENDING_SIGNATURE: "서명 대기",
  SIGNED: "서명 완료",
  CHANGED: "변경됨",
  CANCELLED: "취소",
};

export const SIGNATURE_STATUS_LABEL: Record<SignatureStatus, string> = {
  PENDING: "대기",
  SENT: "발송됨",
  SIGNED: "서명 완료",
  EXPIRED: "만료",
  INVALIDATED: "무효",
};

export const SIGNATURE_PHASE_LABEL: Record<SignaturePhase, string> = {
  SIGNABLE: "서명 대기",
  SIGNED: "서명 완료",
  EXPIRED: "링크 만료",
  INVALIDATED: "무효",
};
