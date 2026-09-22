"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireManager, scopeToStore } from "./auth";
import {
  buildCustomerSnapshot,
  buildDeliveryAddressSnapshot,
  buildFinanceSnapshot,
  currentSignatureRequest,
  newSignatureToken,
  nextContractNo,
  nextOrderNo,
  signatureExpiry,
  signatureState,
} from "./contracts";
import { advanceConsultationStage } from "./consultations";
import { newTrackingToken } from "./orders";
import { prisma } from "./prisma";

export type ContractNotice =
  | "created"
  | "resent"
  | "amended"
  | "cancelled"
  | "signed"
  | "quote-not-sent"
  | "plan-not-approved"
  | "out-of-stock"
  | "already-contracted"
  | "busy"
  | "cannot-cancel"
  | "nothing-to-resend"
  | "bad-amount";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value === "" ? null : value;
}

function nonNegativeInt(formData: FormData, key: string): number {
  const raw = text(formData, key).replace(/[,\s]/g, "");
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * 트랜잭션 안에서 던져 롤백을 일으키는 실패. 이미 차감된 재고까지 전부 되돌린다.
 * `redirect()` 를 트랜잭션/try 안에서 부르면 그 예외가 롤백·catch 에 먹히므로,
 * 실패는 값으로 들고 나와 바깥에서 리다이렉트한다.
 */
class ContractFailure extends Error {
  constructor(
    readonly notice: ContractNotice,
    readonly detail?: string,
  ) {
    super(notice);
  }
}

function back(path: string, notice: ContractNotice, detail?: string): never {
  const query = new URLSearchParams({ contract: notice });
  if (detail) query.set("detail", detail);
  redirect(`${path}?${query.toString()}`);
}

/**
 * 실제 동시성 방어는 (b)의 조건부 `updateMany` 자체다 — DB 종류와 무관하게 항상 정확하다.
 * 이 함수는 그 위에 얹는 방어적 재시도 신호일 뿐이다. `P2034` 는 Prisma 가 쓰기 충돌 시
 * 모든 드라이버 공통으로 내는 코드라 Postgres 에서도 그대로 유효하다. 정규식 쪽은
 * SQLite 전용 에러 문자열이라 Postgres 에서는 매치되지 않는다 — 해가 되진 않지만 죽은 코드.
 */
function isBusyError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : "";
  return code === "P2034" || /SQLITE_BUSY|database is locked|write lock/i.test(message);
}

// ------------------------------------------------------------ 계약 생성

/**
 * 계약 생성 — 이 Phase 의 핵심. 계획 §6 최상위 리스크(견적→계약→결제→배송 정합성)를
 * 단일 트랜잭션으로 막는다.
 *
 * 순서: 견적 상태 재확인 → **재고 조건부 차감** → 계약 생성 → 견적 LOCKED →
 * 상담 단계 전진 → 서명 요청 생성. 하나라도 실패하면 전부 롤백되므로,
 * "재고는 빠졌는데 계약이 없는" 중간 상태가 존재할 수 없다.
 *
 * 재고 차감은 반드시 `updateMany(where: { quantity: { gte } })` 의 **조건부 업데이트**로만
 * 한다. 읽고 나서 쓰면 두 매니저가 마지막 1대를 동시에 계약할 수 있다 (계획 §6).
 */
export async function createContractAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const quoteId = text(formData, "quoteId");
  const quotePath = `/quotes/${quoteId}`;

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, ...scopeToStore(ctx) },
    include: { items: { include: { product: { select: { name: true } } } }, customer: true },
  });
  if (!quote) notFound();

  if (quote.status !== "SENT") {
    back(quotePath, quote.status === "LOCKED" || quote.status === "CONVERTED" ? "already-contracted" : "quote-not-sent");
  }

  const plan = await prisma.paymentPlan.findUnique({
    where: { quoteId },
    include: { financeProduct: true },
  });
  if (!plan || plan.status !== "APPROVED") back(quotePath, "plan-not-approved");

  const productNames = new Map(quote.items.map((item) => [item.productId, item.product.name]));

  let contractId: string;
  try {
    contractId = await prisma.$transaction(async (tx) => {
      // (a) 견적 상태를 트랜잭션 안에서 다시 본다 — 그 사이 다른 요청이 계약했을 수 있다.
      const fresh = await tx.quote.findUnique({
        where: { id: quoteId },
        include: { items: true },
      });
      if (!fresh) throw new ContractFailure("quote-not-sent");
      if (fresh.status !== "SENT") throw new ContractFailure("already-contracted");

      // (b) 재고 조건부 차감. count 가 1 이 아니면 그 품목은 재고가 모자란다.
      for (const item of fresh.items) {
        const result = await tx.inventoryItem.updateMany({
          where: {
            productId: item.productId,
            storeId: fresh.storeId,
            quantity: { gte: item.qty },
          },
          data: { quantity: { decrement: item.qty } },
        });
        if (result.count !== 1) {
          throw new ContractFailure("out-of-stock", productNames.get(item.productId) ?? item.productId);
        }
      }

      // (c) 계약 생성. 금액과 조건은 전부 이 시점 스냅샷이다.
      const contract = await tx.contract.create({
        data: {
          contractNo: await nextContractNo(tx, ctx.store.code),
          quoteId: fresh.id,
          customerId: fresh.customerId,
          managerId: ctx.manager.id,
          storeId: fresh.storeId,
          status: "PENDING_SIGNATURE",
          customerSnapshotJson: JSON.stringify(buildCustomerSnapshot(quote.customer)),
          deliveryAddressSnapshotJson: JSON.stringify(buildDeliveryAddressSnapshot(quote.customer)),
          financeSnapshotJson: JSON.stringify(buildFinanceSnapshot(plan)),
          totalAmount: plan.totalPayable,
        },
        select: { id: true },
      });

      // (d) 견적 잠금. 이 시점부터 Phase 6 의 모든 쓰기 액션이 거부된다.
      await tx.quote.update({ where: { id: fresh.id }, data: { status: "LOCKED" } });

      // (e) 상담 단계 전진 (앞으로만 — 이미 배송/완료로 간 상담은 되돌리지 않는다).
      await advanceConsultationStage(tx, fresh.consultationId, "CONTRACTED");

      // (f) 서명 요청. 계약이 서명 요청 없이 존재하는 순간이 없도록 같은 트랜잭션에서 만든다.
      await tx.signatureRequest.create({
        data: {
          contractId: contract.id,
          token: newSignatureToken(),
          status: "SENT",
          expiresAt: signatureExpiry(),
        },
      });

      return contract.id;
    });
  } catch (error) {
    if (error instanceof ContractFailure) back(quotePath, error.notice, error.detail);
    if (isBusyError(error)) back(quotePath, "busy");
    // quoteId unique 위반 = 같은 견적으로 이미 계약이 있다.
    if ((error as { code?: string })?.code === "P2002") back(quotePath, "already-contracted");
    throw error;
  }

  revalidatePath("/contracts");
  revalidatePath(quotePath);
  redirect(`/contracts/${contractId}?contract=created`);
}

// ------------------------------------------------------------ 서명 요청 재전송

/**
 * P1 계약서 재전송.
 *
 * 아직 살아 있는 링크면 같은 요청의 `sentCount` 만 올린다 (같은 링크를 다시 보낸 것).
 * 만료·무효 상태면 새 토큰으로 **새 요청 행**을 만들고 이전 요청은 이력으로 남긴다.
 */
export async function resendSignatureAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const contractId = text(formData, "contractId");
  const path = `/contracts/${contractId}`;

  const contract = await prisma.contract.findFirst({
    where: { id: contractId, ...scopeToStore(ctx) },
    include: { signatureRequests: { orderBy: { requestedAt: "desc" } } },
  });
  if (!contract) notFound();
  if (contract.status === "SIGNED" || contract.status === "CANCELLED") {
    back(path, "nothing-to-resend");
  }

  const current = currentSignatureRequest(contract);
  const state = current ? signatureState(current) : null;

  if (current && state?.isSignable) {
    await prisma.signatureRequest.update({
      where: { id: current.id },
      data: { sentCount: { increment: 1 }, status: "SENT" },
    });
  } else {
    await prisma.$transaction(async (tx) => {
      if (current) {
        await tx.signatureRequest.update({
          where: { id: current.id },
          data: {
            status: "INVALIDATED",
            invalidatedAt: new Date(),
            invalidatedReason: "재전송으로 새 링크 발급",
          },
        });
      }
      await tx.signatureRequest.create({
        data: {
          contractId: contract.id,
          token: newSignatureToken(),
          status: "SENT",
          expiresAt: signatureExpiry(),
        },
      });
    });
  }

  revalidatePath(path);
  back(path, "resent");
}

// ------------------------------------------------------------ 계약 변경 / 취소

/** 살아 있는 서명 요청을 전부 무효화한다. 금액이 바뀌면 반드시 호출한다. */
async function invalidateOpenSignatures(
  tx: Prisma.TransactionClient,
  contractId: string,
  reason: string,
): Promise<void> {
  await tx.signatureRequest.updateMany({
    where: { contractId, status: { notIn: ["SIGNED", "INVALIDATED"] } },
    data: { status: "INVALIDATED", invalidatedAt: new Date(), invalidatedReason: reason },
  });
}

/**
 * P1 계약 변경. 배송지와 계약금액을 고칠 수 있다.
 *
 * **금액이 바뀌면 살아 있는 서명 요청을 자동으로 무효화한다** (계획 수용기준). 고객이
 * 옛 금액이 적힌 링크로 서명하는 일을 막기 위해서다. 배송지만 바뀌면 금액이 그대로이므로
 * 기존 링크를 유지한다.
 */
export async function amendContractAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const contractId = text(formData, "contractId");
  const path = `/contracts/${contractId}`;

  const contract = await prisma.contract.findFirst({
    where: { id: contractId, ...scopeToStore(ctx) },
    select: { id: true, status: true, totalAmount: true, deliveryAddressSnapshotJson: true },
  });
  if (!contract) notFound();
  if (contract.status === "SIGNED" || contract.status === "CANCELLED") {
    back(path, "cannot-cancel");
  }

  const totalAmount = nonNegativeInt(formData, "totalAmount");
  if (totalAmount <= 0) back(path, "bad-amount");

  const amountChanged = totalAmount !== contract.totalAmount;
  const snapshot = {
    address: optionalText(formData, "address"),
    addressDetail: optionalText(formData, "addressDetail"),
    recipientName: text(formData, "recipientName"),
    recipientPhone: text(formData, "recipientPhone"),
  };

  await prisma.$transaction(async (tx) => {
    await tx.contract.update({
      where: { id: contract.id },
      data: {
        totalAmount,
        deliveryAddressSnapshotJson: JSON.stringify(snapshot),
        status: "CHANGED",
      },
    });
    if (amountChanged) {
      await invalidateOpenSignatures(tx, contract.id, "계약 금액 변경으로 무효화");
      await tx.signatureRequest.create({
        data: {
          contractId: contract.id,
          token: newSignatureToken(),
          status: "SENT",
          expiresAt: signatureExpiry(),
        },
      });
    }
  });

  revalidatePath(path);
  back(path, "amended");
}

/**
 * P1 계약 취소. 차감했던 재고를 되돌리고 서명 요청을 무효화한다.
 *
 * 배송이 시작된 뒤에는 취소하지 않는다 — 주문이 `PLACED` 를 벗어났으면 거부한다.
 * (주문 상태 전이 자체는 Phase 9 의 책임이다.)
 */
export async function cancelContractAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const contractId = text(formData, "contractId");
  const path = `/contracts/${contractId}`;

  const contract = await prisma.contract.findFirst({
    where: { id: contractId, ...scopeToStore(ctx) },
    include: { quote: { include: { items: true } }, order: true },
  });
  if (!contract) notFound();
  if (contract.status === "CANCELLED") back(path, "cannot-cancel");
  if (contract.order && contract.order.status !== "PLACED") back(path, "cannot-cancel");

  await prisma.$transaction(async (tx) => {
    // 차감했던 만큼 되돌린다. 계약 생성 시 전 품목이 성공했으므로 전 품목을 복원한다.
    for (const item of contract.quote.items) {
      await tx.inventoryItem.updateMany({
        where: { productId: item.productId, storeId: contract.storeId },
        data: { quantity: { increment: item.qty } },
      });
    }

    await invalidateOpenSignatures(tx, contract.id, "계약 취소");

    if (contract.order) {
      await tx.order.update({ where: { id: contract.order.id }, data: { status: "CANCELLED" } });
    }

    await tx.contract.update({
      where: { id: contract.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: optionalText(formData, "cancelReason") ?? "사유 미기재",
      },
    });

    // 계약이 취소되면 상담도 취소로 닫는다 (팀리드 결정, Phase 10a).
    await advanceConsultationStage(tx, contract.quote.consultationId, "CANCELLED");
  });

  revalidatePath(path);
  revalidatePath("/contracts");
  back(path, "cancelled");
}

// ------------------------------------------------------------ 전자서명 (공개)

/**
 * 고객 서명 제출 — **인증 없는 공개 경로** (`/sign/[token]`).
 *
 * 접근 제어는 32바이트 난수 토큰의 소지다 (계획 §1: 고객 로그인 없음). 매장 스코프를
 * 걸지 않는 것은 누락이 아니라 이 경로의 설계다.
 *
 * 서명이 성립하면 같은 트랜잭션에서 `Order` 와 `OrderItem` 을 만든다 — "계약 완료 결과
 * 저장" 의 실체이며, Phase 9 는 견적/계약을 몰라도 주문에서 시작할 수 있다.
 */
export async function signContractAction(formData: FormData): Promise<void> {
  const token = text(formData, "token");
  const path = `/sign/${token}`;

  const request = await prisma.signatureRequest.findUnique({
    where: { token },
    include: {
      contract: {
        include: { quote: { include: { items: true } }, store: { select: { code: true } } },
      },
    },
  });
  if (!request) notFound();

  // 만료·무효·이미 서명됨은 화면이 먼저 막지만, 폼을 직접 POST 하는 경우도 막는다.
  if (!signatureState(request).isSignable) redirect(path);

  const signerName = text(formData, "signerName");
  const signatureImage = text(formData, "signatureImage");
  if (!signerName || !signatureImage.startsWith("data:image/")) redirect(`${path}?error=1`);

  const { contract } = request;

  await prisma.$transaction(async (tx) => {
    const signedAt = new Date();

    await tx.signatureRequest.update({
      where: { id: request.id },
      data: { status: "SIGNED", signedAt, signatureImage, signerName },
    });

    await tx.contract.update({
      where: { id: contract.id },
      data: { status: "SIGNED", signedAt },
    });

    await tx.quote.update({ where: { id: contract.quoteId }, data: { status: "CONVERTED" } });

    await tx.order.create({
      data: {
        orderNo: await nextOrderNo(tx, contract.store.code),
        contractId: contract.id,
        status: "PLACED",
        // 고객 안내용 공개 추적 링크(`/track/[token]`)는 주문과 함께 발급된다 (Phase 9).
        publicTrackingToken: newTrackingToken(),
        items: {
          create: contract.quote.items.map((item) => ({
            productId: item.productId,
            quoteItemId: item.id,
            qty: item.qty,
            unitPrice: item.unitPriceSnapshot,
            lineTotal: item.lineTotal,
          })),
        },
      },
    });
  });

  revalidatePath(`/contracts/${contract.id}`);
  redirect(`${path}?signed=1`);
}
