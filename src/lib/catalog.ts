// 상품 카탈로그 / 재고 조회 헬퍼.
// Phase 4(상품비교) · 5(프로모션) · 6(견적서) 는 이 모듈의 쿼리 패턴을 그대로 재사용한다.

import type { Prisma } from "@prisma/client";
import type { AuthContext } from "./auth";
import { scopeToStore } from "./auth";
import { prisma } from "./prisma";
import { deriveStock, type InventoryFacts, type StockView } from "./inventory";

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Next 의 searchParams 값은 문자열이거나 배열이다. 첫 값만 취하고 공백은 버린다. */
export function pickOne(params: RawSearchParams, key: string): string | undefined {
  const value = params[key];
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

export function pickInt(params: RawSearchParams, key: string): number | undefined {
  const raw = pickOne(params, key);
  if (raw == null) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

/** 서버 액션이 되돌아올 현재 경로. 액션 결과 파라미터는 중복되지 않게 걷어낸다. */
export function buildReturnTo(pathname: string, params: RawSearchParams): string {
  const search = new URLSearchParams();
  for (const key of Object.keys(params)) {
    if (key === "compare" || key === "transfer") continue;
    const value = pickOne(params, key);
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** 계획 §2 — 비교 항목은 최대 4개, 애플리케이션 레벨에서 강제한다. */
export const COMPARISON_LIMIT = 4;

/**
 * 매니저의 열려있는(미저장) 비교함. Phase 4 의 /compare 가 같은 레코드를 진입점으로 읽는다.
 * savedAt 이 채워지면 상담 이력에 묶인 스냅샷으로 보고 다음 요청에 새 비교함을 연다.
 */
export async function openComparison(managerId: string) {
  const existing = await prisma.comparison.findFirst({
    where: { managerId, savedAt: null },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (existing) return existing;

  return prisma.comparison.create({
    data: { managerId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
}

/** 비교함을 새로 만들지 않고 현재 담긴 productId 만 읽는다 (목록의 담김 표시용). */
export async function comparisonProductIds(managerId: string): Promise<Set<string>> {
  const comparison = await prisma.comparison.findFirst({
    where: { managerId, savedAt: null },
    orderBy: { createdAt: "desc" },
    include: { items: { select: { productId: true } } },
  });
  return new Set(comparison?.items.map((item) => item.productId) ?? []);
}

export const PRODUCT_SORTS = {
  name: { label: "상품명순", orderBy: { name: "asc" } },
  priceAsc: { label: "가격 낮은순", orderBy: { basePrice: "asc" } },
  priceDesc: { label: "가격 높은순", orderBy: { basePrice: "desc" } },
  newest: { label: "최신 출시순", orderBy: { releasedAt: "desc" } },
} as const satisfies Record<string, { label: string; orderBy: Prisma.ProductOrderByWithRelationInput }>;

export type ProductSortKey = keyof typeof PRODUCT_SORTS;

export function resolveSort(value: string | undefined): ProductSortKey {
  return value && value in PRODUCT_SORTS ? (value as ProductSortKey) : "name";
}

export interface ProductFilter {
  q?: string;
  categoryId?: string;
  status?: string;
  minPrice?: number;
  maxPrice?: number;
  /** 내 매장에 판매가능 재고가 있는 상품만. */
  inStockStoreId?: string;
}

/**
 * 상품명 · 모델코드 · 카테고리명 · 주요 스펙(키/값) 통합 검색 (PRD §4 상품탐색 P0).
 *
 * SQLite 는 `mode: "insensitive"` 를 지원하지 않는다. 한글은 대소문자가 없어 문제가 없고,
 * ASCII 인 모델코드만 원문/대문자 두 갈래로 매칭한다.
 */
export function productWhere(filter: ProductFilter): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];
  const q = filter.q?.trim();

  if (q) {
    and.push({
      OR: [
        { name: { contains: q } },
        { modelCode: { contains: q } },
        { modelCode: { contains: q.toUpperCase() } },
        { description: { contains: q } },
        { category: { name: { contains: q } } },
        { specs: { some: { OR: [{ key: { contains: q } }, { value: { contains: q } }] } } },
      ],
    });
  }
  if (filter.categoryId) and.push({ categoryId: filter.categoryId });
  if (filter.status) and.push({ status: filter.status });
  if (filter.minPrice != null) and.push({ basePrice: { gte: filter.minPrice } });
  if (filter.maxPrice != null) and.push({ basePrice: { lte: filter.maxPrice } });
  if (filter.inStockStoreId) {
    and.push({
      inventoryItems: { some: { storeId: filter.inStockStoreId, quantity: { gt: 0 } } },
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

function mergeFacts(rows: InventoryFacts[]): InventoryFacts | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];
  // HQ 는 scopeToStore 가 {} 를 돌려주므로 여러 매장 행이 온다. 전사 합계로 합친다.
  return {
    quantity: rows.reduce((sum, r) => sum + r.quantity, 0),
    reservedQty: rows.reduce((sum, r) => sum + r.reservedQty, 0),
    safetyStock: Math.max(...rows.map((r) => r.safetyStock)),
    status: rows.every((r) => r.status === "SALE_STOPPED") ? "SALE_STOPPED" : "IN_STOCK",
    asOfAt: rows.reduce((oldest, r) => (r.asOfAt < oldest ? r.asOfAt : oldest), rows[0].asOfAt),
  };
}

/**
 * "내 매장" 기준 재고 맵. 목록 화면의 배지에 쓴다.
 * scopeToStore 를 통과하므로 타 매장 재고는 절대 섞이지 않는다 (HQ 제외 — 정책상 전 매장 합계).
 */
export async function storeStockMap(
  ctx: AuthContext,
  productIds: string[],
  productStatusById?: Map<string, string>,
): Promise<Map<string, StockView>> {
  const result = new Map<string, StockView>();
  if (productIds.length === 0) return result;

  const rows = await prisma.inventoryItem.findMany({
    where: { ...scopeToStore(ctx), productId: { in: productIds } },
  });

  const byProduct = new Map<string, InventoryFacts[]>();
  for (const row of rows) {
    const list = byProduct.get(row.productId);
    if (list) list.push(row);
    else byProduct.set(row.productId, [row]);
  }

  for (const productId of productIds) {
    result.set(
      productId,
      deriveStock(mergeFacts(byProduct.get(productId) ?? []), productStatusById?.get(productId)),
    );
  }
  return result;
}

/**
 * 한 상품의 전 매장 재고 (PRD §4 P1 인접매장 통합조회).
 *
 * **의도적으로 scopeToStore 를 적용하지 않는다.** 매니저가 "이 상품 다른 매장에 있나?" 를
 * 확인하는 것이 이 기능의 목적이고, 노출 범위는 수량/기준시각뿐인 읽기 전용 정보다.
 */
export async function crossStoreStock(productId: string, productStatus: string) {
  const [stores, items] = await Promise.all([
    prisma.store.findMany({ orderBy: { code: "asc" } }),
    prisma.inventoryItem.findMany({ where: { productId } }),
  ]);
  const byStore = new Map(items.map((item) => [item.storeId, item]));

  return stores.map((store) => ({
    store,
    view: deriveStock(byStore.get(store.id) ?? null, productStatus),
  }));
}

/**
 * P1 최근 조회 기록. 상품 상세는 세션 쿠키를 읽는 동적 렌더라 요청마다 정확히 한 번 실행된다.
 * `@@unique([managerId, targetType, targetId])` 덕에 재방문은 viewedAt 만 갱신한다.
 */
export async function recordProductView(managerId: string, productId: string): Promise<void> {
  await prisma.recentlyViewed.upsert({
    where: { managerId_targetType_targetId: { managerId, targetType: "PRODUCT", targetId: productId } },
    update: { viewedAt: new Date() },
    create: { managerId, targetType: "PRODUCT", targetId: productId, productId },
  });
}

/** P1 최근 조회 — 상품 상세 진입 시 upsert 된 RecentlyViewed 를 읽는다. */
export async function recentlyViewedProducts(managerId: string, take = 5) {
  const rows = await prisma.recentlyViewed.findMany({
    where: { managerId, targetType: "PRODUCT", productId: { not: null } },
    orderBy: { viewedAt: "desc" },
    take,
    include: { product: { include: { category: true } } },
  });
  return rows.flatMap((row) => (row.product ? [{ product: row.product, viewedAt: row.viewedAt }] : []));
}

/**
 * P1 인기상품.
 *
 * 지금 가진 정직한 신호는 조회 기록뿐이라 **RecentlyViewed 를 본 매니저 수**로 집계한다
 * (`@@unique([managerId, targetType, targetId])` 때문에 1 매니저 = 1 표). 견적 데이터가 쌓이는
 * Phase 6/11 이후에는 QuoteItem 참조 수로 바꾸는 편이 낫다.
 */
export async function popularProducts(take = 5) {
  const grouped = await prisma.recentlyViewed.groupBy({
    by: ["productId"],
    where: { targetType: "PRODUCT", productId: { not: null } },
    _count: { productId: true },
    orderBy: { _count: { productId: "desc" } },
    take,
  });

  const ids = grouped.flatMap((row) => (row.productId ? [row.productId] : []));
  if (ids.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: { category: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  return grouped.flatMap((row) => {
    const product = row.productId ? byId.get(row.productId) : undefined;
    return product ? [{ product, viewerCount: row._count.productId }] : [];
  });
}

export interface Recommendation {
  product: Prisma.ProductGetPayload<{ include: { category: true } }>;
  reason: string;
}

/**
 * P1 보유가전 기반 추천 — 고객이 가진 가전의 카테고리에서 교체 후보를 고른다.
 * 정확히 같은 모델은 제외한다. OwnedAppliance 가 0건이면 빈 배열 (Phase 2 데이터가
 * 아직 없어도 화면이 깨지지 않아야 한다).
 */
export async function recommendProductsForCustomer(
  customerId: string,
  take = 6,
): Promise<Recommendation[]> {
  const owned = await prisma.ownedAppliance.findMany({
    where: { customerId },
    include: { category: true },
  });
  if (owned.length === 0) return [];

  const categoryIds = [...new Set(owned.map((o) => o.categoryId))];
  const excludeIds = owned.flatMap((o) => (o.productId ? [o.productId] : []));
  const excludeModels = owned.map((o) => o.modelName);

  const where: Prisma.ProductWhereInput = {
    categoryId: { in: categoryIds },
    status: "ON_SALE",
    ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    ...(excludeModels.length > 0 ? { modelCode: { notIn: excludeModels } } : {}),
  };

  const candidates = await prisma.product.findMany({
    where,
    include: { category: true },
    orderBy: { basePrice: "desc" },
    take: take * 2,
  });

  const ownedByCategory = new Map(owned.map((o) => [o.categoryId, o]));
  const seenPerCategory = new Map<string, number>();
  const picked: Recommendation[] = [];

  // 카테고리당 최대 2개씩 돌아가며 담아 한 카테고리가 목록을 독점하지 않게 한다.
  for (const product of candidates) {
    const used = seenPerCategory.get(product.categoryId) ?? 0;
    if (used >= 2) continue;
    seenPerCategory.set(product.categoryId, used + 1);

    const source = ownedByCategory.get(product.categoryId);
    picked.push({
      product,
      reason: source
        ? `보유 중인 ${source.category.name} ${source.modelName} 교체 후보`
        : "보유가전 기반 추천",
    });
    if (picked.length >= take) break;
  }
  return picked;
}
