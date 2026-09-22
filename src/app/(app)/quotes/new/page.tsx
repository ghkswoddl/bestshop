import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Badge,
  Button,
  Card,
  CardGrid,
  InventoryBadge,
  LinkButton,
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
import { requireManager, scopeToStore } from "@/lib/auth";
import { pickOne, productWhere, storeStockMap, type RawSearchParams } from "@/lib/catalog";
import { findComparison, quoteCandidateProductIds } from "@/lib/comparison";
import { customerAccessWhere } from "@/lib/customers";
import { CONSULTATION_STAGE_LABEL, type ConsultationStage } from "@/lib/enums";
import { formatKRW } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { createQuoteAction } from "@/lib/quote-actions";
import { QuoteNoticeBanner } from "../_components/badges";

const CUSTOMER_RESULT_LIMIT = 20;
const PRODUCT_RESULT_LIMIT = 20;

/** 상담이 열려 있다고 보는 단계 — 견적을 붙일 수 있는 상담. */
const OPEN_STAGES = ["IN_PROGRESS", "QUOTED"];

interface Candidate {
  id: string;
  name: string;
  modelCode: string;
  basePrice: number;
  status: string;
  categoryName: string;
  /** 비교함/템플릿에서 넘어온 항목은 기본 선택 상태로 둔다. */
  preselected: boolean;
  source: string;
}

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const ctx = await requireManager();
  const params = await searchParams;

  const customerId = pickOne(params, "customerId");
  const comparisonId = pickOne(params, "comparisonId");
  const templateId = pickOne(params, "templateId");
  const customerQuery = pickOne(params, "cq") ?? "";
  const productQuery = pickOne(params, "pq") ?? "";

  // ---------------------------------------------------------------- 후보 상품

  const candidates = new Map<string, Candidate>();
  let comparisonNote: string | null = null;

  if (comparisonId) {
    const comparison = await findComparison(ctx.manager.id, comparisonId);
    if (comparison) {
      const checked = new Set(await quoteCandidateProductIds(comparisonId));
      // 빈 배열은 "전체 선택"이 아니라 "아무것도 안 골랐다"는 뜻이다 (Phase 4 계약).
      comparisonNote =
        checked.size > 0
          ? `비교함에서 견적 대상으로 고른 ${checked.size}개 상품을 담았습니다.`
          : "비교함에서 견적 대상을 고르지 않아 비교 항목 전체를 후보로 보여줍니다. 담을 상품을 선택하세요.";

      for (const item of comparison.items) {
        candidates.set(item.product.id, {
          id: item.product.id,
          name: item.product.name,
          modelCode: item.product.modelCode,
          basePrice: item.product.basePrice,
          status: item.product.status,
          categoryName: item.product.category.name,
          preselected: checked.size === 0 ? false : checked.has(item.product.id),
          source: "상품비교",
        });
      }
    }
  }

  if (templateId) {
    const template = await prisma.quote.findFirst({
      where: { id: templateId, ...scopeToStore(ctx) },
      include: { items: { orderBy: { sortOrder: "asc" }, include: { product: { include: { category: true } } } } },
    });
    for (const item of template?.items ?? []) {
      candidates.set(item.product.id, {
        id: item.product.id,
        name: item.product.name,
        modelCode: item.product.modelCode,
        basePrice: item.product.basePrice,
        status: item.product.status,
        categoryName: item.product.category.name,
        preselected: true,
        source: `템플릿 ${template?.templateName ?? ""}`.trim(),
      });
    }
  }

  if (productQuery) {
    const found = await prisma.product.findMany({
      where: productWhere({ q: productQuery, status: "ON_SALE" }),
      orderBy: { name: "asc" },
      take: PRODUCT_RESULT_LIMIT,
      include: { category: true },
    });
    for (const product of found) {
      if (candidates.has(product.id)) continue;
      candidates.set(product.id, {
        id: product.id,
        name: product.name,
        modelCode: product.modelCode,
        basePrice: product.basePrice,
        status: product.status,
        categoryName: product.category.name,
        preselected: false,
        source: "상품검색",
      });
    }
  }

  const candidateList = [...candidates.values()];
  const stock = await storeStockMap(
    ctx,
    candidateList.map((candidate) => candidate.id),
    new Map(candidateList.map((candidate) => [candidate.id, candidate.status])),
  );

  // ------------------------------------------------------------------- 고객

  const customer = customerId
    ? await prisma.customer.findFirst({
        where: { AND: [{ id: customerId }, customerAccessWhere(ctx)] },
        select: { id: true, name: true, phone: true, memberNo: true },
      })
    : null;

  const customerResults =
    customer == null && customerQuery
      ? await prisma.customer.findMany({
          where: {
            AND: [
              customerAccessWhere(ctx),
              {
                OR: [
                  { name: { contains: customerQuery } },
                  // 숫자가 없는 검색어에 빈 문자열 contains 를 넣으면 전 행과 매칭된다. 절을 아예 뺀다.
                  ...(customerQuery.replace(/\D/g, "").length >= 2
                    ? [{ phoneNormalized: { contains: customerQuery.replace(/\D/g, "") } }]
                    : []),
                  { memberNo: { contains: customerQuery.toUpperCase() } },
                ],
              },
            ],
          },
          orderBy: { updatedAt: "desc" },
          take: CUSTOMER_RESULT_LIMIT,
          select: { id: true, name: true, phone: true, memberNo: true },
        })
      : [];

  const consultations = customer
    ? await prisma.consultation.findMany({
        where: { customerId: customer.id, ...scopeToStore(ctx), stage: { in: OPEN_STAGES } },
        orderBy: { startedAt: "desc" },
        select: { id: true, stage: true, startedAt: true },
      })
    : [];

  /** 현재 선택을 유지한 채 파라미터 하나만 바꾼 링크. */
  const withParam = (key: string, value: string) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ customerId, comparisonId, templateId, cq: customerQuery, pq: productQuery })) {
      if (v) next.set(k, v);
    }
    if (value) next.set(key, value);
    else next.delete(key);
    return `/quotes/new?${next.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="새 견적 작성"
        actions={
          <LinkButton href="/quotes" variant="secondary">
            견적 목록
          </LinkButton>
        }
      />
      <main className="flex-1 overflow-y-auto p-md sm:p-xl">
        <div className="mx-auto max-w-container">
          <QuoteNoticeBanner notice={pickOne(params, "quote")} />

          <CardGrid>
            <Card title="1. 고객 선택" className="col-span-12">
              {customer ? (
                <div className="flex flex-wrap items-center justify-between gap-md">
                  <div>
                    <p className="text-h3 text-gray-900">{customer.name}</p>
                    <p className="text-caption tabular-nums text-gray-700">
                      {formatPhone(customer.phone)}
                      {customer.memberNo ? ` · ${customer.memberNo}` : ""}
                    </p>
                  </div>
                  <LinkButton href={withParam("customerId", "")} variant="secondary">
                    고객 변경
                  </LinkButton>
                </div>
              ) : (
                <>
                  <form
                    method="get"
                    action="/quotes/new"
                    className="flex flex-col gap-md sm:flex-row sm:flex-wrap sm:items-end sm:gap-lg"
                  >
                    {comparisonId && <input type="hidden" name="comparisonId" value={comparisonId} />}
                    {templateId && <input type="hidden" name="templateId" value={templateId} />}
                    {productQuery && <input type="hidden" name="pq" value={productQuery} />}
                    <div className="w-full sm:min-w-[280px] sm:flex-1">
                      <TextField
                        name="cq"
                        label="고객명 · 휴대폰번호 · 회원번호"
                        defaultValue={customerQuery}
                        placeholder="홍길동 / 01012345678"
                      />
                    </div>
                    <div className="sm:pb-px">
                      <Button type="submit">고객 검색</Button>
                    </div>
                  </form>

                  {customerQuery && (
                    <div className="mt-lg">
                      <Table>
                        <THead>
                          <TR>
                            <TH>고객명</TH>
                            <TH>휴대폰번호</TH>
                            <TH>회원번호</TH>
                            <TH>선택</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {customerResults.length === 0 ? (
                            <TableEmpty colSpan={4}>
                              검색된 고객이 없습니다. 고객조회 화면에서 먼저 등록해 주세요.
                            </TableEmpty>
                          ) : (
                            customerResults.map((row) => (
                              <TR key={row.id}>
                                <TD>{row.name}</TD>
                                <TD className="tabular-nums text-gray-700">
                                  {formatPhone(row.phone)}
                                </TD>
                                <TD className="tabular-nums text-gray-700">{row.memberNo ?? "-"}</TD>
                                <TD>
                                  <Link
                                    href={withParam("customerId", row.id)}
                                    className="text-lg-red hover:underline"
                                  >
                                    이 고객으로 작성
                                  </Link>
                                </TD>
                              </TR>
                            ))
                          )}
                        </TBody>
                      </Table>
                    </div>
                  )}
                </>
              )}
            </Card>

            <Card title="2. 상품 선택" className="col-span-12">
              {comparisonNote && (
                <Notice tone="info" className="mb-lg">
                  {comparisonNote}
                </Notice>
              )}

              <form
                method="get"
                action="/quotes/new"
                className="flex flex-col gap-md sm:flex-row sm:flex-wrap sm:items-end sm:gap-lg"
              >
                {customerId && <input type="hidden" name="customerId" value={customerId} />}
                {comparisonId && <input type="hidden" name="comparisonId" value={comparisonId} />}
                {templateId && <input type="hidden" name="templateId" value={templateId} />}
                <div className="w-full sm:min-w-[280px] sm:flex-1">
                  <TextField
                    name="pq"
                    label="상품명 · 모델코드 · 스펙으로 후보 추가"
                    defaultValue={productQuery}
                    placeholder="OLED / 냉장고 / 4도어"
                    hint="검색하면 아래 후보 목록에 더해집니다. 선택 상태는 검색할 때 초기화됩니다."
                  />
                </div>
                <div className="sm:pb-px">
                  <Button type="submit" variant="secondary">
                    상품 검색
                  </Button>
                </div>
              </form>
            </Card>

            <Card title="3. 견적 생성" className="col-span-12">
              <form action={createQuoteAction} className="flex flex-col gap-lg">
                <input type="hidden" name="customerId" value={customer?.id ?? ""} />

                {consultations.length > 0 && (
                  <div className="w-full sm:w-96">
                    <Select name="consultationId" label="연결할 상담 (선택)" defaultValue="">
                      <option value="">상담 연결 안 함</option>
                      {consultations.map((consultation) => (
                        <option key={consultation.id} value={consultation.id}>
                          {consultation.startedAt.toISOString().slice(0, 10)} ·{" "}
                          {CONSULTATION_STAGE_LABEL[consultation.stage as ConsultationStage]}
                        </option>
                      ))}
                    </Select>
                    <p className="mt-xs text-caption text-gray-700">
                      상담을 연결하면 견적 저장 시 그 상담의 단계가 &lsquo;견적&rsquo;으로 올라갑니다.
                    </p>
                  </div>
                )}

                <Table>
                  <THead>
                    <TR>
                      <TH>담기</TH>
                      <TH>상품</TH>
                      <TH>카테고리</TH>
                      <TH className="text-right">정가</TH>
                      <TH>내 매장 재고</TH>
                      <TH>출처</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {candidateList.length === 0 ? (
                      <TableEmpty colSpan={6}>
                        후보 상품이 없습니다. 위에서 상품을 검색하거나 상품비교 화면에서 견적
                        대상을 골라 넘어오세요.
                      </TableEmpty>
                    ) : (
                      candidateList.map((candidate) => (
                        <TR key={candidate.id}>
                          <TD>
                            <input
                              type="checkbox"
                              name="productId"
                              value={candidate.id}
                              defaultChecked={candidate.preselected}
                              aria-label={`${candidate.name} 견적에 담기`}
                              className="h-5 w-5 rounded-control accent-lg-red"
                            />
                          </TD>
                          <TD>
                            <p className="font-medium text-gray-900">{candidate.name}</p>
                            <p className="text-caption tabular-nums text-gray-700">
                              {candidate.modelCode}
                            </p>
                          </TD>
                          <TD className="text-gray-700">{candidate.categoryName}</TD>
                          <TD className="text-right tabular-nums">
                            {formatKRW(candidate.basePrice)}
                          </TD>
                          <TD>
                            <InventoryBadge
                              status={stock.get(candidate.id)?.status ?? "NOT_CARRIED"}
                            />
                          </TD>
                          <TD>
                            <Badge tone="neutral" showIcon={false}>
                              {candidate.source}
                            </Badge>
                          </TD>
                        </TR>
                      ))
                    )}
                  </TBody>
                </Table>

                <p className="text-caption text-gray-700">
                  재고는 참고 정보입니다. 견적을 저장해도 재고가 예약되지 않으며, 차감은 계약
                  생성 시점에만 일어납니다. 생성 후에도 상품을 계속 추가할 수 있습니다.
                </p>

                <div className="flex justify-end gap-md">
                  <Button type="submit" size="lg" disabled={!customer || candidateList.length === 0}>
                    견적 생성
                  </Button>
                </div>
              </form>
            </Card>
          </CardGrid>
        </div>
      </main>
    </>
  );
}
