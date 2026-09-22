import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  CardGrid,
  Notice,
  Select,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableEmpty,
  TextField,
} from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { pickOne, type RawSearchParams } from "@/lib/catalog";
import { ORDER_STATUS } from "@/lib/enums";
import { formatDate } from "@/lib/format";
import { orderProgress, orderScope } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { DelayBadge, DeliveryNoticeBanner, OrderStatusBadge } from "./_components/badges";

const RESULT_LIMIT = 100;

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const ctx = await requireManager();
  const params = await searchParams;
  const q = pickOne(params, "q") ?? "";
  const status = pickOne(params, "status");
  const onlyDelayed = pickOne(params, "delayed") === "1";
  const now = new Date();

  const rows = await prisma.order.findMany({
    where: {
      ...orderScope(ctx),
      ...(status && (ORDER_STATUS as readonly string[]).includes(status) ? { status } : {}),
      ...(q
        ? {
            OR: [
              { orderNo: { contains: q.toUpperCase() } },
              { contract: { contractNo: { contains: q.toUpperCase() } } },
              { contract: { customer: { name: { contains: q } } } },
            ],
          }
        : {}),
    },
    orderBy: { placedAt: "desc" },
    take: RESULT_LIMIT,
    include: {
      contract: { include: { customer: { select: { id: true, name: true } } } },
      deliveryJobs: true,
      installJobs: true,
      items: { select: { id: true } },
    },
  });

  const withProgress = rows.map((order) => ({ order, progress: orderProgress(order, now) }));
  const visible = onlyDelayed
    ? withProgress.filter((row) => row.progress.delayedCount > 0)
    : withProgress;
  const delayedTotal = withProgress.filter((row) => row.progress.delayedCount > 0).length;

  return (
    <>
      <PageHeader title="배송 및 설치 추적" />
      <main className="flex-1 overflow-y-auto p-md sm:p-xl">
        <div className="mx-auto max-w-container">
          <DeliveryNoticeBanner
            notice={pickOne(params, "delivery")}
            detail={pickOne(params, "detail")}
          />

          {delayedTotal > 0 && !onlyDelayed && (
            <Notice tone="warning" className="mb-lg">
              예정일이 지난 배송·설치가 있는 주문이 {delayedTotal}건 있습니다.{" "}
              <Link href="/deliveries?delayed=1" className="underline">
                지연 건만 보기
              </Link>
            </Notice>
          )}

          <CardGrid>
            <Card title="주문 검색" className="col-span-12">
              <form
                method="get"
                action="/deliveries"
                className="flex flex-col gap-md sm:flex-row sm:flex-wrap sm:items-end sm:gap-lg"
              >
                <div className="w-full sm:min-w-[280px] sm:flex-1">
                  <TextField
                    name="q"
                    label="주문번호 · 계약번호 · 고객명"
                    defaultValue={q}
                    placeholder="주문번호 또는 고객명"
                  />
                </div>
                <div className="w-full sm:w-48">
                  <Select name="status" label="주문 상태" defaultValue={status ?? ""}>
                    <option value="">전체</option>
                    <option value="PLACED">접수</option>
                    <option value="PREPARING">준비중</option>
                    <option value="SHIPPING">배송중</option>
                    <option value="DELIVERED">배송완료</option>
                    <option value="COMPLETED">완료</option>
                    <option value="CANCELLED">취소</option>
                  </Select>
                </div>
                <div className="sm:pb-px">
                  <Button type="submit">검색</Button>
                </div>
              </form>
            </Card>

            <Card title={`주문 ${visible.length}건`} flush className="col-span-12">
              <Table>
                <THead>
                  <TR>
                    <TH>주문번호</TH>
                    <TH>고객</TH>
                    <TH>품목</TH>
                    <TH>주문 상태</TH>
                    <TH>배송</TH>
                    <TH>설치</TH>
                    <TH>알림</TH>
                    <TH>주문일</TH>
                  </TR>
                </THead>
                <TBody>
                  {visible.length === 0 ? (
                    <TableEmpty colSpan={8}>
                      주문이 없습니다. 계약의 전자서명이 완료되면 주문이 생성됩니다.
                    </TableEmpty>
                  ) : (
                    visible.map(({ order, progress }) => (
                      <TR key={order.id}>
                        <TD>
                          <Link
                            href={`/deliveries/${order.id}`}
                            className="font-semibold text-lg-red hover:underline"
                          >
                            {order.orderNo}
                          </Link>
                        </TD>
                        <TD>
                          <Link
                            href={`/customers/${order.contract.customer.id}`}
                            className="hover:text-lg-red hover:underline"
                          >
                            {order.contract.customer.name}
                          </Link>
                        </TD>
                        <TD className="text-gray-700">{order.items.length}개</TD>
                        <TD>
                          <OrderStatusBadge status={order.status} />
                        </TD>
                        <TD className="tabular-nums text-gray-700">
                          {progress.deliveryDone}/{progress.deliveryTotal}
                        </TD>
                        <TD className="tabular-nums text-gray-700">
                          {progress.installDone}/{progress.installTotal}
                        </TD>
                        <TD>
                          <div className="flex flex-wrap gap-xs">
                            {progress.delayedCount > 0 && <DelayBadge />}
                            {progress.failedCount > 0 && (
                              <span className="text-caption text-error">
                                실패 {progress.failedCount}건
                              </span>
                            )}
                          </div>
                        </TD>
                        <TD className="text-gray-700">{formatDate(order.placedAt)}</TD>
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
