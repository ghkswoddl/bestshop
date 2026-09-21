import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Badge,
  Button,
  Card,
  CardGrid,
  Notice,
  Select,
  Table,
  TableEmpty,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TextField,
} from "@/components/ui";
import { AddToCompare, CompareNotice } from "@/components/catalog/CompareControls";
import { AsOfAt, StockCell } from "@/components/catalog/StockCell";
import { requireManager } from "@/lib/auth";
import {
  buildReturnTo,
  comparisonProductIds,
  pickInt,
  pickOne,
  popularProducts,
  PRODUCT_SORTS,
  productWhere,
  recentlyViewedProducts,
  recommendProductsForCustomer,
  resolveSort,
  storeStockMap,
  type RawSearchParams,
} from "@/lib/catalog";
import { PRODUCT_STATUS, PRODUCT_STATUS_LABEL, type ProductStatus } from "@/lib/enums";
import { formatKRW } from "@/lib/format";
import { prisma } from "@/lib/prisma";

// 카탈로그가 61개라 60이면 무필터 조회가 1건 잘린다. 여유를 두고 잡는다.
const RESULT_LIMIT = 100;

const PRODUCT_STATUS_TONE = {
  ON_SALE: "success",
  DISCONTINUED: "neutral",
  NOT_CARRIED: "neutral",
} as const;

function ProductStatusBadge({ status }: { status: string }) {
  const key = (PRODUCT_STATUS.includes(status as ProductStatus) ? status : "ON_SALE") as ProductStatus;
  return (
    <Badge tone={PRODUCT_STATUS_TONE[key]} showIcon={false}>
      {PRODUCT_STATUS_LABEL[key]}
    </Badge>
  );
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requireManager();

  const q = pickOne(params, "q");
  const categoryId = pickOne(params, "category");
  const status = pickOne(params, "status");
  const minPrice = pickInt(params, "minPrice");
  const maxPrice = pickInt(params, "maxPrice");
  const onlyInStock = pickOne(params, "inStock") === "1";
  const customerId = pickOne(params, "customerId");
  const sortKey = resolveSort(pickOne(params, "sort"));
  const returnTo = buildReturnTo("/products", params);

  const where = productWhere({
    q,
    categoryId,
    status,
    minPrice,
    maxPrice,
    // 내 매장 재고 필터는 반드시 소속 매장으로 좁힌다.
    inStockStoreId: onlyInStock ? ctx.manager.storeId : undefined,
  });

  const [categories, products, total, inCart, recent, popular, recommended] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.product.findMany({
      where,
      include: { category: true, specs: { where: { isKey: true }, orderBy: { sortOrder: "asc" } } },
      orderBy: PRODUCT_SORTS[sortKey].orderBy,
      take: RESULT_LIMIT,
    }),
    prisma.product.count({ where }),
    comparisonProductIds(ctx.manager.id),
    recentlyViewedProducts(ctx.manager.id),
    popularProducts(),
    customerId ? recommendProductsForCustomer(customerId) : Promise.resolve([]),
  ]);

  const customer = customerId
    ? await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } })
    : null;

  const stock = await storeStockMap(
    ctx,
    products.map((product) => product.id),
    new Map(products.map((product) => [product.id, product.status])),
  );

  return (
    <>
      <PageHeader
        title="상품탐색"
        actions={
          <Link href="/compare">
            <Button variant="secondary">비교함 보기</Button>
          </Link>
        }
      />
      <main className="flex-1 overflow-y-auto p-xl">
        <div className="mx-auto flex max-w-container flex-col gap-lg">
          <CompareNotice state={pickOne(params, "compare")} />

          <Card title="검색 및 필터">
            <form method="get" className="flex flex-col gap-md">
              {customerId && <input type="hidden" name="customerId" value={customerId} />}
              <div className="grid grid-cols-1 gap-md md:grid-cols-12">
                <div className="md:col-span-5">
                  <TextField
                    name="q"
                    label="통합 검색"
                    placeholder="상품명 · 모델명 · 카테고리 · 스펙"
                    defaultValue={q ?? ""}
                  />
                </div>
                <div className="md:col-span-3">
                  <Select name="category" label="카테고리" defaultValue={categoryId ?? ""}>
                    <option value="">전체</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Select name="status" label="판매상태" defaultValue={status ?? ""}>
                    <option value="">전체</option>
                    {PRODUCT_STATUS.map((value) => (
                      <option key={value} value={value}>
                        {PRODUCT_STATUS_LABEL[value]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Select name="sort" label="정렬" defaultValue={sortKey}>
                    {Object.entries(PRODUCT_SORTS).map(([value, sort]) => (
                      <option key={value} value={value}>
                        {sort.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 items-end gap-md md:grid-cols-12">
                <div className="md:col-span-3">
                  <TextField
                    name="minPrice"
                    type="number"
                    min={0}
                    step={10000}
                    label="최소 가격"
                    placeholder="0"
                    defaultValue={minPrice ?? ""}
                    suffix="원"
                  />
                </div>
                <div className="md:col-span-3">
                  <TextField
                    name="maxPrice"
                    type="number"
                    min={0}
                    step={10000}
                    label="최대 가격"
                    placeholder="제한 없음"
                    defaultValue={maxPrice ?? ""}
                    suffix="원"
                  />
                </div>
                <div className="flex items-center gap-sm md:col-span-3 md:pb-md">
                  <input
                    id="inStock"
                    name="inStock"
                    type="checkbox"
                    value="1"
                    defaultChecked={onlyInStock}
                    className="h-4 w-4 rounded-control border-gray-200 accent-lg-red"
                  />
                  <label htmlFor="inStock" className="text-body text-gray-900">
                    {ctx.store.name} 재고 보유만
                  </label>
                </div>
                <div className="flex gap-sm md:col-span-3 md:justify-end">
                  <Link href={customerId ? `/products?customerId=${customerId}` : "/products"}>
                    <Button variant="secondary">초기화</Button>
                  </Link>
                  <Button type="submit">검색</Button>
                </div>
              </div>
            </form>
          </Card>

          {customerId && (
            <Card
              title={`${customer?.name ?? "고객"} 보유가전 기반 추천`}
              action={<span className="text-caption text-gray-700">보유 카테고리의 교체 후보</span>}
            >
              {recommended.length === 0 ? (
                <p className="text-body text-gray-700">
                  등록된 보유가전이 없어 추천할 상품이 없습니다. 고객 상세에서 보유가전을 먼저 등록하세요.
                </p>
              ) : (
                <ul className="grid grid-cols-1 gap-md md:grid-cols-2 xl:grid-cols-3">
                  {recommended.map(({ product, reason }) => (
                    <li
                      key={product.id}
                      className="flex flex-col gap-xs rounded-card border border-gray-200 p-md"
                    >
                      <Link href={`/products/${product.id}`} className="text-h3 text-gray-900 hover:text-lg-red">
                        {product.name}
                      </Link>
                      <span className="text-caption text-gray-700">{reason}</span>
                      <span className="tabular-nums text-body font-semibold text-gray-900">
                        {formatKRW(product.basePrice)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <CardGrid>
            <Card
              title="검색 결과"
              flush
              className="col-span-12 xl:col-span-8"
              action={
                <span className="text-caption text-gray-700">
                  총 {total.toLocaleString("ko-KR")}건
                  {total > RESULT_LIMIT && ` (상위 ${RESULT_LIMIT}건 표시)`}
                </span>
              }
            >
              <Table>
                <THead>
                  <TR>
                    <TH>상품</TH>
                    <TH>카테고리</TH>
                    <TH className="text-right">판매가</TH>
                    <TH>판매상태</TH>
                    <TH>{ctx.isHQ ? "전 매장 재고" : `${ctx.store.name} 재고`}</TH>
                    <TH>기준시각</TH>
                    <TH>비교</TH>
                  </TR>
                </THead>
                <TBody>
                  {products.length === 0 ? (
                    <TableEmpty colSpan={7}>조건에 맞는 상품이 없습니다.</TableEmpty>
                  ) : (
                    products.map((product) => {
                      const view = stock.get(product.id);
                      return (
                        <TR key={product.id}>
                          <TD>
                            <Link
                              href={`/products/${product.id}`}
                              className="font-medium text-gray-900 hover:text-lg-red"
                            >
                              {product.name}
                            </Link>
                            <div className="text-caption tabular-nums text-gray-700">{product.modelCode}</div>
                            {product.specs.length > 0 && (
                              <div className="mt-xs text-caption text-gray-400">
                                {product.specs
                                  .map((spec) => `${spec.key} ${spec.value}${spec.unit ?? ""}`)
                                  .join(" · ")}
                              </div>
                            )}
                          </TD>
                          <TD className="text-gray-700">{product.category.name}</TD>
                          <TD className="whitespace-nowrap text-right tabular-nums font-semibold">
                            {formatKRW(product.basePrice)}
                          </TD>
                          <TD>
                            <ProductStatusBadge status={product.status} />
                          </TD>
                          <TD>{view && <StockCell view={view} />}</TD>
                          <TD>
                            <AsOfAt value={view?.asOfAt ?? null} />
                          </TD>
                          <TD>
                            <AddToCompare
                              productId={product.id}
                              returnTo={returnTo}
                              inCart={inCart.has(product.id)}
                            />
                          </TD>
                        </TR>
                      );
                    })
                  )}
                </TBody>
              </Table>
            </Card>

            <div className="col-span-12 flex flex-col gap-lg xl:col-span-4">
              <Card title="최근 조회">
                {recent.length === 0 ? (
                  <p className="text-body text-gray-700">최근 조회한 상품이 없습니다.</p>
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {recent.map(({ product }) => (
                      <li key={product.id} className="flex items-center justify-between gap-md py-sm">
                        <Link href={`/products/${product.id}`} className="text-body text-gray-900 hover:text-lg-red">
                          {product.name}
                          <span className="ml-sm text-caption text-gray-400">{product.category.name}</span>
                        </Link>
                        <span className="shrink-0 tabular-nums text-caption text-gray-700">
                          {formatKRW(product.basePrice)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card
                title="인기상품"
                action={<span className="text-caption text-gray-400">조회 매니저 수 기준</span>}
              >
                {popular.length === 0 ? (
                  <p className="text-body text-gray-700">
                    아직 집계된 조회 기록이 없습니다. 상품 상세를 열면 집계가 시작됩니다.
                  </p>
                ) : (
                  <ol className="divide-y divide-gray-200">
                    {popular.map(({ product, viewerCount }, index) => (
                      <li key={product.id} className="flex items-center gap-md py-sm">
                        <span className="w-5 shrink-0 tabular-nums text-caption font-bold text-lg-red">
                          {index + 1}
                        </span>
                        <Link
                          href={`/products/${product.id}`}
                          className="min-w-0 flex-1 truncate text-body text-gray-900 hover:text-lg-red"
                        >
                          {product.name}
                        </Link>
                        <span className="shrink-0 tabular-nums text-caption text-gray-700">
                          {viewerCount}명 조회
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>

              <Notice tone="info">
                재고 수량과 기준시각은 조회 시점의 값입니다. 재고 확정은 계약 생성 시점에 다시 검증됩니다.
              </Notice>
            </div>
          </CardGrid>
        </div>
      </main>
    </>
  );
}
