import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import {
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
import { AsOfAt, StockCell } from "@/components/catalog/StockCell";
import {
  RequestTransfer,
  TransferNotice,
  TransferStatusBadge,
} from "@/components/catalog/TransferControls";
import { requireManager } from "@/lib/auth";
import {
  buildReturnTo,
  crossStoreStock,
  pickOne,
  productWhere,
  storeStockMap,
  type RawSearchParams,
} from "@/lib/catalog";
import { INVENTORY_STATUS, INVENTORY_STATUS_LABEL, type InventoryStatus } from "@/lib/enums";
import { formatDate, formatKRW } from "@/lib/format";
import { canTransferOut, DEFAULT_LOW_STOCK_THRESHOLD } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

/** 화면에 먼저 보여야 할 순서 — 품절 → 부족 → 나머지. */
const STATUS_PRIORITY: Record<InventoryStatus, number> = {
  OUT_OF_STOCK: 0,
  LOW_STOCK: 1,
  IN_STOCK: 2,
  SALE_STOPPED: 3,
  NOT_CARRIED: 4,
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requireManager();

  const q = pickOne(params, "q");
  const categoryId = pickOne(params, "category");
  const statusFilter = pickOne(params, "status");
  const focusProductId = pickOne(params, "productId");
  const returnTo = buildReturnTo("/inventory", params);

  const [categories, products] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.product.findMany({
      where: productWhere({ q, categoryId }),
      include: { category: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // 기본 조회는 반드시 소속 매장으로 스코프한다 (scopeToStore 는 storeStockMap 안에서 적용).
  const stock = await storeStockMap(
    ctx,
    products.map((product) => product.id),
    new Map(products.map((product) => [product.id, product.status])),
  );

  const rows = products
    .map((product) => ({ product, view: stock.get(product.id)! }))
    .filter((row) => !statusFilter || row.view.status === statusFilter)
    .sort(
      (a, b) =>
        STATUS_PRIORITY[a.view.status] - STATUS_PRIORITY[b.view.status] ||
        a.product.name.localeCompare(b.product.name, "ko-KR"),
    );

  const outOfStock = rows.filter((row) => row.view.status === "OUT_OF_STOCK").length;
  const lowStock = rows.filter((row) => row.view.status === "LOW_STOCK").length;
  const oldestAsOf = rows.reduce<Date | null>(
    (oldest, row) =>
      row.view.asOfAt && (!oldest || row.view.asOfAt < oldest) ? row.view.asOfAt : oldest,
    null,
  );

  const focus = focusProductId
    ? await prisma.product.findUnique({
        where: { id: focusProductId },
        include: { category: true },
      })
    : null;
  // 인접매장 통합조회(P1). 의도적으로 매장 스코프를 적용하지 않는 읽기 전용 조회다.
  const focusStores = focus ? await crossStoreStock(focus.id, focus.status) : [];

  const recentTransfers = await prisma.transferRequest.findMany({
    // TransferRequest 는 storeId 컬럼이 없어 scopeToStore 를 그대로 spread 할 수 없다.
    // 소속 매장이 출고/입고 어느 쪽이든 관련된 건만 본다 (HQ 는 전건).
    where: ctx.isHQ
      ? {}
      : { OR: [{ fromStoreId: ctx.manager.storeId }, { toStoreId: ctx.manager.storeId }] },
    orderBy: { requestedAt: "desc" },
    take: 5,
    include: {
      product: { select: { id: true, name: true } },
      fromStore: { select: { name: true } },
      toStore: { select: { name: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="재고 및 매장확인"
        actions={
          <Link href="/inventory/transfers">
            <Button variant="secondary">이동요청 관리</Button>
          </Link>
        }
      />
      <main className="flex-1 overflow-y-auto p-md sm:p-xl">
        <div className="mx-auto flex max-w-container flex-col gap-lg">
          <TransferNotice state={pickOne(params, "transfer")} />

          {(outOfStock > 0 || lowStock > 0) && (
            <Notice tone={outOfStock > 0 ? "error" : "warning"}>
              {ctx.store.name} 기준 품절 {outOfStock}건 · 재고부족 {lowStock}건입니다. 가용 수량이
              안전재고(미설정 시 {DEFAULT_LOW_STOCK_THRESHOLD}개) 이하이면 재고부족으로 표시합니다.
            </Notice>
          )}

          <CardGrid>
            <Card title="재고 조회" className="col-span-12 lg:col-span-8">
              <form method="get" className="grid grid-cols-1 items-end gap-md md:grid-cols-12">
                <div className="md:col-span-4">
                  <TextField
                    name="q"
                    label="상품 검색"
                    placeholder="상품명 · 모델명 · 스펙"
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
                  <Select name="status" label="재고상태" defaultValue={statusFilter ?? ""}>
                    <option value="">전체</option>
                    {INVENTORY_STATUS.map((value) => (
                      <option key={value} value={value}>
                        {INVENTORY_STATUS_LABEL[value]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex gap-sm md:col-span-3 md:justify-end">
                  <Link href="/inventory">
                    <Button variant="secondary">초기화</Button>
                  </Link>
                  <Button type="submit">조회</Button>
                </div>
              </form>
            </Card>

            <Card
              title="매장 기본정보"
              className="col-span-12 lg:col-span-4"
              action={
                <Link href="/store" className="text-caption text-lg-red hover:underline">
                  상세 보기
                </Link>
              }
            >
              <dl className="divide-y divide-gray-200 text-body">
                <div className="flex gap-md py-sm">
                  <dt className="w-20 shrink-0 text-caption text-gray-700">매장</dt>
                  <dd className="text-gray-900">
                    {ctx.store.name} <span className="text-gray-700">({ctx.store.code})</span>
                  </dd>
                </div>
                <div className="flex gap-md py-sm">
                  <dt className="w-20 shrink-0 text-caption text-gray-700">주소</dt>
                  <dd className="text-gray-900">{ctx.store.address}</dd>
                </div>
                <div className="flex gap-md py-sm">
                  <dt className="w-20 shrink-0 text-caption text-gray-700">전화</dt>
                  <dd className="tabular-nums text-gray-900">{ctx.store.phone}</dd>
                </div>
                <div className="flex gap-md py-sm">
                  <dt className="w-20 shrink-0 text-caption text-gray-700">운영시간</dt>
                  <dd className="tabular-nums text-gray-900">
                    {ctx.store.openTime} ~ {ctx.store.closeTime}
                  </dd>
                </div>
                <div className="flex gap-md py-sm">
                  <dt className="w-20 shrink-0 text-caption text-gray-700">최종 기준시각</dt>
                  <dd className="text-gray-900">
                    <AsOfAt value={oldestAsOf} />
                  </dd>
                </div>
              </dl>
            </Card>

            {focus && (
              <Card
                title={`${focus.name} — 매장별 재고`}
                flush
                className="col-span-12"
                action={
                  <Link href={`/products/${focus.id}`} className="text-caption text-lg-red hover:underline">
                    상품 상세
                  </Link>
                }
              >
                <Table>
                  <THead>
                    <TR>
                      <TH>매장</TH>
                      <TH>주소</TH>
                      <TH>재고</TH>
                      <TH>기준시각</TH>
                      <TH>이동</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {focusStores.map(({ store, view }) => {
                      const isMine = store.id === ctx.manager.storeId;
                      return (
                        <TR key={store.id}>
                          <TD>
                            <span className="font-medium">{store.name}</span>
                            {isMine && <span className="ml-xs text-caption text-lg-red">소속</span>}
                          </TD>
                          <TD className="text-gray-700">{store.address}</TD>
                          <TD>
                            <StockCell view={view} />
                          </TD>
                          <TD>
                            <AsOfAt value={view.asOfAt} />
                          </TD>
                          <TD>
                            {isMine ? (
                              <span className="text-caption text-gray-400">-</span>
                            ) : canTransferOut(view) ? (
                              <RequestTransfer
                                productId={focus.id}
                                fromStoreId={store.id}
                                returnTo={returnTo}
                              />
                            ) : (
                              <span className="text-caption text-gray-400">이동 불가</span>
                            )}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </Card>
            )}

            <Card
              title={`${ctx.isHQ ? "전 매장 합계" : ctx.store.name} 재고 현황`}
              flush
              className="col-span-12"
              action={<span className="text-caption text-gray-700">{rows.length}건</span>}
            >
              <Table>
                <THead>
                  <TR>
                    <TH>상품</TH>
                    <TH>카테고리</TH>
                    <TH className="text-right">판매가</TH>
                    <TH>판매가능 상태</TH>
                    <TH className="text-right">보유</TH>
                    <TH className="text-right">예약</TH>
                    <TH>기준시각</TH>
                    <TH>타 매장</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.length === 0 ? (
                    <TableEmpty colSpan={8}>조건에 맞는 재고가 없습니다.</TableEmpty>
                  ) : (
                    rows.map(({ product, view }) => (
                      <TR key={product.id}>
                        <TD>
                          <Link
                            href={`/products/${product.id}`}
                            className="font-medium text-gray-900 hover:text-lg-red"
                          >
                            {product.name}
                          </Link>
                          <div className="text-caption tabular-nums text-gray-700">{product.modelCode}</div>
                        </TD>
                        <TD className="text-gray-700">{product.category.name}</TD>
                        <TD className="whitespace-nowrap text-right tabular-nums">
                          {formatKRW(product.basePrice)}
                        </TD>
                        <TD>
                          <StockCell view={view} />
                        </TD>
                        <TD className="text-right tabular-nums">{view.quantity}</TD>
                        <TD className="text-right tabular-nums text-gray-700">{view.reservedQty}</TD>
                        <TD>
                          <AsOfAt value={view.asOfAt} />
                        </TD>
                        <TD>
                          <Link
                            href={`/inventory?productId=${product.id}`}
                            className="text-caption text-lg-red hover:underline"
                          >
                            통합조회
                          </Link>
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </Card>

            <Card
              title="최근 이동요청"
              flush
              className="col-span-12"
              action={
                <Link href="/inventory/transfers" className="text-caption text-lg-red hover:underline">
                  전체 보기
                </Link>
              }
            >
              <Table>
                <THead>
                  <TR>
                    <TH>상태</TH>
                    <TH>상품</TH>
                    <TH>출고 → 입고</TH>
                    <TH className="text-right">수량</TH>
                    <TH>요청일</TH>
                  </TR>
                </THead>
                <TBody>
                  {recentTransfers.length === 0 ? (
                    <TableEmpty colSpan={5}>이동요청이 없습니다.</TableEmpty>
                  ) : (
                    recentTransfers.map((transfer) => (
                      <TR key={transfer.id}>
                        <TD>
                          <TransferStatusBadge status={transfer.status} />
                        </TD>
                        <TD>
                          <Link
                            href={`/products/${transfer.product.id}`}
                            className="text-gray-900 hover:text-lg-red"
                          >
                            {transfer.product.name}
                          </Link>
                        </TD>
                        <TD className="text-gray-700">
                          {transfer.fromStore.name} → {transfer.toStore.name}
                        </TD>
                        <TD className="text-right tabular-nums">{transfer.quantity}개</TD>
                        <TD className="tabular-nums text-gray-700">{formatDate(transfer.requestedAt)}</TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </Card>
          </CardGrid>
        </div>
      </main>
    </>
  );
}
