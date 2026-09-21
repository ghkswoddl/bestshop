"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireManager, scopeToStore } from "./auth";
import type { AuthContext } from "./auth";
import { advanceConsultationStage } from "./consultations";
import { customerAccessWhere } from "./customers";
import { prisma } from "./prisma";
import { computeQuoteTotals, isQuoteEditable, nextQuoteNo, priceLines } from "./quotes";

// 액션 결과는 Phase 3/4 와 같은 방식으로 쿼리스트링에 실어 되돌린다.
// 목록 행마다 useActionState 클라이언트 컴포넌트를 붙이지 않아도 되고 JS 없이 동작한다.
export type QuoteNotice =
  | "created"
  | "item-added"
  | "item-updated"
  | "item-removed"
  | "saved"
  | "repriced"
  | "forked"
  | "deleted"
  | "locked"
  | "no-customer"
  | "no-items"
  | "bad-qty"
  | "duplicate-item";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value === "" ? null : value;
}

/** 금액/수량 입력. 쉼표와 공백을 걷어내고 음수는 0 으로 막는다. */
function nonNegativeInt(formData: FormData, key: string, fallback = 0): number {
  const raw = text(formData, key).replace(/[,\s]/g, "");
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function optionalDate(formData: FormData, key: string): Date | null {
  const value = text(formData, key);
  if (!value) return null;
  const date = new Date(`${value}T23:59:59`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function back(path: string, notice: QuoteNotice): never {
  redirect(`${path}?quote=${notice}`);
}

/** 견적 합계를 라인에서 다시 계산해 저장한다. 라인/수수료가 바뀔 때마다 호출한다. */
async function recalculateQuote(tx: Prisma.TransactionClient, quoteId: string): Promise<void> {
  const quote = await tx.quote.findUniqueOrThrow({
    where: { id: quoteId },
    include: { items: true },
  });
  const totals = computeQuoteTotals(quote.items, {
    deliveryFee: quote.deliveryFee,
    installFee: quote.installFee,
  });
  await tx.quote.update({
    where: { id: quoteId },
    data: {
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      grandTotal: totals.grandTotal,
    },
  });
}

/**
 * 편집 대상 견적을 연다. 매장 밖이면 404, DRAFT 가 아니면 잠김 안내로 되돌린다.
 * 모든 쓰기 액션의 첫 줄에서 호출한다.
 */
async function openEditableQuote(ctx: AuthContext, quoteId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, ...scopeToStore(ctx) },
    select: { id: true, status: true, customerId: true },
  });
  if (!quote) notFound();
  if (!isQuoteEditable(quote)) back(`/quotes/${quote.id}`, "locked");
  return quote;
}

// ------------------------------------------------------------------ 생성

/**
 * 견적 생성. 고객과 초기 라인을 한 트랜잭션에 담는다.
 *
 * `/quotes/new` 는 GET 렌더에서 레코드를 만들지 않는다 (Phase 4 의 /compare 와 같은 규칙) —
 * 이 액션이 유일한 생성 경로라서 화면만 열고 나간 흔적이 DRAFT 로 쌓이지 않는다.
 */
export async function createQuoteAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();

  const customerId = text(formData, "customerId");
  if (!customerId) back("/quotes/new", "no-customer");

  const customer = await prisma.customer.findFirst({
    where: { AND: [{ id: customerId }, customerAccessWhere(ctx)] },
    select: { id: true },
  });
  if (!customer) notFound();

  const productIds = formData
    .getAll("productId")
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  if (productIds.length === 0) back(`/quotes/new?customerId=${customerId}`, "no-items");

  // 상품은 카탈로그 전역이지만 존재 확인은 해야 한다. 순서는 폼에 담긴 순서를 유지한다.
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, basePrice: true },
  });
  const priceById = new Map(products.map((product) => [product.id, product.basePrice]));
  const ordered = productIds.filter((id) => priceById.has(id));
  if (ordered.length === 0) back(`/quotes/new?customerId=${customerId}`, "no-items");

  const lines = await priceLines(
    ordered.map((productId) => ({
      productId,
      qty: 1,
      unitPriceSnapshot: priceById.get(productId) ?? 0,
    })),
  );
  const totals = computeQuoteTotals(lines, { deliveryFee: 0, installFee: 0 });

  // 상담이 넘어왔다면 매장 스코프 안에 있는지 확인한다. 밖이면 조용히 떼고 견적만 만든다.
  const requestedConsultationId = optionalText(formData, "consultationId");
  const consultation = requestedConsultationId
    ? await prisma.consultation.findFirst({
        where: { id: requestedConsultationId, customerId, ...scopeToStore(ctx) },
        select: { id: true, stage: true },
      })
    : null;

  const created = await prisma.$transaction(async (tx) => {
    const quote = await tx.quote.create({
      data: {
        quoteNo: await nextQuoteNo(tx, ctx.store.code),
        customerId,
        consultationId: consultation?.id ?? null,
        managerId: ctx.manager.id,
        storeId: ctx.store.id,
        status: "DRAFT",
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        grandTotal: totals.grandTotal,
        items: {
          create: lines.map((line, index) => ({
            productId: line.productId,
            qty: line.qty,
            unitPriceSnapshot: line.unitPriceSnapshot,
            discountAmount: line.discountAmount,
            appliedPromotionId: line.appliedPromotionId,
            appliedPromotionSnapshot: line.appliedPromotionSnapshot,
            lineTotal: line.lineTotal,
            sortOrder: index,
          })),
        },
      },
      select: { id: true },
    });

    // 견적이 처음 붙는 순간 상담 단계를 '견적'으로 올린다.
    // 전진 판정은 advanceConsultationStage 한 곳이 맡는다 (뒤로 가거나 종착에서 나가지 않음).
    await advanceConsultationStage(tx, consultation?.id, "QUOTED");

    return quote;
  });

  revalidatePath("/quotes");
  if (consultation) revalidatePath(`/customers/${customerId}`);
  redirect(`/quotes/${created.id}?quote=created`);
}

// ---------------------------------------------------------------- 라인 편집

export async function addQuoteItemAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const quote = await openEditableQuote(ctx, text(formData, "quoteId"));
  const productId = text(formData, "productId");

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, basePrice: true },
  });
  if (!product) notFound();

  const existing = await prisma.quoteItem.findFirst({
    where: { quoteId: quote.id, productId },
    select: { id: true },
  });
  if (existing) back(`/quotes/${quote.id}`, "duplicate-item");

  const [line] = await priceLines([
    { productId, qty: 1, unitPriceSnapshot: product.basePrice },
  ]);
  const last = await prisma.quoteItem.findFirst({
    where: { quoteId: quote.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.quoteItem.create({
      data: {
        quoteId: quote.id,
        productId: line.productId,
        qty: line.qty,
        unitPriceSnapshot: line.unitPriceSnapshot,
        discountAmount: line.discountAmount,
        appliedPromotionId: line.appliedPromotionId,
        appliedPromotionSnapshot: line.appliedPromotionSnapshot,
        lineTotal: line.lineTotal,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    await recalculateQuote(tx, quote.id);
  });

  back(`/quotes/${quote.id}`, "item-added");
}

/**
 * 수량/옵션 변경. 수량이 바뀌면 프로모션 조건(minQty/minAmount)의 충족 여부가 달라지므로
 * 그 라인의 프로모션을 다시 고른다. **단가 스냅샷은 건드리지 않는다.**
 */
export async function updateQuoteItemAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const quote = await openEditableQuote(ctx, text(formData, "quoteId"));

  const item = await prisma.quoteItem.findFirst({
    where: { id: text(formData, "itemId"), quoteId: quote.id },
    select: { id: true, productId: true, unitPriceSnapshot: true },
  });
  if (!item) notFound();

  const qty = nonNegativeInt(formData, "qty");
  if (qty < 1) back(`/quotes/${quote.id}`, "bad-qty");

  const [line] = await priceLines([
    { productId: item.productId, qty, unitPriceSnapshot: item.unitPriceSnapshot },
  ]);

  await prisma.$transaction(async (tx) => {
    await tx.quoteItem.update({
      where: { id: item.id },
      data: {
        qty,
        optionsJson: optionalText(formData, "options"),
        discountAmount: line.discountAmount,
        appliedPromotionId: line.appliedPromotionId,
        appliedPromotionSnapshot: line.appliedPromotionSnapshot,
        lineTotal: line.lineTotal,
      },
    });
    await recalculateQuote(tx, quote.id);
  });

  back(`/quotes/${quote.id}`, "item-updated");
}

export async function removeQuoteItemAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const quote = await openEditableQuote(ctx, text(formData, "quoteId"));

  await prisma.$transaction(async (tx) => {
    // quoteId 를 조건에 함께 넣어 타 견적의 라인을 지울 수 없게 한다.
    await tx.quoteItem.deleteMany({ where: { id: text(formData, "itemId"), quoteId: quote.id } });
    await recalculateQuote(tx, quote.id);
  });

  back(`/quotes/${quote.id}`, "item-removed");
}

// ------------------------------------------------------------- 견적 메타 저장

export async function updateQuoteMetaAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const quote = await openEditableQuote(ctx, text(formData, "quoteId"));

  await prisma.$transaction(async (tx) => {
    await tx.quote.update({
      where: { id: quote.id },
      data: {
        deliveryFee: nonNegativeInt(formData, "deliveryFee"),
        installFee: nonNegativeInt(formData, "installFee"),
        validUntil: optionalDate(formData, "validUntil"),
        memo: optionalText(formData, "memo"),
        templateName: optionalText(formData, "templateName"),
      },
    });
    await recalculateQuote(tx, quote.id);
  });

  back(`/quotes/${quote.id}`, "saved");
}

/**
 * 모든 라인의 프로모션을 현재 시점 기준으로 다시 적용한다.
 *
 * 견적을 며칠 묵혀 두면 작성 당시 붙은 프로모션이 끝나 있거나 더 나은 프로모션이 시작되어
 * 있을 수 있다. 자동으로 덮어쓰면 매니저가 모르는 사이 금액이 움직이므로 명시적 액션으로 둔다.
 * **단가 스냅샷은 여기서도 갱신하지 않는다** — 가격 스냅샷 원칙은 프로모션 재적용과 무관하다.
 */
export async function reapplyPromotionsAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const quote = await openEditableQuote(ctx, text(formData, "quoteId"));

  const items = await prisma.quoteItem.findMany({
    where: { quoteId: quote.id },
    select: { id: true, productId: true, qty: true, unitPriceSnapshot: true },
  });
  const lines = await priceLines(items);

  await prisma.$transaction(async (tx) => {
    for (const [index, line] of lines.entries()) {
      await tx.quoteItem.update({
        where: { id: items[index].id },
        data: {
          discountAmount: line.discountAmount,
          appliedPromotionId: line.appliedPromotionId,
          appliedPromotionSnapshot: line.appliedPromotionSnapshot,
          lineTotal: line.lineTotal,
        },
      });
    }
    await recalculateQuote(tx, quote.id);
  });

  back(`/quotes/${quote.id}`, "repriced");
}

// ---------------------------------------------------------------- 버전 분기

/**
 * 새 버전 만들기. 원본을 복제해 `parentQuoteId` 로 잇고 `version` 을 1 올린다.
 *
 * 라인은 **스냅샷을 그대로 복사한다.** 새 버전은 같은 협상의 연장이지 새 견적이 아니므로
 * 단가도 할인도 원본과 같은 상태에서 출발해야 비교가 된다. 현재 시점 프로모션으로 맞추고
 * 싶으면 새 DRAFT 에서 '프로모션 재적용' 을 누르면 된다.
 */
export async function forkQuoteAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();

  const source = await prisma.quote.findFirst({
    where: { id: text(formData, "quoteId"), ...scopeToStore(ctx) },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) notFound();

  const created = await prisma.$transaction(async (tx) => {
    // 새 버전은 새 금액이다. 원본에 붙어 있던 결제설계는 그 자리에서 무효화한다 —
    // 그대로 두면 어느 버전의 금액에 대한 설계인지가 모호해진다.
    await tx.paymentPlan.updateMany({
      where: { quoteId: source.id, status: { in: ["DRAFT", "APPROVED"] } },
      data: { status: "CANCELLED", approvalCode: null, failureReason: null },
    });

    return tx.quote.create({
      data: {
        quoteNo: await nextQuoteNo(tx, ctx.store.code),
        customerId: source.customerId,
        consultationId: source.consultationId,
        managerId: ctx.manager.id,
        storeId: source.storeId,
        status: "DRAFT",
        validUntil: source.validUntil,
        subtotal: source.subtotal,
        discountTotal: source.discountTotal,
        deliveryFee: source.deliveryFee,
        installFee: source.installFee,
        grandTotal: source.grandTotal,
        version: source.version + 1,
        parentQuoteId: source.id,
        templateName: null,
        memo: source.memo,
        items: {
          create: source.items.map((item) => ({
            productId: item.productId,
            qty: item.qty,
            optionsJson: item.optionsJson,
            unitPriceSnapshot: item.unitPriceSnapshot,
            discountAmount: item.discountAmount,
            appliedPromotionId: item.appliedPromotionId,
            appliedPromotionSnapshot: item.appliedPromotionSnapshot,
            lineTotal: item.lineTotal,
            sortOrder: item.sortOrder,
          })),
        },
      },
      select: { id: true },
    });
  });

  revalidatePath("/quotes");
  redirect(`/quotes/${created.id}?quote=forked`);
}

export async function deleteQuoteAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const quote = await openEditableQuote(ctx, text(formData, "quoteId"));

  // 자식 버전이 매달린 견적은 지우지 않는다 — 이력의 사슬이 끊긴다.
  const children = await prisma.quote.count({ where: { parentQuoteId: quote.id } });
  if (children > 0) back(`/quotes/${quote.id}`, "locked");

  await prisma.quote.delete({ where: { id: quote.id } });
  revalidatePath("/quotes");
  redirect("/quotes?quote=deleted");
}
