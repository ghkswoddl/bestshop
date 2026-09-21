// 상담이력 조회 · 단계 전이 · 후속조치 파생 (PRD §4 상담이력관리 P0 + P1).
//
// 상담 단계는 **앞으로만 간다.** 여러 Phase 가 각자의 시점에 단계를 올리므로
// (견적 생성 → QUOTED, 계약 생성 → CONTRACTED, 배송 시작 → DELIVERING ...)
// 전이 판정을 이 모듈 한 곳에 모아 둔다. 호출측이 직접 stage 를 쓰지 않는다.

import type { Prisma } from "@prisma/client";
import type { AuthContext } from "./auth";
import { scopeToStore } from "./auth";
import { prisma } from "./prisma";
import type { ConsultationStage, FollowUpStatus } from "./enums";

const DAY_MS = 86_400_000;

// ------------------------------------------------------------------ 단계 전이

/**
 * 진행 서열. 큰 값으로만 이동할 수 있다.
 * 세 종착 단계는 같은 서열을 갖는다 — 서로 넘나들 수 없다는 뜻이다.
 */
const STAGE_RANK: Record<ConsultationStage, number> = {
  IN_PROGRESS: 0,
  QUOTED: 1,
  CONTRACTED: 2,
  DELIVERING: 3,
  COMPLETED: 4,
  CLOSED: 4,
  CANCELLED: 4,
};

/**
 * 종착 단계. 한 번 들어오면 어떤 경로로도 나가지 않는다.
 * - COMPLETED: 주문까지 끝났다 (배송·설치 완료)
 * - CLOSED: 매니저가 판매 없이 상담을 종료했다
 * - CANCELLED: 상담이 무효가 되었다 (계약 취소 포함)
 */
export const CONSULTATION_TERMINAL: readonly ConsultationStage[] = [
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
];

export function isConsultationTerminal(stage: string): boolean {
  return (CONSULTATION_TERMINAL as readonly string[]).includes(stage);
}

export function canAdvanceStage(from: string, to: ConsultationStage): boolean {
  if (isConsultationTerminal(from)) return false;
  const fromRank = STAGE_RANK[from as ConsultationStage];
  if (fromRank == null) return false;
  return STAGE_RANK[to] > fromRank;
}

/**
 * 상담 단계를 전진시킨다. 뒤로 가거나 종착에서 나가는 요청은 **조용히 무시한다**.
 *
 * 조용히 무시하는 이유: 호출측이 전부 "부수적으로 단계를 밀어 보는" 경로다
 * (견적 저장, 계약 생성, 배송 진행). 단계가 이미 더 앞서 있다고 해서 견적 저장이
 * 실패해서는 안 된다. 사용자가 명시적으로 단계를 바꾸는 유일한 경로인 '상담 종료'는
 * 액션 쪽에서 따로 가능 여부를 검사해 안내한다.
 */
export async function advanceConsultationStage(
  tx: Prisma.TransactionClient,
  consultationId: string | null | undefined,
  to: ConsultationStage,
): Promise<void> {
  if (!consultationId) return;

  const consultation = await tx.consultation.findUnique({
    where: { id: consultationId },
    select: { stage: true },
  });
  if (!consultation || !canAdvanceStage(consultation.stage, to)) return;

  await tx.consultation.update({
    where: { id: consultationId },
    data: {
      stage: to,
      ...(isConsultationTerminal(to) ? { endedAt: new Date() } : {}),
    },
  });
}

/** 주문에 연결된 상담 id. Order → Contract → Quote → consultationId. */
export async function consultationIdForOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<string | null> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { contract: { select: { quote: { select: { consultationId: true } } } } },
  });
  return order?.contract.quote.consultationId ?? null;
}

// ---------------------------------------------------------------- 후속조치 (P1)

/** 후속조치 임박 기준 — 예정일이 향후 N일 이내면 '임박' 으로 본다. */
export const FOLLOW_UP_SOON_DAYS = 3;

export type FollowUpUrgency = "OVERDUE" | "SOON" | "UPCOMING" | "DONE" | "CANCELLED";

export interface FollowUpState {
  urgency: FollowUpUrgency;
  /** 지난 일수(음수면 남은 일수). */
  daysFromDue: number;
  label: string;
}

/** 저장하지 않고 조회 시점에 계산한다 (계획 §1 — 알림 인프라 없음). */
export function followUpState(
  followUp: { status: string; dueAt: Date },
  at: Date = new Date(),
): FollowUpState {
  if (followUp.status === "DONE") {
    return { urgency: "DONE", daysFromDue: 0, label: "완료" };
  }
  if (followUp.status === "CANCELLED") {
    return { urgency: "CANCELLED", daysFromDue: 0, label: "취소" };
  }

  const daysFromDue = Math.floor((at.getTime() - followUp.dueAt.getTime()) / DAY_MS);
  if (followUp.dueAt < at) {
    return { urgency: "OVERDUE", daysFromDue, label: `${daysFromDue}일 경과` };
  }

  const daysLeft = Math.ceil((followUp.dueAt.getTime() - at.getTime()) / DAY_MS);
  if (daysLeft <= FOLLOW_UP_SOON_DAYS) {
    return { urgency: "SOON", daysFromDue: -daysLeft, label: `${daysLeft}일 남음` };
  }
  return { urgency: "UPCOMING", daysFromDue: -daysLeft, label: `${daysLeft}일 남음` };
}

/**
 * P1 후속조치 대상. 기한이 지났거나 임박한 미완료 건.
 * `FollowUp` 에는 storeId 가 없으므로 상담을 통해 매장 스코프를 건다.
 */
export async function dueFollowUps(ctx: AuthContext, at: Date = new Date(), take = 50) {
  const rows = await prisma.followUp.findMany({
    where: {
      status: "PENDING",
      consultation: scopeToStore(ctx),
      dueAt: { lte: new Date(at.getTime() + FOLLOW_UP_SOON_DAYS * DAY_MS) },
    },
    orderBy: { dueAt: "asc" },
    take,
    include: {
      customer: { select: { id: true, name: true } },
      manager: { select: { name: true } },
      consultation: { select: { id: true } },
    },
  });
  return rows.map((row) => ({ followUp: row, state: followUpState(row, at) }));
}

// ---------------------------------------------------------------------- 조회

export const consultationInclude = {
  customer: { select: { id: true, name: true, phone: true, memberNo: true } },
  manager: { select: { id: true, name: true } },
  assignedManager: { select: { id: true, name: true } },
  store: { select: { id: true, name: true } },
  notes: {
    orderBy: { createdAt: "desc" },
    include: { manager: { select: { id: true, name: true } } },
  },
  followUps: {
    orderBy: { dueAt: "asc" },
    include: { manager: { select: { name: true } } },
  },
  quotes: {
    orderBy: { createdAt: "desc" },
    include: {
      paymentPlan: { include: { financeProduct: { select: { name: true } } } },
      contract: {
        include: {
          order: { include: { deliveryJobs: true, installJobs: true } },
          signatureRequests: { orderBy: { requestedAt: "desc" }, take: 1 },
        },
      },
    },
  },
} satisfies Prisma.ConsultationInclude;

export type ConsultationDetail = Prisma.ConsultationGetPayload<{
  include: typeof consultationInclude;
}>;

/** 상담에는 storeId 컬럼이 있으므로 scopeToStore 를 그대로 쓴다. */
export function findConsultation(
  ctx: AuthContext,
  consultationId: string,
): Promise<ConsultationDetail | null> {
  return prisma.consultation.findFirst({
    where: { id: consultationId, ...scopeToStore(ctx) },
    include: consultationInclude,
  });
}

// ------------------------------------------------------------ 상담 타임라인

export type TimelineKind =
  | "CONSULTATION"
  | "NOTE"
  | "QUOTE"
  | "PAYMENT"
  | "CONTRACT"
  | "SIGNATURE"
  | "ORDER"
  | "DELIVERY"
  | "INSTALL"
  | "FOLLOW_UP";

export interface TimelineEntry {
  id: string;
  at: Date;
  kind: TimelineKind;
  title: string;
  detail: string | null;
  /** 관련 화면으로 가는 링크. 없으면 링크 없이 표시한다. */
  href: string | null;
}

/**
 * PRD P0 "견적·계약·배송 정보와 상담이력 연결" — 상담 한 건에 매달린 모든 사건을
 * 시간순으로 합친다. 각 Phase 가 남긴 타임스탬프를 읽기만 하고 새로 저장하지 않는다.
 */
export function buildTimeline(consultation: ConsultationDetail): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      id: `start-${consultation.id}`,
      at: consultation.startedAt,
      kind: "CONSULTATION",
      title: "상담 시작",
      detail: consultation.channel ? `채널 ${consultation.channel}` : null,
      href: null,
    },
  ];

  for (const note of consultation.notes) {
    entries.push({
      id: `note-${note.id}`,
      at: note.createdAt,
      kind: "NOTE",
      title: `상담 메모 (${note.manager.name})`,
      detail: note.content,
      href: null,
    });
  }

  for (const quote of consultation.quotes) {
    entries.push({
      id: `quote-${quote.id}`,
      at: quote.createdAt,
      kind: "QUOTE",
      title: `견적 작성 ${quote.quoteNo}`,
      detail: `${quote.grandTotal.toLocaleString("ko-KR")}원`,
      href: `/quotes/${quote.id}`,
    });

    if (quote.paymentPlan) {
      entries.push({
        id: `plan-${quote.paymentPlan.id}`,
        at: quote.paymentPlan.createdAt,
        kind: "PAYMENT",
        title: `결제설계 ${quote.paymentPlan.financeProduct.name}`,
        detail: `총 ${quote.paymentPlan.totalPayable.toLocaleString("ko-KR")}원`,
        href: `/quotes/${quote.id}/payment`,
      });
    }

    const contract = quote.contract;
    if (!contract) continue;

    entries.push({
      id: `contract-${contract.id}`,
      at: contract.createdAt,
      kind: "CONTRACT",
      title: `계약 생성 ${contract.contractNo}`,
      detail: `${contract.totalAmount.toLocaleString("ko-KR")}원`,
      href: `/contracts/${contract.id}`,
    });

    if (contract.signedAt) {
      entries.push({
        id: `signed-${contract.id}`,
        at: contract.signedAt,
        kind: "SIGNATURE",
        title: "전자서명 완료",
        detail: contract.signatureRequests[0]?.signerName ?? null,
        href: `/contracts/${contract.id}`,
      });
    }
    if (contract.cancelledAt) {
      entries.push({
        id: `cancelled-${contract.id}`,
        at: contract.cancelledAt,
        kind: "CONTRACT",
        title: "계약 취소",
        detail: contract.cancelReason,
        href: `/contracts/${contract.id}`,
      });
    }

    const order = contract.order;
    if (!order) continue;

    entries.push({
      id: `order-${order.id}`,
      at: order.placedAt,
      kind: "ORDER",
      title: `주문 접수 ${order.orderNo}`,
      detail: null,
      href: `/deliveries/${order.id}`,
    });

    for (const job of order.deliveryJobs) {
      if (job.completedAt) {
        entries.push({
          id: `delivery-${job.id}`,
          at: job.completedAt,
          kind: "DELIVERY",
          title: "배송 완료",
          detail: job.carrier,
          href: `/deliveries/${order.id}`,
        });
      }
    }
    for (const job of order.installJobs) {
      if (job.completedAt) {
        entries.push({
          id: `install-${job.id}`,
          at: job.completedAt,
          kind: "INSTALL",
          title: "설치 완료",
          detail: job.technicianName,
          href: `/deliveries/${order.id}`,
        });
      }
    }
  }

  for (const followUp of consultation.followUps) {
    entries.push({
      id: `followup-${followUp.id}`,
      at: followUp.createdAt,
      kind: "FOLLOW_UP",
      title: "후속조치 등록",
      detail: followUp.content,
      href: null,
    });
    if (followUp.completedAt) {
      entries.push({
        id: `followup-done-${followUp.id}`,
        at: followUp.completedAt,
        kind: "FOLLOW_UP",
        title: "후속조치 완료",
        detail: followUp.content,
        href: null,
      });
    }
  }

  if (consultation.endedAt) {
    entries.push({
      id: `end-${consultation.id}`,
      at: consultation.endedAt,
      kind: "CONSULTATION",
      title: "상담 종료",
      detail: consultation.summary,
      href: null,
    });
  }

  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** 상담 한 건의 다음 행동 요약 — 목록에서 "무엇이 막혀 있는지" 를 한 줄로 보여준다. */
export function consultationHint(consultation: {
  stage: string;
  quotes: { status: string; contract: { status: string } | null }[];
}): string {
  if (isConsultationTerminal(consultation.stage)) return "-";
  if (consultation.quotes.length === 0) return "견적 작성 필요";

  const withContract = consultation.quotes.find((quote) => quote.contract != null);
  if (withContract?.contract) {
    return withContract.contract.status === "SIGNED" ? "배송 일정 등록" : "전자서명 대기";
  }

  const sent = consultation.quotes.some((quote) => quote.status === "SENT");
  return sent ? "결제 승인 · 계약 생성" : "결제설계 필요";
}

export const FOLLOW_UP_URGENCY_LABEL: Record<FollowUpUrgency, string> = {
  OVERDUE: "기한 경과",
  SOON: "임박",
  UPCOMING: "예정",
  DONE: "완료",
  CANCELLED: "취소",
};

export function isFollowUpOpen(status: string): boolean {
  return (status as FollowUpStatus) === "PENDING";
}
