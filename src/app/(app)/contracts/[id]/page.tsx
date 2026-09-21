import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Badge,
  Button,
  Card,
  CardGrid,
  LinkButton,
  Notice,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TextField,
} from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { pickOne, type RawSearchParams } from "@/lib/catalog";
import {
  SIGNATURE_STATUS_LABEL,
  currentSignatureRequest,
  findContract,
  parseSnapshot,
  signatureState,
  type CustomerSnapshot,
  type DeliveryAddressSnapshot,
  type FinanceSnapshot,
} from "@/lib/contracts";
import {
  amendContractAction,
  cancelContractAction,
  resendSignatureAction,
} from "@/lib/contract-actions";
import type { SignatureStatus } from "@/lib/enums";
import { formatDate, formatDateTime, formatKRW } from "@/lib/format";
import { aprLabel, FINANCE_TYPE_LABEL } from "@/lib/payments";
import { formatPhone } from "@/lib/phone";
import { ConfirmSubmitButton } from "../../customers/_components/ConfirmSubmitButton";
import { ContractNoticeBanner, ContractStatusBadge, SignaturePhaseBadge } from "../_components/badges";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-md py-sm">
      <dt className="w-28 shrink-0 text-caption text-gray-700">{label}</dt>
      <dd className="min-w-0 break-words text-body text-gray-900">{value || "-"}</dd>
    </div>
  );
}

export default async function ContractDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const ctx = await requireManager();
  const { id } = await params;
  const search = await searchParams;

  const contract = await findContract(ctx, id);
  if (!contract) notFound();

  const customerSnapshot = parseSnapshot<CustomerSnapshot>(contract.customerSnapshotJson);
  const addressSnapshot = parseSnapshot<DeliveryAddressSnapshot>(
    contract.deliveryAddressSnapshotJson,
  );
  const financeSnapshot = parseSnapshot<FinanceSnapshot>(contract.financeSnapshotJson);

  const current = currentSignatureRequest(contract);
  const state = current ? signatureState(current) : null;
  const editable = contract.status !== "SIGNED" && contract.status !== "CANCELLED";
  const cancellable =
    contract.status !== "CANCELLED" && (!contract.order || contract.order.status === "PLACED");

  return (
    <>
      <PageHeader
        title={`계약 ${contract.contractNo}`}
        actions={
          <>
            <LinkButton href={`/quotes/${contract.quoteId}`} variant="secondary">
              원본 견적
            </LinkButton>
            {editable && (
              <form action={resendSignatureAction}>
                <input type="hidden" name="contractId" value={contract.id} />
                <Button type="submit">서명 요청 재전송</Button>
              </form>
            )}
          </>
        }
      />
      <main className="flex-1 overflow-y-auto p-xl">
        <div className="mx-auto max-w-container">
          <ContractNoticeBanner
            notice={pickOne(search, "contract")}
            detail={pickOne(search, "detail")}
          />

          {contract.status === "CANCELLED" && (
            <Notice tone="error" className="mb-lg">
              취소된 계약입니다 ({formatDateTime(contract.cancelledAt)}). 사유:{" "}
              {contract.cancelReason ?? "미기재"}. 차감했던 재고는 복원되었습니다.
            </Notice>
          )}
          {state?.isStale && (
            <Notice tone="warning" className="mb-lg">
              서명 요청 후 {state.daysPending}일이 지났습니다. 고객에게 링크를 다시 안내하세요.
            </Notice>
          )}
          {state?.phase === "EXPIRED" && (
            <Notice tone="error" className="mb-lg">
              서명 링크가 만료되었습니다. 재전송하면 새 링크가 발급됩니다.
            </Notice>
          )}

          <CardGrid>
            <Card
              title="계약 정보"
              className="col-span-12 lg:col-span-7"
              action={<ContractStatusBadge status={contract.status} />}
            >
              <dl className="grid grid-cols-2 gap-x-xl">
                <Field label="계약번호" value={contract.contractNo} />
                <Field
                  label="원본 견적"
                  value={
                    <Link
                      href={`/quotes/${contract.quoteId}`}
                      className="text-lg-red hover:underline"
                    >
                      {contract.quote.quoteNo}
                    </Link>
                  }
                />
                <Field label="담당 매니저" value={contract.manager.name} />
                <Field label="매장" value={contract.store.name} />
                <Field label="생성일" value={formatDateTime(contract.createdAt)} />
                <Field label="서명일" value={formatDateTime(contract.signedAt)} />
                <Field
                  label="계약금액"
                  value={
                    <span className="text-h2 tabular-nums text-lg-red">
                      {formatKRW(contract.totalAmount)}
                    </span>
                  }
                />
              </dl>
              <p className="mt-md text-caption text-gray-700">
                계약금액은 결제설계의 총 납입액(상품금액 + 배송·설치비 + 할부수수료)입니다.
              </p>
            </Card>

            <Card title="고객 · 배송 정보 (계약 시점 스냅샷)" className="col-span-12 lg:col-span-5">
              <dl className="divide-y divide-gray-200">
                <Field label="고객명" value={customerSnapshot?.name} />
                <Field
                  label="연락처"
                  value={
                    customerSnapshot?.phone ? (
                      <span className="tabular-nums">{formatPhone(customerSnapshot.phone)}</span>
                    ) : null
                  }
                />
                <Field label="회원번호" value={customerSnapshot?.memberNo} />
                <Field
                  label="배송지"
                  value={[addressSnapshot?.address, addressSnapshot?.addressDetail]
                    .filter(Boolean)
                    .join(" ")}
                />
                <Field label="수령인" value={addressSnapshot?.recipientName} />
                <Field
                  label="수령인 연락처"
                  value={
                    addressSnapshot?.recipientPhone ? (
                      <span className="tabular-nums">
                        {formatPhone(addressSnapshot.recipientPhone)}
                      </span>
                    ) : null
                  }
                />
              </dl>
              <p className="mt-md text-caption text-gray-700">
                고객 정보가 이후에 바뀌어도 이 계약서의 내용은 변하지 않습니다.
              </p>
            </Card>

            <Card title="계약 상품" flush className="col-span-12">
              <Table>
                <THead>
                  <TR>
                    <TH>상품</TH>
                    <TH className="text-right">단가</TH>
                    <TH className="text-right">수량</TH>
                    <TH className="text-right">할인</TH>
                    <TH className="text-right">금액</TH>
                  </TR>
                </THead>
                <TBody>
                  {contract.quote.items.map((item) => (
                    <TR key={item.id}>
                      <TD>
                        <p className="font-medium text-gray-900">{item.product.name}</p>
                        <p className="text-caption tabular-nums text-gray-700">
                          {item.product.modelCode} · {item.product.category.name}
                          {item.optionsJson ? ` · ${item.optionsJson}` : ""}
                        </p>
                      </TD>
                      <TD className="text-right tabular-nums">
                        {formatKRW(item.unitPriceSnapshot)}
                      </TD>
                      <TD className="text-right tabular-nums">{item.qty}</TD>
                      <TD className="text-right tabular-nums text-gray-700">
                        {item.discountAmount > 0 ? `- ${formatKRW(item.discountAmount)}` : "-"}
                      </TD>
                      <TD className="text-right font-semibold tabular-nums">
                        {formatKRW(item.lineTotal)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>

            <Card title="결제 조건 (계약 시점 스냅샷)" className="col-span-12 lg:col-span-6">
              {financeSnapshot ? (
                <dl className="grid grid-cols-2 gap-x-xl">
                  <Field
                    label="결제수단"
                    value={`${financeSnapshot.name} (${
                      FINANCE_TYPE_LABEL[
                        financeSnapshot.type as keyof typeof FINANCE_TYPE_LABEL
                      ] ?? financeSnapshot.type
                    })`}
                  />
                  <Field
                    label="할부 조건"
                    value={
                      financeSnapshot.months > 0
                        ? `${financeSnapshot.months}개월 · ${aprLabel(financeSnapshot.apr)}`
                        : "일시납"
                    }
                  />
                  <Field label="상품금액" value={formatKRW(financeSnapshot.principal)} />
                  <Field label="선납금" value={formatKRW(financeSnapshot.downPayment)} />
                  <Field label="할부수수료" value={formatKRW(financeSnapshot.interestTotal)} />
                  <Field
                    label="월 납입금"
                    value={
                      financeSnapshot.months > 0
                        ? `${formatKRW(financeSnapshot.monthlyAmount)} × ${financeSnapshot.months - 1}회 + 마지막 ${formatKRW(financeSnapshot.lastMonthAmount)}`
                        : "일시납"
                    }
                  />
                  <Field label="총 납입액" value={formatKRW(financeSnapshot.totalPayable)} />
                  <Field label="승인번호" value={financeSnapshot.approvalCode} />
                </dl>
              ) : (
                <p className="text-body text-gray-400">결제 조건 스냅샷이 없습니다.</p>
              )}
            </Card>

            <Card
              title="전자서명"
              className="col-span-12 lg:col-span-6"
              action={state ? <SignaturePhaseBadge state={state} /> : undefined}
            >
              {current ? (
                <>
                  <dl className="divide-y divide-gray-200">
                    <Field label="요청일" value={formatDateTime(current.requestedAt)} />
                    <Field label="만료일" value={formatDateTime(current.expiresAt)} />
                    <Field label="발송 횟수" value={`${current.sentCount}회`} />
                    <Field label="서명일" value={formatDateTime(current.signedAt)} />
                    <Field label="서명자" value={current.signerName} />
                  </dl>

                  {state?.isSignable && (
                    <div className="mt-lg rounded-control border border-gray-200 bg-gray-100 p-md">
                      <p className="mb-xs text-caption font-medium text-gray-700">
                        고객 서명 링크 (로그인 없이 열립니다)
                      </p>
                      <code className="break-all text-caption text-gray-900">
                        /sign/{current.token}
                      </code>
                      <p className="mt-sm">
                        <Link
                          href={`/sign/${current.token}`}
                          className="text-body text-lg-red hover:underline"
                        >
                          서명 화면 열기
                        </Link>
                      </p>
                    </div>
                  )}

                  {current.signatureImage && (
                    <div className="mt-lg">
                      <p className="mb-sm text-caption font-medium text-gray-700">서명 이미지</p>
                      {/* 고객이 Canvas 로 그린 data URL. next/image 는 data URL 최적화 대상이 아니다. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={current.signatureImage}
                        alt={`${current.signerName ?? "고객"} 서명`}
                        className="h-32 rounded-control border border-gray-200 bg-white"
                      />
                    </div>
                  )}
                </>
              ) : (
                <p className="text-body text-gray-400">서명 요청이 없습니다.</p>
              )}
            </Card>

            {contract.signatureRequests.length > 1 && (
              <Card title="서명 요청 이력" flush className="col-span-12">
                <Table>
                  <THead>
                    <TR>
                      <TH>요청일</TH>
                      <TH>상태</TH>
                      <TH>발송</TH>
                      <TH>만료일</TH>
                      <TH>서명일</TH>
                      <TH>무효 사유</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {contract.signatureRequests.map((request) => (
                      <TR key={request.id}>
                        <TD className="tabular-nums">{formatDateTime(request.requestedAt)}</TD>
                        <TD>
                          <Badge tone="neutral" showIcon={false}>
                            {SIGNATURE_STATUS_LABEL[request.status as SignatureStatus] ??
                              request.status}
                          </Badge>
                        </TD>
                        <TD className="tabular-nums text-gray-700">{request.sentCount}회</TD>
                        <TD className="tabular-nums text-gray-700">
                          {formatDate(request.expiresAt)}
                        </TD>
                        <TD className="tabular-nums text-gray-700">
                          {formatDateTime(request.signedAt)}
                        </TD>
                        <TD className="text-gray-700">{request.invalidatedReason ?? "-"}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>
            )}

            {contract.order && (
              <Card
                title="주문"
                className="col-span-12"
                action={
                  <Badge tone="success" showIcon={false}>
                    {contract.order.orderNo}
                  </Badge>
                }
              >
                <p className="text-body text-gray-700">
                  서명이 완료되어 주문 {contract.order.items.length}건이 생성되었습니다. 배송·설치
                  진행 상황은 배송 및 설치 추적 화면에서 확인합니다.
                </p>
              </Card>
            )}

            {editable && (
              <Card title="계약 변경" className="col-span-12 lg:col-span-7">
                <form action={amendContractAction} className="flex flex-col gap-lg">
                  <input type="hidden" name="contractId" value={contract.id} />
                  <div className="grid grid-cols-2 gap-lg">
                    <TextField
                      name="recipientName"
                      label="수령인"
                      defaultValue={addressSnapshot?.recipientName ?? ""}
                    />
                    <TextField
                      name="recipientPhone"
                      label="수령인 연락처"
                      defaultValue={addressSnapshot?.recipientPhone ?? ""}
                    />
                  </div>
                  <TextField
                    name="address"
                    label="배송지"
                    defaultValue={addressSnapshot?.address ?? ""}
                  />
                  <TextField
                    name="addressDetail"
                    label="상세주소"
                    defaultValue={addressSnapshot?.addressDetail ?? ""}
                  />
                  <TextField
                    name="totalAmount"
                    label="계약금액 (원)"
                    inputMode="numeric"
                    defaultValue={String(contract.totalAmount)}
                    hint="금액을 바꾸면 기존 서명 요청이 자동으로 무효화되고 새 링크가 발급됩니다."
                  />
                  <div className="flex justify-end">
                    <Button type="submit" variant="secondary">
                      계약 변경 저장
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {cancellable && (
              <Card title="계약 취소" className="col-span-12 lg:col-span-5">
                <form action={cancelContractAction} className="flex flex-col gap-lg">
                  <input type="hidden" name="contractId" value={contract.id} />
                  <TextField
                    name="cancelReason"
                    label="취소 사유"
                    placeholder="고객 변심 / 재고 문제"
                  />
                  <p className="text-caption text-gray-700">
                    취소하면 계약 생성 시 차감했던 재고가 복원되고, 진행 중인 서명 요청이
                    무효화됩니다.
                  </p>
                  <div className="flex justify-end">
                    <ConfirmSubmitButton
                      confirmMessage={`계약 ${contract.contractNo} 을(를) 취소할까요? 재고가 복원되고 서명 요청이 무효화됩니다.`}
                    >
                      계약 취소
                    </ConfirmSubmitButton>
                  </div>
                </form>
              </Card>
            )}
          </CardGrid>
        </div>
      </main>
    </>
  );
}
