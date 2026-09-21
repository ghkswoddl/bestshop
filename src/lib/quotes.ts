// 견적 조회 · 금액 계산 · 파생 상태 (PRD §4 견적서 작성 P0 + P1).
//
// 금액은 전부 KRW Int. 나눗셈이 끼는 지점은 프로모션 계산뿐이고 그쪽은
// src/lib/promotions.ts 가 Math.floor 로 정수화한다 — 이 모듈은 덧셈/뺄셈만 한다.
//
// 단가는 라인을 담는 순간 Product.basePrice 를 QuoteItem.unitPriceSnapshot 으로 복사한다.
// 이후 상품 가격이 바뀌어도 기존 견적/계약 금액은 움직이지 않는다 (계획 §2 원칙 2).

import type { Prisma } from "@prisma/client";
import type { AuthContext } from "./auth";
import { scopeToStore } from "./auth";
import { prisma } from "./prisma";
import {
  applicablePromotions,
  bestPromotion,
  evaluatePromotion,
  promotionSnapshotJson,
  type ApplicablePromotion,
  type PromotionEvaluation,
} from "./promotions";
import { QUOTE_STATUS_LABEL, type QuoteStatus } from "./enums";

const DAY_MS = 86_400_000;

// ------------------------------------------------------------------ 편집 가능성

/**
 * DRAFT 만 편집할 수 있다.
 *
 * Phase 8 이 계약을 만들 때 상태를 LOCKED/CONVERTED 로 올리면, 그 순간부터 이 함수가
 * false 를 돌려주고 모든 쓰기 액션이 거부된다. 잠긴 견적을 이어서 고치려면
 * forkQuoteAction 으로 새 버전을 떠야 한다 — 원본은 절대 변하지 않는다.
 */
export function isQuoteEditable(quote: { status: string }): boolean {
  return quote.status === "DRAFT";
}

export function quoteLockReason(quote: { status: string }): string | null {
  if (isQuoteEditable(quote)) return null;
  const label = QUOTE_STATUS_LABEL[quote.status as QuoteStatus] ?? quote.status;

  // SENT 는 결제설계가 붙어서 잠긴 상태다. 결제설계를 취소하면 다시 열리므로
  // 새 버전 말고 더 가벼운 길을 먼저 알려 준다.
  if (quote.status === "SENT") {
    return `결제설계가 연결되어 '${label}' 상태입니다. 금액을 고치려면 결제설계를 취소하거나 새 버전을 만드세요.`;
  }
  return `'${label}' 상태의 견적은 수정할 수 없습니다. 새 버전을 만들어 이어서 작성하세요.`;
}

// -------------------------------------------------------------------- 금액 계산

export interface QuoteLineAmounts {
  unitPriceSnapshot: number;
  qty: number;
  discountAmount: number;
}

export interface QuoteFees {
  deliveryFee: number;
  installFee: number;
}

export interface QuoteTotals {
  subtotal: number;
  discountTotal: number;
  deliveryFee: number;
  installFee: number;
  grandTotal: number;
}

/** 라인 합계 = 단가 스냅샷 × 수량 − 할인액. 할인은 promotions.ts 가 이미 라인합계 이하로 clamp 한다. */
export function lineTotalOf(line: QuoteLineAmounts): number {
  return line.unitPriceSnapshot * line.qty - line.discountAmount;
}

/**
 * 견적 합계. 라인 할인이 라인합계를 넘지 못하므로 `subtotal - discountTotal` 은 음수가 될 수
 * 없고 배송/설치비는 음수를 받지 않는다. 그럼에도 총액에 0 하한을 두는 이유는, 나중에 누가
 * 음수 조정 항목을 넣더라도 고객에게 음수 청구액이 보이지 않게 하기 위함이다 (계획 수용기준).
 */
export function computeQuoteTotals(lines: QuoteLineAmounts[], fees: QuoteFees): QuoteTotals {
  const subtotal = lines.reduce((sum, line) => sum + line.unitPriceSnapshot * line.qty, 0);
  const discountTotal = lines.reduce((sum, line) => sum + line.discountAmount, 0);
  const deliveryFee = Math.max(0, fees.deliveryFee);
  const installFee = Math.max(0, fees.installFee);

  return {
    subtotal,
    discountTotal,
    deliveryFee,
    installFee,
    grandTotal: Math.max(0, subtotal - discountTotal + deliveryFee + installFee),
  };
}

// ------------------------------------------------------------ 프로모션 적용

export interface PricedLineInput {
  productId: string;
  qty: number;
  unitPriceSnapshot: number;
}

export interface PricedLine extends PricedLineInput {
  discountAmount: number;
  appliedPromotionId: string | null;
  appliedPromotionSnapshot: string | null;
  lineTotal: number;
}

/**
 * 라인마다 가장 유리한 프로모션 1건을 골라 할인액과 스냅샷을 채운다.
 *
 * `bestPromotion` 이 돌려주는 discount 는 이미 `0 <= discount <= lineTotal` 로 clamp 되어
 * 있으므로 여기서 다시 clamp 하지 않는다 (이중 clamp 는 버그를 숨긴다 — Phase 5 handoff).
 */
export async function priceLines(
  inputs: PricedLineInput[],
  at: Date = new Date(),
): Promise<PricedLine[]> {
  if (inputs.length === 0) return [];

  const candidates = await applicablePromotions(
    inputs.map((line) => line.productId),
    at,
  );

  return inputs.map((line) => {
    const best = bestPromotion(candidates.get(line.productId) ?? [], {
      unitPrice: line.unitPriceSnapshot,
      qty: line.qty,
    });
    const discountAmount = best?.discount ?? 0;
    return {
      ...line,
      discountAmount,
      appliedPromotionId: best?.promotion.id ?? null,
      appliedPromotionSnapshot: best ? promotionSnapshotJson(best) : null,
      lineTotal: line.unitPriceSnapshot * line.qty - discountAmount,
    };
  });
}

/**
 * 라인별 프로모션 후보 **전부**를 평가해 돌려준다. 적용된 1건만 보여주면 매니저가
 * "왜 저 프로모션은 안 붙었지?" 를 알 수 없어, 미적용 후보의 ineligibleReason 까지 화면에 낸다.
 */
export async function promotionBreakdown(
  lines: PricedLineInput[],
  at: Date = new Date(),
): Promise<Map<string, PromotionEvaluation[]>> {
  const result = new Map<string, PromotionEvaluation[]>();
  if (lines.length === 0) return result;

  const candidates = await applicablePromotions(
    lines.map((line) => line.productId),
    at,
  );

  for (const line of lines) {
    const forProduct: ApplicablePromotion[] = candidates.get(line.productId) ?? [];
    result.set(
      line.productId,
      forProduct.map((candidate) =>
        evaluatePromotion(candidate, { unitPrice: line.unitPriceSnapshot, qty: line.qty }),
      ),
    );
  }
  return result;
}

// ---------------------------------------------------------------------- 조회

export const quoteInclude = {
  items: {
    orderBy: { sortOrder: "asc" },
    include: { product: { include: { category: true } } },
  },
  customer: { select: { id: true, name: true, phone: true, memberNo: true, address: true, addressDetail: true } },
  manager: { select: { id: true, name: true, employeeNo: true } },
  store: { select: { id: true, name: true, code: true, phone: true, address: true } },
  consultation: { select: { id: true, stage: true, startedAt: true } },
} satisfies Prisma.QuoteInclude;

export type QuoteDetail = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>;
export type QuoteLine = QuoteDetail["items"][number];

/** 매장 스코프 단건 조회. 타 매장 견적은 존재 자체가 보이지 않는다. */
export function findQuote(ctx: AuthContext, quoteId: string): Promise<QuoteDetail | null> {
  return prisma.quote.findFirst({
    where: { id: quoteId, ...scopeToStore(ctx) },
    include: quoteInclude,
  });
}

export const QUOTE_LIST_FILTERS = ["all", "editable", "locked", "expired"] as const;
export type QuoteListFilter = (typeof QUOTE_LIST_FILTERS)[number];

/** P1 견적서 템플릿 — templateName 이 채워진 견적을 재사용 가능한 구성으로 본다. */
export function quoteTemplates(ctx: AuthContext, take = 20) {
  return prisma.quote.findMany({
    where: { ...scopeToStore(ctx), templateName: { not: null } },
    orderBy: { updatedAt: "desc" },
    take,
    select: {
      id: true,
      templateName: true,
      quoteNo: true,
      grandTotal: true,
      _count: { select: { items: true } },
    },
  });
}

// ------------------------------------------------------------ 유효기간 (P1)

/** 유효기간 임박 판정 구간. 프로모션의 종료임박과 같은 7일 기준을 쓴다. */
export const QUOTE_EXPIRING_WINDOW_DAYS = 7;

export type QuoteValidityLevel = "NONE" | "VALID" | "EXPIRING" | "EXPIRED";

export interface QuoteValidity {
  level: QuoteValidityLevel;
  daysLeft: number | null;
  label: string;
}

/** 저장하지 않고 조회 시점에 계산한다 (계획 §1 — 알림 테이블/배치 없음). */
export function quoteValidity(
  quote: { validUntil: Date | null },
  at: Date = new Date(),
): QuoteValidity {
  if (!quote.validUntil) {
    return { level: "NONE", daysLeft: null, label: "유효기간 미설정" };
  }

  const daysLeft = Math.ceil((quote.validUntil.getTime() - at.getTime()) / DAY_MS);
  if (daysLeft < 0) return { level: "EXPIRED", daysLeft, label: `유효기간 ${-daysLeft}일 경과` };
  if (daysLeft <= QUOTE_EXPIRING_WINDOW_DAYS) {
    return { level: "EXPIRING", daysLeft, label: `유효기간 ${daysLeft}일 남음` };
  }
  return { level: "VALID", daysLeft, label: `유효기간 ${daysLeft}일 남음` };
}

// -------------------------------------------------------- 버전 이력 (P1)

export interface QuoteVersion {
  id: string;
  quoteNo: string;
  version: number;
  status: string;
  parentQuoteId: string | null;
  grandTotal: number;
  createdAt: Date;
}

/**
 * P1 견적 변경 이력 = `parentQuoteId` 로 이어진 버전 사슬.
 *
 * 같은 고객의 견적을 한 번에 읽어 메모리에서 연결 요소를 찾는다. 부모를 따라 올라가며
 * 매번 질의하면 사슬 길이만큼 왕복이 생기고, 한 견적에서 두 번 분기한 경우를 놓친다.
 */
export async function quoteVersionChain(
  ctx: AuthContext,
  quote: { id: string; customerId: string },
): Promise<QuoteVersion[]> {
  const all = await prisma.quote.findMany({
    where: { customerId: quote.customerId, ...scopeToStore(ctx) },
    orderBy: { version: "asc" },
    select: {
      id: true,
      quoteNo: true,
      version: true,
      status: true,
      parentQuoteId: true,
      grandTotal: true,
      createdAt: true,
    },
  });

  const byId = new Map(all.map((row) => [row.id, row]));
  const childrenOf = new Map<string, QuoteVersion[]>();
  for (const row of all) {
    if (!row.parentQuoteId) continue;
    const siblings = childrenOf.get(row.parentQuoteId);
    if (siblings) siblings.push(row);
    else childrenOf.set(row.parentQuoteId, [row]);
  }

  const connected = new Map<string, QuoteVersion>();
  const queue = [quote.id];
  while (queue.length > 0) {
    const id = queue.pop();
    if (id == null || connected.has(id)) continue;
    const row = byId.get(id);
    if (!row) continue;

    connected.set(id, row);
    if (row.parentQuoteId) queue.push(row.parentQuoteId);
    for (const child of childrenOf.get(id) ?? []) queue.push(child.id);
  }

  return [...connected.values()].sort((a, b) => a.version - b.version);
}

// ----------------------------------------------------------------- 견적번호

/**
 * `Q-{매장코드}-{YYMMDD}-{일련번호}`. 같은 매장/같은 날 견적 수 + 1 로 만들고,
 * 동시 생성으로 unique 충돌이 나면 호출측이 재시도한다.
 */
export async function nextQuoteNo(
  tx: Prisma.TransactionClient,
  storeCode: string,
  at: Date = new Date(),
): Promise<string> {
  const kst = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  const stamp = kst.toISOString().slice(2, 10).replace(/-/g, "");
  const prefix = `Q-${storeCode}-${stamp}-`;

  const todayCount = await tx.quote.count({ where: { quoteNo: { startsWith: prefix } } });
  return `${prefix}${String(todayCount + 1).padStart(3, "0")}`;
}
