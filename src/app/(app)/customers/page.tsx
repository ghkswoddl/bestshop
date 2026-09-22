import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Badge,
  Button,
  Card,
  CardGrid,
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
import {
  buildCustomerSearchWhere,
  consultationScope,
  customerAccessWhere,
  groupDuplicates,
  parseSearchParams,
  type CustomerSearchParams,
} from "@/lib/customers";
import { deleteSavedSearchAction, saveSearchAction } from "@/lib/customer-actions";
import { formatDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { ConsentBadges, StageBadge } from "./_components/badges";
import { ConfirmSubmitButton } from "./_components/ConfirmSubmitButton";
import { CustomerFormDialog } from "./_components/CustomerFormDialog";

const RESULT_LIMIT = 100;
const RECENT_LIMIT = 8;

function toQueryString(params: CustomerSearchParams): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.consultation !== "all") search.set("consultation", params.consultation);
  if (params.sort !== "recent") search.set("sort", params.sort);
  const query = search.toString();
  return query ? `?${query}` : "";
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireManager();
  const params = parseSearchParams(await searchParams);

  const [rows, savedSearches, recents] = await Promise.all([
    prisma.customer.findMany({
      where: buildCustomerSearchWhere(ctx, params),
      orderBy: params.sort === "name" ? { name: "asc" } : { updatedAt: "desc" },
      take: RESULT_LIMIT,
      select: {
        id: true,
        name: true,
        phone: true,
        phoneNormalized: true,
        memberNo: true,
        createdAt: true,
        mergedIntoId: true,
        consents: { select: { type: true, granted: true, revokedAt: true } },
        // 상담은 반드시 매장 스코프로 읽는다 — 타 매장 상담 건수가 새면 안 된다.
        consultations: {
          where: consultationScope(ctx),
          select: { id: true, stage: true, startedAt: true },
          orderBy: { startedAt: "desc" },
        },
      },
    }),
    prisma.savedSearch.findMany({
      where: { managerId: ctx.manager.id, scope: "CUSTOMER" },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.recentlyViewed.findMany({
      // 조회 당시에는 접근 가능했더라도 이후 타 매장에 귀속될 수 있으므로 지금 기준으로 다시 거른다.
      where: {
        managerId: ctx.manager.id,
        targetType: "CUSTOMER",
        customer: { is: customerAccessWhere(ctx) },
      },
      orderBy: { viewedAt: "desc" },
      take: RECENT_LIMIT,
      select: { id: true, customer: { select: { id: true, name: true, phone: true } } },
    }),
  ]);

  const groups = groupDuplicates(rows);

  return (
    <>
      <PageHeader
        title="고객조회"
        actions={<CustomerFormDialog mode="create" triggerLabel="신규 고객 등록" />}
      />
      <main className="flex-1 overflow-y-auto p-md sm:p-xl">
        <div className="mx-auto max-w-container">
          <CardGrid>
            <Card title="고객 검색" className="col-span-12">
              <form
                method="get"
                action="/customers"
                className="flex flex-col gap-md sm:flex-row sm:flex-wrap sm:items-end sm:gap-lg"
              >
                <div className="w-full sm:min-w-[280px] sm:flex-1">
                  <TextField
                    name="q"
                    label="이름 · 휴대폰번호 · 회원번호"
                    defaultValue={params.q}
                    placeholder="홍길동 / 01012345678 / 회원번호"
                    hint="휴대폰번호는 하이픈·공백을 넣어도 동일하게 검색됩니다."
                  />
                </div>
                <div className="w-full sm:w-44">
                  <Select name="consultation" label="상담 이력" defaultValue={params.consultation}>
                    <option value="all">전체</option>
                    <option value="has">기존 상담 있음</option>
                    <option value="none">상담 이력 없음</option>
                  </Select>
                </div>
                <div className="w-full sm:w-44">
                  <Select name="sort" label="정렬" defaultValue={params.sort}>
                    <option value="recent">최근 업데이트순</option>
                    <option value="name">이름순</option>
                  </Select>
                </div>
                <div className="flex gap-md sm:pb-px">
                  <Button type="submit">검색</Button>
                  <Link
                    href="/customers"
                    className="inline-flex h-10 items-center justify-center rounded-control border border-gray-200 bg-white px-lg text-button text-gray-900 hover:bg-gray-100"
                  >
                    초기화
                  </Link>
                </div>
              </form>
            </Card>

            <Card title="검색조건 저장" className="col-span-12 xl:col-span-4">
              <form
                action={saveSearchAction}
                className="flex flex-col gap-md sm:flex-row sm:items-end"
              >
                <input type="hidden" name="q" value={params.q} />
                <input type="hidden" name="consultation" value={params.consultation} />
                <input type="hidden" name="sort" value={params.sort} />
                <TextField name="name" label="현재 조건 이름" required placeholder="강남 재구매 후보" />
                <Button type="submit" variant="secondary">
                  저장
                </Button>
              </form>
              <ul className="mt-lg flex flex-col gap-sm">
                {savedSearches.length === 0 ? (
                  <li className="text-caption text-gray-400">저장된 검색조건이 없습니다.</li>
                ) : (
                  savedSearches.map((saved) => {
                    const restored = toQueryString(parseSearchParams(JSON.parse(saved.paramsJson)));
                    return (
                      <li
                        key={saved.id}
                        className="flex items-center justify-between gap-md rounded-control border border-gray-200 px-md py-sm"
                      >
                        <Link
                          href={`/customers${restored}`}
                          className="text-body text-lg-red hover:underline"
                        >
                          {saved.name}
                        </Link>
                        <form action={deleteSavedSearchAction}>
                          <input type="hidden" name="savedSearchId" value={saved.id} />
                          <ConfirmSubmitButton
                            confirmMessage={`저장된 검색조건 "${saved.name}" 을(를) 삭제할까요?`}
                          >
                            삭제
                          </ConfirmSubmitButton>
                        </form>
                      </li>
                    );
                  })
                )}
              </ul>
            </Card>

            <Card title="최근 조회 고객" className="col-span-12 xl:col-span-4">
              <ul className="flex flex-col gap-sm">
                {recents.length === 0 ? (
                  <li className="text-caption text-gray-400">최근 조회한 고객이 없습니다.</li>
                ) : (
                  recents.map(
                    (recent) =>
                      recent.customer && (
                        <li key={recent.id} className="flex items-center justify-between gap-md">
                          <Link
                            href={`/customers/${recent.customer.id}`}
                            className="text-body text-lg-red hover:underline"
                          >
                            {recent.customer.name}
                          </Link>
                          <span className="text-caption tabular-nums text-gray-700">
                            {formatPhone(recent.customer.phone)}
                          </span>
                        </li>
                      ),
                  )
                )}
              </ul>
            </Card>

            <Card title="조회 범위" className="col-span-12 xl:col-span-4">
              <p className="text-body text-gray-700">
                {ctx.isHQ
                  ? "본사 계정은 전 매장 고객을 조회합니다."
                  : `${ctx.store.name}에서 상담 이력이 있는 고객과, 아직 어느 매장에서도 상담 이력이 없는 신규 고객을 조회합니다.`}
              </p>
              <p className="mt-md text-caption text-gray-400">
                검색 결과 최대 {RESULT_LIMIT}건까지 표시합니다.
              </p>
            </Card>

            <Card
              title={`검색 결과 ${groups.length}건`}
              flush
              className="col-span-12"
              action={
                rows.length > groups.length ? (
                  <Badge tone="info">중복 고객 {rows.length - groups.length}건 통합 표시</Badge>
                ) : undefined
              }
            >
              <Table>
                <THead>
                  <TR>
                    <TH>고객명</TH>
                    <TH>휴대폰번호</TH>
                    <TH>회원번호</TH>
                    <TH>기존 상담</TH>
                    <TH>최근 상담일</TH>
                    <TH>동의 상태</TH>
                  </TR>
                </THead>
                <TBody>
                  {groups.length === 0 ? (
                    <TableEmpty colSpan={6}>
                      조건에 맞는 고객이 없습니다. 신규 고객이라면 우측 상단에서 등록해 주세요.
                    </TableEmpty>
                  ) : (
                    groups.map((group) => (
                      <TR key={group.primary.id}>
                        <TD>
                          <Link
                            href={`/customers/${group.primary.id}`}
                            className="font-semibold text-lg-red hover:underline"
                          >
                            {group.primary.name}
                          </Link>
                          {group.duplicates.length > 0 && (
                            <p className="mt-xs text-caption text-gray-700">
                              중복 {group.duplicates.length}건 통합:{" "}
                              {group.duplicates.map((duplicate, index) => (
                                <span key={duplicate.id}>
                                  {index > 0 && ", "}
                                  <Link
                                    href={`/customers/${duplicate.id}`}
                                    className="underline hover:text-lg-red"
                                  >
                                    {duplicate.name}
                                    {duplicate.memberNo ? ` (${duplicate.memberNo})` : ""}
                                  </Link>
                                </span>
                              ))}
                            </p>
                          )}
                        </TD>
                        <TD className="tabular-nums">{formatPhone(group.primary.phone)}</TD>
                        <TD className="tabular-nums text-gray-700">
                          {group.primary.memberNo ?? "-"}
                        </TD>
                        <TD>
                          {group.consultationCount > 0 ? (
                            <div className="flex items-center gap-sm">
                              <StageBadge stage={group.lastConsultation?.stage ?? "IN_PROGRESS"} />
                              <span className="text-caption tabular-nums text-gray-700">
                                {group.consultationCount}건
                              </span>
                            </div>
                          ) : (
                            <Badge tone="neutral">신규</Badge>
                          )}
                        </TD>
                        <TD className="tabular-nums text-gray-700">
                          {formatDate(group.lastConsultation?.startedAt ?? null)}
                        </TD>
                        <TD>
                          <ConsentBadges consents={group.primary.consents} />
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
