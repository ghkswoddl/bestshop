import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  CardGrid,
  Notice,
  Select,
  Table,
  TableEmpty,
  TBody,
  TD,
  TextField,
  TH,
  THead,
  TR,
} from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { pickOne, type RawSearchParams } from "@/lib/catalog";
import { CONSULTATION_STAGE_LABEL, type ConsultationStage } from "@/lib/enums";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import {
  canSelectAnyManager,
  conversionMetrics,
  dueFollowUpCount,
  dueFollowUps,
  FOLLOW_UP_SOON_DAYS,
  formatRatio,
  kstDayEnd,
  kstDayStart,
  kstDaysAgoStart,
  managerPerformance,
  parseKstDate,
  periodStageCounts,
  recentConsultations,
  resolveManagerFilter,
  scopedManagers,
  STAGE_ORDER,
  todayStageCounts,
  toKstDateString,
  totalStages,
  UNHANDLED_AFTER_DAYS,
  unhandledConsultations,
  unhandledCount,
  type DashboardFilter,
} from "@/lib/dashboard";

const DEFAULT_PERIOD_DAYS = 29; // 오늘 포함 30일

const STAGE_TONE: Record<ConsultationStage, BadgeTone> = {
  IN_PROGRESS: "info",
  QUOTED: "warning",
  CONTRACTED: "success",
  DELIVERING: "info",
  COMPLETED: "neutral",
  CLOSED: "neutral",
  CANCELLED: "error",
};

function StageBadge({ stage }: { stage: string }) {
  const key = (stage in CONSULTATION_STAGE_LABEL ? stage : "IN_PROGRESS") as ConsultationStage;
  return (
    <Badge tone={STAGE_TONE[key]} showIcon={false}>
      {CONSULTATION_STAGE_LABEL[key]}
    </Badge>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "alert";
}) {
  return (
    <Card className="col-span-12 sm:col-span-6 xl:col-span-3">
      <p className="text-caption text-gray-700">{label}</p>
      <p
        className={`mt-sm text-display tabular-nums ${tone === "alert" ? "text-lg-red" : "text-gray-900"}`}
      >
        {value}
      </p>
      {hint && <p className="mt-xs text-caption text-gray-400">{hint}</p>}
    </Card>
  );
}

const SHORTCUTS = [
  { href: "/customers", label: "고객조회", desc: "전화번호 · 이름으로 검색" },
  { href: "/products", label: "상품탐색", desc: "스펙 · 재고 확인" },
  { href: "/quotes/new", label: "견적서 작성", desc: "상품 담고 합계 자동 계산" },
  { href: "/contracts", label: "계약 및 전자서명", desc: "서명 상태 확인" },
  { href: "/deliveries", label: "배송 및 설치 추적", desc: "일정 · 지연 확인" },
  { href: "/consultations", label: "상담이력관리", desc: "상담 기록 · 후속조치" },
  { href: "/promotions", label: "프로모션 공지", desc: "진행중 · 종료임박" },
  { href: "/inventory", label: "재고 및 매장확인", desc: "매장별 재고 · 기준시각" },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requireManager();
  const now = new Date();

  // --- 기간 필터 (KST 기준). 잘못된 입력이나 역전된 범위는 기본값으로 되돌린다.
  const defaultFrom = kstDaysAgoStart(now, DEFAULT_PERIOD_DAYS);
  const defaultTo = kstDayEnd(now);
  const parsedFrom = parseKstDate(pickOne(params, "from"));
  const parsedToDay = parseKstDate(pickOne(params, "to"));
  const parsedTo = parsedToDay ? new Date(parsedToDay.getTime() + 86_400_000) : null;

  let from = parsedFrom ?? defaultFrom;
  let to = parsedTo ?? defaultTo;
  if (from >= to) {
    from = defaultFrom;
    to = defaultTo;
  }

  const managerParam = pickOne(params, "manager");
  const managerId = resolveManagerFilter(ctx, managerParam);
  const filter: DashboardFilter = { from, to, managerId };
  const canPickManager = canSelectAnyManager(ctx);

  const [
    today,
    period,
    metrics,
    unhandledTotal,
    unhandled,
    followUpTotal,
    followUps,
    recent,
    managers,
    perManager,
  ] = await Promise.all([
    todayStageCounts(ctx, now, managerId),
    periodStageCounts(ctx, filter),
    conversionMetrics(ctx, filter),
    unhandledCount(ctx, now, managerId),
    unhandledConsultations(ctx, now, managerId),
    dueFollowUpCount(ctx, now, managerId),
    dueFollowUps(ctx, now, managerId),
    recentConsultations(ctx, managerId),
    scopedManagers(ctx),
    canPickManager ? managerPerformance(ctx, filter) : Promise.resolve([]),
  ]);

  const todayTotal = totalStages(today);
  const periodTotal = totalStages(period);

  const selectedManagerName = managerId
    ? (managers.find((m) => m.id === managerId)?.name ?? ctx.manager.name)
    : null;
  const scopeLabel = managerId
    ? `${selectedManagerName} 개인`
    : ctx.isHQ
      ? "전 매장"
      : ctx.store.name;

  return (
    <>
      <PageHeader title="상담대시보드" />
      <main className="flex-1 overflow-y-auto p-md sm:p-xl">
        <div className="mx-auto flex max-w-container flex-col gap-lg">
          <Card title="조회 조건">
            <form
              method="get"
              className="grid grid-cols-1 items-end gap-md sm:grid-cols-2 md:grid-cols-12"
            >
              <div className="md:col-span-3">
                <TextField
                  name="from"
                  type="date"
                  label="시작일"
                  defaultValue={toKstDateString(from)}
                />
              </div>
              <div className="md:col-span-3">
                <TextField
                  name="to"
                  type="date"
                  label="종료일"
                  defaultValue={toKstDateString(new Date(to.getTime() - 86_400_000))}
                />
              </div>
              <div className="md:col-span-3">
                <Select name="manager" label="담당자" defaultValue={managerParam ?? "all"}>
                  <option value="all">{ctx.isHQ ? "전 매장" : `${ctx.store.name} 전체`}</option>
                  <option value="me">본인 ({ctx.manager.name})</option>
                  {canPickManager &&
                    managers
                      .filter((m) => m.id !== ctx.manager.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                </Select>
              </div>
              <div className="flex flex-wrap gap-sm md:col-span-3 md:justify-end md:pb-px">
                <Link href="/dashboard">
                  <Button variant="secondary">초기화</Button>
                </Link>
                <Button type="submit">조회</Button>
              </div>
            </form>
            {!canPickManager && (
              <p className="mt-md text-caption text-gray-400">
                개인별 상세 실적은 점장 · 본사 계정에서 조회할 수 있습니다.
              </p>
            )}
          </Card>

          <CardGrid>
            <Metric
              label={`당일 상담 (${formatDate(kstDayStart(now))} 기준)`}
              value={`${todayTotal}건`}
              hint="한국시간 00:00부터"
            />
            <Metric label="당일 진행중" value={`${today.IN_PROGRESS}건`} hint="오늘 시작·진행중" />
            <Metric
              label="미처리 상담"
              value={`${unhandledTotal}건`}
              hint={`${UNHANDLED_AFTER_DAYS}일 이상 변화 없음`}
              tone={unhandledTotal > 0 ? "alert" : undefined}
            />
            <Metric
              label="후속조치 대상"
              value={`${followUpTotal}건`}
              hint={`기한 경과 + ${FOLLOW_UP_SOON_DAYS}일 이내`}
              tone={followUpTotal > 0 ? "alert" : undefined}
            />
          </CardGrid>

          <Card
            title="단계별 상담 건수"
            action={
              <span className="text-caption text-gray-700">
                {formatDate(from)} ~ {formatDate(new Date(to.getTime() - 86_400_000))} · {scopeLabel}{" "}
                · 총 {periodTotal}건
              </span>
            }
          >
            <ul className="grid grid-cols-2 gap-md md:grid-cols-3 xl:grid-cols-6">
              {STAGE_ORDER.map((stage) => (
                <li
                  key={stage}
                  className="flex flex-col gap-xs rounded-card border border-gray-200 p-md"
                >
                  <StageBadge stage={stage} />
                  <span className="text-h2 tabular-nums text-gray-900">{period[stage]}건</span>
                </li>
              ))}
            </ul>
          </Card>

          <CardGrid>
            <Card title="견적 전환율" className="col-span-12 sm:col-span-6">
              <p className="text-display tabular-nums text-gray-900">
                {formatRatio(metrics.conversionRate)}
              </p>
              <p className="mt-xs text-caption text-gray-700">
                견적까지 진행 {metrics.reachedQuote}건 / 전체 {metrics.total}건
              </p>
            </Card>
            <Card title="계약률" className="col-span-12 sm:col-span-6">
              <p className="text-display tabular-nums text-gray-900">
                {formatRatio(metrics.contractRate)}
              </p>
              <p className="mt-xs text-caption text-gray-700">
                계약까지 진행 {metrics.reachedContract}건 / 전체 {metrics.total}건
              </p>
            </Card>
          </CardGrid>

          {periodTotal === 0 ? (
            <Notice tone="info">
              선택한 기간에 시작된 상담이 없습니다. 전환율과 계약률은 분모가 0이라 &ldquo;—&rdquo;로
              표시됩니다.
            </Notice>
          ) : (
            <Notice tone="neutral">
              전환 판정은 현재 상담 단계와 실제 견적·계약 레코드를 함께 봅니다. 상담을 종료(상담종료
              · 취소)해도 이미 받은 견적은 전환 실적에 남습니다.
            </Notice>
          )}

          <CardGrid>
            <Card title="미처리 상담" flush className="col-span-12 xl:col-span-6">
              <Table>
                <THead>
                  <TR>
                    <TH>고객</TH>
                    <TH>단계</TH>
                    <TH>담당</TH>
                    <TH>마지막 변화</TH>
                  </TR>
                </THead>
                <TBody>
                  {unhandled.length === 0 ? (
                    <TableEmpty colSpan={4}>미처리 상담이 없습니다.</TableEmpty>
                  ) : (
                    unhandled.map((row) => (
                      <TR key={row.id}>
                        <TD>
                          <Link
                            href={`/customers/${row.customer.id}`}
                            className="font-medium text-gray-900 hover:text-lg-red"
                          >
                            {row.customer.name}
                          </Link>
                        </TD>
                        <TD>
                          <StageBadge stage={row.stage} />
                        </TD>
                        <TD className="text-gray-700">{row.manager.name}</TD>
                        <TD className="whitespace-nowrap text-gray-700">
                          {formatRelative(row.updatedAt, now)}
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </Card>

            <Card title="후속조치 대상" flush className="col-span-12 xl:col-span-6">
              <Table>
                <THead>
                  <TR>
                    <TH>고객</TH>
                    <TH>기한</TH>
                    <TH>내용</TH>
                    <TH>담당</TH>
                  </TR>
                </THead>
                <TBody>
                  {followUps.length === 0 ? (
                    <TableEmpty colSpan={4}>예정된 후속조치가 없습니다.</TableEmpty>
                  ) : (
                    followUps.map(({ followUp, state }) => (
                      <TR key={followUp.id}>
                        <TD>
                          <Link
                            href={`/customers/${followUp.customer.id}`}
                            className="font-medium text-gray-900 hover:text-lg-red"
                          >
                            {followUp.customer.name}
                          </Link>
                        </TD>
                        <TD className="whitespace-nowrap">
                          <span className="tabular-nums">{formatDate(followUp.dueAt)}</span>
                          <Badge
                            tone={state.urgency === "OVERDUE" ? "error" : "warning"}
                            className="ml-sm"
                          >
                            {state.label}
                          </Badge>
                        </TD>
                        <TD className="text-gray-700">{followUp.content ?? "-"}</TD>
                        <TD className="text-gray-700">{followUp.manager.name}</TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </Card>
          </CardGrid>

          {canPickManager && (
            <Card
              title="개인별 실적"
              flush
              action={
                <span className="text-caption text-gray-700">
                  {formatDate(from)} ~ {formatDate(new Date(to.getTime() - 86_400_000))}
                </span>
              }
            >
              <Table>
                <THead>
                  <TR>
                    <TH>담당자</TH>
                    <TH className="text-right">상담</TH>
                    <TH className="text-right">견적까지</TH>
                    <TH className="text-right">계약까지</TH>
                    <TH className="text-right">전환율</TH>
                    <TH className="text-right">계약률</TH>
                  </TR>
                </THead>
                <TBody>
                  {perManager.length === 0 ? (
                    <TableEmpty colSpan={6}>선택한 기간에 상담 실적이 없습니다.</TableEmpty>
                  ) : (
                    perManager.map((row) => (
                      <TR key={row.managerId}>
                        <TD className="font-medium">{row.name}</TD>
                        <TD className="text-right tabular-nums">{row.total}</TD>
                        <TD className="text-right tabular-nums">{row.reachedQuote}</TD>
                        <TD className="text-right tabular-nums">{row.reachedContract}</TD>
                        <TD className="text-right tabular-nums">
                          {formatRatio(row.conversionRate)}
                        </TD>
                        <TD className="text-right tabular-nums">{formatRatio(row.contractRate)}</TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </Card>
          )}

          <CardGrid>
            <Card title="최근 상담" flush className="col-span-12 xl:col-span-7">
              <Table>
                <THead>
                  <TR>
                    <TH>고객</TH>
                    <TH>시작</TH>
                    <TH>단계</TH>
                    <TH>담당</TH>
                    {ctx.isHQ && <TH>매장</TH>}
                    <TH className="text-right">견적</TH>
                  </TR>
                </THead>
                <TBody>
                  {recent.length === 0 ? (
                    <TableEmpty colSpan={ctx.isHQ ? 6 : 5}>
                      아직 시작된 상담이 없습니다.
                    </TableEmpty>
                  ) : (
                    recent.map((row) => (
                      <TR key={row.id}>
                        <TD>
                          <Link
                            href={`/customers/${row.customer.id}`}
                            className="font-medium text-gray-900 hover:text-lg-red"
                          >
                            {row.customer.name}
                          </Link>
                        </TD>
                        <TD className="whitespace-nowrap tabular-nums text-gray-700">
                          {formatDateTime(row.startedAt)}
                        </TD>
                        <TD>
                          <StageBadge stage={row.stage} />
                        </TD>
                        <TD className="text-gray-700">{row.manager.name}</TD>
                        {ctx.isHQ && <TD className="text-gray-700">{row.store.name}</TD>}
                        <TD className="text-right tabular-nums text-gray-700">
                          {row._count.quotes}
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </Card>

            <Card title="주요 업무 바로가기" className="col-span-12 xl:col-span-5">
              <ul className="grid grid-cols-1 gap-sm sm:grid-cols-2">
                {SHORTCUTS.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex h-full flex-col gap-xs rounded-card border border-gray-200 p-md transition-colors hover:border-lg-red hover:bg-lg-red-light"
                    >
                      <span className="text-h3 text-gray-900">{item.label}</span>
                      <span className="text-caption text-gray-700">{item.desc}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </CardGrid>
        </div>
      </main>
    </>
  );
}
