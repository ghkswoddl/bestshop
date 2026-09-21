import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Badge,
  Button,
  Card,
  CardGrid,
  LinkButton,
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
import { pickOne, type RawSearchParams } from "@/lib/catalog";
import { formatDate, formatKRW } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  QUOTE_LIST_FILTERS,
  quoteTemplates,
  quoteValidity,
  type QuoteListFilter,
} from "@/lib/quotes";
import { QuoteNoticeBanner, QuoteStatusBadge, ValidityBadge } from "./_components/badges";

const RESULT_LIMIT = 100;

function resolveFilter(value: string | undefined): QuoteListFilter {
  return value && (QUOTE_LIST_FILTERS as readonly string[]).includes(value)
    ? (value as QuoteListFilter)
    : "all";
}

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const ctx = await requireManager();
  const params = await searchParams;
  const q = pickOne(params, "q") ?? "";
  const filter = resolveFilter(pickOne(params, "status"));
  const now = new Date();

  const [rows, templates] = await Promise.all([
    prisma.quote.findMany({
      where: {
        ...scopeToStore(ctx),
        ...(filter === "editable" ? { status: "DRAFT" } : {}),
        ...(filter === "locked" ? { status: { not: "DRAFT" } } : {}),
        ...(filter === "expired" ? { validUntil: { lt: now } } : {}),
        ...(q
          ? {
              OR: [
                { quoteNo: { contains: q.toUpperCase() } },
                { customer: { name: { contains: q } } },
                { customer: { memberNo: { contains: q.toUpperCase() } } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: RESULT_LIMIT,
      include: {
        customer: { select: { id: true, name: true } },
        manager: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    quoteTemplates(ctx, 5),
  ]);

  return (
    <>
      <PageHeader
        title="견적서 작성"
        actions={<LinkButton href="/quotes/new">새 견적 작성</LinkButton>}
      />
      <main className="flex-1 overflow-y-auto p-xl">
        <div className="mx-auto max-w-container">
          <QuoteNoticeBanner notice={pickOne(params, "quote")} />

          <CardGrid>
            <Card title="견적 검색" className="col-span-12">
              <form method="get" action="/quotes" className="flex flex-wrap items-end gap-lg">
                <div className="min-w-[280px] flex-1">
                  <TextField
                    name="q"
                    label="견적번호 · 고객명 · 회원번호"
                    defaultValue={q}
                    placeholder="견적번호 또는 고객명"
                  />
                </div>
                <div className="w-48">
                  <Select name="status" label="상태" defaultValue={filter}>
                    <option value="all">전체</option>
                    <option value="editable">작성중 (수정 가능)</option>
                    <option value="locked">확정 이후 (잠김)</option>
                    <option value="expired">유효기간 경과</option>
                  </Select>
                </div>
                <div className="flex gap-md pb-px">
                  <Button type="submit">검색</Button>
                  <LinkButton href="/quotes" variant="secondary">
                    초기화
                  </LinkButton>
                </div>
              </form>
            </Card>

            {templates.length > 0 && (
              <Card title="견적서 템플릿" className="col-span-12">
                <p className="mb-md text-caption text-gray-700">
                  이름을 붙여 둔 견적을 템플릿으로 재사용합니다. 선택하면 같은 상품 구성으로 새
                  견적을 시작합니다.
                </p>
                <ul className="flex flex-wrap gap-md">
                  {templates.map((template) => (
                    <li key={template.id}>
                      <Link
                        href={`/quotes/new?templateId=${template.id}`}
                        className="inline-flex items-center gap-sm rounded-control border border-gray-200 bg-white px-md py-sm text-body text-gray-900 hover:bg-gray-100"
                      >
                        <span className="font-medium">{template.templateName}</span>
                        <span className="text-caption text-gray-700">
                          {template._count.items}개 품목 · {formatKRW(template.grandTotal)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card title={`견적 ${rows.length}건`} flush className="col-span-12">
              <Table>
                <THead>
                  <TR>
                    <TH>견적번호</TH>
                    <TH>고객</TH>
                    <TH>품목</TH>
                    <TH className="text-right">견적금액</TH>
                    <TH>상태</TH>
                    <TH>유효기간</TH>
                    <TH>담당</TH>
                    <TH>수정일</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.length === 0 ? (
                    <TableEmpty colSpan={8}>
                      조건에 맞는 견적이 없습니다. 우측 상단에서 새 견적을 작성하세요.
                    </TableEmpty>
                  ) : (
                    rows.map((quote) => (
                      <TR key={quote.id}>
                        <TD>
                          <Link
                            href={`/quotes/${quote.id}`}
                            className="font-semibold text-lg-red hover:underline"
                          >
                            {quote.quoteNo}
                          </Link>
                          {quote.version > 1 && (
                            <span className="ml-sm text-caption text-gray-700">
                              v{quote.version}
                            </span>
                          )}
                        </TD>
                        <TD>
                          <Link
                            href={`/customers/${quote.customer.id}`}
                            className="hover:text-lg-red hover:underline"
                          >
                            {quote.customer.name}
                          </Link>
                        </TD>
                        <TD className="text-gray-700">{quote._count.items}개</TD>
                        <TD className="text-right font-semibold">{formatKRW(quote.grandTotal)}</TD>
                        <TD>
                          <QuoteStatusBadge status={quote.status} />
                        </TD>
                        <TD>
                          <ValidityBadge validity={quoteValidity(quote, now)} />
                        </TD>
                        <TD className="text-gray-700">{quote.manager.name}</TD>
                        <TD className="text-gray-700">{formatDate(quote.updatedAt)}</TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </Card>

            <Card title="견적 작성 규칙" className="col-span-12">
              <ul className="flex flex-col gap-sm text-body text-gray-700">
                <li>· 1개 견적은 1개 매장({ctx.store.name}) 기준입니다. 타 매장 재고는 섞이지 않습니다.</li>
                <li>· 단가는 상품을 담는 순간 스냅샷으로 복사됩니다. 이후 상품 가격이 바뀌어도 이 견적 금액은 변하지 않습니다.</li>
                <li>· 견적 저장으로 재고가 예약되지 않습니다. 재고 차감은 계약 생성 시점에만 일어납니다.</li>
                <li>· <Badge tone="info" showIcon={false}>작성중</Badge> 상태에서만 수정할 수 있습니다. 확정 이후에는 새 버전을 만들어 이어서 작성합니다.</li>
              </ul>
            </Card>
          </CardGrid>
        </div>
      </main>
    </>
  );
}
