// 상담대시보드 집계. 모든 모델을 **읽기만** 한다 — 이 모듈에는 쓰기 경로가 없다.
//
// 계획 §2 가 명시한 두 함정을 여기서 한 번만 처리한다:
//  1. "당일" 은 Asia/Seoul 자정 기준이다. UTC 자정이 아니다.
//  2. 전환율/계약률의 분모가 0 일 수 있다. NaN/Infinity 대신 null 을 돌려준다.
//
// 상담 단계의 의미(종착 단계 · 전이 규칙)와 후속조치 임박 기준은 Phase 10a 의
// `consultations.ts` 가 소유한다. 여기서 재정의하지 않고 가져다 쓴다.

import type { AuthContext } from "./auth";
import { scopeToStore } from "./auth";
import { FOLLOW_UP_SOON_DAYS, followUpState } from "./consultations";
import { CONSULTATION_STAGE, type ConsultationStage } from "./enums";
import { prisma } from "./prisma";

const DAY_MS = 86_400_000;
/** 한국은 서머타임이 없어 고정 오프셋으로 계산해도 정확하다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// -------------------------------------------------------------- KST 날짜 경계

/** 주어진 순간이 속한 **한국 시간 기준** 그날 00:00 의 UTC 인스턴트. */
export function kstDayStart(at: Date): Date {
  const shifted = at.getTime() + KST_OFFSET_MS;
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - KST_OFFSET_MS);
}

/** 그날 24:00 (= 다음날 00:00). 범위 조건에 미포함 끝으로 쓴다. */
export function kstDayEnd(at: Date): Date {
  return new Date(kstDayStart(at).getTime() + DAY_MS);
}

/** KST 기준 `days` 일 전의 00:00. days=0 이면 오늘 00:00. */
export function kstDaysAgoStart(at: Date, days: number): Date {
  return new Date(kstDayStart(at).getTime() - days * DAY_MS);
}

/** `<input type="date">` 의 "YYYY-MM-DD" 를 그 날짜의 KST 00:00 으로 해석한다. */
export function parseKstDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00+09:00`);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

/** KST 기준 YYYY-MM-DD 문자열 (date input 의 defaultValue 용). */
export function toKstDateString(at: Date): string {
  return new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ 지표 계산

/**
 * 분모가 0 이면 **null** 을 돌려준다 (0 도 NaN 도 아니다).
 * 계획 §2 가 명시한 zero-division 케이스 — 화면은 null 을 "—" 로 렌더한다.
 */
export function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/** 비율을 백분율 문자열로. null(분모 0)은 "—". */
export function formatRatio(value: number | null, fractionDigits = 1): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

// ------------------------------------------------------------------ 단계 구분

export const STAGE_ORDER: ConsultationStage[] = [...CONSULTATION_STAGE];

/** 단계값만으로 "견적 이상" 을 판정할 때 쓰는 집합. */
const QUOTED_STAGES: ConsultationStage[] = ["QUOTED", "CONTRACTED", "DELIVERING", "COMPLETED"];
/** 단계값만으로 "계약 이상" 을 판정할 때 쓰는 집합. */
const CONTRACTED_STAGES: ConsultationStage[] = ["CONTRACTED", "DELIVERING", "COMPLETED"];

/**
 * 미처리 판정 대상 단계.
 * CONTRACTED/DELIVERING 은 배송 파이프라인이 끌고 가는 중이라 "매니저가 방치한" 상태가 아니고,
 * COMPLETED/CLOSED/CANCELLED 는 종착 단계다 (consultations.ts 의 CONSULTATION_TERMINAL).
 */
export const UNHANDLED_STAGES: ConsultationStage[] = ["IN_PROGRESS", "QUOTED"];

/** 이 일수만큼 아무 변화가 없으면 미처리로 본다. 저장된 플래그가 아니라 조회 시점 파생값이다. */
export const UNHANDLED_AFTER_DAYS = 3;

/** 후속조치 임박 기준은 Phase 10a 소유값을 그대로 쓴다 (두 화면이 어긋나지 않도록). */
export { FOLLOW_UP_SOON_DAYS, followUpState };

export type StageCounts = Record<ConsultationStage, number>;

export function emptyStageCounts(): StageCounts {
  return Object.fromEntries(STAGE_ORDER.map((stage) => [stage, 0])) as StageCounts;
}

export function totalStages(counts: StageCounts): number {
  return STAGE_ORDER.reduce((total, stage) => total + counts[stage], 0);
}

// --------------------------------------------------------------------- 필터

export interface DashboardFilter {
  /** 포함 (KST 00:00). */
  from: Date;
  /** 미포함 (KST 다음날 00:00). */
  to: Date;
  /** undefined 면 스코프 내 전체. */
  managerId?: string;
}

/**
 * 담당자 필터의 권한 규칙.
 * 일반 MANAGER 는 본인 실적과 매장 합계만 볼 수 있다 — 동료 개인 실적은 볼 수 없다.
 * STORE_ADMIN / HQ 는 스코프 안의 특정 매니저를 지정할 수 있다.
 */
export function canSelectAnyManager(ctx: AuthContext): boolean {
  return ctx.isStoreAdmin || ctx.isHQ;
}

/** 요청된 담당자 값을 권한에 맞게 보정한다. "all" 이면 undefined. */
export function resolveManagerFilter(
  ctx: AuthContext,
  requested: string | undefined,
): string | undefined {
  if (!requested || requested === "all") return undefined;
  if (requested === "me") return ctx.manager.id;
  // 권한이 없으면 타인 지정을 본인으로 되돌린다.
  return canSelectAnyManager(ctx) ? requested : ctx.manager.id;
}

function periodWhere(ctx: AuthContext, filter: DashboardFilter) {
  return {
    ...scopeToStore(ctx),
    ...(filter.managerId ? { managerId: filter.managerId } : {}),
    startedAt: { gte: filter.from, lt: filter.to },
  };
}

// --------------------------------------------------------------------- 집계

async function groupStages(where: object): Promise<StageCounts> {
  const rows = await prisma.consultation.groupBy({
    by: ["stage"],
    where,
    _count: { _all: true },
  });
  const counts = emptyStageCounts();
  for (const row of rows) {
    if (row.stage in counts) counts[row.stage as ConsultationStage] = row._count._all;
  }
  return counts;
}

/** P0 — 당일(KST) 시작된 상담의 단계별 건수. */
export function todayStageCounts(ctx: AuthContext, now: Date, managerId?: string) {
  return groupStages({
    ...scopeToStore(ctx),
    ...(managerId ? { managerId } : {}),
    startedAt: { gte: kstDayStart(now), lt: kstDayEnd(now) },
  });
}

/** P0 단계별 건수 + P1 기간별 실적. */
export function periodStageCounts(ctx: AuthContext, filter: DashboardFilter) {
  return groupStages(periodWhere(ctx, filter));
}

// --------------------------------------------------------- 전환율 / 계약률

/**
 * "견적까지 갔다" 의 판정은 **현재 단계 OR 실제 견적 존재** 의 합집합이다.
 *
 * 단계만 보면 안 되는 이유: 종착 단계(CLOSED/CANCELLED)로 들어간 상담은 이전에 견적·계약이
 * 있었더라도 그 사실이 `stage` 에서 사라진다. 견적을 받고도 구매하지 않은 상담이 전환 실적에서
 * 통째로 빠지면 전환율이 실제보다 낮게 나온다.
 *
 * 관계만 보면 안 되는 이유: 시드 데이터처럼 단계만 세팅되고 Quote 레코드가 아직 없는 상담이
 * 존재한다 (Phase 11 이 견적을 시드하기 전까지). 합집합이 두 경우를 모두 잡는다.
 */
function reachedQuoteWhere() {
  return { OR: [{ stage: { in: QUOTED_STAGES } }, { quotes: { some: {} } }] };
}

function reachedContractWhere() {
  return {
    OR: [
      { stage: { in: CONTRACTED_STAGES } },
      { quotes: { some: { contract: { isNot: null } } } },
    ],
  };
}

export interface ConversionMetrics {
  total: number;
  reachedQuote: number;
  reachedContract: number;
  /** 분모 0 이면 null. */
  conversionRate: number | null;
  /** 분모 0 이면 null. */
  contractRate: number | null;
}

export async function conversionMetrics(
  ctx: AuthContext,
  filter: DashboardFilter,
): Promise<ConversionMetrics> {
  const base = periodWhere(ctx, filter);
  const [total, reachedQuote, reachedContract] = await Promise.all([
    prisma.consultation.count({ where: base }),
    prisma.consultation.count({ where: { ...base, ...reachedQuoteWhere() } }),
    prisma.consultation.count({ where: { ...base, ...reachedContractWhere() } }),
  ]);

  return {
    total,
    reachedQuote,
    reachedContract,
    conversionRate: ratio(reachedQuote, total),
    contractRate: ratio(reachedContract, total),
  };
}

// ------------------------------------------------------- 미처리 / 후속조치

function unhandledWhere(ctx: AuthContext, now: Date, managerId?: string) {
  return {
    ...scopeToStore(ctx),
    ...(managerId ? { managerId } : {}),
    stage: { in: UNHANDLED_STAGES },
    updatedAt: { lt: new Date(now.getTime() - UNHANDLED_AFTER_DAYS * DAY_MS) },
  };
}

/**
 * P0 미처리 상담 — 열린 단계인데 `UNHANDLED_AFTER_DAYS` 일 넘게 변화가 없는 건.
 * 기간 필터와 무관하게 "지금 방치된 것" 을 보여준다.
 */
export function unhandledConsultations(ctx: AuthContext, now: Date, managerId?: string, take = 10) {
  return prisma.consultation.findMany({
    where: unhandledWhere(ctx, now, managerId),
    orderBy: { updatedAt: "asc" },
    take,
    include: {
      customer: { select: { id: true, name: true } },
      manager: { select: { name: true } },
    },
  });
}

export function unhandledCount(ctx: AuthContext, now: Date, managerId?: string) {
  return prisma.consultation.count({ where: unhandledWhere(ctx, now, managerId) });
}

function followUpWhere(ctx: AuthContext, now: Date, managerId?: string) {
  return {
    status: "PENDING",
    // FollowUp 에는 storeId 가 없어 consultation 관계로 매장 스코프를 건다 (Phase 10a 와 동일).
    consultation: scopeToStore(ctx),
    ...(managerId ? { managerId } : {}),
    dueAt: { lte: new Date(now.getTime() + FOLLOW_UP_SOON_DAYS * DAY_MS) },
  };
}

/**
 * P0 후속조치 대상 — 기한이 지났거나 임박한 미완료 건.
 * 임박 기준은 Phase 10a 의 `FOLLOW_UP_SOON_DAYS` 를 그대로 쓴다.
 * 이 모듈은 FollowUp 을 **읽기만** 한다 (쓰기는 Phase 10a 소관).
 */
export async function dueFollowUps(ctx: AuthContext, now: Date, managerId?: string, take = 10) {
  const rows = await prisma.followUp.findMany({
    where: followUpWhere(ctx, now, managerId),
    orderBy: { dueAt: "asc" },
    take,
    include: {
      customer: { select: { id: true, name: true } },
      manager: { select: { name: true } },
      consultation: { select: { id: true, stage: true } },
    },
  });
  return rows.map((row) => ({ followUp: row, state: followUpState(row, now) }));
}

export function dueFollowUpCount(ctx: AuthContext, now: Date, managerId?: string) {
  return prisma.followUp.count({ where: followUpWhere(ctx, now, managerId) });
}

// ------------------------------------------------------------------ 목록/실적

/** P0 최근 상담 — 바로가기용 목록. */
export function recentConsultations(ctx: AuthContext, managerId?: string, take = 8) {
  return prisma.consultation.findMany({
    where: { ...scopeToStore(ctx), ...(managerId ? { managerId } : {}) },
    orderBy: { startedAt: "desc" },
    take,
    include: {
      customer: { select: { id: true, name: true } },
      manager: { select: { name: true } },
      store: { select: { name: true } },
      _count: { select: { quotes: true } },
    },
  });
}

export interface ManagerPerformance {
  managerId: string;
  name: string;
  total: number;
  reachedQuote: number;
  reachedContract: number;
  conversionRate: number | null;
  contractRate: number | null;
}

/**
 * P1 개인별 실적. STORE_ADMIN / HQ 전용 — 호출 전에 canSelectAnyManager(ctx) 로 막을 것.
 *
 * 전환 판정이 "단계 OR 견적 존재" 합집합이라 groupBy 로는 표현할 수 없어 기간 내 상담을
 * 읽어 메모리에서 집계한다. 상담 건수가 수천 건이 되면 이 부분은 다시 봐야 한다
 * (worker-3 의 재고 상태 필터와 같은 성격의 한계).
 */
export async function managerPerformance(
  ctx: AuthContext,
  filter: DashboardFilter,
): Promise<ManagerPerformance[]> {
  const rows = await prisma.consultation.findMany({
    where: periodWhere(ctx, filter),
    select: {
      managerId: true,
      stage: true,
      manager: { select: { name: true } },
      quotes: { select: { contract: { select: { id: true } } } },
    },
  });

  const byManager = new Map<string, ManagerPerformance>();
  for (const row of rows) {
    const entry = byManager.get(row.managerId) ?? {
      managerId: row.managerId,
      name: row.manager.name,
      total: 0,
      reachedQuote: 0,
      reachedContract: 0,
      conversionRate: null,
      contractRate: null,
    };

    entry.total += 1;
    const stage = row.stage as ConsultationStage;
    if (QUOTED_STAGES.includes(stage) || row.quotes.length > 0) entry.reachedQuote += 1;
    if (CONTRACTED_STAGES.includes(stage) || row.quotes.some((q) => q.contract != null)) {
      entry.reachedContract += 1;
    }
    byManager.set(row.managerId, entry);
  }

  return [...byManager.values()]
    .map((entry) => ({
      ...entry,
      conversionRate: ratio(entry.reachedQuote, entry.total),
      contractRate: ratio(entry.reachedContract, entry.total),
    }))
    .sort((a, b) => b.total - a.total);
}

/** 담당자 필터 드롭다운에 채울 매니저 목록 (스코프 내, 활성). */
export function scopedManagers(ctx: AuthContext) {
  return prisma.manager.findMany({
    where: { ...scopeToStore(ctx), active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
