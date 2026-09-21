"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireManager, scopeToStore } from "./auth";
import type { AuthContext } from "./auth";
import { prisma } from "./prisma";
import {
  canReplacePlan,
  computeSchedule,
  financeIneligibleReason,
  isPlanEditable,
} from "./payments";

// 액션 결과는 `?pay=` 로 되돌린다 (견적 쪽 `?quote=` 와 섞이지 않게 분리).
export type PaymentNotice =
  | "saved"
  | "approved"
  | "rejected"
  | "cancelled"
  | "no-product"
  | "ineligible"
  | "bad-downpayment"
  | "plan-locked"
  | "quote-locked";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nonNegativeInt(formData: FormData, key: string): number {
  const raw = text(formData, key).replace(/[,\s]/g, "");
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function back(quoteId: string, notice: PaymentNotice): never {
  redirect(`/quotes/${quoteId}/payment?pay=${notice}`);
}

/** 결제설계를 붙일 견적을 연다. 매장 밖이면 404. */
async function openQuote(ctx: AuthContext, quoteId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, ...scopeToStore(ctx) },
    select: { id: true, status: true, grandTotal: true },
  });
  if (!quote) notFound();
  return quote;
}

// ------------------------------------------------------------- 설계 저장

/**
 * 결제설계 저장 (P0).
 *
 * 처음 설계가 붙는 순간 견적을 `DRAFT` → `SENT` 로 올린다. 이후 견적 라인/비용 수정은
 * 기존 잠금 규칙(`isQuoteEditable`)이 그대로 막으므로, 저장된 `principal` 이 견적 총액과
 * 어긋날 수 없다. 단계는 앞으로만 간다 (`LOCKED`/`CONVERTED` 는 되돌리지 않는다).
 */
export async function savePaymentPlanAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const quoteId = text(formData, "quoteId");
  const quote = await openQuote(ctx, quoteId);

  const existing = await prisma.paymentPlan.findUnique({
    where: { quoteId },
    select: { id: true, status: true },
  });
  // 취소본 위에는 다시 설계할 수 있다. 승인·거절된 설계만 막는다.
  if (!canReplacePlan(existing)) back(quoteId, "plan-locked");

  // 견적이 계약 단계로 넘어갔으면 결제설계도 손대지 않는다.
  if (quote.status === "LOCKED" || quote.status === "CONVERTED" || quote.status === "CANCELLED") {
    back(quoteId, "quote-locked");
  }

  const financeProductId = text(formData, "financeProductId");
  if (!financeProductId) back(quoteId, "no-product");

  const product = await prisma.financeProduct.findUnique({ where: { id: financeProductId } });
  if (!product) notFound();
  if (financeIneligibleReason(product, quote.grandTotal)) back(quoteId, "ineligible");

  const downPayment = nonNegativeInt(formData, "downPayment");
  if (downPayment > quote.grandTotal) back(quoteId, "bad-downpayment");

  const schedule = computeSchedule(product, { principal: quote.grandTotal, downPayment });

  await prisma.$transaction(async (tx) => {
    await tx.paymentPlan.upsert({
      where: { quoteId },
      update: {
        financeProductId: product.id,
        principal: schedule.principal,
        downPayment: schedule.downPayment,
        months: schedule.months,
        monthlyAmount: schedule.monthlyAmount,
        lastMonthAmount: schedule.lastMonthAmount,
        interestTotal: schedule.interestTotal,
        totalPayable: schedule.totalPayable,
        status: "DRAFT",
        approvalCode: null,
        failureReason: null,
      },
      create: {
        quoteId,
        financeProductId: product.id,
        principal: schedule.principal,
        downPayment: schedule.downPayment,
        months: schedule.months,
        monthlyAmount: schedule.monthlyAmount,
        lastMonthAmount: schedule.lastMonthAmount,
        interestTotal: schedule.interestTotal,
        totalPayable: schedule.totalPayable,
        status: "DRAFT",
      },
    });

    if (quote.status === "DRAFT") {
      await tx.quote.update({ where: { id: quoteId }, data: { status: "SENT" } });
    }
  });

  revalidatePath(`/quotes/${quoteId}`);
  back(quoteId, "saved");
}

// ------------------------------------------------------------- 승인 (모의)

/**
 * P1 결제 승인 결과 조회 및 실패 사유 표시.
 *
 * 실제 결제 게이트웨이 연동은 범위 밖이므로(계획 §1 의 전자서명과 같은 성격) 매니저가
 * 승인/거절 결과를 직접 기록하는 모의 구현이다. 승인번호는 생성하되 어디에도 조회하러
 * 가지 않는다 — 화면에도 '모의 승인' 이라고 적어 둔다.
 */
export async function decidePaymentPlanAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const quoteId = text(formData, "quoteId");
  await openQuote(ctx, quoteId);

  const plan = await prisma.paymentPlan.findUnique({
    where: { quoteId },
    select: { id: true, status: true },
  });
  if (!plan) notFound();
  if (!isPlanEditable(plan)) back(quoteId, "plan-locked");

  const approved = text(formData, "decision") === "approve";
  const reason = text(formData, "failureReason");

  await prisma.paymentPlan.update({
    where: { id: plan.id },
    data: approved
      ? {
          status: "APPROVED",
          approvalCode: `AP-${randomBytes(4).toString("hex").toUpperCase()}`,
          failureReason: null,
        }
      : {
          status: "REJECTED",
          approvalCode: null,
          failureReason: reason || "승인 거절 (사유 미기재)",
        },
  });

  revalidatePath(`/quotes/${quoteId}`);
  back(quoteId, approved ? "approved" : "rejected");
}

// ------------------------------------------------------------- 설계 취소

/**
 * 결제설계 취소. 견적을 `SENT` → `DRAFT` 로 되돌려 다시 편집할 수 있게 한다.
 *
 * 견적이 `SENT` 로 올라간 이유가 바로 이 결제설계이므로, 원인을 거두면 결과도 거둔다.
 * 그렇게 하지 않으면 잘못 누른 결제설계 하나 때문에 멀쩡한 견적이 영구히 잠겨 새 버전을
 * 뜨는 것 말고는 길이 없다. 계약이 걸린 `LOCKED`/`CONVERTED` 는 절대 되돌리지 않는다.
 */
export async function cancelPaymentPlanAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const quoteId = text(formData, "quoteId");
  const quote = await openQuote(ctx, quoteId);

  const plan = await prisma.paymentPlan.findUnique({
    where: { quoteId },
    select: { id: true },
  });
  if (!plan) notFound();

  await prisma.$transaction(async (tx) => {
    await tx.paymentPlan.update({
      where: { id: plan.id },
      data: { status: "CANCELLED", approvalCode: null },
    });
    if (quote.status === "SENT") {
      await tx.quote.update({ where: { id: quoteId }, data: { status: "DRAFT" } });
    }
  });

  revalidatePath(`/quotes/${quoteId}`);
  back(quoteId, "cancelled");
}
