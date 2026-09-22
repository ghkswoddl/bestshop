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
} from "@/components/ui";
import { AsOfAt, StockCell } from "@/components/catalog/StockCell";
import {
  RequestTransfer,
  TransferNotice,
  TransferStatusBadge,
} from "@/components/catalog/TransferControls";
import { requireManager } from "@/lib/auth";
import { buildReturnTo, crossStoreStock, pickOne, type RawSearchParams } from "@/lib/catalog";
import { TRANSFER_STATUS, TRANSFER_STATUS_LABEL } from "@/lib/enums";
import { formatDateTime } from "@/lib/format";
import { canTransferOut } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requireManager();

  const statusFilter = pickOne(params, "status");
  const focusProductId = pickOne(params, "productId");
  const returnTo = buildReturnTo("/inventory/transfers", params);

  // TransferRequest 에는 storeId 컬럼이 없어 scopeToStore 를 spread 할 수 없다.
  // 소속 매장이 출고 또는 입고 당사자인 건만 본다 (HQ 는 전건).
  const storeScope = ctx.isHQ
    ? {}
    : { OR: [{ fromStoreId: ctx.manager.storeId }, { toStoreId: ctx.manager.storeId }] };

  const transfers = await prisma.transferRequest.findMany({
    where: { ...storeScope, ...(statusFilter ? { status: statusFilter } : {}) },
    orderBy: { requestedAt: "desc" },
    include: {
      product: { select: { id: true, name: true, modelCode: true } },
      fromStore: { select: { name: true } },
      toStore: { select: { name: true } },
      requestedBy: { select: { name: true } },
    },
  });

  const focus = focusProductId
    ? await prisma.product.findUnique({ where: { id: focusProductId } })
    : null;
  // 이동 가능 여부 조회(P1) — 전 매장 재고를 읽어야 하므로 의도적으로 매장 스코프를 두지 않는다.
  const focusStores = focus ? await crossStoreStock(focus.id, focus.status) : [];

  const products = await prisma.product.findMany({
    where: { status: { not: "NOT_CARRIED" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const pending = transfers.filter((t) => t.status === "REQUESTED" || t.status === "IN_TRANSIT").length;

  return (
    <>
      <PageHeader
        title="매장 간 상품 이동"
        actions={
          <Link href="/inventory">
            <Button variant="secondary">재고 화면으로</Button>
          </Link>
        }
      />
      <main className="flex-1 overflow-y-auto p-md sm:p-xl">
        <div className="mx-auto flex max-w-container flex-col gap-lg">
          <TransferNotice state={pickOne(params, "transfer")} />

          {pending > 0 && (
            <Notice tone="info">진행 중인 이동요청이 {pending}건 있습니다 (요청 · 이동중).</Notice>
          )}

          <CardGrid>
            <Card title="이동 가능 여부 조회" className="col-span-12">
              <form method="get" className="grid grid-cols-1 items-end gap-md md:grid-cols-12">
                <div className="md:col-span-6">
                  <Select name="productId" label="상품" defaultValue={focusProductId ?? ""}>
                    <option value="">상품을 선택하세요</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="md:col-span-3">
                  <Select name="status" label="요청 상태" defaultValue={statusFilter ?? ""}>
                    <option value="">전체</option>
                    {TRANSFER_STATUS.map((value) => (
                      <option key={value} value={value}>
                        {TRANSFER_STATUS_LABEL[value]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex gap-sm md:col-span-3 md:justify-end">
                  <Link href="/inventory/transfers">
                    <Button variant="secondary">초기화</Button>
                  </Link>
                  <Button type="submit">조회</Button>
                </div>
              </form>

              {focus && (
                <div className="mt-lg">
                  <Table>
                    <THead>
                      <TR>
                        <TH>매장</TH>
                        <TH>재고</TH>
                        <TH>기준시각</TH>
                        <TH>이동 가능</TH>
                        <TH>요청</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {focusStores.map(({ store, view }) => {
                        const isMine = store.id === ctx.manager.storeId;
                        const available = canTransferOut(view);
                        return (
                          <TR key={store.id}>
                            <TD>
                              <span className="font-medium">{store.name}</span>
                              {isMine && <span className="ml-xs text-caption text-lg-red">소속</span>}
                            </TD>
                            <TD>
                              <StockCell view={view} />
                            </TD>
                            <TD>
                              <AsOfAt value={view.asOfAt} />
                            </TD>
                            <TD>
                              <Badge tone={available ? "success" : "neutral"}>
                                {available ? "가능" : "불가"}
                              </Badge>
                            </TD>
                            <TD>
                              {isMine || !available ? (
                                <span className="text-caption text-gray-400">-</span>
                              ) : (
                                <RequestTransfer
                                  productId={focus.id}
                                  fromStoreId={store.id}
                                  returnTo={returnTo}
                                />
                              )}
                            </TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                </div>
              )}
            </Card>

            <Card
              title="이동요청 현황"
              flush
              className="col-span-12"
              action={<span className="text-caption text-gray-700">{transfers.length}건</span>}
            >
              <Table>
                <THead>
                  <TR>
                    <TH>상태</TH>
                    <TH>상품</TH>
                    <TH>출고 매장</TH>
                    <TH>입고 매장</TH>
                    <TH className="text-right">수량</TH>
                    <TH>요청자</TH>
                    <TH>요청시각</TH>
                    <TH>응답/완료</TH>
                    <TH>메모</TH>
                  </TR>
                </THead>
                <TBody>
                  {transfers.length === 0 ? (
                    <TableEmpty colSpan={9}>이동요청이 없습니다.</TableEmpty>
                  ) : (
                    transfers.map((transfer) => (
                      <TR key={transfer.id}>
                        <TD>
                          <TransferStatusBadge status={transfer.status} />
                        </TD>
                        <TD>
                          <Link
                            href={`/products/${transfer.product.id}`}
                            className="font-medium text-gray-900 hover:text-lg-red"
                          >
                            {transfer.product.name}
                          </Link>
                          <div className="text-caption tabular-nums text-gray-700">
                            {transfer.product.modelCode}
                          </div>
                        </TD>
                        <TD className="text-gray-700">{transfer.fromStore.name}</TD>
                        <TD className="text-gray-700">{transfer.toStore.name}</TD>
                        <TD className="text-right tabular-nums">{transfer.quantity}개</TD>
                        <TD className="text-gray-700">{transfer.requestedBy.name}</TD>
                        <TD className="whitespace-nowrap tabular-nums text-gray-700">
                          {formatDateTime(transfer.requestedAt)}
                        </TD>
                        <TD className="whitespace-nowrap tabular-nums text-gray-700">
                          {formatDateTime(transfer.completedAt ?? transfer.respondedAt)}
                        </TD>
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
