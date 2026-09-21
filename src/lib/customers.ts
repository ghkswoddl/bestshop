import type { Prisma } from "@prisma/client";
import type { AuthContext } from "./auth";
import { scopeCustomerToStore, scopeToStore } from "./auth";
import { normalizePhone } from "./phone";
import { prisma } from "./prisma";

// ---------------------------------------------------------------- 매장 스코프

/**
 * 고객 목록/상세 조회의 매장 범위. 세 갈래를 OR 로 묶는다.
 *
 * 1. `scopeCustomerToStore(ctx)` — 이 매장에 상담 이력이 있는 고객.
 * 2. 그 고객으로 병합된 중복 레코드. 검색 결과에서 한 행으로 합쳐 보여주려면
 *    중복 쪽도 같이 읽혀야 하는데, 중복 레코드에는 보통 상담 이력이 없어
 *    1번으로는 걸리지 않는다. 병합 대상의 매장을 그대로 물려받는다.
 * 3. 어느 매장에서도 상담 이력이 없고 어디에도 병합되지 않은 고객 — 워크인 신규.
 *    매니저가 상담을 시작하는 순간 이 고객은 1번으로 옮겨간다.
 *
 * 3번에서 `mergedIntoId: null` 조건이 빠지면, 타 매장 고객의 중복 레코드가
 * '미귀속 신규'로 분류되어 전 매장에 노출된다.
 */
export function customerAccessWhere(ctx: AuthContext): Prisma.CustomerWhereInput {
  if (ctx.isHQ) return {};
  const scoped = scopeCustomerToStore(ctx);
  return {
    OR: [
      scoped,
      { mergedInto: scoped },
      { AND: [{ consultations: { none: {} } }, { mergedIntoId: null }] },
    ],
  };
}

/**
 * 고객 정보를 **쓰는**(수정/삭제/상담시작) 경로 전용 스코프.
 *
 * `customerAccessWhere` 의 3번 분기(미귀속 워크인)는 조회 목적으로 전 매장에 열려 있다 —
 * 어느 매장이든 상담 이력이 아직 없는 고객을 찾아 상담을 시작할 수 있어야 하기 때문이다.
 * 하지만 같은 분기를 쓰기에도 그대로 쓰면, A 매장이 등록한 워크인 고객의 이름·전화번호·주소 같은
 * PII 를 B 매장 매니저가 상담 시작 전에 마음대로 덮어쓸 수 있다.
 *
 * 그래서 쓰기 권한은 `registeredByStoreId` 로 한 번 더 좁힌다 — 등록 매장이 없거나(레거시 시드)
 * 본인 매장이 등록한 경우만 허용한다. 고객을 막 만든 매니저는 그 자리에서 보유가전 추가·상담
 * 시작까지 이어갈 수 있어야 하므로(등록 직후 흐름), 1·2번 분기는 그대로 두고 3번만 좁힌다.
 */
export function customerMutationAccessWhere(ctx: AuthContext): Prisma.CustomerWhereInput {
  if (ctx.isHQ) return {};
  const scoped = scopeCustomerToStore(ctx);
  return {
    OR: [
      scoped,
      { mergedInto: scoped },
      {
        AND: [
          { consultations: { none: {} } },
          { mergedIntoId: null },
          { OR: [{ registeredByStoreId: null }, { registeredByStoreId: ctx.store.id }] },
        ],
      },
    ],
  };
}

/** 고객에 딸린 Consultation 을 읽을 때 쓰는 매장 필터. */
export function consultationScope(ctx: AuthContext): Prisma.ConsultationWhereInput {
  return scopeToStore(ctx);
}

// -------------------------------------------------------------------- 검색

export const CUSTOMER_SORTS = ["recent", "name"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export const CONSULTATION_FILTERS = ["all", "has", "none"] as const;
export type ConsultationFilter = (typeof CONSULTATION_FILTERS)[number];

export interface CustomerSearchParams {
  q: string;
  consultation: ConsultationFilter;
  sort: CustomerSort;
}

export function parseSearchParams(raw: Record<string, string | string[] | undefined>): CustomerSearchParams {
  const value = (key: string) => {
    const v = raw[key];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const consultation = value("consultation");
  const sort = value("sort");
  return {
    q: value("q").trim(),
    consultation: (CONSULTATION_FILTERS as readonly string[]).includes(consultation)
      ? (consultation as ConsultationFilter)
      : "all",
    sort: (CUSTOMER_SORTS as readonly string[]).includes(sort) ? (sort as CustomerSort) : "recent",
  };
}

/**
 * 이름 / 휴대폰번호(하이픈·공백 무관) / 회원번호 중 하나라도 맞으면 매칭.
 * 숫자가 없는 검색어에 대해서는 전화번호 절을 넣지 않는다 — 빈 문자열 `contains` 는
 * 전체 행과 매칭되어 스코프를 무력화한다.
 */
export function buildCustomerSearchWhere(
  ctx: AuthContext,
  params: CustomerSearchParams,
): Prisma.CustomerWhereInput {
  const and: Prisma.CustomerWhereInput[] = [customerAccessWhere(ctx)];

  if (params.q) {
    const digits = normalizePhone(params.q);
    const or: Prisma.CustomerWhereInput[] = [
      { name: { contains: params.q } },
      { memberNo: { contains: params.q.toUpperCase() } },
    ];
    if (digits.length >= 2) or.push({ phoneNormalized: { contains: digits } });
    and.push({ OR: or });
  }

  if (params.consultation === "has") {
    and.push({ consultations: { some: consultationScope(ctx) } });
  } else if (params.consultation === "none") {
    and.push({ consultations: { none: consultationScope(ctx) } });
  }

  return { AND: and };
}

// -------------------------------------------------------- 중복 고객 통합 표시

export interface DuplicateGroupMember {
  id: string;
  name: string;
  phone: string;
  phoneNormalized: string;
  memberNo: string | null;
  createdAt: Date;
  mergedIntoId: string | null;
  consultations: { id: string; stage: string; startedAt: Date }[];
}

export interface CustomerGroup<T extends DuplicateGroupMember> {
  primary: T;
  duplicates: T[];
  consultationCount: number;
  /** 그룹 전체에서 가장 최근 상담. 중복 레코드 쪽에만 이력이 있는 경우도 잡는다. */
  lastConsultation: { id: string; stage: string; startedAt: Date } | null;
}

/**
 * 같은 휴대폰번호를 쓰는 레코드를 한 행으로 합쳐 보여주기 위한 그룹핑.
 * 표시 전용이며 어느 레코드도 삭제하거나 병합하지 않는다 — 실제 병합은 범위 밖이다.
 * 대표 레코드는 `mergedIntoId` 가 비어 있고 가장 먼저 만들어진 것을 고른다.
 */
export function groupDuplicates<T extends DuplicateGroupMember>(rows: T[]): CustomerGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.phoneNormalized || `id:${row.id}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }

  return [...buckets.values()].map((bucket) => {
    const sorted = [...bucket].sort((a, b) => {
      const merged = Number(a.mergedIntoId != null) - Number(b.mergedIntoId != null);
      if (merged !== 0) return merged;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const [primary, ...duplicates] = sorted;
    const consultations = sorted.flatMap((row) => row.consultations);
    const lastConsultation = consultations.reduce<CustomerGroup<T>["lastConsultation"]>(
      (latest, c) => (latest == null || c.startedAt > latest.startedAt ? c : latest),
      null,
    );
    return { primary, duplicates, consultationCount: consultations.length, lastConsultation };
  });
}

// ------------------------------------------------------- 최근 조회 목록 (P1)

/** 고객상세를 열 때 호출한다. `@@unique([managerId, targetType, targetId])` 로 중복 없이 갱신된다. */
export async function recordCustomerView(ctx: AuthContext, customerId: string): Promise<void> {
  await prisma.recentlyViewed.upsert({
    where: {
      managerId_targetType_targetId: {
        managerId: ctx.manager.id,
        targetType: "CUSTOMER",
        targetId: customerId,
      },
    },
    update: { viewedAt: new Date() },
    create: {
      managerId: ctx.manager.id,
      targetType: "CUSTOMER",
      targetId: customerId,
      customerId,
    },
  });
}

// --------------------------------------------------------------- 교체주기 (P1)

export type ReplacementLevel = "OVERDUE" | "DUE_SOON" | "OK" | "UNKNOWN";

export interface ReplacementInfo {
  level: ReplacementLevel;
  monthsOwned: number | null;
  cycleMonths: number | null;
  /** 남은 개월 수. 음수면 주기를 넘긴 개월 수. */
  monthsRemaining: number | null;
  label: string;
}

/** 교체주기 임박 판정 구간 — 주기 도달 12개월 전부터 상담 참고정보로 띄운다. */
const DUE_SOON_WINDOW_MONTHS = 12;

export function replacementInfo(
  purchasedAt: Date | null,
  cycleMonths: number | null,
  now: Date = new Date(),
): ReplacementInfo {
  if (purchasedAt == null || cycleMonths == null) {
    return {
      level: "UNKNOWN",
      monthsOwned: null,
      cycleMonths,
      monthsRemaining: null,
      label: purchasedAt == null ? "구매일 미확인" : "교체주기 정보 없음",
    };
  }

  const monthsOwned = monthsBetween(purchasedAt, now);
  const monthsRemaining = cycleMonths - monthsOwned;

  if (monthsRemaining <= 0) {
    return {
      level: "OVERDUE",
      monthsOwned,
      cycleMonths,
      monthsRemaining,
      label: `교체주기 ${Math.abs(monthsRemaining)}개월 경과`,
    };
  }
  if (monthsRemaining <= DUE_SOON_WINDOW_MONTHS) {
    return {
      level: "DUE_SOON",
      monthsOwned,
      cycleMonths,
      monthsRemaining,
      label: `교체주기 ${monthsRemaining}개월 전`,
    };
  }
  return {
    level: "OK",
    monthsOwned,
    cycleMonths,
    monthsRemaining,
    label: `사용 ${Math.floor(monthsOwned / 12)}년 ${monthsOwned % 12}개월`,
  };
}

function monthsBetween(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return to.getDate() < from.getDate() ? months - 1 : months;
}
