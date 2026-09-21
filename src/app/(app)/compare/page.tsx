import Link from "next/link";
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
  TextField,
} from "@/components/ui";
import { AddToCompare, CompareNotice } from "@/components/catalog/CompareControls";
import { StockCell } from "@/components/catalog/StockCell";
import { requireManager } from "@/lib/auth";
import {
  buildReturnTo,
  COMPARISON_LIMIT,
  pickOne,
  productWhere,
  storeStockMap,
  type RawSearchParams,
} from "@/lib/catalog";
import {
  buildSpecMatrix,
  findComparison,
  findOpenComparison,
  purchaseScenarios,
  savedComparisons,
  suggestCombination,
  type ComparisonDetail,
} from "@/lib/comparison";
import {
  clearComparisonAction,
  removeFromComparisonAction,
  reopenComparisonAction,
  saveComparisonAction,
  toggleQuoteCandidateAction,
} from "@/lib/comparison-actions";
import { CONSULTATION_STAGE_LABEL, type ConsultationStage } from "@/lib/enums";
import { formatDate, formatDateTime, formatKRW } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const PICKER_LIMIT = 8;

function HiddenContext({
  comparisonId,
  returnTo,
  productId,
}: {
  comparisonId: string;
  returnTo: string;
  productId?: string;
}) {
  return (
    <>
      <input type="hidden" name="comparisonId" value={comparisonId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {productId && <input type="hidden" name="productId" value={productId} />}
    </>
  );
}

/** 스펙 행 왼쪽 라벨 — 주요 스펙과 값이 갈리는 행을 눈에 띄게 한다. */
function SpecLabel({ label, isKey, differs }: { label: string; isKey: boolean; differs: boolean }) {
  return (
    <span className="flex items-center gap-xs">
      <span className={isKey ? "font-semibold text-gray-900" : "text-gray-700"}>{label}</span>
      {differs && (
        <Badge tone="info" showIcon={false}>
          차이
        </Badge>
      )}
    </span>
  );
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requireManager();

  const viewId = pickOne(params, "id");
  const consultationId = pickOne(params, "consultationId");
  const diffOnly = pickOne(params, "diff") === "1";
  const pickerQuery = pickOne(params, "add");
  const returnTo = buildReturnTo("/compare", params);

  const comparison: ComparisonDetail | null = viewId
    ? await findComparison(ctx.manager.id, viewId)
    : await findOpenComparison(ctx.manager.id);

  const items = comparison?.items ?? [];
  const readOnly = Boolean(comparison?.savedAt);
  const specRows = buildSpecMatrix(items).filter((row) => !diffOnly || row.differs);
  const candidateCount = items.filter((item) => item.isQuoteCandidate).length;

  const [stock, scenarios, suggestions, saved, consultation] = await Promise.all([
    storeStockMap(
      ctx,
      items.map((item) => item.product.id),
      new Map(items.map((item) => [item.product.id, item.product.status])),
    ),
    purchaseScenarios(items),
    suggestCombination(items),
    savedComparisons(ctx.manager.id),
    consultationId
      ? prisma.consultation.findFirst({
          where: {
            id: consultationId,
            ...(ctx.isHQ ? {} : { storeId: ctx.manager.storeId }),
          },
          select: { id: true, stage: true, customer: { select: { name: true } } },
        })
      : Promise.resolve(null),
  ]);

  const pickerResults = pickerQuery
    ? await prisma.product.findMany({
        where: productWhere({ q: pickerQuery }),
        include: { category: true },
        orderBy: { name: "asc" },
        take: PICKER_LIMIT,
      })
    : [];
  const inCart = new Set(items.map((item) => item.product.id));

  return (
    <>
      <PageHeader
        title="상품비교"
        actions={
          <Link href="/products">
            <Button variant="secondary">상품탐색</Button>
          </Link>
        }
      />
      <main className="flex-1 overflow-y-auto p-xl">
        <div className="mx-auto flex max-w-container flex-col gap-lg">
          <CompareNotice state={pickOne(params, "compare")} />

          {readOnly && (
            <Notice tone="info">
              저장된 비교 결과입니다 ({formatDateTime(comparison?.savedAt)} 저장). 수정하려면 아래
              &lsquo;다시 비교하기&rsquo;로 새 비교함에 복제하세요.
            </Notice>
          )}
          {!readOnly && items.length >= COMPARISON_LIMIT && (
            <Notice tone="warning">
              비교함이 가득 찼습니다 (최대 {COMPARISON_LIMIT}개). 더 담으려면 먼저 항목을 제거하세요.
            </Notice>
          )}

          <CardGrid>
            <Card
              title={comparison?.title ?? "비교 결과"}
              flush
              className="col-span-12"
              action={
                <div className="flex items-center gap-md">
                  <span className="text-caption text-gray-700">
                    {items.length}/{COMPARISON_LIMIT}개 · 견적 대상 {candidateCount}개
                  </span>
                  <Link
                    href={
                      diffOnly
                        ? buildReturnTo("/compare", { ...params, diff: undefined })
                        : buildReturnTo("/compare", { ...params, diff: "1" })
                    }
                    className="text-caption text-lg-red hover:underline"
                  >
                    {diffOnly ? "전체 스펙 보기" : "차이나는 스펙만"}
                  </Link>
                  {!readOnly && items.length > 0 && (
                    <form action={clearComparisonAction}>
                      <HiddenContext comparisonId={comparison!.id} returnTo={returnTo} />
                      <Button type="submit" variant="secondary">
                        비우기
                      </Button>
                    </form>
                  )}
                </div>
              }
            >
              {items.length === 0 ? (
                <div className="px-lg pb-lg">
                  <TableEmptyState />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH className="w-44">항목</TH>
                      {items.map((item) => (
                        <TH key={item.id} className="min-w-52">
                          <Link
                            href={`/products/${item.product.id}`}
                            className="text-body font-semibold text-gray-900 hover:text-lg-red"
                          >
                            {item.product.name}
                          </Link>
                        </TH>
                      ))}
                    </TR>
                  </THead>
                  <TBody>
                    <TR>
                      <TD className="text-gray-700">모델명</TD>
                      {items.map((item) => (
                        <TD key={item.id} className="tabular-nums">
                          {item.product.modelCode}
                        </TD>
                      ))}
                    </TR>
                    <TR>
                      <TD className="text-gray-700">카테고리</TD>
                      {items.map((item) => (
                        <TD key={item.id}>{item.product.category.name}</TD>
                      ))}
                    </TR>
                    <TR>
                      <TD className="text-gray-700">판매가</TD>
                      {items.map((item) => (
                        <TD key={item.id} className="tabular-nums text-h3 text-gray-900">
                          {formatKRW(item.product.basePrice)}
                        </TD>
                      ))}
                    </TR>
                    <TR>
                      <TD className="text-gray-700">
                        {ctx.isHQ ? "전 매장 재고" : `${ctx.store.name} 재고`}
                      </TD>
                      {items.map((item) => {
                        const view = stock.get(item.product.id);
                        return <TD key={item.id}>{view && <StockCell view={view} />}</TD>;
                      })}
                    </TR>
                    <TR>
                      <TD className="text-gray-700">견적 대상</TD>
                      {items.map((item) => (
                        <TD key={item.id}>
                          {readOnly ? (
                            <Badge tone={item.isQuoteCandidate ? "success" : "neutral"}>
                              {item.isQuoteCandidate ? "선택됨" : "미선택"}
                            </Badge>
                          ) : (
                            <form action={toggleQuoteCandidateAction}>
                              <HiddenContext
                                comparisonId={comparison!.id}
                                returnTo={returnTo}
                                productId={item.product.id}
                              />
                              <Button
                                type="submit"
                                variant={item.isQuoteCandidate ? "primary" : "secondary"}
                              >
                                {item.isQuoteCandidate ? "선택됨" : "견적 대상으로"}
                              </Button>
                            </form>
                          )}
                        </TD>
                      ))}
                    </TR>
                    {!readOnly && (
                      <TR>
                        <TD className="text-gray-700">비교함</TD>
                        {items.map((item) => (
                          <TD key={item.id}>
                            <form action={removeFromComparisonAction}>
                              <HiddenContext
                                comparisonId={comparison!.id}
                                returnTo={returnTo}
                                productId={item.product.id}
                              />
                              <Button type="submit" variant="ghost">
                                제거
                              </Button>
                            </form>
                          </TD>
                        ))}
                      </TR>
                    )}
                    {specRows.length === 0 ? (
                      <TableEmpty colSpan={items.length + 1}>
                        {diffOnly ? "값이 갈리는 스펙이 없습니다." : "등록된 스펙이 없습니다."}
                      </TableEmpty>
                    ) : (
                      specRows.map((row) => (
                        <TR key={row.key}>
                          <TD>
                            <SpecLabel label={row.key} isKey={row.isKey} differs={row.differs} />
                          </TD>
                          {row.values.map((value, index) => (
                            <TD key={items[index].id}>
                              {value == null ? (
                                <span className="text-gray-400">-</span>
                              ) : (
                                <>
                                  {value}
                                  {row.unit && <span className="ml-xs text-gray-700">{row.unit}</span>}
                                </>
                              )}
                            </TD>
                          ))}
                        </TR>
                      ))
                    )}
                  </TBody>
                </Table>
              )}
            </Card>

            {items.length > 0 && (
              <Card
                title="견적 대상 선택"
                className="col-span-12 lg:col-span-5"
                action={<span className="text-caption text-gray-700">견적서 작성에서 이어집니다</span>}
              >
                {candidateCount === 0 ? (
                  <p className="text-body text-gray-700">
                    비교표의 &lsquo;견적 대상으로&rsquo; 버튼으로 견적에 올릴 상품을 고르세요.
                  </p>
                ) : (
                  <>
                    <ul className="divide-y divide-gray-200">
                      {items
                        .filter((item) => item.isQuoteCandidate)
                        .map((item) => (
                          <li key={item.id} className="flex items-center justify-between gap-md py-sm">
                            <span className="text-body text-gray-900">{item.product.name}</span>
                            <span className="shrink-0 tabular-nums text-body font-semibold">
                              {formatKRW(item.product.basePrice)}
                            </span>
                          </li>
                        ))}
                    </ul>
                    <div className="mt-md flex items-center justify-between border-t border-gray-200 pt-md">
                      <span className="text-body text-gray-700">합계 (정가 기준)</span>
                      <span className="tabular-nums text-h3 text-gray-900">
                        {formatKRW(
                          items
                            .filter((item) => item.isQuoteCandidate)
                            .reduce((total, item) => total + item.product.basePrice, 0),
                        )}
                      </span>
                    </div>
                    <Link
                      href={`/quotes/new?comparisonId=${comparison!.id}`}
                      className="mt-md block"
                    >
                      <Button fullWidth>선택 상품으로 견적서 작성</Button>
                    </Link>
                    <p className="mt-sm text-caption text-gray-400">
                      할인·프로모션은 견적 화면에서 반영됩니다.
                    </p>
                  </>
                )}
              </Card>
            )}

            {!readOnly && (
              <Card title="비교 결과 저장 및 상담 연계" className="col-span-12 lg:col-span-7">
                <form action={saveComparisonAction} className="flex flex-col gap-md">
                  <HiddenContext comparisonId={comparison?.id ?? ""} returnTo={returnTo} />
                  <input type="hidden" name="consultationId" value={consultation?.id ?? ""} />
                  <TextField
                    name="title"
                    label="제목"
                    placeholder="예: 김서연 고객 혼수 냉장고 비교"
                    defaultValue=""
                  />
                  {consultation ? (
                    <Notice tone="info">
                      {consultation.customer.name} 고객 상담(
                      {CONSULTATION_STAGE_LABEL[consultation.stage as ConsultationStage]})에 연결해
                      저장합니다.
                    </Notice>
                  ) : (
                    <p className="text-caption text-gray-700">
                      상담 화면에서 <code className="text-gray-900">?consultationId=</code> 를 달고
                      들어오면 해당 상담·고객에 자동으로 연결됩니다.
                    </p>
                  )}
                  <div className="flex justify-end">
                    <Button type="submit" disabled={items.length === 0}>
                      비교 결과 저장
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {items.length > 0 && (
              <Card
                title="구매 시나리오 비교"
                flush
                className="col-span-12 lg:col-span-7"
                action={<span className="text-caption text-gray-400">정가 기준 참고값</span>}
              >
                <Table>
                  <THead>
                    <TR>
                      <TH>구성</TH>
                      <TH>포함 상품</TH>
                      <TH className="text-right">합계</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {scenarios.map((scenario) => (
                      <TR key={scenario.key}>
                        <TD>
                          <div className="font-semibold text-gray-900">{scenario.label}</div>
                          <div className="text-caption text-gray-700">{scenario.note}</div>
                        </TD>
                        <TD className="text-gray-700">
                          {scenario.lines
                            .map((line) => `${line.categoryName} ${line.productName}`)
                            .join(" · ")}
                        </TD>
                        <TD className="whitespace-nowrap text-right tabular-nums font-semibold">
                          {formatKRW(scenario.total)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>
            )}

            {items.length > 0 && (
              <Card title="추천 조합" className="col-span-12 lg:col-span-5">
                {suggestions.length === 0 ? (
                  <p className="text-body text-gray-700">추천할 조합이 없습니다.</p>
                ) : (
                  <ul className="flex flex-col gap-md">
                    {suggestions.map(({ product, reason }) => (
                      <li
                        key={product.id}
                        className="flex items-center justify-between gap-md rounded-card border border-gray-200 p-md"
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/products/${product.id}`}
                            className="block truncate text-body font-medium text-gray-900 hover:text-lg-red"
                          >
                            {product.name}
                          </Link>
                          <span className="text-caption text-gray-700">{reason}</span>
                          <div className="tabular-nums text-caption text-gray-900">
                            {formatKRW(product.basePrice)}
                          </div>
                        </div>
                        {!readOnly && (
                          <AddToCompare
                            productId={product.id}
                            returnTo={returnTo}
                            inCart={inCart.has(product.id)}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {!readOnly && (
              <Card title="비교 상품 추가" className="col-span-12">
                <form method="get" className="grid grid-cols-1 items-end gap-md md:grid-cols-12">
                  {viewId && <input type="hidden" name="id" value={viewId} />}
                  {consultationId && (
                    <input type="hidden" name="consultationId" value={consultationId} />
                  )}
                  <div className="md:col-span-9">
                    <TextField
                      name="add"
                      label="상품 검색"
                      placeholder="상품명 · 모델명 · 카테고리 · 스펙"
                      defaultValue={pickerQuery ?? ""}
                    />
                  </div>
                  <div className="flex gap-sm md:col-span-3 md:justify-end">
                    <Link href="/compare">
                      <Button variant="secondary">초기화</Button>
                    </Link>
                    <Button type="submit">검색</Button>
                  </div>
                </form>

                {pickerQuery && (
                  <div className="mt-lg">
                    <Table>
                      <THead>
                        <TR>
                          <TH>상품</TH>
                          <TH>카테고리</TH>
                          <TH className="text-right">판매가</TH>
                          <TH>추가</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {pickerResults.length === 0 ? (
                          <TableEmpty colSpan={4}>검색 결과가 없습니다.</TableEmpty>
                        ) : (
                          pickerResults.map((product) => (
                            <TR key={product.id}>
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
                                {formatKRW(product.basePrice)}
                              </TD>
                              <TD>
                                <AddToCompare
                                  productId={product.id}
                                  returnTo={returnTo}
                                  inCart={inCart.has(product.id)}
                                />
                              </TD>
                            </TR>
                          ))
                        )}
                      </TBody>
                    </Table>
                  </div>
                )}
              </Card>
            )}

            <Card
              title="저장된 비교 결과"
              flush
              className="col-span-12"
              action={<span className="text-caption text-gray-700">{saved.length}건</span>}
            >
              <Table>
                <THead>
                  <TR>
                    <TH>제목</TH>
                    <TH>비교 상품</TH>
                    <TH>연결 상담</TH>
                    <TH>견적 대상</TH>
                    <TH>저장일</TH>
                    <TH>열기</TH>
                  </TR>
                </THead>
                <TBody>
                  {saved.length === 0 ? (
                    <TableEmpty colSpan={6}>저장된 비교 결과가 없습니다.</TableEmpty>
                  ) : (
                    saved.map((entry) => (
                      <TR key={entry.id}>
                        <TD className="font-medium">{entry.title ?? "(제목 없음)"}</TD>
                        <TD className="text-gray-700">
                          {entry.items.map((item) => item.product.name).join(" · ")}
                        </TD>
                        <TD className="text-gray-700">
                          {entry.consultation
                            ? `${entry.consultation.customer.name} (${
                                CONSULTATION_STAGE_LABEL[
                                  entry.consultation.stage as ConsultationStage
                                ]
                              })`
                            : (entry.customer?.name ?? "-")}
                        </TD>
                        <TD className="tabular-nums text-gray-700">
                          {entry.items.filter((item) => item.isQuoteCandidate).length}개
                        </TD>
                        <TD className="tabular-nums text-gray-700">{formatDate(entry.savedAt)}</TD>
                        <TD>
                          <div className="flex gap-sm">
                            <Link href={`/compare?id=${entry.id}`}>
                              <Button variant="secondary">보기</Button>
                            </Link>
                            <form action={reopenComparisonAction}>
                              <input type="hidden" name="comparisonId" value={entry.id} />
                              <Button type="submit" variant="ghost">
                                다시 비교하기
                              </Button>
                            </form>
                          </div>
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

function TableEmptyState() {
  return (
    <div className="flex flex-col items-center gap-md py-3xl text-center">
      <p className="text-body text-gray-700">
        비교함이 비어 있습니다. 상품탐색이나 상품 상세에서 &lsquo;비교함에 추가&rsquo;를 누르거나,
        아래에서 상품을 검색해 담으세요.
      </p>
      <Link href="/products">
        <Button variant="secondary">상품탐색으로</Button>
      </Link>
    </div>
  );
}
