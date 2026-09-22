import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  CardGrid,
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
import { pickOne, type RawSearchParams } from "@/lib/catalog";
import { consultationHint, dueFollowUps } from "@/lib/consultations";
import { CONSULTATION_STAGE, CONSULTATION_CHANNEL_LABEL, type ConsultationChannel } from "@/lib/enums";
import { formatDate, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { ConsultationNoticeBanner, FollowUpBadge, StageBadge } from "./_components/badges";

const RESULT_LIMIT = 100;

/** `<input type="date">` 값을 그 날의 시작/끝으로 바꾼다. */
function dayStart(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
function dayEnd(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function ConsultationsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const ctx = await requireManager();
  const params = await searchParams;
  const now = new Date();

  const q = pickOne(params, "q") ?? "";
  const qDigits = q.replace(/\D/g, "");
  const stage = pickOne(params, "stage");
  const managerId = pickOne(params, "manager");
  const from = dayStart(pickOne(params, "from"));
  const to = dayEnd(pickOne(params, "to"));
  const mineOnly = pickOne(params, "mine") === "1";

  const [rows, colleagues, followUps] = await Promise.all([
    prisma.consultation.findMany({
      where: {
        ...scopeToStore(ctx),
        ...(stage && (CONSULTATION_STAGE as readonly string[]).includes(stage) ? { stage } : {}),
        ...(managerId ? { managerId } : {}),
        ...(mineOnly ? { managerId: ctx.manager.id } : {}),
        ...(from || to ? { startedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        ...(q
          ? {
              OR: [
                { customer: { name: { contains: q } } },
                // 숫자가 없는 검색어에 빈 문자열 contains 를 넣으면 전 행과 매칭된다. 절을 아예 뺀다.
                ...(qDigits.length >= 2
                  ? [{ customer: { phoneNormalized: { contains: qDigits } } }]
                  : []),
                { summary: { contains: q } },
                { notes: { some: { content: { contains: q } } } },
              ],
            }
          : {}),
      },
      orderBy: { startedAt: "desc" },
      take: RESULT_LIMIT,
      include: {
        customer: { select: { id: true, name: true } },
        manager: { select: { name: true } },
        quotes: { select: { status: true, contract: { select: { status: true } } } },
        _count: { select: { notes: true, followUps: true } },
      },
    }),
    prisma.manager.findMany({
      where: { ...scopeToStore(ctx), active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    dueFollowUps(ctx, now),
  ]);

  const overdue = followUps.filter((row) => row.state.urgency === "OVERDUE");

  return (
    <>
      <PageHeader
        title="상담이력관리"
        actions={
          <LinkButton href="/customers" variant="secondary">
            고객조회에서 상담 시작
          </LinkButton>
        }
      />
      <main className="flex-1 overflow-y-auto p-md sm:p-xl">
        <div className="mx-auto max-w-container">
          <ConsultationNoticeBanner notice={pickOne(params, "consultation")} />

          {followUps.length > 0 && (
            <Notice tone={overdue.length > 0 ? "error" : "warning"} className="mb-lg">
              후속조치 대상이 {followUps.length}건 있습니다
              {overdue.length > 0 ? ` (기한 경과 ${overdue.length}건)` : ""}.
            </Notice>
          )}

          <CardGrid>
            <Card title="상담 검색" className="col-span-12">
              <form
                method="get"
                action="/consultations"
                className="grid grid-cols-1 items-end gap-md sm:grid-cols-2 lg:grid-cols-6 lg:gap-lg"
              >
                <div className="sm:col-span-2">
                  <TextField
                    name="q"
                    label="고객명 · 연락처 · 상담내용"
                    defaultValue={q}
                    placeholder="고객명 또는 메모 내용"
                  />
                </div>
                <div>
                  <Select name="stage" label="상담 단계" defaultValue={stage ?? ""}>
                    <option value="">전체</option>
                    <option value="IN_PROGRESS">진행중</option>
                    <option value="QUOTED">견적</option>
                    <option value="CONTRACTED">계약</option>
                    <option value="DELIVERING">배송</option>
                    <option value="COMPLETED">완료</option>
                    <option value="CLOSED">상담종료</option>
                    <option value="CANCELLED">취소</option>
                  </Select>
                </div>
                <div>
                  <Select name="manager" label="담당 매니저" defaultValue={managerId ?? ""}>
                    <option value="">전체</option>
                    {colleagues.map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <TextField
                    name="from"
                    label="상담일 시작"
                    type="date"
                    defaultValue={pickOne(params, "from") ?? ""}
                  />
                </div>
                <div>
                  <TextField
                    name="to"
                    label="상담일 종료"
                    type="date"
                    defaultValue={pickOne(params, "to") ?? ""}
                  />
                </div>
                <div className="flex flex-wrap gap-md sm:col-span-2 lg:col-span-6 lg:justify-end">
                  <Button type="submit">검색</Button>
                  <LinkButton href="/consultations" variant="secondary">
                    초기화
                  </LinkButton>
                </div>
              </form>
              <div className="mt-md flex flex-wrap gap-sm">
                <LinkButton
                  href={mineOnly ? "/consultations" : "/consultations?mine=1"}
                  variant={mineOnly ? "primary" : "secondary"}
                >
                  내 상담만 보기
                </LinkButton>
                <LinkButton href="/consultations?stage=IN_PROGRESS" variant="secondary">
                  진행중만 보기
                </LinkButton>
              </div>
            </Card>

            {followUps.length > 0 && (
              <Card title="후속조치 대상" flush className="col-span-12">
                <Table>
                  <THead>
                    <TR>
                      <TH>기한</TH>
                      <TH>상태</TH>
                      <TH>고객</TH>
                      <TH>내용</TH>
                      <TH>담당</TH>
                      <TH>상담</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {followUps.map(({ followUp, state }) => (
                      <TR key={followUp.id}>
                        <TD className="tabular-nums">{formatDate(followUp.dueAt)}</TD>
                        <TD>
                          <FollowUpBadge state={state} />
                        </TD>
                        <TD>
                          <Link
                            href={`/customers/${followUp.customer.id}`}
                            className="hover:text-lg-red hover:underline"
                          >
                            {followUp.customer.name}
                          </Link>
                        </TD>
                        <TD className="text-gray-700">{followUp.content ?? "-"}</TD>
                        <TD className="text-gray-700">{followUp.manager.name}</TD>
                        <TD>
                          <Link
                            href={`/consultations/${followUp.consultationId}`}
                            className="text-lg-red hover:underline"
                          >
                            상담 열기
                          </Link>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>
            )}

            <Card title={`상담 ${rows.length}건`} flush className="col-span-12">
              <Table>
                <THead>
                  <TR>
                    <TH>상담일시</TH>
                    <TH>고객</TH>
                    <TH>단계</TH>
                    <TH>채널</TH>
                    <TH>담당</TH>
                    <TH>메모</TH>
                    <TH>후속</TH>
                    <TH>다음 할 일</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.length === 0 ? (
                    <TableEmpty colSpan={8}>
                      조건에 맞는 상담이 없습니다. 고객조회에서 상담을 시작하세요.
                    </TableEmpty>
                  ) : (
                    rows.map((consultation) => (
                      <TR key={consultation.id}>
                        <TD className="tabular-nums">
                          <Link
                            href={`/consultations/${consultation.id}`}
                            className="font-semibold text-lg-red hover:underline"
                          >
                            {formatDateTime(consultation.startedAt)}
                          </Link>
                        </TD>
                        <TD>
                          <Link
                            href={`/customers/${consultation.customer.id}`}
                            className="hover:text-lg-red hover:underline"
                          >
                            {consultation.customer.name}
                          </Link>
                        </TD>
                        <TD>
                          <StageBadge stage={consultation.stage} />
                        </TD>
                        <TD className="text-gray-700">
                          {consultation.channel
                            ? (CONSULTATION_CHANNEL_LABEL[
                                consultation.channel as ConsultationChannel
                              ] ?? consultation.channel)
                            : "-"}
                        </TD>
                        <TD className="text-gray-700">{consultation.manager.name}</TD>
                        <TD className="tabular-nums text-gray-700">
                          {consultation._count.notes}
                        </TD>
                        <TD className="tabular-nums text-gray-700">
                          {consultation._count.followUps}
                        </TD>
                        <TD className="text-gray-700">{consultationHint(consultation)}</TD>
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
