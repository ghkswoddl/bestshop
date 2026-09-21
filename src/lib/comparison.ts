// 상품비교 조회/파생 헬퍼 (PRD §4 상품비교 P0 + P1).
//
// 비교함 자체의 생성/담기는 Phase 3 의 src/lib/catalog.ts 가 이미 갖고 있다.
// 이 모듈은 "담긴 것을 어떻게 보여주고 무엇을 견적으로 넘기는가" 만 다룬다.

import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export const comparisonInclude = {
  items: {
    orderBy: { sortOrder: "asc" },
    include: {
      product: {
        include: { category: true, specs: { orderBy: { sortOrder: "asc" } } },
      },
    },
  },
  consultation: {
    select: {
      id: true,
      stage: true,
      startedAt: true,
      customer: { select: { id: true, name: true } },
    },
  },
  customer: { select: { id: true, name: true } },
} satisfies Prisma.ComparisonInclude;

export type ComparisonDetail = Prisma.ComparisonGetPayload<{ include: typeof comparisonInclude }>;
export type ComparisonEntry = ComparisonDetail["items"][number];

/**
 * 열려있는(미저장) 비교함을 **만들지 않고** 읽는다.
 * /compare 는 GET 렌더에서 레코드를 새로 만들지 않는다 — 담기 액션이 필요할 때만 만든다.
 */
export function findOpenComparison(managerId: string): Promise<ComparisonDetail | null> {
  return prisma.comparison.findFirst({
    where: { managerId, savedAt: null },
    orderBy: { createdAt: "desc" },
    include: comparisonInclude,
  });
}

/** 저장본을 포함해 단건을 연다. 다른 매니저의 비교함은 보이지 않는다. */
export function findComparison(managerId: string, comparisonId: string) {
  return prisma.comparison.findFirst({
    where: { id: comparisonId, managerId },
    include: comparisonInclude,
  });
}

/** P1 — 저장된 비교 결과 목록 (상담 연계 정보 포함). */
export function savedComparisons(managerId: string, take = 10) {
  return prisma.comparison.findMany({
    where: { managerId, savedAt: { not: null } },
    orderBy: { savedAt: "desc" },
    take,
    include: comparisonInclude,
  });
}

/**
 * **Phase 6(견적서 작성)의 진입 API.**
 *
 * 비교 화면에서 "견적 대상"으로 체크한 상품의 id 를 비교함 정렬순서대로 돌려준다.
 * 하나도 고르지 않았으면 빈 배열이다 — 견적 화면은 이때 비교함 전체를 후보로 보여주거나
 * 사용자에게 선택을 요구하면 된다 (빈 배열을 "전체 선택"으로 해석하지 말 것).
 */
export async function quoteCandidateProductIds(comparisonId: string): Promise<string[]> {
  const items = await prisma.comparisonItem.findMany({
    where: { comparisonId, isQuoteCandidate: true },
    orderBy: { sortOrder: "asc" },
    select: { productId: true },
  });
  return items.map((item) => item.productId);
}

// ------------------------------------------------------------------ 스펙 매트릭스

export interface SpecRow {
  key: string;
  unit: string | null;
  /** 어느 한 상품에서라도 주요 스펙(ProductSpec.isKey)이면 true — 위쪽에 정렬한다. */
  isKey: boolean;
  /** 열(비교 항목) 순서와 1:1. 해당 상품에 그 스펙이 없으면 null → 화면에서 "-". */
  values: (string | null)[];
  /** 값이 실제로 갈리는 행인지. "차이나는 항목만 보기" 필터에 쓴다. */
  differs: boolean;
}

/**
 * 카테고리가 섞인 비교에서도 동작하도록 **스펙 키의 합집합**으로 행을 만든다.
 * 정렬은 주요 스펙 우선 → 원래 표시순서(sortOrder) → 키 이름순.
 */
export function buildSpecMatrix(items: ComparisonEntry[]): SpecRow[] {
  interface Meta {
    isKey: boolean;
    unit: string | null;
    minOrder: number;
  }
  const meta = new Map<string, Meta>();

  for (const item of items) {
    for (const spec of item.product.specs) {
      const prev = meta.get(spec.key);
      if (!prev) {
        meta.set(spec.key, { isKey: spec.isKey, unit: spec.unit, minOrder: spec.sortOrder });
        continue;
      }
      prev.isKey = prev.isKey || spec.isKey;
      prev.unit = prev.unit ?? spec.unit;
      prev.minOrder = Math.min(prev.minOrder, spec.sortOrder);
    }
  }

  const valueOf = (item: ComparisonEntry, key: string) =>
    item.product.specs.find((spec) => spec.key === key)?.value ?? null;

  return [...meta.entries()]
    .sort(([keyA, a], [keyB, b]) => {
      if (a.isKey !== b.isKey) return a.isKey ? -1 : 1;
      if (a.minOrder !== b.minOrder) return a.minOrder - b.minOrder;
      return keyA.localeCompare(keyB, "ko-KR");
    })
    .map(([key, info]) => {
      const values = items.map((item) => valueOf(item, key));
      const present = values.filter((value): value is string => value != null);
      return {
        key,
        unit: info.unit,
        isKey: info.isKey,
        values,
        differs: present.length > 0 && new Set(present).size > 1,
      };
    });
}

// --------------------------------------------------------- P1 구매 시나리오 비교

export interface ScenarioLine {
  categoryName: string;
  productId: string;
  productName: string;
  price: number;
}

export interface Scenario {
  key: "value" | "current" | "premium";
  label: string;
  note: string;
  lines: ScenarioLine[];
  total: number;
}

/**
 * P1 구매 시나리오 비교.
 *
 * 비교함에 담긴 **카테고리 집합**을 그대로 두고 가격대만 바꿔 세 가지 구성의 합계를 낸다.
 * - 실속 구성: 카테고리별 카탈로그 최저가 판매중 상품
 * - 현재 비교 구성: 비교함 항목 (같은 카테고리가 여럿이면 최저가 1개)
 * - 프리미엄 구성: 카테고리별 카탈로그 최고가 판매중 상품
 *
 * 프로모션/할인은 반영하지 않는다 — 정가(basePrice) 기준 참고용이고,
 * 실제 금액은 Phase 6 의 견적 계산이 단일 진실 공급원이다.
 */
export async function purchaseScenarios(items: ComparisonEntry[]): Promise<Scenario[]> {
  if (items.length === 0) return [];

  const categoryIds = [...new Set(items.map((item) => item.product.categoryId))];
  const catalog = await prisma.product.findMany({
    where: { categoryId: { in: categoryIds }, status: "ON_SALE" },
    include: { category: true },
    orderBy: { basePrice: "asc" },
  });

  const pick = (categoryId: string, mode: "min" | "max") => {
    const inCategory = catalog.filter((product) => product.categoryId === categoryId);
    if (inCategory.length === 0) return null;
    // catalog 는 basePrice asc 로 정렬되어 있다.
    return mode === "min" ? inCategory[0] : inCategory[inCategory.length - 1];
  };

  const comparedByCategory = categoryIds.map((categoryId) => {
    const inCategory = items.filter((item) => item.product.categoryId === categoryId);
    return inCategory.reduce((best, current) =>
      current.product.basePrice < best.product.basePrice ? current : best,
    );
  });

  const toLines = (mode: "min" | "max"): ScenarioLine[] =>
    categoryIds.flatMap((categoryId) => {
      const product = pick(categoryId, mode);
      return product
        ? [
            {
              categoryName: product.category.name,
              productId: product.id,
              productName: product.name,
              price: product.basePrice,
            },
          ]
        : [];
    });

  const currentLines: ScenarioLine[] = comparedByCategory.map((item) => ({
    categoryName: item.product.category.name,
    productId: item.product.id,
    productName: item.product.name,
    price: item.product.basePrice,
  }));

  const sum = (lines: ScenarioLine[]) => lines.reduce((total, line) => total + line.price, 0);
  const valueLines = toLines("min");
  const premiumLines = toLines("max");

  return [
    {
      key: "value",
      label: "실속 구성",
      note: "카테고리별 최저가 판매중 상품",
      lines: valueLines,
      total: sum(valueLines),
    },
    {
      key: "current",
      label: "현재 비교 구성",
      note: "비교함에 담긴 상품 (같은 카테고리는 최저가 1개)",
      lines: currentLines,
      total: sum(currentLines),
    },
    {
      key: "premium",
      label: "프리미엄 구성",
      note: "카테고리별 최고가 판매중 상품",
      lines: premiumLines,
      total: sum(premiumLines),
    },
  ];
}

// ------------------------------------------------------------- P1 추천 조합

export interface CombinationSuggestion {
  product: Prisma.ProductGetPayload<{ include: { category: true } }>;
  reason: string;
}

/**
 * P1 추천 조합.
 *
 * 1순위 신호는 **다른 비교함에 함께 담긴 적 있는 상품**(공동 출현 횟수)이다. Phase 3 의
 * 인기상품과 같은 성격으로, 쓰면 쓸수록 채워지는 정직한 신호다.
 * 공동 출현 데이터가 아직 없으면 **비교함에 없는 카테고리에서 현재 평균가와 가장 가까운
 * 상품**으로 대체한다 (가격대가 어울리는 다른 카테고리 구성 제안). 어느 신호를 썼는지는
 * reason 문구로 화면에 그대로 드러낸다.
 */
export async function suggestCombination(
  items: ComparisonEntry[],
  take = 3,
): Promise<CombinationSuggestion[]> {
  if (items.length === 0) return [];

  const ownProductIds = items.map((item) => item.product.id);
  const ownComparisonIds = [...new Set(items.map((item) => item.comparisonId))];

  const coOccurring = await prisma.comparisonItem.findMany({
    where: {
      comparisonId: { notIn: ownComparisonIds },
      productId: { notIn: ownProductIds },
      comparison: { items: { some: { productId: { in: ownProductIds } } } },
    },
    select: { productId: true },
  });

  if (coOccurring.length > 0) {
    const counts = new Map<string, number>();
    for (const row of coOccurring) counts.set(row.productId, (counts.get(row.productId) ?? 0) + 1);

    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, take);
    const products = await prisma.product.findMany({
      where: { id: { in: ranked.map(([id]) => id) } },
      include: { category: true },
    });
    const byId = new Map(products.map((product) => [product.id, product]));

    return ranked.flatMap(([id, count]) => {
      const product = byId.get(id);
      return product ? [{ product, reason: `다른 비교함에서 ${count}회 함께 비교됨` }] : [];
    });
  }

  const ownCategoryIds = [...new Set(items.map((item) => item.product.categoryId))];
  const averagePrice = Math.round(
    items.reduce((total, item) => total + item.product.basePrice, 0) / items.length,
  );

  const others = await prisma.product.findMany({
    where: { categoryId: { notIn: ownCategoryIds }, status: "ON_SALE" },
    include: { category: true },
  });

  const bestPerCategory = new Map<string, (typeof others)[number]>();
  for (const product of others) {
    const current = bestPerCategory.get(product.categoryId);
    if (
      !current ||
      Math.abs(product.basePrice - averagePrice) < Math.abs(current.basePrice - averagePrice)
    ) {
      bestPerCategory.set(product.categoryId, product);
    }
  }

  return [...bestPerCategory.values()]
    .sort(
      (a, b) => Math.abs(a.basePrice - averagePrice) - Math.abs(b.basePrice - averagePrice),
    )
    .slice(0, take)
    .map((product) => ({
      product,
      reason: `비교 평균가와 가까운 ${product.category.name} 구성 후보`,
    }));
}
