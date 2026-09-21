import { notFound } from "next/navigation";
import { Badge, Card, Notice, TBody, TD, TH, THead, TR, Table } from "@/components/ui";
import { parseSnapshot, type DeliveryAddressSnapshot } from "@/lib/contracts";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  DELIVERY_STATUS_LABEL,
  INSTALL_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  findOrderByTrackingToken,
  isDeliveryDelayed,
  isInstallDelayed,
  orderProgress,
} from "@/lib/orders";
import type { DeliveryStatus, InstallStatus, OrderStatus } from "@/lib/enums";
import { formatPhone } from "@/lib/phone";

/**
 * 고객 안내용 배송·설치 조회 (PRD §4 P1) — **의도적으로 인증이 없다.**
 *
 * Phase 8 의 `/sign/[token]` 과 같은 설계다: 고객은 계정이 없고 접근 제어는 난수 토큰의
 * 소지다. `(app)` 라우트 그룹 바깥에 두어 세션 가드와 앱 셸을 피한다.
 *
 * **이 화면은 읽기 전용이고 고객에게 보여도 되는 것만 담는다** — 금액, 담당 매니저, 내부
 * 메모, 다른 고객 정보는 조회 자체를 하지 않는다 (`findOrderByTrackingToken` 의 select 참조).
 */
export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const order = await findOrderByTrackingToken(token);
  if (!order) notFound();

  const progress = orderProgress(order);
  const address = parseSnapshot<DeliveryAddressSnapshot>(
    order.contract.deliveryAddressSnapshotJson,
  );
  const itemName = (orderItemId: string | null) => {
    if (!orderItemId) return "전체 상품";
    return order.items.find((item) => item.id === orderItemId)?.product.name ?? "상품";
  };

  return (
    <main className="min-h-screen bg-gray-100 px-lg py-xl">
      <div className="mx-auto max-w-[720px]">
        <header className="mb-lg text-center">
          <p className="text-h2 text-lg-red">LG Bestshop</p>
          <h1 className="mt-xs text-display text-gray-900">배송 · 설치 조회</h1>
          <p className="mt-xs text-caption text-gray-700">
            {order.contract.store.name} · {formatPhone(order.contract.store.phone)}
          </p>
        </header>

        {progress.delayedCount > 0 && (
          <Notice tone="warning" className="mb-lg">
            예정일이 지난 일정이 있습니다. 자세한 내용은 매장으로 문의해 주세요.
          </Notice>
        )}

        <div className="flex flex-col gap-lg">
          <Card title="주문 상태">
            <div className="flex flex-wrap items-center justify-between gap-md">
              <div>
                <p className="text-caption text-gray-700">주문번호</p>
                <p className="text-h3 tabular-nums text-gray-900">{order.orderNo}</p>
              </div>
              <Badge tone={progress.status === "COMPLETED" ? "success" : "info"}>
                {ORDER_STATUS_LABEL[progress.status as OrderStatus]}
              </Badge>
            </div>
            <dl className="mt-lg divide-y divide-gray-200">
              <div className="flex justify-between py-sm text-body">
                <dt className="text-gray-700">주문일</dt>
                <dd className="text-gray-900">{formatDate(order.placedAt)}</dd>
              </div>
              <div className="flex justify-between gap-lg py-sm text-body">
                <dt className="shrink-0 text-gray-700">배송지</dt>
                <dd className="text-right text-gray-900">
                  {[address?.address, address?.addressDetail].filter(Boolean).join(" ") || "-"}
                </dd>
              </div>
              <div className="flex justify-between py-sm text-body">
                <dt className="text-gray-700">수령인</dt>
                <dd className="text-gray-900">{address?.recipientName ?? "-"}</dd>
              </div>
            </dl>
          </Card>

          <Card title="주문 상품" flush>
            <Table>
              <THead>
                <TR>
                  <TH>상품</TH>
                  <TH className="text-right">수량</TH>
                </TR>
              </THead>
              <TBody>
                {order.items.map((item) => (
                  <TR key={item.id}>
                    <TD>
                      <p className="font-medium text-gray-900">{item.product.name}</p>
                      <p className="text-caption tabular-nums text-gray-700">
                        {item.product.modelCode} · {item.product.category.name}
                      </p>
                    </TD>
                    <TD className="text-right tabular-nums">{item.qty}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card title="배송 일정" flush>
            <Table>
              <THead>
                <TR>
                  <TH>대상</TH>
                  <TH>상태</TH>
                  <TH>예정일</TH>
                  <TH>완료일</TH>
                </TR>
              </THead>
              <TBody>
                {order.deliveryJobs.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="py-xl text-center text-gray-400">
                      배송 일정이 아직 등록되지 않았습니다.
                    </TD>
                  </TR>
                ) : (
                  order.deliveryJobs.map((job) => (
                    <TR key={job.id}>
                      <TD>{itemName(job.orderItemId)}</TD>
                      <TD>
                        <div className="flex flex-wrap items-center gap-xs">
                          <Badge tone={job.status === "DELIVERED" ? "success" : "info"}>
                            {DELIVERY_STATUS_LABEL[job.status as DeliveryStatus]}
                          </Badge>
                          {isDeliveryDelayed(job) && <Badge tone="warning">지연</Badge>}
                        </div>
                        {job.carrier && (
                          <p className="mt-xs text-caption text-gray-700">
                            {job.carrier}
                            {job.trackingNo ? ` · ${job.trackingNo}` : ""}
                          </p>
                        )}
                      </TD>
                      <TD className="tabular-nums text-gray-700">
                        {formatDateTime(job.scheduledAt)}
                      </TD>
                      <TD className="tabular-nums text-gray-700">
                        {formatDateTime(job.completedAt)}
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </Card>

          <Card title="설치 일정" flush>
            <Table>
              <THead>
                <TR>
                  <TH>대상</TH>
                  <TH>상태</TH>
                  <TH>예정일</TH>
                  <TH>완료일</TH>
                </TR>
              </THead>
              <TBody>
                {order.installJobs.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="py-xl text-center text-gray-400">
                      설치 일정이 아직 등록되지 않았습니다.
                    </TD>
                  </TR>
                ) : (
                  order.installJobs.map((job) => (
                    <TR key={job.id}>
                      <TD>{itemName(job.orderItemId)}</TD>
                      <TD>
                        <div className="flex flex-wrap items-center gap-xs">
                          <Badge tone={job.status === "COMPLETED" ? "success" : "info"}>
                            {INSTALL_STATUS_LABEL[job.status as InstallStatus]}
                          </Badge>
                          {isInstallDelayed(job) && <Badge tone="warning">지연</Badge>}
                        </div>
                      </TD>
                      <TD className="tabular-nums text-gray-700">
                        {formatDateTime(job.scheduledAt)}
                      </TD>
                      <TD className="tabular-nums text-gray-700">
                        {formatDateTime(job.completedAt)}
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </Card>

          <p className="pb-xl text-center text-caption text-gray-700">
            일정 변경이나 문의는 {order.contract.store.name}{" "}
            {formatPhone(order.contract.store.phone)} 으로 연락해 주세요.
          </p>
        </div>
      </div>
    </main>
  );
}
