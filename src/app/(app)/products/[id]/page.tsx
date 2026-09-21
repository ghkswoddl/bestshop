import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Badge,
  Button,
  Card,
  CardGrid,
  Notice,
  Table,
  TableEmpty,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";
import { AddToCompare, CompareNotice } from "@/components/catalog/CompareControls";
import { AsOfAt, StockCell } from "@/components/catalog/StockCell";
import {
  RequestTransfer,
  TransferNotice,
  TransferStatusBadge,
} from "@/components/catalog/TransferControls";
import { requireManager } from "@/lib/auth";
import {
  buildReturnTo,
  comparisonProductIds,
  crossStoreStock,
  pickOne,
  recordProductView,
  storeStockMap,
  type RawSearchParams,
} from "@/lib/catalog";
import { PRODUCT_STATUS, PRODUCT_STATUS_LABEL, type ProductStatus } from "@/lib/enums";
import { formatDate, formatKRW } from "@/lib/format";
import { canTransferOut } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

const PRODUCT_STATUS_TONE = {
  ON_SALE: "success",
  DISCONTINUED: "neutral",
  NOT_CARRIED: "neutral",
} as const;

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-md py-sm">
      <dt className="w-24 shrink-0 text-caption text-gray-700">{label}</dt>
      <dd className="min-w-0 text-body text-gray-900">{value ?? "-"}</dd>
    </div>
  );
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ id }, query, ctx] = await Promise.all([params, searchParams, requireManager()]);

  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: true, specs: { orderBy: { sortOrder: "asc" } } },
  });
  if (!product) notFound();

  // 상품 상세는 세션 쿠키를 읽는 동적 렌더라 요청당 정확히 한 번 기록된다 (P1 최근 조회).
  await recordProductView(ctx.manager.id, product.id);

  const [stock, stores, inCart, transfers] = await Promise.all([
    storeStockMap(ctx, [product.id], new Map([[product.id, product.status]])),
    // 인접매장 통합조회(P1) — 의도적으로 매장 스코프를 적용하지 않는 읽기 전용 조회.
    crossStoreStock(product.id, product.status),
    comparisonProductIds(ctx.manager.id),
    prisma.transferRequest.findMany({
      where: {
        productId: product.id,
        OR: [{ fromStoreId: ctx.manager.storeId }, { toStoreId: ctx.manager.storeId }],
      },
      orderBy: { requestedAt: "desc" },
      take: 10,
      include: {
        fromStore: { select: { name: true } },
        toStore: { select: { name: true } },
        requestedBy: { select: { name: true } },
      },
    }),
  ]);

  const mine = stock.get(product.id)!;
  const returnTo = buildReturnTo(`/products/${product.id}`, query);
  const statusKey = (
    PRODUCT_STATUS.includes(product.status as ProductStatus) ? product.status : "ON_SALE"
  ) as ProductStatus;

  return (
    <>
      <PageHeader
        title={product.name}
        actions={
          <>
            <Link href="/products">
              <Button variant="secondary">목록으로</Button>
            </Link>
            <Link href={`/inventory?productId=${product.id}`}>
              <Button variant="secondary">재고 조회</Button>
            </Link>
            {/* Phase 5 의 딥링크 계약 — 이 상품에 적용 가능한 프로모션만 필터해서 보여준다. */}
            <Link href={`/promotions?productId=${product.id}`}>
              <Button variant="secondary">적용 프로모션</Button>
            </Link>
          </>
        }
      />
      <main className="flex-1 overflow-y-auto p-xl">
        <div className="mx-auto flex max-w-container flex-col gap-lg">
          <CompareNotice state={pickOne(query, "compare")} />
          <TransferNotice state={pickOne(query, "transfer")} />

          {mine.needsAttention && (
            <Notice tone={mine.status === "OUT_OF_STOCK" ? "error" : "warning"}>
              {ctx.store.name} 재고가 {mine.status === "OUT_OF_STOCK" ? "품절" : "부족"}합니다
              (가용 {mine.available}개 / 기준 {mine.threshold}개 이하). 아래 매장별 재고에서 이동요청을
              검토하세요.
            </Notice>
          )}

          <CardGrid>
            <Card title="상품 정보" className="col-span-12 lg:col-span-7">
              <dl className="divide-y divide-gray-200">
                <Field label="모델명" value={<span className="tabular-nums">{product.modelCode}</span>} />
                <Field label="카테고리" value={product.category.name} />
                <Field label="브랜드" value={product.brand} />
                <Field
                  label="판매가"
                  value={
                    <span className="text-h2 tabular-nums text-gray-900">
                      {formatKRW(product.basePrice)}
                    </span>
                  }
                />
                <Field
                  label="판매상태"
                  value={
                    <Badge tone={PRODUCT_STATUS_TONE[statusKey]} showIcon={false}>
                      {PRODUCT_STATUS_LABEL[statusKey]}
                    </Badge>
                  }
                />
                <Field label="출시일" value={formatDate(product.releasedAt)} />
                <Field label="주요 기능" value={product.description} />
              </dl>
              <div className="mt-lg flex gap-sm">
                <AddToCompare productId={product.id} returnTo={returnTo} inCart={inCart.has(product.id)} />
                <Link href="/compare">
                  <Button variant="secondary">비교함 보기</Button>
                </Link>
              </div>
            </Card>

            <Card
              title={`${ctx.isHQ ? "전 매장" : ctx.store.name} 재고`}
              className="col-span-12 lg:col-span-5"
              action={
                <Link href="/store" className="text-caption text-lg-red hover:underline">
                  매장 정보 보기
                </Link>
              }
            >
              <dl className="divide-y divide-gray-200">
                <Field label="판매상태" value={<StockCell view={mine} />} />
                <Field label="보유수량" value={<span className="tabular-nums">{mine.quantity}개</span>} />
                <Field label="예약수량" value={<span className="tabular-nums">{mine.reservedQty}개</span>} />
                <Field
                  label="부족기준"
                  value={<span className="tabular-nums">가용 {mine.threshold}개 이하</span>}
                />
                <Field label="기준시각" value={<AsOfAt value={mine.asOfAt} />} />
              </dl>
            </Card>

            <Card title="주요 스펙" flush className="col-span-12 lg:col-span-7">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-40">항목</TH>
                    <TH>내용</TH>
                    <TH className="w-24">비교 기본</TH>
                  </TR>
                </THead>
                <TBody>
                  {product.specs.length === 0 ? (
                    <TableEmpty colSpan={3}>등록된 스펙이 없습니다.</TableEmpty>
                  ) : (
                    product.specs.map((spec) => (
                      <TR key={spec.id}>
                        <TD className="text-gray-700">{spec.key}</TD>
                        <TD>
                          {spec.value}
                          {spec.unit && <span className="ml-xs text-gray-700">{spec.unit}</span>}
                        </TD>
                        <TD>
                          {spec.isKey && (
                            <Badge tone="info" showIcon={false}>
                              노출
                            </Badge>
                          )}
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </Card>

            <Card
              title="매장별 재고 (인접매장 통합조회)"
              flush
              className="col-span-12 lg:col-span-5"
              action={<span className="text-caption text-gray-400">읽기 전용</span>}
            >
              <Table>
                <THead>
                  <TR>
                    <TH>매장</TH>
                    <TH>재고</TH>
                    <TH>기준시각</TH>
                    <TH>이동</TH>
                  </TR>
                </THead>
                <TBody>
                  {stores.map(({ store, view }) => {
                    const isMine = store.id === ctx.manager.storeId;
                    return (
                      <TR key={store.id}>
                        <TD>
                          <span className="font-medium">{store.name}</span>
                          {isMine && <span className="ml-xs text-caption text-lg-red">소속</span>}
                          <div className="text-caption text-gray-700">{store.phone}</div>
                        </TD>
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
                              productId={product.id}
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

            <Card
              title="매장 간 이동요청 현황"
              flush
              className="col-span-12"
              action={
                <Link href="/inventory/transfers" className="text-caption text-lg-red hover:underline">
                  전체 이동요청 보기
                </Link>
              }
            >
              <Table>
                <THead>
                  <TR>
                    <TH>상태</TH>
                    <TH>출고 매장</TH>
                    <TH>입고 매장</TH>
                    <TH className="text-right">수량</TH>
                    <TH>요청자</TH>
                    <TH>요청일</TH>
                    <TH>메모</TH>
                  </TR>
                </THead>
                <TBody>
                  {transfers.length === 0 ? (
                    <TableEmpty colSpan={7}>이 상품의 이동요청 이력이 없습니다.</TableEmpty>
                  ) : (
                    transfers.map((transfer) => (
                      <TR key={transfer.id}>
                        <TD>
                          <TransferStatusBadge status={transfer.status} />
                        </TD>
                        <TD className="text-gray-700">{transfer.fromStore.name}</TD>
                        <TD className="text-gray-700">{transfer.toStore.name}</TD>
                        <TD className="text-right tabular-nums">{transfer.quantity}개</TD>
                        <TD className="text-gray-700">{transfer.requestedBy.name}</TD>
                        <TD className="tabular-nums text-gray-700">{formatDate(transfer.requestedAt)}</TD>
                        <TD className="text-gray-700">{transfer.note ?? "-"}</TD>
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
