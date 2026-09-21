"use server";

import { redirect } from "next/navigation";
import { requireManager } from "./auth";
import { prisma } from "./prisma";

/** 오픈 리다이렉트 방지 — 앱 내부 경로만 허용한다. */
function safeReturnTo(value: FormDataEntryValue | null): string {
  const raw = typeof value === "string" ? value : "";
  // "//" 나 "/\" 로 시작하면 브라우저가 스킴 상대 URL로 해석해 외부 사이트로 보낼 수 있다.
  const isSafe = raw.startsWith("/") && (raw.length === 1 || (raw[1] !== "/" && raw[1] !== "\\"));
  return isSafe ? raw : "/compare";
}

function withFeedback(path: string, value: string): string {
  const [pathname, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.set("compare", value);
  return `${pathname}?${params.toString()}`;
}

/**
 * 수정 가능한 비교함만 돌려준다.
 * 저장된 비교(savedAt != null)는 상담 이력에 붙은 스냅샷이라 변경을 막는다.
 */
async function editableComparison(managerId: string, comparisonId: string) {
  return prisma.comparison.findFirst({
    where: { id: comparisonId, managerId, savedAt: null },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function removeFromComparisonAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const comparisonId = String(formData.get("comparisonId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const returnTo = safeReturnTo(formData.get("returnTo"));

  const comparison = await editableComparison(ctx.manager.id, comparisonId);
  if (!comparison) redirect(withFeedback(returnTo, "locked"));

  await prisma.comparisonItem.deleteMany({ where: { comparisonId, productId } });
  redirect(withFeedback(returnTo, "removed"));
}

/** 견적 대상 체크/해제 (PRD §4 "비교 결과에서 견적 대상 상품 선택"). */
export async function toggleQuoteCandidateAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const comparisonId = String(formData.get("comparisonId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const returnTo = safeReturnTo(formData.get("returnTo"));

  const comparison = await editableComparison(ctx.manager.id, comparisonId);
  if (!comparison) redirect(withFeedback(returnTo, "locked"));

  const item = comparison.items.find((entry) => entry.productId === productId);
  if (!item) redirect(withFeedback(returnTo, "invalid"));

  await prisma.comparisonItem.update({
    where: { id: item.id },
    data: { isQuoteCandidate: !item.isQuoteCandidate },
  });
  redirect(withFeedback(returnTo, item.isQuoteCandidate ? "unpicked" : "picked"));
}

export async function clearComparisonAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const comparisonId = String(formData.get("comparisonId") ?? "");
  const returnTo = safeReturnTo(formData.get("returnTo"));

  const comparison = await editableComparison(ctx.manager.id, comparisonId);
  if (!comparison) redirect(withFeedback(returnTo, "locked"));

  await prisma.comparisonItem.deleteMany({ where: { comparisonId } });
  redirect(withFeedback(returnTo, "cleared"));
}

/**
 * P1 — 비교 결과 저장 및 상담이력 연계.
 *
 * savedAt 을 채우면 그 비교함은 스냅샷이 되어 더 이상 수정되지 않고,
 * 다음 "비교함에 추가" 가 새 비교함을 연다 (catalog.openComparison 규칙).
 * consultationId 가 주어지면 그 상담의 고객도 함께 묶어 둔다.
 */
export async function saveComparisonAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const comparisonId = String(formData.get("comparisonId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const consultationId = String(formData.get("consultationId") ?? "").trim();
  const returnTo = safeReturnTo(formData.get("returnTo"));

  const comparison = await editableComparison(ctx.manager.id, comparisonId);
  if (!comparison) redirect(withFeedback(returnTo, "locked"));
  if (comparison.items.length === 0) redirect(withFeedback(returnTo, "empty"));

  let customerId: string | null = null;
  if (consultationId) {
    // 상담은 매장 스코프 안에서만 연결한다 (타 매장 상담에 비교 결과를 붙이지 못하게).
    const consultation = await prisma.consultation.findFirst({
      where: {
        id: consultationId,
        ...(ctx.isHQ ? {} : { storeId: ctx.manager.storeId }),
      },
      select: { id: true, customerId: true },
    });
    if (!consultation) redirect(withFeedback(returnTo, "no-consultation"));
    customerId = consultation.customerId;
  }

  await prisma.comparison.update({
    where: { id: comparison.id },
    data: {
      savedAt: new Date(),
      title: title || null,
      consultationId: consultationId || null,
      customerId,
    },
  });
  redirect(withFeedback("/compare", "saved"));
}

/**
 * 저장된 비교를 새 비교함으로 복제해 다시 편집한다.
 * 저장본 자체는 상담 이력의 스냅샷이므로 건드리지 않는다.
 */
export async function reopenComparisonAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const comparisonId = String(formData.get("comparisonId") ?? "");

  const source = await prisma.comparison.findFirst({
    where: { id: comparisonId, managerId: ctx.manager.id },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) redirect(withFeedback("/compare", "invalid"));

  // 열려있는 비교함이 있으면 비우고 재사용한다 — 매니저당 열린 비교함은 항상 1개다.
  const open = await prisma.comparison.findFirst({
    where: { managerId: ctx.manager.id, savedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const target =
    open ?? (await prisma.comparison.create({ data: { managerId: ctx.manager.id } }));
  await prisma.comparisonItem.deleteMany({ where: { comparisonId: target.id } });

  await prisma.comparisonItem.createMany({
    data: source.items.map((item, index) => ({
      comparisonId: target.id,
      productId: item.productId,
      sortOrder: index,
      isQuoteCandidate: item.isQuoteCandidate,
    })),
  });
  redirect(withFeedback("/compare", "reopened"));
}
