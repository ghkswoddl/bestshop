import { createHmac, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { Manager, Store } from "@prisma/client";
import { prisma } from "./prisma";
import type { ManagerRole } from "./enums";

export const SESSION_COOKIE = "bestshop_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const BCRYPT_ROUNDS = 10;

export interface AuthContext {
  /** passwordHash 는 뺀다 — 화면/서버 액션 어디서도 해시가 필요 없고, prop 하나만
   *  잘못 넘겨도 클라이언트로 새어나갈 수 있는 값이라 컨텍스트에 아예 담지 않는다. */
  manager: Omit<Manager, "passwordHash">;
  store: Store;
  role: ManagerRole;
  /** HQ 는 전 매장 데이터를 조회할 수 있다 (전용 UI 는 없음 — 계획 §1). */
  isHQ: boolean;
  /** 점장. 소속 매장 전체 상담을 조회할 수 있다. */
  isStoreAdmin: boolean;
}

// ------------------------------------------------------------------ 비밀번호

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// -------------------------------------------------------------------- 세션
// HttpOnly 쿠키에 `base64url(payload).HMAC-SHA256` 을 담는 최소 구현.
// 외부 IdP 연동이 없는 exam 범위라 JWT 라이브러리를 쓰지 않는다.

interface SessionPayload {
  managerId: string;
  exp: number;
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET 환경변수가 설정되지 않았습니다.");
  return secret;
}

function sign(body: string): string {
  return createHmac("sha256", sessionSecret()).update(body).digest("base64url");
}

function serializeSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function parseSession(token: string): SessionPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.managerId !== "string" || payload.exp < Date.now()) return null;
  return payload;
}

/** Server Action / Route Handler 에서만 호출할 수 있다 (쿠키 쓰기). */
export async function createSession(managerId: string): Promise<void> {
  const token = serializeSession({
    managerId,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Server Action / Route Handler 에서만 호출할 수 있다 (쿠키 쓰기). */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// ----------------------------------------------------------------- 인증 조회

/**
 * 현재 요청의 로그인 컨텍스트. 비로그인이면 null.
 * Route Handler 에서 401 을 돌려주고 싶을 때 사용한다.
 * 한 요청 안에서는 React cache 로 중복 조회가 합쳐진다.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = parseSession(token);
  if (!payload) return null;

  const manager = await prisma.manager.findUnique({
    where: { id: payload.managerId },
    omit: { passwordHash: true },
    include: { store: true },
  });
  if (!manager || !manager.active) return null;

  const { store, ...rest } = manager;
  const role = rest.role as ManagerRole;
  return {
    manager: rest,
    store,
    role,
    isHQ: role === "HQ",
    isStoreAdmin: role === "STORE_ADMIN",
  };
});

/**
 * 로그인 필수 화면/액션의 진입점. 비로그인이면 /login 으로 리다이렉트한다.
 * Server Component, Server Action 어디서나 호출할 수 있다.
 */
export async function requireManager(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return ctx;
}

// -------------------------------------------------------------- 매장 스코프

/**
 * storeId 컬럼을 가진 모델(Consultation, Quote, Contract, InventoryItem, Manager ...)
 * 의 목록 조회에 그대로 spread 한다.
 *
 *   prisma.quote.findMany({ where: { ...scopeToStore(ctx), status: "DRAFT" } })
 *
 * HQ 는 빈 객체를 받아 전 매장을 조회한다.
 */
export function scopeToStore(ctx: AuthContext): { storeId?: string } {
  return ctx.isHQ ? {} : { storeId: ctx.manager.storeId };
}

/**
 * Customer 는 storeId 컬럼이 없다. 해당 매장에서 상담 이력이 있는 고객으로 좁힌다.
 *
 *   prisma.customer.findMany({ where: { ...scopeCustomerToStore(ctx), mergedIntoId: null } })
 *
 * 신규 워크인 고객 검색처럼 의도적으로 전역 조회가 필요한 경로에서는 쓰지 않는다.
 */
export function scopeCustomerToStore(ctx: AuthContext): {
  consultations?: { some: { storeId: string } };
} {
  return ctx.isHQ ? {} : { consultations: { some: { storeId: ctx.manager.storeId } } };
}

/** 단건 리소스의 매장 소유권 확인. 목록이 아닌 상세 조회/변경 경로에서 사용한다. */
export function canAccessStore(ctx: AuthContext, storeId: string): boolean {
  return ctx.isHQ || ctx.manager.storeId === storeId;
}

/** 단건 리소스 접근 거부 시 404 를 던진다 (타 매장 존재 여부를 노출하지 않기 위함). */
export async function assertStoreAccess(ctx: AuthContext, storeId: string): Promise<void> {
  if (!canAccessStore(ctx, storeId)) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
}
