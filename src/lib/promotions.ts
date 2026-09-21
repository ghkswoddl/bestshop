// 프로모션 조회 · 적용 판정 · 할인 계산.
//
// Phase 6(견적서 작성)은 이 모듈의 applicablePromotions() / evaluatePromotion() /
// bestPromotion() / promotionSnapshotJson() 을 그대로 호출한다. 시그니처는 고정이다.
//
// 알림(신규/종료임박)은 저장하지 않고 조회 시점에 파생 계산한다 — 계획 §1 결정.
// 금액은 전부 KRW Int. 나눗셈 결과는 항상 Math.floor 로 정수화한다.

import type { Promotion } from "@prisma/client";
import { prisma } from "./prisma";
import {
  PROMOTION_BENEFIT_TYPE_LABEL,
  type PromotionBenefitType,
  type PromotionStatus,
} from "./enums";

const DAY_MS = 86_400_000;

/** P1 신규 프로모션 알림 기준 — createdAt 이 최근 N일 이내. */
export const NEW_PROMOTION_WINDOW_DAYS = 7;
/** P1 종료예정 알림 기준 — endsAt 이 향후 N일 이내. */
export const ENDING_SOON_WINDOW_DAYS = 7;

// ------------------------------------------------------------------ 적용조건

/** Promotion.conditionsJson 의 해석된 형태. 필드는 전부 선택이며 없으면 무조건이다. */
export interface PromotionConditions {
  /** 라인 최소 수량. */
  minQty?: number;
  /** 라인 최소 금액(KRW). */
  minAmount?: number;
  /** 할인 상한(KRW). 정률 할인의 폭주를 막는다. */
  maxDiscount?: number;
  /** 화면에만 보여주는 자유 문구. 계산에 관여하지 않는다. */
  note?: string;
}

/** 잘못된 JSON 이어도 절대 던지지 않는다 — 시드/외부 입력을 신뢰하지 않는다. */
export function parseConditions(json: string | null | undefined): PromotionConditions {
  if (!json) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {};
  }
  if (typeof raw !== "object" || raw === null) return {};

  const source = raw as Record<string, unknown>;
  const num = (key: string) => {
    const value = source[key];
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? Math.trunc(value)
      : undefined;
  };
  return {
    minQty: num("minQty"),
    minAmount: num("minAmount"),
    maxDiscount: num("maxDiscount"),
    note: typeof source.note === "string" ? source.note : undefined,
  };
}

export function describeConditions(conditions: PromotionConditions): string[] {
  const lines: string[] = [];
  if (conditions.minQty != null) lines.push(`최소 ${conditions.minQty}개 이상 구매`);
  if (conditions.minAmount != null)
    lines.push(`최소 구매금액 ${conditions.minAmount.toLocaleString("ko-KR")}원`);
  if (conditions.maxDiscount != null)
    lines.push(`최대 할인 ${conditions.maxDiscount.toLocaleString("ko-KR")}원`);
  if (conditions.note) lines.push(conditions.note);
  return lines.length > 0 ? lines : ["별도 조건 없음"];
}

// -------------------------------------------------------------- 파생 상태

/**
 * 화면에 보여줄 진행 단계. DB 의 `status` 컬럼(편집 상태)과 기간을 합쳐 파생한다.
 * DRAFT/CANCELLED 는 기간과 무관하게 절대 적용되지 않는다.
 */
export type PromotionPhase = "ACTIVE" | "UPCOMING" | "EXPIRED" | "DRAFT" | "CANCELLED";

export const PROMOTION_PHASE_LABEL: Record<PromotionPhase, string> = {
  ACTIVE: "진행중",
  UPCOMING: "진행예정",
  EXPIRED: "종료",
  DRAFT: "작성중",
  CANCELLED: "취소",
};

export interface PromotionFlags {
  phase: PromotionPhase;
  /** 지금 견적에 적용할 수 있는가. */
  isActive: boolean;
  /** P1 신규 — createdAt 이 최근 7일 이내이고 아직 종료되지 않음. */
  isNew: boolean;
  /** P1 종료예정 — 진행중이면서 endsAt 이 향후 7일 이내. */
  isEndingSoon: boolean;
  daysUntilEnd: number | null;
  daysUntilStart: number | null;
}

type PromotionTiming = Pick<Promotion, "status" | "startsAt" | "endsAt" | "createdAt">;

function ceilDays(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
}

export function promotionFlags(promotion: PromotionTiming, at: Date = new Date()): PromotionFlags {
  const status = promotion.status as PromotionStatus;

  let phase: PromotionPhase;
  if (status === "DRAFT") phase = "DRAFT";
  else if (status === "CANCELLED") phase = "CANCELLED";
  else if (status === "ENDED" || promotion.endsAt < at) phase = "EXPIRED";
  else if (promotion.startsAt > at) phase = "UPCOMING";
  else phase = "ACTIVE";

  const isActive = phase === "ACTIVE";
  const daysUntilEnd = isActive ? ceilDays(at, promotion.endsAt) : null;

  return {
    phase,
    isActive,
    isNew:
      phase !== "EXPIRED" &&
      phase !== "CANCELLED" &&
      at.getTime() - promotion.createdAt.getTime() <= NEW_PROMOTION_WINDOW_DAYS * DAY_MS,
    isEndingSoon: daysUntilEnd != null && daysUntilEnd <= ENDING_SOON_WINDOW_DAYS,
    daysUntilEnd,
    daysUntilStart: phase === "UPCOMING" ? ceilDays(at, promotion.startsAt) : null,
  };
}

/** 지금 견적에 적용 가능한 프로모션만 고르는 Prisma where 조각. */
export function activePromotionWhere(at: Date = new Date()) {
  return { status: "ACTIVE", startsAt: { lte: at }, endsAt: { gte: at } } as const;
}

// ---------------------------------------------------------------- 조회 계약

export interface ApplicablePromotion {
  promotion: Promotion;
  conditions: PromotionConditions;
}

/**
 * 주어진 상품들에 지금(또는 `at` 시점) 적용 가능한 프로모션.
 *
 * - 반환 Map 은 **요청한 모든 productId 에 대해 항목을 보장한다** (없으면 빈 배열).
 *   호출측에서 undefined 를 검사할 필요가 없다.
 * - status === "ACTIVE" 이고 startsAt <= at <= endsAt 인 것만 담는다.
 *   DRAFT / CANCELLED / ENDED 와 기간 밖은 제외된다.
 * - 수량·금액 조건(minQty/minAmount)은 **여기서 판정하지 않는다.** 라인 정보가 필요하므로
 *   evaluatePromotion() 이 담당한다. 이 함수는 "이 상품이 대상인가"까지만 본다.
 * - 프로모션은 매장 스코프 대상이 아니다 (Promotion 에 storeId 컬럼이 없다 — 카탈로그 레벨).
 */
export async function applicablePromotions(
  productIds: string[],
  at: Date = new Date(),
): Promise<Map<string, ApplicablePromotion[]>> {
  const result = new Map<string, ApplicablePromotion[]>();
  for (const id of productIds) result.set(id, []);
  if (productIds.length === 0) return result;

  const links = await prisma.promotionProduct.findMany({
    where: { productId: { in: productIds }, promotion: activePromotionWhere(at) },
    include: { promotion: true },
    orderBy: { promotion: { endsAt: "asc" } },
  });

  for (const link of links) {
    result.get(link.productId)?.push({
      promotion: link.promotion,
      conditions: parseConditions(link.promotion.conditionsJson),
    });
  }
  return result;
}

// ---------------------------------------------------------------- 할인 계산

export interface QuoteLineInput {
  /** 견적 시점 단가 스냅샷(KRW Int). */
  unitPrice: number;
  qty: number;
}

export interface PromotionEvaluation {
  promotion: Promotion;
  conditions: PromotionConditions;
  /** 라인 할인액(KRW Int). 항상 0 이상 lineTotal 이하. */
  discount: number;
  /** 조건 미충족 사유. null 이면 적용 가능. */
  ineligibleReason: string | null;
}

export function promotionBenefitLabel(promotion: Promotion): string {
  const type = promotion.benefitType as PromotionBenefitType;
  const value = promotion.benefitValue;
  switch (type) {
    case "PERCENT_DISCOUNT":
      return `${value}% 할인`;
    case "AMOUNT_DISCOUNT":
      return `${value.toLocaleString("ko-KR")}원 할인 (개당)`;
    case "CASHBACK":
      return `${value.toLocaleString("ko-KR")}원 캐시백`;
    case "GIFT":
      return "사은품 증정";
    case "BUNDLE":
      return value > 0 ? `번들 ${value.toLocaleString("ko-KR")}원 혜택` : "번들 혜택";
    default:
      return PROMOTION_BENEFIT_TYPE_LABEL[type] ?? "혜택";
  }
}

/**
 * 견적 라인 한 줄에 프로모션을 적용했을 때의 할인액.
 *
 * - GIFT / CASHBACK / BUNDLE 은 **견적 금액을 깎지 않는다** (discount 0). 사은품·캐시백은
 *   판매가 차감이 아니라 별도 혜택이므로, 목록에는 남기되 합계에는 반영하지 않는다.
 * - 정률 할인은 Math.floor 로 원 단위 절사한다 (금액은 Int).
 * - 최종 할인액은 `0 <= discount <= lineTotal` 로 clamp 한다 (계획 수용기준: 음수 할인 0 clamp).
 */
export function evaluatePromotion(
  candidate: ApplicablePromotion,
  line: QuoteLineInput,
): PromotionEvaluation {
  const { promotion, conditions } = candidate;
  const qty = Math.max(0, Math.trunc(line.qty));
  const unitPrice = Math.max(0, Math.trunc(line.unitPrice));
  const lineTotal = unitPrice * qty;

  let ineligibleReason: string | null = null;
  if (conditions.minQty != null && qty < conditions.minQty) {
    ineligibleReason = `최소 ${conditions.minQty}개 이상 구매 시 적용`;
  } else if (conditions.minAmount != null && lineTotal < conditions.minAmount) {
    ineligibleReason = `최소 구매금액 ${conditions.minAmount.toLocaleString("ko-KR")}원 미만`;
  }

  let discount = 0;
  if (!ineligibleReason) {
    switch (promotion.benefitType as PromotionBenefitType) {
      case "PERCENT_DISCOUNT":
        discount = Math.floor((lineTotal * promotion.benefitValue) / 100);
        break;
      case "AMOUNT_DISCOUNT":
        discount = promotion.benefitValue * qty;
        break;
      default:
        discount = 0;
    }
    if (conditions.maxDiscount != null) discount = Math.min(discount, conditions.maxDiscount);
  }

  return {
    promotion,
    conditions,
    discount: Math.min(Math.max(discount, 0), lineTotal),
    ineligibleReason,
  };
}

/**
 * 후보 중 실제 할인액이 가장 큰 프로모션 하나.
 * 한 라인에 프로모션을 중복 적용하지 않는다는 뜻이며, 할인액이 0인(사은품 등) 후보는
 * 금액 할인 후보가 하나도 없을 때만 선택된다.
 */
export function bestPromotion(
  candidates: ApplicablePromotion[],
  line: QuoteLineInput,
): PromotionEvaluation | null {
  const eligible = candidates
    .map((candidate) => evaluatePromotion(candidate, line))
    .filter((result) => result.ineligibleReason === null);
  if (eligible.length === 0) return null;

  return eligible.reduce((best, current) => (current.discount > best.discount ? current : best));
}

/**
 * QuoteItem.appliedPromotionSnapshot 에 넣을 JSON 문자열.
 * 서명된 계약이 프로모션 변경/종료의 영향을 받지 않도록 적용 시점 값을 통째로 복사한다.
 */
export function promotionSnapshotJson(result: PromotionEvaluation): string {
  const { promotion, conditions, discount } = result;
  return JSON.stringify({
    promotionId: promotion.id,
    code: promotion.code,
    title: promotion.title,
    benefitType: promotion.benefitType,
    benefitValue: promotion.benefitValue,
    conditions,
    startsAt: promotion.startsAt.toISOString(),
    endsAt: promotion.endsAt.toISOString(),
    discount,
    appliedAt: new Date().toISOString(),
  });
}

// -------------------------------------------------------------- 변경 이력

/**
 * P1 대상상품 · 적용조건 변경 이력. 별도 이력 테이블을 만들지 않고 Phase 0 의 AuditLog 를 읽는다.
 * 기록 규약: entityType "Promotion", entityId = promotion.id,
 * action 은 PROMOTION_* 접두사, beforeJson/afterJson 은 변경된 필드만 담은 JSON 문자열.
 */
export const PROMOTION_AUDIT_ENTITY = "Promotion";

export const PROMOTION_AUDIT_ACTION_LABEL: Record<string, string> = {
  PROMOTION_CREATED: "프로모션 등록",
  PROMOTION_PERIOD_CHANGED: "기간 변경",
  PROMOTION_PRODUCTS_CHANGED: "대상상품 변경",
  PROMOTION_CONDITIONS_CHANGED: "적용조건 변경",
  PROMOTION_STATUS_CHANGED: "상태 변경",
};

export async function promotionHistory(promotionId: string, take = 20) {
  return prisma.auditLog.findMany({
    where: { entityType: PROMOTION_AUDIT_ENTITY, entityId: promotionId },
    orderBy: { createdAt: "desc" },
    take,
    include: { actor: { select: { name: true } } },
  });
}
