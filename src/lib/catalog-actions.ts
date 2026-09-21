"use server";

import { redirect } from "next/navigation";
import { requireManager } from "./auth";
import { prisma } from "./prisma";
import { COMPARISON_LIMIT, openComparison } from "./catalog";
import { deriveStock } from "./inventory";

/** 오픈 리다이렉트 방지 — 앱 내부 경로만 허용한다. */
function safeReturnTo(value: FormDataEntryValue | null): string {
  const raw = typeof value === "string" ? value : "";
  // "//" 나 "/\" 로 시작하면 브라우저가 스킴 상대 URL로 해석해 외부 사이트로 보낼 수 있다.
  const isSafe = raw.startsWith("/") && (raw.length === 1 || (raw[1] !== "/" && raw[1] !== "\\"));
  return isSafe ? raw : "/products";
}

function withFeedback(path: string, key: string, value: string): string {
  const [pathname, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.set(key, value);
  return `${pathname}?${params.toString()}`;
}

/** 상품탐색/상품상세의 "비교함에 추가". Phase 4 가 이 비교함을 이어받는다. */
export async function addToComparisonAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const productId = String(formData.get("productId") ?? "");
  const returnTo = safeReturnTo(formData.get("returnTo"));
  if (!productId) redirect(withFeedback(returnTo, "compare", "invalid"));

  const comparison = await openComparison(ctx.manager.id);

  if (comparison.items.some((item) => item.productId === productId)) {
    redirect(withFeedback(returnTo, "compare", "exists"));
  }
  if (comparison.items.length >= COMPARISON_LIMIT) {
    redirect(withFeedback(returnTo, "compare", "full"));
  }

  await prisma.comparisonItem.create({
    data: { comparisonId: comparison.id, productId, sortOrder: comparison.items.length },
  });
  redirect(withFeedback(returnTo, "compare", "added"));
}

/**
 * P1 매장 간 상품 이동 요청 생성 (REQUESTED 상태까지만).
 *
 * **재고 수량은 건드리지 않는다.** 실제 차감/예약은 Phase 8 이 계약 트랜잭션에서
 * 조건부 updateMany 로 처리한다. 여기서는 요청 레코드만 남긴다.
 */
export async function createTransferRequestAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const productId = String(formData.get("productId") ?? "");
  const fromStoreId = String(formData.get("fromStoreId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);
  const returnTo = safeReturnTo(formData.get("returnTo"));

  if (!productId || !fromStoreId || !Number.isInteger(quantity) || quantity < 1) {
    redirect(withFeedback(returnTo, "transfer", "invalid"));
  }
  if (fromStoreId === ctx.manager.storeId) {
    redirect(withFeedback(returnTo, "transfer", "same-store"));
  }

  // 요청 시점의 출고 매장 가용수량 확인. 승인 시점에 다시 확인해야 하는 참고값이다.
  const [source, product] = await Promise.all([
    prisma.inventoryItem.findUnique({
      where: { productId_storeId: { productId, storeId: fromStoreId } },
    }),
    prisma.product.findUnique({ where: { id: productId }, select: { status: true } }),
  ]);
  if (!product) redirect(withFeedback(returnTo, "transfer", "invalid"));

  const view = deriveStock(source, product.status);
  if (view.available < quantity) {
    redirect(withFeedback(returnTo, "transfer", "insufficient"));
  }

  await prisma.transferRequest.create({
    data: {
      productId,
      fromStoreId,
      toStoreId: ctx.manager.storeId,
      quantity,
      status: "REQUESTED",
      requestedById: ctx.manager.id,
      note: String(formData.get("note") ?? "") || null,
    },
  });
  redirect(withFeedback(returnTo, "transfer", "requested"));
}
