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
  TableEmpty,
  TextField,
} from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { pickInt, pickOne, type RawSearchParams } from "@/lib/catalog";
import { FINANCE_TYPE, type FinanceType } from "@/lib/enums";
import { formatDateTime, formatKRW } from "@/lib/format";
import {
  FINANCE_TYPE_LABEL,
  activeFinanceProducts,
  aprLabel,
  canReplacePlan,
  comparePaymentOptions,
  computeSchedule,
  findPaymentPlan,
  isPlanEditable,
  termLabel,
} from "@/lib/payments";
import {
  cancelPaymentPlanAction,
  decidePaymentPlanAction,
  savePaymentPlanAction,
} from "@/lib/payment-actions";
import { findQuote } from "@/lib/quotes";
import { ConfirmSubmitButton } from "../../../customers/_components/ConfirmSubmitButton";
import { PaymentNoticeBanner, PaymentStatusBadge, QuoteStatusBadge } from "../../_components/badges";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-md py-sm">
      <dt className="w-28 shrink-0 text-caption text-gray-700">{label}</dt>
      <dd className="text-body text-gray-900">{value}</dd>
    </div>
  );
}

export default async function QuotePaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const ctx = await requireManager();
  const { id } = await params;
  const search = await searchParams;

  const quote = await findQuote(ctx, id);
  if (!quote) notFound();

  const [plan, products] = await Promise.all([findPaymentPlan(ctx, quote.id), activeFinanceProducts()]);

  // 선납금은 미리보기용으로 쿼리스트링에 싣는다. 저장된 설계가 있으면 그 값을 기본으로 쓴다.
  const downPayment = Math.min(
    Math.max(0, pickInt(search, "down") ?? plan?.downPayment ?? 0),
    quote.grandTotal,
  );
  const typeFilter = pickOne(search, "type");
  const activeType = typeFilter && (FINANCE_TYPE as readonly string[]).includes(typeFilter)
    ? (typeFilter as FinanceType)
    : null;

  const rows = comparePaymentOptions(products, { principal: quote.grandTotal, downPayment }).filter(
    (row) => activeType == null || row.product.type === activeType,
  );

  const planEditable = isPlanEditable(plan);
  const planReplaceable = canReplacePlan(plan);
  const quoteClosed =
    quote.status === "LOCKED" || quote.status === "CONVERTED" || quote.status === "CANCELLED";
  const savedSchedule = plan
    ? computeSchedule(plan.financeProduct, {
        principal: plan.principal,
        downPayment: plan.downPayment,
      })
    : null;
  const planDrifted =
    plan != null && (plan.principal !== quote.grandTotal || savedSchedule?.totalPayable !== plan.totalPayable);

  const typeHref = (type: string) => {
    const next = new URLSearchParams();
    if (downPayment > 0) next.set("down", String(downPayment));
    if (type) next.set("type", type);
    const qs = next.toString();
    return `/quotes/${quote.id}/payment${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title={`결제 및 금융설계 · ${quote.quoteNo}`}
        actions={
          <LinkButton href={`/quotes/${quote.id}`} variant="secondary">
            견적으로 돌아가기
          </LinkButton>
        }
      />
      <main className="flex-1 overflow-y-auto p-md sm:p-xl">
        <div className="mx-auto max-w-container">
          <PaymentNoticeBanner notice={pickOne(search, "pay")} />

          {quoteClosed && (
            <Notice tone="warning" className="mb-lg">
              계약 단계로 넘어간 견적입니다. 결제설계는 조회만 할 수 있습니다.
            </Notice>
          )}
          {planDrifted && (
            <Notice tone="error" className="mb-lg">
              저장된 결제설계의 결제금액({formatKRW(plan.principal)})이 현재 견적 금액(
              {formatKRW(quote.grandTotal)})과 다릅니다. 결제설계를 다시 저장하세요.
            </Notice>
          )}

          <CardGrid>
            <Card
              title="결제 대상 견적"
              className="col-span-12 lg:col-span-5"
              action={<QuoteStatusBadge status={quote.status} />}
            >
              <dl className="divide-y divide-gray-200">
                <Field
                  label="고객"
                  value={
                    <Link
                      href={`/customers/${quote.customer.id}`}
                      className="text-lg-red hover:underline"
                    >
                      {quote.customer.name}
                    </Link>
                  }
                />
                <Field
                  label="견적"
                  value={
                    <Link href={`/quotes/${quote.id}`} className="text-lg-red hover:underline">
                      {quote.quoteNo}
                    </Link>
                  }
                />
                <Field label="품목" value={`${quote.items.length}개`} />
                <Field
                  label="결제금액"
                  value={
                    <span className="text-h2 tabular-nums text-lg-red">
                      {formatKRW(quote.grandTotal)}
                    </span>
                  }
                />
              </dl>
              <p className="mt-md text-caption text-gray-700">
                결제금액은 배송비·설치비가 포함된 견적 합계입니다. 견적을 고치려면 결제설계를
                취소해야 합니다.
              </p>
            </Card>

            <Card
              title="현재 결제설계"
              className="col-span-12 lg:col-span-7"
              action={plan ? <PaymentStatusBadge status={plan.status} /> : undefined}
            >
              {plan ? (
                <>
                  <dl className="grid grid-cols-1 gap-x-xl sm:grid-cols-2">
                    <Field
                      label="금융상품"
                      value={
                        <>
                          {plan.financeProduct.name}
                          <span className="ml-sm text-caption text-gray-700">
                            {FINANCE_TYPE_LABEL[plan.financeProduct.type as FinanceType]} ·{" "}
                            {termLabel(plan.financeProduct)} · {aprLabel(plan.financeProduct.apr)}
                          </span>
                        </>
                      }
                    />
                    <Field label="결제금액" value={formatKRW(plan.principal)} />
                    <Field label="선납금" value={formatKRW(plan.downPayment)} />
                    <Field label="할부원금" value={formatKRW(plan.principal - plan.downPayment)} />
                    <Field label="할부수수료" value={formatKRW(plan.interestTotal)} />
                    <Field
                      label="월 납입금"
                      value={
                        plan.months > 0 ? (
                          <>
                            <span className="tabular-nums">{formatKRW(plan.monthlyAmount)}</span>
                            <span className="text-caption text-gray-700"> × {plan.months - 1}회</span>
                            {plan.lastMonthAmount !== plan.monthlyAmount && (
                              <span className="text-caption text-gray-700">
                                {" "}
                                + 마지막 {formatKRW(plan.lastMonthAmount)}
                              </span>
                            )}
                          </>
                        ) : (
                          "일시납"
                        )
                      }
                    />
                    <Field
                      label="총 납입액"
                      value={
                        <span className="text-h3 tabular-nums text-gray-900">
                          {formatKRW(plan.totalPayable)}
                        </span>
                      }
                    />
                    {plan.approvalCode && <Field label="승인번호" value={plan.approvalCode} />}
                    <Field label="최종 수정" value={formatDateTime(plan.updatedAt)} />
                  </dl>

                  {plan.failureReason && (
                    <Notice tone="error" className="mt-lg">
                      승인 거절 사유: {plan.failureReason}
                    </Notice>
                  )}

                  {!quoteClosed && (
                    <div className="mt-lg flex flex-wrap items-end gap-md border-t border-gray-200 pt-lg">
                      {planEditable ? (
                        <>
                          <form action={decidePaymentPlanAction} className="flex items-end gap-md">
                            <input type="hidden" name="quoteId" value={quote.id} />
                            <input type="hidden" name="decision" value="approve" />
                            <Button type="submit">결제 승인 (모의)</Button>
                          </form>
                          <form
                            action={decidePaymentPlanAction}
                            className="flex w-full flex-col gap-md sm:w-auto sm:flex-1 sm:flex-row sm:items-end"
                          >
                            <input type="hidden" name="quoteId" value={quote.id} />
                            <input type="hidden" name="decision" value="reject" />
                            <div className="w-full sm:min-w-[200px] sm:flex-1">
                              <TextField
                                name="failureReason"
                                label="거절 사유"
                                placeholder="한도 초과 / 카드사 승인 거절"
                              />
                            </div>
                            <Button type="submit" variant="secondary">
                              거절 처리
                            </Button>
                          </form>
                        </>
                      ) : (
                        <p className="flex-1 text-body text-gray-700">
                          {plan.status === "CANCELLED"
                            ? "취소된 설계입니다. 아래에서 다시 설계할 수 있습니다."
                            : "승인·거절된 설계는 수정할 수 없습니다. 취소 후 다시 설계하세요."}
                        </p>
                      )}
                      {plan.status !== "CANCELLED" && (
                        <form action={cancelPaymentPlanAction}>
                          <input type="hidden" name="quoteId" value={quote.id} />
                          <ConfirmSubmitButton confirmMessage="결제설계를 취소하면 견적이 다시 '작성중' 으로 돌아갑니다. 진행할까요?">
                            결제설계 취소
                          </ConfirmSubmitButton>
                        </form>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-body text-gray-400">
                  아직 결제설계가 없습니다. 아래에서 결제수단과 금융상품을 선택하세요.
                </p>
              )}
            </Card>

            <Card title="선납금 / 결제수단" className="col-span-12">
              <form
                method="get"
                action={`/quotes/${quote.id}/payment`}
                className="flex flex-col gap-md sm:flex-row sm:flex-wrap sm:items-end sm:gap-lg"
              >
                {activeType && <input type="hidden" name="type" value={activeType} />}
                <div className="w-full sm:w-56">
                  <TextField
                    name="down"
                    label="선납금 (원)"
                    inputMode="numeric"
                    defaultValue={String(downPayment)}
                    hint="입력 후 '다시 계산' 을 누르면 아래 표가 갱신됩니다."
                  />
                </div>
                <div className="sm:pb-px">
                  <Button type="submit" variant="secondary">
                    다시 계산
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-sm sm:pb-md">
                  <span className="text-caption text-gray-700">결제수단</span>
                  <Link
                    href={typeHref("")}
                    className={
                      activeType == null
                        ? "rounded-control bg-lg-red-light px-md py-xs text-caption font-semibold text-lg-red"
                        : "rounded-control border border-gray-200 px-md py-xs text-caption text-gray-700 hover:bg-gray-100"
                    }
                  >
                    전체
                  </Link>
                  {FINANCE_TYPE.map((type) => (
                    <Link
                      key={type}
                      href={typeHref(type)}
                      className={
                        activeType === type
                          ? "rounded-control bg-lg-red-light px-md py-xs text-caption font-semibold text-lg-red"
                          : "rounded-control border border-gray-200 px-md py-xs text-caption text-gray-700 hover:bg-gray-100"
                      }
                    >
                      {FINANCE_TYPE_LABEL[type]}
                    </Link>
                  ))}
                </div>
              </form>
            </Card>

            <Card
              title="금융상품 조건 비교"
              flush
              className="col-span-12"
              action={
                <span className="text-caption text-gray-700">
                  결제금액 {formatKRW(quote.grandTotal)} · 선납금 {formatKRW(downPayment)} 기준
                </span>
              }
            >
              <Table>
                <THead>
                  <TR>
                    <TH>금융상품</TH>
                    <TH>결제수단</TH>
                    <TH>기간</TH>
                    <TH>연이율</TH>
                    <TH className="text-right">월 납입금</TH>
                    <TH className="text-right">수수료</TH>
                    <TH className="text-right">총 납입액</TH>
                    <TH>선택</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.length === 0 ? (
                    <TableEmpty colSpan={8}>조건에 맞는 금융상품이 없습니다.</TableEmpty>
                  ) : (
                    rows.map(({ product, schedule, ineligibleReason }) => {
                      const selected = plan?.financeProductId === product.id && plan.status !== "CANCELLED";
                      return (
                        <TR key={product.id} className={selected ? "bg-lg-red-light" : undefined}>
                          <TD>
                            <p className="font-medium text-gray-900">{product.name}</p>
                            {product.benefitNote && (
                              <p className="text-caption text-gray-700">{product.benefitNote}</p>
                            )}
                            {ineligibleReason && (
                              <p className="text-caption text-warning">{ineligibleReason}</p>
                            )}
                          </TD>
                          <TD className="text-gray-700">
                            {FINANCE_TYPE_LABEL[product.type as FinanceType]}
                          </TD>
                          <TD className="tabular-nums text-gray-700">{termLabel(product)}</TD>
                          <TD className="tabular-nums text-gray-700">{aprLabel(product.apr)}</TD>
                          <TD className="text-right tabular-nums">
                            {schedule.months > 0 ? formatKRW(schedule.monthlyAmount) : "일시납"}
                          </TD>
                          <TD className="text-right tabular-nums text-gray-700">
                            {schedule.interestTotal > 0 ? formatKRW(schedule.interestTotal) : "-"}
                          </TD>
                          <TD className="text-right font-semibold tabular-nums">
                            {formatKRW(schedule.totalPayable)}
                          </TD>
                          <TD>
                            {selected ? (
                              <Badge tone="success">적용됨</Badge>
                            ) : ineligibleReason || quoteClosed || !planReplaceable ? (
                              <span className="text-caption text-gray-400">-</span>
                            ) : (
                              <form action={savePaymentPlanAction}>
                                <input type="hidden" name="quoteId" value={quote.id} />
                                <input type="hidden" name="financeProductId" value={product.id} />
                                <input type="hidden" name="downPayment" value={String(downPayment)} />
                                <Button type="submit" variant="ghost">
                                  이 조건으로 설계
                                </Button>
                              </form>
                            )}
                          </TD>
                        </TR>
                      );
                    })
                  )}
                </TBody>
              </Table>
              <p className="px-lg py-md text-caption text-gray-700">
                할부수수료는 단리(할부원금 × 연이율 × 개월수 ÷ 12)로 계산하며 원 단위는 절사합니다.
                월 납입금은 올림 처리하고 마지막 회차가 잔액을 흡수하므로, 회차 합계는 총 납입액과
                정확히 일치합니다. 실제 카드사 승인 금액과는 차이가 있을 수 있습니다.
              </p>
            </Card>
          </CardGrid>
        </div>
      </main>
    </>
  );
}
