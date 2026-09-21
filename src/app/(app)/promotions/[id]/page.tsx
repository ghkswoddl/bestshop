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
import { requireManager } from "@/lib/auth";
import { PROMOTION_BENEFIT_TYPE_LABEL, type PromotionBenefitType } from "@/lib/enums";
import { formatDate, formatDateTime, formatKRW } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  describeConditions,
  evaluatePromotion,
  parseConditions,
  promotionBenefitLabel,
  promotionFlags,
  promotionHistory,
  PROMOTION_AUDIT_ACTION_LABEL,
} from "@/lib/promotions";
import { AlertBadges, PhaseBadge } from "../_components/badges";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-md py-sm">
      <dt className="w-24 shrink-0 text-caption text-gray-700">{label}</dt>
      <dd className="min-w-0 text-body text-gray-900">{value}</dd>
    </div>
  );
}

function JsonBlock({ value }: { value: string | null }) {
  if (!value) return <span className="text-gray-400">-</span>;
  return (
    <span className="block whitespace-pre-wrap break-all text-caption text-gray-700">{value}</span>
  );
}

export default async function PromotionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireManager();

  const promotion = await prisma.promotion.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      products: {
        include: { product: { include: { category: true } } },
        orderBy: { product: { basePrice: "desc" } },
      },
    },
  });
  if (!promotion) notFound();

  const at = new Date();
  const flags = promotionFlags(promotion, at);
  const conditions = parseConditions(promotion.conditionsJson);
  const history = await promotionHistory(promotion.id);

  // 적용조건에 최소 수량이 있으면 그 수량 기준으로 예상 할인을 보여준다 (1개 기준이면 늘 미충족).
  const previewQty = Math.max(1, conditions.minQty ?? 1);
  const candidate = { promotion, conditions };

  return (
    <>
      <PageHeader
        title={promotion.title}
        actions={
          <Link href="/promotions">
            <Button variant="secondary">목록으로</Button>
          </Link>
        }
      />
      <main className="flex-1 overflow-y-auto p-xl">
        <div className="mx-auto flex max-w-container flex-col gap-lg">
          {flags.isActive ? (
            <Notice tone="success">
              지금 견적에 적용할 수 있는 프로모션입니다.
              {flags.isEndingSoon &&
                ` ${flags.daysUntilEnd === 0 ? "오늘" : `${flags.daysUntilEnd}일 뒤`} 종료됩니다.`}
            </Notice>
          ) : (
            <Notice tone="warning">
              견적에 적용할 수 없습니다 —{" "}
              {flags.phase === "UPCOMING"
                ? `${formatDate(promotion.startsAt)}부터 시작합니다 (D-${flags.daysUntilStart}).`
                : flags.phase === "EXPIRED"
                  ? `${formatDate(promotion.endsAt)}에 종료되었습니다.`
                  : flags.phase === "CANCELLED"
                    ? "취소된 프로모션입니다."
                    : "아직 게시되지 않은 작성중 상태입니다."}
            </Notice>
          )}

          <CardGrid>
            <Card title="프로모션 정보" className="col-span-12 lg:col-span-7">
              <dl className="divide-y divide-gray-200">
                <Field label="코드" value={<span className="tabular-nums">{promotion.code}</span>} />
                <Field
                  label="기간"
                  value={
                    <span className="tabular-nums">
                      {formatDate(promotion.startsAt)} ~ {formatDate(promotion.endsAt)}
                    </span>
                  }
                />
                <Field
                  label="혜택"
                  value={
                    <span className="flex flex-wrap items-center gap-sm">
                      <span className="font-semibold">{promotionBenefitLabel(promotion)}</span>
                      <Badge tone="neutral" showIcon={false}>
                        {PROMOTION_BENEFIT_TYPE_LABEL[
                          promotion.benefitType as PromotionBenefitType
                        ] ?? promotion.benefitType}
                      </Badge>
                    </span>
                  }
                />
                <Field
                  label="진행 단계"
                  value={
                    <span className="flex flex-wrap items-center gap-sm">
                      <PhaseBadge phase={flags.phase} />
                      <AlertBadges flags={flags} />
                    </span>
                  }
                />
                <Field label="등록자" value={promotion.createdBy?.name ?? "본사"} />
                <Field
                  label="등록일"
                  value={<span className="tabular-nums">{formatDate(promotion.createdAt)}</span>}
                />
                <Field label="설명" value={promotion.description ?? "-"} />
              </dl>
            </Card>

            <Card title="적용조건" className="col-span-12 lg:col-span-5">
              <ul className="flex flex-col gap-sm">
                {describeConditions(conditions).map((line) => (
                  <li key={line} className="flex items-start gap-sm text-body text-gray-900">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-lg-red" />
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-lg text-caption text-gray-700">
                금액 조건은 견적 라인(단가 × 수량) 기준으로 판정합니다. 사은품 · 캐시백 · 번들 혜택은
                견적 합계를 깎지 않고 별도 혜택으로 안내됩니다.
              </p>
            </Card>

            <Card
              title="대상상품"
              flush
              className="col-span-12"
              action={
                <span className="text-caption text-gray-700">
                  {promotion.products.length}개 · 예상 할인은 {previewQty}개 구매 기준
                </span>
              }
            >
              <Table>
                <THead>
                  <TR>
                    <TH>상품</TH>
                    <TH>카테고리</TH>
                    <TH className="text-right">판매가</TH>
                    <TH className="text-right">예상 할인</TH>
                    <TH className="text-right">적용 후 금액</TH>
                    <TH>적용 가능</TH>
                  </TR>
                </THead>
                <TBody>
                  {promotion.products.length === 0 ? (
                    <TableEmpty colSpan={6}>등록된 대상상품이 없습니다.</TableEmpty>
                  ) : (
                    promotion.products.map(({ id: linkId, product }) => {
                      const result = evaluatePromotion(candidate, {
                        unitPrice: product.basePrice,
                        qty: previewQty,
                      });
                      const lineTotal = product.basePrice * previewQty;
                      return (
                        <TR key={linkId}>
                          <TD>
                            <Link
                              href={`/products/${product.id}`}
                              className="font-medium text-gray-900 hover:text-lg-red"
                            >
                              {product.name}
                            </Link>
                            <div className="text-caption tabular-nums text-gray-700">
                              {product.modelCode}
                            </div>
                          </TD>
                          <TD className="text-gray-700">{product.category.name}</TD>
                          <TD className="whitespace-nowrap text-right tabular-nums">
                            {formatKRW(lineTotal)}
                          </TD>
                          <TD className="whitespace-nowrap text-right tabular-nums font-semibold text-lg-red">
                            {result.discount > 0 ? `-${formatKRW(result.discount)}` : "-"}
                          </TD>
                          <TD className="whitespace-nowrap text-right tabular-nums font-semibold">
                            {formatKRW(lineTotal - result.discount)}
                          </TD>
                          <TD>
                            {!flags.isActive ? (
                              <Badge tone="neutral">기간 외</Badge>
                            ) : result.ineligibleReason ? (
                              <Badge tone="warning">{result.ineligibleReason}</Badge>
                            ) : result.discount > 0 ? (
                              <Badge tone="success">적용 가능</Badge>
                            ) : (
                              <Badge tone="info">별도 혜택</Badge>
                            )}
                          </TD>
                        </TR>
                      );
                    })
                  )}
                </TBody>
              </Table>
            </Card>

            <Card
              title="대상상품 및 적용조건 변경 이력"
              flush
              className="col-span-12"
              action={<span className="text-caption text-gray-700">최근 {history.length}건</span>}
            >
              <Table>
                <THead>
                  <TR>
                    <TH>일시</TH>
                    <TH>변경 유형</TH>
                    <TH>변경 전</TH>
                    <TH>변경 후</TH>
                    <TH>담당자</TH>
                  </TR>
                </THead>
                <TBody>
                  {history.length === 0 ? (
                    <TableEmpty colSpan={5}>기록된 변경 이력이 없습니다.</TableEmpty>
                  ) : (
                    history.map((entry) => (
                      <TR key={entry.id}>
                        <TD className="whitespace-nowrap tabular-nums text-gray-700">
                          {formatDateTime(entry.createdAt)}
                        </TD>
                        <TD className="whitespace-nowrap">
                          {PROMOTION_AUDIT_ACTION_LABEL[entry.action] ?? entry.action}
                        </TD>
                        <TD className="max-w-xs">
                          <JsonBlock value={entry.beforeJson} />
                        </TD>
                        <TD className="max-w-xs">
                          <JsonBlock value={entry.afterJson} />
                        </TD>
                        <TD className="whitespace-nowrap text-gray-700">
                          {entry.actor?.name ?? "본사"}
                        </TD>
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
