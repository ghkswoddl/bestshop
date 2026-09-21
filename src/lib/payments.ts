// 결제 및 금융설계 — 할부 계산 · 금융상품 조회 · 파생 상태 (PRD §4 P0 + P1).
//
// 금액은 전부 KRW Int. 이율(apr)은 basis point Int (590 = 5.90%).
// 나눗셈이 들어가는 유일한 지점이 할부 배분이라, 이 모듈이 반올림 규칙의 단일 진실 공급원이다.
//
// 불변식 (scripts/quote-calc-check.ts 가 강제한다):
//   monthlyAmount × (months − 1) + lastMonthAmount === totalPayable − downPayment
//   모든 금액 >= 0, 모든 금액이 정수

import type { FinanceProduct, Prisma } from "@prisma/client";
import type { AuthContext } from "./auth";
import { scopeToStore } from "./auth";
import { prisma } from "./prisma";
import type { FinanceType, PaymentPlanStatus } from "./enums";

/** 이율 계산의 분모. apr 은 basis point 이므로 10000, 연이율이므로 12개월. */
const BASIS_POINTS = 10_000;
const MONTHS_PER_YEAR = 12;

// ------------------------------------------------------------------ 할부 계산

export interface FinanceTerms {
  type: string;
  /** 할부/렌탈 개월 수. 0 이면 일시납. */
  months: number;
  /** 연이율 basis point (590 = 5.90%). */
  apr: number;
}

export interface ScheduleInput {
  /** Quote.grandTotal. 배송·설치비가 이미 포함된 최종 청구액이다. */
  principal: number;
  downPayment: number;
}

export interface PaymentSchedule {
  principal: number;
  downPayment: number;
  /** 선납금을 뺀 할부 대상 금액. */
  financedAmount: number;
  interestTotal: number;
  /** 회차로 쪼개는 금액 = financedAmount + interestTotal. */
  installmentTotal: number;
  /** 실제 회차 수. 일시납이면 0. */
  months: number;
  /** 1 ~ (months-1) 회차 납입액. 일시납이면 0. */
  monthlyAmount: number;
  /** 마지막 회차 납입액. 잔액을 흡수한다. 일시납이면 0. */
  lastMonthAmount: number;
  /** 고객이 최종적으로 내는 총액 = 선납금 + 할부원금 + 이자. */
  totalPayable: number;
}

/**
 * 할부 수수료. **단리**로 계산한다 — `원금 × 연이율 × 개월수 / 12`.
 *
 * 원리금 균등상환(amortization)은 거듭제곱이 필요해 부동소수점을 끌어들인다. 계획 §2 가
 * 금액을 Int 로 못박은 이유가 반올림 불일치이므로, 정수 연산만으로 끝나는 단리를 쓴다.
 * 실제 카드 할부수수료 고지 방식과도 가깝다. 원 단위는 절사한다.
 */
function simpleInterest(financedAmount: number, apr: number, months: number): number {
  if (financedAmount <= 0 || apr <= 0 || months <= 0) return 0;
  return Math.floor((financedAmount * apr * months) / (BASIS_POINTS * MONTHS_PER_YEAR));
}

/**
 * 회차 배분. 계획 §2 규칙대로 **월 납입금을 올림**하고 **마지막 회차가 잔액을 흡수**한다.
 *
 * 올림 배분은 총액이 회차 수에 비해 지나치게 작을 때(총액 < (개월−1)²) 마지막 회차를
 * 음수로 만든다. 현실적인 견적 금액에서는 일어나지 않지만, 음수 납입액을 내보내느니
 * 그 구간에서는 내림 배분으로 떨어뜨린다. 어느 쪽이든 합계 불변식은 정확히 성립한다.
 */
function splitInstallments(
  installmentTotal: number,
  months: number,
): { monthlyAmount: number; lastMonthAmount: number } {
  if (months <= 0 || installmentTotal <= 0) {
    return { monthlyAmount: 0, lastMonthAmount: 0 };
  }

  const rounded = Math.ceil(installmentTotal / months);
  const remainder = installmentTotal - rounded * (months - 1);
  if (remainder >= 0) return { monthlyAmount: rounded, lastMonthAmount: remainder };

  const floored = Math.floor(installmentTotal / months);
  return {
    monthlyAmount: floored,
    lastMonthAmount: installmentTotal - floored * (months - 1),
  };
}

/**
 * 결제 설계 한 건.
 *
 * - `LUMP` 과 `months <= 0` 은 일시납으로 본다. 월 납입금은 **0** 이다 — 원금을 넣으면
 *   결제수단 비교표에서 일시불이 "월 1,100만원" 처럼 보여 오히려 오해를 만든다.
 *   화면은 월 납입금 대신 '일시납' 으로 표기한다.
 * - `RENTAL` 은 원금이 0 일 수 있다(소유권 이전 없는 구성). 그때는 전부 0 이 되고
 *   나눗셈은 애초에 일어나지 않는다.
 */
export function computeSchedule(terms: FinanceTerms, input: ScheduleInput): PaymentSchedule {
  const principal = Math.max(0, Math.trunc(input.principal));
  const downPayment = Math.min(Math.max(0, Math.trunc(input.downPayment)), principal);
  const financedAmount = principal - downPayment;

  const months = terms.type === "LUMP" ? 0 : Math.max(0, Math.trunc(terms.months));
  const interestTotal = simpleInterest(financedAmount, terms.apr, months);
  const installmentTotal = financedAmount + interestTotal;
  const { monthlyAmount, lastMonthAmount } = splitInstallments(installmentTotal, months);

  return {
    principal,
    downPayment,
    financedAmount,
    interestTotal,
    installmentTotal,
    months,
    monthlyAmount,
    lastMonthAmount,
    totalPayable: downPayment + installmentTotal,
  };
}

/** 표시용 연이율. basis point 를 정수 연산만으로 문자열화한다. */
export function aprLabel(apr: number): string {
  if (apr <= 0) return "무이자";
  return `${Math.floor(apr / 100)}.${String(apr % 100).padStart(2, "0")}%`;
}

/** 표시용 회차 문구. */
export function termLabel(terms: FinanceTerms): string {
  if (terms.type === "LUMP" || terms.months <= 0) return "일시납";
  return `${terms.months}개월`;
}

// ------------------------------------------------------------------ 적용 가능성

/**
 * 이 금융상품을 이 금액에 쓸 수 있는가. 쓸 수 없으면 사유 문자열.
 * 프로모션의 `ineligibleReason` 과 같은 방식으로, 후보는 목록에 남기되 이유를 함께 보여준다.
 */
export function financeIneligibleReason(
  product: Pick<FinanceProduct, "active" | "minAmount" | "maxAmount">,
  principal: number,
): string | null {
  if (!product.active) return "판매 중지된 금융상품";
  if (product.minAmount != null && principal < product.minAmount) {
    return `최소 결제금액 ${product.minAmount.toLocaleString("ko-KR")}원 이상`;
  }
  if (product.maxAmount != null && principal > product.maxAmount) {
    return `최대 결제금액 ${product.maxAmount.toLocaleString("ko-KR")}원 이하`;
  }
  return null;
}

// -------------------------------------------------------------------- 조회

export function activeFinanceProducts(): Promise<FinanceProduct[]> {
  return prisma.financeProduct.findMany({
    where: { active: true },
    orderBy: [{ type: "asc" }, { months: "asc" }, { apr: "asc" }],
  });
}

export const paymentPlanInclude = {
  financeProduct: true,
} satisfies Prisma.PaymentPlanInclude;

export type PaymentPlanDetail = Prisma.PaymentPlanGetPayload<{
  include: typeof paymentPlanInclude;
}>;

/** 매장 스코프 조회 — PaymentPlan 에는 storeId 가 없으므로 견적을 통해 좁힌다. */
export function findPaymentPlan(
  ctx: AuthContext,
  quoteId: string,
): Promise<PaymentPlanDetail | null> {
  return prisma.paymentPlan.findFirst({
    where: { quoteId, quote: scopeToStore(ctx) },
    include: paymentPlanInclude,
  });
}

// ------------------------------------------------------- P1 결제수단 비교

export interface PaymentComparisonRow {
  product: FinanceProduct;
  schedule: PaymentSchedule;
  ineligibleReason: string | null;
}

/**
 * P1 결제수단별 · 조건별 비교. 같은 원금에 모든 금융상품을 태워 본다.
 * 계산은 `computeSchedule` 하나만 쓴다 — 비교표가 저장된 설계와 다른 수식을 쓰면 안 된다.
 */
export function comparePaymentOptions(
  products: FinanceProduct[],
  input: ScheduleInput,
): PaymentComparisonRow[] {
  return products.map((product) => ({
    product,
    schedule: computeSchedule(product, input),
    ineligibleReason: financeIneligibleReason(product, input.principal),
  }));
}

// ---------------------------------------------------------------- 승인 상태

export const PAYMENT_PLAN_STATUS_LABEL: Record<PaymentPlanStatus, string> = {
  DRAFT: "설계중",
  APPROVED: "승인",
  REJECTED: "승인거절",
  CANCELLED: "취소",
};

export const FINANCE_TYPE_LABEL: Record<FinanceType, string> = {
  LUMP: "일시불",
  CARD: "카드",
  INSTALLMENT: "할부",
  RENTAL: "렌탈",
};

/**
 * 지금 이 설계를 승인/거절/취소할 수 있는가. 살아 있는 설계(DRAFT)에만 해당한다.
 * 승인·거절된 설계는 결과가 확정된 것이므로 손대려면 먼저 취소해야 한다.
 */
export function isPlanEditable(plan: { status: string } | null): boolean {
  return plan == null || plan.status === "DRAFT";
}

/**
 * 새 설계로 덮어쓸 수 있는가.
 *
 * `isPlanEditable` 과 다르다 — **취소된 설계 위에는 다시 설계할 수 있어야 한다.**
 * `PaymentPlan` 은 `quoteId` 에 1:1 이라 취소본이 자리를 차지하고 있는데, 이것까지 막으면
 * 한 번 취소한 견적은 영영 결제설계를 붙일 수 없는 막다른 길이 된다.
 */
export function canReplacePlan(plan: { status: string } | null): boolean {
  return plan == null || plan.status === "DRAFT" || plan.status === "CANCELLED";
}
