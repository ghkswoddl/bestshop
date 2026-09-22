import Link from "next/link";
import { notFound } from "next/navigation";
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
import { parseSnapshot, type DeliveryAddressSnapshot } from "@/lib/contracts";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  DELIVERY_STATUS_LABEL,
  DELIVERY_TRANSITIONS,
  INSTALL_STATUS_LABEL,
  INSTALL_TRANSITIONS,
  canCompleteInstall,
  findOrder,
  isDeliveryDelayed,
  isInstallDelayed,
  orderProgress,
  scheduleHistory,
} from "@/lib/orders";
import {
  advanceDeliveryAction,
  advanceInstallAction,
  createDeliveryJobAction,
  createInstallJobAction,
  rescheduleJobAction,
} from "@/lib/order-actions";
import type { DeliveryStatus, InstallStatus } from "@/lib/enums";
import { formatPhone } from "@/lib/phone";
import {
  DelayBadge,
  DeliveryNoticeBanner,
  DeliveryStatusBadge,
  InstallStatusBadge,
  OrderStatusBadge,
} from "../_components/badges";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-md py-sm">
      <dt className="w-28 shrink-0 text-caption text-gray-700">{label}</dt>
      <dd className="min-w-0 break-words text-body text-gray-900">{value || "-"}</dd>
    </div>
  );
}

/** 전이표가 허용하는 다음 상태만 버튼으로 낸다. 서버도 같은 표로 다시 검사한다. */
function TransitionButtons({
  orderId,
  jobId,
  allowed,
  labels,
  action,
}: {
  orderId: string;
  jobId: string;
  allowed: readonly string[];
  labels: Record<string, string>;
  action: (formData: FormData) => Promise<void>;
}) {
  if (allowed.length === 0) {
    return <span className="text-caption text-gray-400">종료된 작업</span>;
  }
  return (
    <div className="flex flex-wrap gap-xs">
      {allowed.map((status) => (
        <form key={status} action={action}>
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="status" value={status} />
          <Button type="submit" variant="ghost">
            {labels[status]}
          </Button>
        </form>
      ))}
    </div>
  );
}

function RescheduleForm({
  orderId,
  jobId,
  kind,
  scheduledAt,
}: {
  orderId: string;
  jobId: string;
  kind: "delivery" | "install";
  scheduledAt: Date | null;
}) {
  return (
    <form
      action={rescheduleJobAction}
      className="flex flex-col gap-sm sm:flex-row sm:flex-wrap sm:items-end"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="kind" value={kind} />
      <div className="w-52">
        <TextField
          name="scheduledAt"
          label="새 예정일시"
          type="datetime-local"
          defaultValue={scheduledAt ? toLocalInput(scheduledAt) : ""}
        />
      </div>
      <div className="w-40">
        <TextField name="reason" label="변경 사유" placeholder="고객 요청" />
      </div>
      <Button type="submit" variant="secondary">
        일정 변경
      </Button>
    </form>
  );
}

/** `datetime-local` 은 타임존 표기를 받지 않는다. KST 기준 문자열로 만든다. */
function toLocalInput(value: Date): string {
  const kst = new Date(value.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 16);
}

export default async function DeliveryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const ctx = await requireManager();
  const { id } = await params;
  const search = await searchParams;

  const order = await findOrder(ctx, id);
  if (!order) notFound();

  const progress = orderProgress(order);
  const address = parseSnapshot<DeliveryAddressSnapshot>(
    order.contract.deliveryAddressSnapshotJson,
  );
  const history = await scheduleHistory({
    deliveryJobIds: order.deliveryJobs.map((job) => job.id),
    installJobIds: order.installJobs.map((job) => job.id),
  });

  const itemLabel = (orderItemId: string | null) => {
    if (!orderItemId) return "주문 전체";
    const item = order.items.find((row) => row.id === orderItemId);
    return item ? item.product.name : "알 수 없는 품목";
  };

  const active = order.status !== "CANCELLED";

  return (
    <>
      <PageHeader
        title={`배송 추적 ${order.orderNo}`}
        actions={
          <Link
            href={`/contracts/${order.contractId}`}
            className="inline-flex h-10 items-center justify-center rounded-control border border-gray-200 bg-white px-lg text-button text-gray-900 hover:bg-gray-100"
          >
            계약 보기
          </Link>
        }
      />
      <main className="flex-1 overflow-y-auto p-md sm:p-xl">
        <div className="mx-auto max-w-container">
          <DeliveryNoticeBanner
            notice={pickOne(search, "delivery")}
            detail={pickOne(search, "detail")}
          />

          {progress.delayedCount > 0 && (
            <Notice tone="warning" className="mb-lg">
              예정일이 지난 작업이 {progress.delayedCount}건 있습니다. 일정을 변경하거나 상태를
              갱신하세요.
            </Notice>
          )}
          {progress.blockedInstalls > 0 && (
            <Notice tone="info" className="mb-lg">
              배송 완료를 기다리는 설치 작업이 {progress.blockedInstalls}건 있습니다. 배송이
              완료되어야 설치를 완료 처리할 수 있습니다.
            </Notice>
          )}

          <CardGrid>
            <Card
              title="주문 정보"
              className="col-span-12 lg:col-span-7"
              action={<OrderStatusBadge status={order.status} />}
            >
              <dl className="grid grid-cols-1 gap-x-xl sm:grid-cols-2">
                <Field label="주문번호" value={order.orderNo} />
                <Field
                  label="계약"
                  value={
                    <Link
                      href={`/contracts/${order.contractId}`}
                      className="text-lg-red hover:underline"
                    >
                      {order.contract.contractNo}
                    </Link>
                  }
                />
                <Field
                  label="고객"
                  value={
                    <Link
                      href={`/customers/${order.contract.customer.id}`}
                      className="text-lg-red hover:underline"
                    >
                      {order.contract.customer.name}
                    </Link>
                  }
                />
                <Field label="주문일" value={formatDateTime(order.placedAt)} />
                <Field
                  label="배송지"
                  value={[address?.address, address?.addressDetail].filter(Boolean).join(" ")}
                />
                <Field
                  label="수령인"
                  value={
                    address?.recipientName
                      ? `${address.recipientName} (${formatPhone(address.recipientPhone ?? "")})`
                      : null
                  }
                />
                <Field label="완료일" value={formatDateTime(order.completedAt)} />
              </dl>
              <p className="mt-md text-caption text-gray-700">
                배송지는 계약 시점 스냅샷입니다. 고객 주소가 이후에 바뀌어도 이 주문의 배송지는
                변하지 않습니다.
              </p>
            </Card>

            <Card title="고객 안내 링크" className="col-span-12 lg:col-span-5">
              <p className="mb-sm text-body text-gray-700">
                로그인 없이 열리는 배송 조회 링크입니다. 고객에게 그대로 전달하세요.
              </p>
              <div className="rounded-control border border-gray-200 bg-gray-100 p-md">
                <code className="break-all text-caption text-gray-900">
                  /track/{order.publicTrackingToken}
                </code>
              </div>
              <p className="mt-sm">
                <Link
                  href={`/track/${order.publicTrackingToken}`}
                  className="text-body text-lg-red hover:underline"
                >
                  추적 화면 열기
                </Link>
              </p>
              <p className="mt-md text-caption text-gray-700">
                금액·담당자·내부 메모는 이 링크에 표시되지 않습니다.
              </p>
            </Card>

            <Card title="배송 작업" flush className="col-span-12">
              <Table>
                <THead>
                  <TR>
                    <TH>대상</TH>
                    <TH>상태</TH>
                    <TH>예정일시</TH>
                    <TH>완료일시</TH>
                    <TH>배송사 / 송장</TH>
                    <TH>상태 변경</TH>
                  </TR>
                </THead>
                <TBody>
                  {order.deliveryJobs.length === 0 ? (
                    <TableEmpty colSpan={6}>등록된 배송 작업이 없습니다.</TableEmpty>
                  ) : (
                    order.deliveryJobs.map((job) => (
                      <TR key={job.id}>
                        <TD>{itemLabel(job.orderItemId)}</TD>
                        <TD>
                          <div className="flex flex-wrap items-center gap-xs">
                            <DeliveryStatusBadge status={job.status} />
                            {isDeliveryDelayed(job) && <DelayBadge />}
                          </div>
                        </TD>
                        <TD className="tabular-nums text-gray-700">
                          {formatDateTime(job.scheduledAt)}
                        </TD>
                        <TD className="tabular-nums text-gray-700">
                          {formatDateTime(job.completedAt)}
                        </TD>
                        <TD className="text-gray-700">
                          {job.carrier ?? "-"}
                          {job.trackingNo && (
                            <p className="text-caption tabular-nums">{job.trackingNo}</p>
                          )}
                        </TD>
                        <TD>
                          {active && (
                            <>
                              <TransitionButtons
                                orderId={order.id}
                                jobId={job.id}
                                allowed={DELIVERY_TRANSITIONS[job.status as DeliveryStatus] ?? []}
                                labels={DELIVERY_STATUS_LABEL}
                                action={advanceDeliveryAction}
                              />
                              {job.status !== "DELIVERED" && job.status !== "CANCELLED" && (
                                <div className="mt-sm">
                                  <RescheduleForm
                                    orderId={order.id}
                                    jobId={job.id}
                                    kind="delivery"
                                    scheduledAt={job.scheduledAt}
                                  />
                                </div>
                              )}
                            </>
                          )}
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </Card>

            <Card title="설치 작업" flush className="col-span-12">
              <Table>
                <THead>
                  <TR>
                    <TH>대상</TH>
                    <TH>상태</TH>
                    <TH>예정일시</TH>
                    <TH>완료일시</TH>
                    <TH>기사</TH>
                    <TH>상태 변경</TH>
                  </TR>
                </THead>
                <TBody>
                  {order.installJobs.length === 0 ? (
                    <TableEmpty colSpan={6}>등록된 설치 작업이 없습니다.</TableEmpty>
                  ) : (
                    order.installJobs.map((job) => {
                      const blocked = canCompleteInstall(job, order.deliveryJobs);
                      return (
                        <TR key={job.id}>
                          <TD>{itemLabel(job.orderItemId)}</TD>
                          <TD>
                            <div className="flex flex-wrap items-center gap-xs">
                              <InstallStatusBadge status={job.status} />
                              {isInstallDelayed(job) && <DelayBadge />}
                            </div>
                            {blocked && job.status !== "COMPLETED" && (
                              <p className="mt-xs text-caption text-warning">{blocked.reason}</p>
                            )}
                          </TD>
                          <TD className="tabular-nums text-gray-700">
                            {formatDateTime(job.scheduledAt)}
                          </TD>
                          <TD className="tabular-nums text-gray-700">
                            {formatDateTime(job.completedAt)}
                          </TD>
                          <TD className="text-gray-700">{job.technicianName ?? "-"}</TD>
                          <TD>
                            {active && (
                              <>
                                <TransitionButtons
                                  orderId={order.id}
                                  jobId={job.id}
                                  allowed={INSTALL_TRANSITIONS[job.status as InstallStatus] ?? []}
                                  labels={INSTALL_STATUS_LABEL}
                                  action={advanceInstallAction}
                                />
                                {job.status !== "COMPLETED" && job.status !== "CANCELLED" && (
                                  <div className="mt-sm">
                                    <RescheduleForm
                                      orderId={order.id}
                                      jobId={job.id}
                                      kind="install"
                                      scheduledAt={job.scheduledAt}
                                    />
                                  </div>
                                )}
                              </>
                            )}
                          </TD>
                        </TR>
                      );
                    })
                  )}
                </TBody>
              </Table>
            </Card>

            {active && (
              <>
                <Card title="배송 작업 등록" className="col-span-12 lg:col-span-6">
                  <form action={createDeliveryJobAction} className="flex flex-col gap-lg">
                    <input type="hidden" name="orderId" value={order.id} />
                    <Select name="orderItemId" label="대상 품목" defaultValue="">
                      <option value="">주문 전체</option>
                      {order.items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.product.name} ({item.qty}개)
                        </option>
                      ))}
                    </Select>
                    <TextField name="scheduledAt" label="배송 예정일시" type="datetime-local" />
                    <div className="grid grid-cols-2 gap-lg">
                      <TextField name="carrier" label="배송사" placeholder="LG 물류" />
                      <TextField name="trackingNo" label="송장번호" />
                    </div>
                    <TextField
                      name="address"
                      label="배송지 (비우면 계약 배송지)"
                      defaultValue={[address?.address, address?.addressDetail]
                        .filter(Boolean)
                        .join(" ")}
                    />
                    <div className="flex justify-end">
                      <Button type="submit">배송 작업 등록</Button>
                    </div>
                  </form>
                </Card>

                <Card title="설치 작업 등록" className="col-span-12 lg:col-span-6">
                  <form action={createInstallJobAction} className="flex flex-col gap-lg">
                    <input type="hidden" name="orderId" value={order.id} />
                    <Select name="orderItemId" label="대상 품목" defaultValue="">
                      <option value="">주문 전체</option>
                      {order.items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.product.name} ({item.qty}개)
                        </option>
                      ))}
                    </Select>
                    <TextField name="scheduledAt" label="설치 예정일시" type="datetime-local" />
                    <TextField name="technicianName" label="설치 기사" placeholder="홍길동 기사" />
                    <TextField name="note" label="메모" />
                    <p className="text-caption text-gray-700">
                      같은 품목의 배송 작업이 있으면 자동으로 연결됩니다. 설치 완료는 그 배송이
                      완료된 뒤에만 가능합니다.
                    </p>
                    <div className="flex justify-end">
                      <Button type="submit">설치 작업 등록</Button>
                    </div>
                  </form>
                </Card>
              </>
            )}

            <Card title="일정 변경 이력" flush className="col-span-12">
              <Table>
                <THead>
                  <TR>
                    <TH>변경일시</TH>
                    <TH>구분</TH>
                    <TH>이전 예정</TH>
                    <TH>변경 예정</TH>
                    <TH>사유</TH>
                    <TH>변경자</TH>
                  </TR>
                </THead>
                <TBody>
                  {history.length === 0 ? (
                    <TableEmpty colSpan={6}>일정 변경 이력이 없습니다.</TableEmpty>
                  ) : (
                    history.map((change) => (
                      <TR key={change.id}>
                        <TD className="tabular-nums">{formatDateTime(change.createdAt)}</TD>
                        <TD className="text-gray-700">
                          {change.deliveryJobId ? "배송" : "설치"}
                        </TD>
                        <TD className="tabular-nums text-gray-700">
                          {formatDateTime(change.previousScheduledAt)}
                        </TD>
                        <TD className="tabular-nums">{formatDateTime(change.newScheduledAt)}</TD>
                        <TD className="text-gray-700">{change.reason ?? "-"}</TD>
                        <TD className="text-gray-700">{change.changedBy?.name ?? "-"}</TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </Card>

            <Card title="주문 품목" flush className="col-span-12">
              <Table>
                <THead>
                  <TR>
                    <TH>상품</TH>
                    <TH>카테고리</TH>
                    <TH className="text-right">수량</TH>
                    <TH>배송</TH>
                    <TH>설치</TH>
                  </TR>
                </THead>
                <TBody>
                  {order.items.map((item) => {
                    const delivery = order.deliveryJobs.find((job) => job.orderItemId === item.id);
                    const install = order.installJobs.find((job) => job.orderItemId === item.id);
                    return (
                      <TR key={item.id}>
                        <TD>
                          <p className="font-medium text-gray-900">{item.product.name}</p>
                          <p className="text-caption tabular-nums text-gray-700">
                            {item.product.modelCode}
                          </p>
                        </TD>
                        <TD className="text-gray-700">{item.product.category.name}</TD>
                        <TD className="text-right tabular-nums">{item.qty}</TD>
                        <TD>
                          {delivery ? (
                            <>
                              <DeliveryStatusBadge status={delivery.status} />
                              <p className="mt-xs text-caption tabular-nums text-gray-700">
                                {formatDate(delivery.scheduledAt)}
                              </p>
                            </>
                          ) : (
                            <span className="text-caption text-gray-400">주문 전체 작업</span>
                          )}
                        </TD>
                        <TD>
                          {install ? (
                            <>
                              <InstallStatusBadge status={install.status} />
                              <p className="mt-xs text-caption tabular-nums text-gray-700">
                                {formatDate(install.scheduledAt)}
                              </p>
                            </>
                          ) : (
                            <span className="text-caption text-gray-400">-</span>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          </CardGrid>
        </div>
      </main>
    </>
  );
}
