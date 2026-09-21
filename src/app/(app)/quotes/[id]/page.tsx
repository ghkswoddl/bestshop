import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Badge,
  Button,
  Card,
  CardGrid,
  InventoryBadge,
  LinkButton,
  Notice,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableEmpty,
  TextArea,
  TextField,
} from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { pickOne, productWhere, storeStockMap, type RawSearchParams } from "@/lib/catalog";
import { CONSULTATION_STAGE_LABEL, type ConsultationStage } from "@/lib/enums";
import { formatDate, formatDateTime, formatKRW, toDateInputValue } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { createContractAction } from "@/lib/contract-actions";
import { findPaymentPlan } from "@/lib/payments";
import { promotionBenefitLabel } from "@/lib/promotions";
import {
  addQuoteItemAction,
  deleteQuoteAction,
  forkQuoteAction,
  reapplyPromotionsAction,
  removeQuoteItemAction,
  updateQuoteItemAction,
  updateQuoteMetaAction,
} from "@/lib/quote-actions";
import {
  computeQuoteTotals,
  findQuote,
  isQuoteEditable,
  promotionBreakdown,
  quoteLockReason,
  quoteValidity,
  quoteVersionChain,
} from "@/lib/quotes";
import { ConfirmSubmitButton } from "../../customers/_components/ConfirmSubmitButton";
import {
  PaymentStatusBadge,
  QuoteNoticeBanner,
  QuoteStatusBadge,
  ValidityBadge,
} from "../_components/badges";

const ADD_SEARCH_LIMIT = 10;

function SummaryRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-md py-sm">
      <dt className={strong ? "text-h3 text-gray-900" : "text-body text-gray-700"}>{label}</dt>
      <dd
        className={
          strong
            ? "text-display tabular-nums text-lg-red"
            : "text-body tabular-nums text-gray-900"
        }
      >
        {value}
      </dd>
    </div>
  );
}

export default async function QuoteDetailPage({
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

  const editable = isQuoteEditable(quote);
  const lockReason = quoteLockReason(quote);
  const validity = quoteValidity(quote);
  const addQuery = pickOne(search, "pq") ?? "";

  const lineInputs = quote.items.map((item) => ({
    productId: item.productId,
    qty: item.qty,
    unitPriceSnapshot: item.unitPriceSnapshot,
  }));

  const [breakdown, stock, versions, addResults, plan] = await Promise.all([
    promotionBreakdown(lineInputs),
    storeStockMap(
      ctx,
      quote.items.map((item) => item.productId),
      new Map(quote.items.map((item) => [item.productId, item.product.status])),
    ),
    quoteVersionChain(ctx, quote),
    addQuery
      ? prisma.product.findMany({
          where: productWhere({ q: addQuery, status: "ON_SALE" }),
          orderBy: { name: "asc" },
          take: ADD_SEARCH_LIMIT,
          include: { category: true },
        })
      : Promise.resolve([]),
    findPaymentPlan(ctx, id),
  ]);

  // 저장된 합계와 라인에서 다시 계산한 합계는 항상 같아야 한다. 어긋나면 화면에서 알린다.
  const recomputed = computeQuoteTotals(quote.items, {
    deliveryFee: quote.deliveryFee,
    installFee: quote.installFee,
  });
  const totalsDrifted = recomputed.grandTotal !== quote.grandTotal;

  const alreadyInQuote = new Set(quote.items.map((item) => item.productId));

  return (
    <>
      <PageHeader
        title={`견적 ${quote.quoteNo}`}
        actions={
          <>
            <LinkButton href={`/quotes/${quote.id}/payment`}>결제 및 금융설계</LinkButton>
            <LinkButton href={`/quotes/${quote.id}/print`} variant="secondary">
              인쇄 / PDF
            </LinkButton>
            <form action={forkQuoteAction}>
              <input type="hidden" name="quoteId" value={quote.id} />
              <Button type="submit" variant="secondary">
                새 버전 만들기
              </Button>
            </form>
          </>
        }
      />
      <main className="flex-1 overflow-y-auto p-xl">
        <div className="mx-auto max-w-container">
          <QuoteNoticeBanner notice={pickOne(search, "quote")} />

          {lockReason && (
            <Notice tone="warning" className="mb-lg">
              {lockReason}
            </Notice>
          )}
          {validity.level === "EXPIRED" && (
            <Notice tone="error" className="mb-lg">
              {validity.label}. 고객에게 제시하기 전에 유효기간을 갱신하거나 새 버전을 만드세요.
            </Notice>
          )}
          {validity.level === "EXPIRING" && (
            <Notice tone="warning" className="mb-lg">
              {validity.label}. 곧 만료됩니다.
            </Notice>
          )}
          {totalsDrifted && (
            <Notice tone="error" className="mb-lg">
              저장된 합계({formatKRW(quote.grandTotal)})와 라인 재계산 결과(
              {formatKRW(recomputed.grandTotal)})가 다릅니다. 라인을 한 번 저장하면 복구됩니다.
            </Notice>
          )}

          <CardGrid>
            <Card
              title="견적 정보"
              className="col-span-12 lg:col-span-8"
              action={
                <div className="flex items-center gap-sm">
                  <QuoteStatusBadge status={quote.status} />
                  <ValidityBadge validity={validity} />
                  {quote.version > 1 && (
                    <Badge tone="neutral" showIcon={false}>
                      버전 {quote.version}
                    </Badge>
                  )}
                </div>
              }
            >
              <dl className="grid grid-cols-2 gap-x-xl divide-gray-200">
                <div className="flex gap-md py-sm">
                  <dt className="w-24 shrink-0 text-caption text-gray-700">고객</dt>
                  <dd className="text-body">
                    <Link
                      href={`/customers/${quote.customer.id}`}
                      className="text-lg-red hover:underline"
                    >
                      {quote.customer.name}
                    </Link>
                    <span className="ml-sm tabular-nums text-gray-700">
                      {formatPhone(quote.customer.phone)}
                    </span>
                  </dd>
                </div>
                <div className="flex gap-md py-sm">
                  <dt className="w-24 shrink-0 text-caption text-gray-700">담당 매니저</dt>
                  <dd className="text-body text-gray-900">{quote.manager.name}</dd>
                </div>
                <div className="flex gap-md py-sm">
                  <dt className="w-24 shrink-0 text-caption text-gray-700">매장</dt>
                  <dd className="text-body text-gray-900">{quote.store.name}</dd>
                </div>
                <div className="flex gap-md py-sm">
                  <dt className="w-24 shrink-0 text-caption text-gray-700">연결 상담</dt>
                  <dd className="text-body text-gray-900">
                    {quote.consultation ? (
                      <>
                        {formatDate(quote.consultation.startedAt)} ·{" "}
                        {CONSULTATION_STAGE_LABEL[quote.consultation.stage as ConsultationStage]}
                      </>
                    ) : (
                      "연결 안 됨"
                    )}
                  </dd>
                </div>
                <div className="flex gap-md py-sm">
                  <dt className="w-24 shrink-0 text-caption text-gray-700">작성일</dt>
                  <dd className="text-body text-gray-900">{formatDateTime(quote.createdAt)}</dd>
                </div>
                <div className="flex gap-md py-sm">
                  <dt className="w-24 shrink-0 text-caption text-gray-700">최종 수정</dt>
                  <dd className="text-body text-gray-900">{formatDateTime(quote.updatedAt)}</dd>
                </div>
                <div className="flex gap-md py-sm">
                  <dt className="w-24 shrink-0 text-caption text-gray-700">결제설계</dt>
                  <dd className="flex flex-wrap items-center gap-sm text-body text-gray-900">
                    {plan ? (
                      <>
                        <PaymentStatusBadge status={plan.status} />
                        <span>{plan.financeProduct.name}</span>
                        <span className="tabular-nums text-gray-700">
                          총 {formatKRW(plan.totalPayable)}
                        </span>
                      </>
                    ) : (
                      <Link
                        href={`/quotes/${quote.id}/payment`}
                        className="text-lg-red hover:underline"
                      >
                        결제설계 하기
                      </Link>
                    )}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card title="금액 요약" className="col-span-12 lg:col-span-4">
              <dl className="divide-y divide-gray-200">
                <SummaryRow label="상품 합계" value={formatKRW(quote.subtotal)} />
                <SummaryRow
                  label="할인 합계"
                  value={quote.discountTotal > 0 ? `- ${formatKRW(quote.discountTotal)}` : formatKRW(0)}
                />
                <SummaryRow label="배송비" value={formatKRW(quote.deliveryFee)} />
                <SummaryRow label="설치비" value={formatKRW(quote.installFee)} />
                <SummaryRow label="견적 합계" value={formatKRW(quote.grandTotal)} strong />
              </dl>
            </Card>

            <Card
              title={`견적 품목 ${quote.items.length}개`}
              flush
              className="col-span-12"
              action={
                editable && quote.items.length > 0 ? (
                  <form action={reapplyPromotionsAction}>
                    <input type="hidden" name="quoteId" value={quote.id} />
                    <Button type="submit" variant="secondary">
                      프로모션 재적용
                    </Button>
                  </form>
                ) : undefined
              }
            >
              <Table>
                <THead>
                  <TR>
                    <TH>상품</TH>
                    <TH>재고</TH>
                    <TH className="text-right">단가 스냅샷</TH>
                    <TH>수량 · 옵션</TH>
                    <TH className="text-right">할인</TH>
                    <TH className="text-right">라인 합계</TH>
                    {editable && <TH>관리</TH>}
                  </TR>
                </THead>
                <TBody>
                  {quote.items.length === 0 ? (
                    <TableEmpty colSpan={editable ? 7 : 6}>
                      담긴 상품이 없습니다. 아래에서 상품을 추가하세요.
                    </TableEmpty>
                  ) : (
                    quote.items.map((item) => {
                      const evaluations = breakdown.get(item.productId) ?? [];
                      return (
                        <TR key={item.id}>
                          <TD>
                            <Link
                              href={`/products/${item.productId}`}
                              className="font-medium text-lg-red hover:underline"
                            >
                              {item.product.name}
                            </Link>
                            <p className="text-caption tabular-nums text-gray-700">
                              {item.product.modelCode} · {item.product.category.name}
                            </p>
                            {evaluations.length > 0 && (
                              <ul className="mt-sm flex flex-col gap-xs">
                                {evaluations.map((evaluation) => {
                                  const applied =
                                    item.appliedPromotionId === evaluation.promotion.id;
                                  return (
                                    <li
                                      key={evaluation.promotion.id}
                                      className="flex flex-wrap items-center gap-sm text-caption"
                                    >
                                      <Badge
                                        tone={applied ? "success" : "neutral"}
                                        showIcon={applied}
                                      >
                                        {applied ? "적용" : "미적용"}
                                      </Badge>
                                      <Link
                                        href={`/promotions/${evaluation.promotion.id}`}
                                        className="text-gray-900 hover:text-lg-red hover:underline"
                                      >
                                        {evaluation.promotion.title}
                                      </Link>
                                      <span className="text-gray-700">
                                        {promotionBenefitLabel(evaluation.promotion)}
                                      </span>
                                      {evaluation.ineligibleReason ? (
                                        <span className="text-warning">
                                          {evaluation.ineligibleReason}
                                        </span>
                                      ) : (
                                        !applied &&
                                        evaluation.discount === 0 && (
                                          <span className="text-gray-700">
                                            금액 할인 아님 (별도 혜택)
                                          </span>
                                        )
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </TD>
                          <TD>
                            <InventoryBadge
                              status={stock.get(item.productId)?.status ?? "NOT_CARRIED"}
                            />
                          </TD>
                          <TD className="text-right tabular-nums">
                            {formatKRW(item.unitPriceSnapshot)}
                          </TD>
                          <TD>
                            {editable ? (
                              <form
                                action={updateQuoteItemAction}
                                className="flex flex-wrap items-end gap-sm"
                              >
                                <input type="hidden" name="quoteId" value={quote.id} />
                                <input type="hidden" name="itemId" value={item.id} />
                                <div className="w-20">
                                  <TextField
                                    name="qty"
                                    label="수량"
                                    inputMode="numeric"
                                    defaultValue={String(item.qty)}
                                  />
                                </div>
                                <div className="w-40">
                                  <TextField
                                    name="options"
                                    label="옵션"
                                    defaultValue={item.optionsJson ?? ""}
                                    placeholder="색상/용량"
                                  />
                                </div>
                                <Button type="submit" variant="secondary">
                                  적용
                                </Button>
                              </form>
                            ) : (
                              <>
                                <span className="tabular-nums">{item.qty}개</span>
                                {item.optionsJson && (
                                  <p className="text-caption text-gray-700">{item.optionsJson}</p>
                                )}
                              </>
                            )}
                          </TD>
                          <TD className="text-right tabular-nums text-gray-700">
                            {item.discountAmount > 0 ? `- ${formatKRW(item.discountAmount)}` : "-"}
                          </TD>
                          <TD className="text-right font-semibold tabular-nums">
                            {formatKRW(item.lineTotal)}
                          </TD>
                          {editable && (
                            <TD>
                              <form action={removeQuoteItemAction}>
                                <input type="hidden" name="quoteId" value={quote.id} />
                                <input type="hidden" name="itemId" value={item.id} />
                                <ConfirmSubmitButton
                                  confirmMessage={`"${item.product.name}" 을(를) 견적에서 삭제할까요?`}
                                >
                                  삭제
                                </ConfirmSubmitButton>
                              </form>
                            </TD>
                          )}
                        </TR>
                      );
                    })
                  )}
                </TBody>
              </Table>
            </Card>

            {editable && (
              <>
                <Card title="상품 추가" className="col-span-12 lg:col-span-7">
                  <form
                    method="get"
                    action={`/quotes/${quote.id}`}
                    className="flex flex-wrap items-end gap-lg"
                  >
                    <div className="min-w-[240px] flex-1">
                      <TextField
                        name="pq"
                        label="상품명 · 모델코드 · 스펙"
                        defaultValue={addQuery}
                        placeholder="OLED / 냉장고 / 4도어"
                      />
                    </div>
                    <div className="pb-px">
                      <Button type="submit" variant="secondary">
                        검색
                      </Button>
                    </div>
                  </form>

                  {addQuery && (
                    <div className="mt-lg">
                      <Table>
                        <THead>
                          <TR>
                            <TH>상품</TH>
                            <TH className="text-right">정가</TH>
                            <TH>추가</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {addResults.length === 0 ? (
                            <TableEmpty colSpan={3}>검색 결과가 없습니다.</TableEmpty>
                          ) : (
                            addResults.map((product) => (
                              <TR key={product.id}>
                                <TD>
                                  <p className="font-medium text-gray-900">{product.name}</p>
                                  <p className="text-caption tabular-nums text-gray-700">
                                    {product.modelCode} · {product.category.name}
                                  </p>
                                </TD>
                                <TD className="text-right tabular-nums">
                                  {formatKRW(product.basePrice)}
                                </TD>
                                <TD>
                                  {alreadyInQuote.has(product.id) ? (
                                    <Badge tone="neutral" showIcon={false}>
                                      담김
                                    </Badge>
                                  ) : (
                                    <form action={addQuoteItemAction}>
                                      <input type="hidden" name="quoteId" value={quote.id} />
                                      <input type="hidden" name="productId" value={product.id} />
                                      <Button type="submit" variant="ghost">
                                        견적에 담기
                                      </Button>
                                    </form>
                                  )}
                                </TD>
                              </TR>
                            ))
                          )}
                        </TBody>
                      </Table>
                    </div>
                  )}
                </Card>

                <Card title="견적 설정" className="col-span-12 lg:col-span-5">
                  <form action={updateQuoteMetaAction} className="flex flex-col gap-lg">
                    <input type="hidden" name="quoteId" value={quote.id} />
                    <div className="grid grid-cols-2 gap-lg">
                      <TextField
                        name="deliveryFee"
                        label="배송비 (원)"
                        inputMode="numeric"
                        defaultValue={String(quote.deliveryFee)}
                      />
                      <TextField
                        name="installFee"
                        label="설치비 (원)"
                        inputMode="numeric"
                        defaultValue={String(quote.installFee)}
                      />
                    </div>
                    <TextField
                      name="validUntil"
                      label="견적 유효기간"
                      type="date"
                      defaultValue={toDateInputValue(quote.validUntil)}
                      hint="비워 두면 유효기간 없이 저장됩니다."
                    />
                    <TextField
                      name="templateName"
                      label="템플릿 이름 (선택)"
                      defaultValue={quote.templateName ?? ""}
                      placeholder="신혼 혼수 기본형"
                      hint="이름을 붙이면 견적 목록에서 템플릿으로 재사용할 수 있습니다."
                    />
                    <TextArea name="memo" label="견적 메모" defaultValue={quote.memo ?? ""} />
                    <div className="flex justify-end gap-md">
                      <Button type="submit">견적 저장</Button>
                    </div>
                  </form>
                </Card>
              </>
            )}

            {quote.status === "SENT" && plan?.status === "APPROVED" && (
              <Card title="계약 생성" className="col-span-12">
                <div className="flex flex-wrap items-center justify-between gap-md">
                  <p className="text-body text-gray-700">
                    결제 승인이 완료되었습니다. 계약을 생성하면 <strong>매장 재고가 차감되고</strong>{" "}
                    견적이 확정으로 잠기며, 고객에게 보낼 전자서명 링크가 만들어집니다. 재고가
                    부족한 품목이 하나라도 있으면 아무것도 차감되지 않고 실패합니다.
                  </p>
                  <form action={createContractAction}>
                    <input type="hidden" name="quoteId" value={quote.id} />
                    <Button type="submit" size="lg">
                      계약 생성
                    </Button>
                  </form>
                </div>
              </Card>
            )}

            <Card title="버전 이력" className="col-span-12" flush>
              <Table>
                <THead>
                  <TR>
                    <TH>버전</TH>
                    <TH>견적번호</TH>
                    <TH>상태</TH>
                    <TH className="text-right">견적금액</TH>
                    <TH>작성일</TH>
                    <TH>이전 버전</TH>
                  </TR>
                </THead>
                <TBody>
                  {versions.map((version) => (
                    <TR
                      key={version.id}
                      className={version.id === quote.id ? "bg-lg-red-light" : undefined}
                    >
                      <TD className="tabular-nums">v{version.version}</TD>
                      <TD>
                        {version.id === quote.id ? (
                          <span className="font-semibold">{version.quoteNo} (현재)</span>
                        ) : (
                          <Link
                            href={`/quotes/${version.id}`}
                            className="text-lg-red hover:underline"
                          >
                            {version.quoteNo}
                          </Link>
                        )}
                      </TD>
                      <TD>
                        <QuoteStatusBadge status={version.status} />
                      </TD>
                      <TD className="text-right tabular-nums">{formatKRW(version.grandTotal)}</TD>
                      <TD className="text-gray-700">{formatDate(version.createdAt)}</TD>
                      <TD className="text-gray-700">
                        {version.parentQuoteId
                          ? (versions.find((row) => row.id === version.parentQuoteId)?.quoteNo ??
                            "-")
                          : "-"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>

            {editable && (
              <Card title="견적 삭제" className="col-span-12">
                <div className="flex flex-wrap items-center justify-between gap-md">
                  <p className="text-body text-gray-700">
                    작성중 견적만 삭제할 수 있습니다. 이 견적을 원본으로 하는 다음 버전이 있으면
                    이력이 끊기므로 삭제되지 않습니다.
                  </p>
                  <form action={deleteQuoteAction}>
                    <input type="hidden" name="quoteId" value={quote.id} />
                    <ConfirmSubmitButton
                      confirmMessage={`견적 ${quote.quoteNo} 을(를) 삭제할까요? 되돌릴 수 없습니다.`}
                    >
                      견적 삭제
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </Card>
            )}
          </CardGrid>
        </div>
      </main>
    </>
  );
}
