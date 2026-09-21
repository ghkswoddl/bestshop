"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireManager } from "./auth";
import type { AuthContext } from "./auth";
import { advanceConsultationStage, consultationIdForOrder } from "./consultations";
import { prisma } from "./prisma";
import {
  canCompleteInstall,
  canTransitionDelivery,
  canTransitionInstall,
  orderProgress,
  orderScope,
} from "./orders";
import { DELIVERY_STATUS, INSTALL_STATUS } from "./enums";

export type DeliveryNotice =
  | "job-created"
  | "status-changed"
  | "rescheduled"
  | "invalid-transition"
  | "install-blocked"
  | "bad-input"
  | "order-cancelled";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value === "" ? null : value;
}

/** `<input type="datetime-local">` 값. 비어 있으면 일정 미정. */
function optionalDateTime(formData: FormData, key: string): Date | null {
  const value = text(formData, key);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function back(orderId: string, notice: DeliveryNotice, detail?: string): never {
  const query = new URLSearchParams({ delivery: notice });
  if (detail) query.set("detail", detail);
  redirect(`/deliveries/${orderId}?${query.toString()}`);
}

/** 매장 스코프 확인. Order 에 storeId 가 없으므로 계약을 통해 좁힌다. */
async function openOrder(ctx: AuthContext, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, ...orderScope(ctx) },
    include: { deliveryJobs: true, installJobs: true },
  });
  if (!order) notFound();
  return order;
}

/**
 * 작업 상태가 바뀔 때마다 주문 전체 상태를 다시 파생해 저장한다.
 *
 * `Order.status` 는 작업들에서 계산되는 캐시다 — Phase 6 의 견적 합계와 같은 관계다.
 * 진실은 언제나 작업 쪽에 있고, 이 함수가 컬럼을 거기에 맞춘다.
 */
async function syncOrderStatus(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { deliveryJobs: true, installJobs: true },
  });
  if (order.status === "CANCELLED") return;

  const progress = orderProgress(order);
  const completedAt = progress.status === "COMPLETED" ? (order.completedAt ?? new Date()) : null;

  if (order.status !== progress.status || order.completedAt?.getTime() !== completedAt?.getTime()) {
    await tx.order.update({
      where: { id: orderId },
      data: { status: progress.status, completedAt },
    });
  }

  // 주문이 움직이면 상담 단계도 따라 전진한다 (앞으로만, 종착에서는 움직이지 않음).
  // PLACED 를 벗어나면 배송 단계에 들어선 것이고, 전부 끝나면 상담도 완료다.
  if (progress.status !== "PLACED") {
    const consultationId = await consultationIdForOrder(tx, orderId);
    await advanceConsultationStage(
      tx,
      consultationId,
      progress.status === "COMPLETED" ? "COMPLETED" : "DELIVERING",
    );
  }
}

// ------------------------------------------------------------- 작업 생성

export async function createDeliveryJobAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const orderId = text(formData, "orderId");
  const order = await openOrder(ctx, orderId);
  if (order.status === "CANCELLED") back(orderId, "order-cancelled");

  // orderItemId 가 비면 주문 전체를 덮는 작업이다. 값이 있으면 이 주문의 품목이어야 한다.
  const orderItemId = optionalText(formData, "orderItemId");
  if (orderItemId) {
    const owned = await prisma.orderItem.findFirst({
      where: { id: orderItemId, orderId },
      select: { id: true },
    });
    if (!owned) notFound();
  }

  await prisma.$transaction(async (tx) => {
    await tx.deliveryJob.create({
      data: {
        orderId,
        orderItemId,
        status: "SCHEDULED",
        scheduledAt: optionalDateTime(formData, "scheduledAt"),
        carrier: optionalText(formData, "carrier"),
        trackingNo: optionalText(formData, "trackingNo"),
        address: optionalText(formData, "address"),
        note: optionalText(formData, "note"),
      },
    });
    await syncOrderStatus(tx, orderId);
  });

  revalidatePath(`/deliveries/${orderId}`);
  back(orderId, "job-created");
}

export async function createInstallJobAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const orderId = text(formData, "orderId");
  const order = await openOrder(ctx, orderId);
  if (order.status === "CANCELLED") back(orderId, "order-cancelled");

  const orderItemId = optionalText(formData, "orderItemId");
  if (orderItemId) {
    const owned = await prisma.orderItem.findFirst({
      where: { id: orderItemId, orderId },
      select: { id: true },
    });
    if (!owned) notFound();
  }

  // 같은 품목의 배송 작업이 있으면 자동으로 이어 붙여 둔다 — 설치 완료 선행조건 판정이 명확해진다.
  const linkedDelivery = orderItemId
    ? (order.deliveryJobs.find((job) => job.orderItemId === orderItemId) ?? null)
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.installJob.create({
      data: {
        orderId,
        orderItemId,
        deliveryJobId: linkedDelivery?.id ?? null,
        status: "SCHEDULED",
        scheduledAt: optionalDateTime(formData, "scheduledAt"),
        technicianName: optionalText(formData, "technicianName"),
        note: optionalText(formData, "note"),
      },
    });
    await syncOrderStatus(tx, orderId);
  });

  revalidatePath(`/deliveries/${orderId}`);
  back(orderId, "job-created");
}

// ------------------------------------------------------------- 상태 전이

/**
 * 배송 상태 전이. 전이표에 없는 이동은 서버에서 거부한다 — 화면 버튼과 무관하게,
 * 폼을 직접 POST 해도 막힌다.
 */
export async function advanceDeliveryAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const orderId = text(formData, "orderId");
  await openOrder(ctx, orderId);

  const jobId = text(formData, "jobId");
  const next = text(formData, "status");
  if (!(DELIVERY_STATUS as readonly string[]).includes(next)) back(orderId, "bad-input");

  const job = await prisma.deliveryJob.findFirst({
    where: { id: jobId, orderId },
    select: { id: true, status: true },
  });
  if (!job) notFound();

  if (!canTransitionDelivery(job.status, next)) {
    back(orderId, "invalid-transition", `${job.status} → ${next}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.deliveryJob.update({
      where: { id: job.id },
      data: {
        status: next,
        completedAt: next === "DELIVERED" ? new Date() : null,
      },
    });
    await syncOrderStatus(tx, orderId);
  });

  revalidatePath(`/deliveries/${orderId}`);
  back(orderId, "status-changed");
}

/**
 * 설치 상태 전이.
 *
 * 전이표 통과에 더해, **COMPLETED 는 대응하는 배송이 완료되어 있어야 한다** (계획 §4
 * "설치가 배송보다 먼저 완료되는 등 불가능한 전이 차단"). 판정은 `canCompleteInstall` 하나에
 * 모여 있고, 거부 사유를 그대로 화면에 되돌린다.
 */
export async function advanceInstallAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const orderId = text(formData, "orderId");
  const order = await openOrder(ctx, orderId);

  const jobId = text(formData, "jobId");
  const next = text(formData, "status");
  if (!(INSTALL_STATUS as readonly string[]).includes(next)) back(orderId, "bad-input");

  const job = order.installJobs.find((row) => row.id === jobId);
  if (!job) notFound();

  if (!canTransitionInstall(job.status, next)) {
    back(orderId, "invalid-transition", `${job.status} → ${next}`);
  }

  if (next === "COMPLETED") {
    const rejection = canCompleteInstall(job, order.deliveryJobs);
    if (rejection) back(orderId, "install-blocked", rejection.reason);
  }

  await prisma.$transaction(async (tx) => {
    await tx.installJob.update({
      where: { id: job.id },
      data: {
        status: next,
        completedAt: next === "COMPLETED" ? new Date() : null,
      },
    });
    await syncOrderStatus(tx, orderId);
  });

  revalidatePath(`/deliveries/${orderId}`);
  back(orderId, "status-changed");
}

// --------------------------------------------------------- 일정 변경 (P1)

/**
 * P1 일정 변경 + 이력 기록. `scheduledAt` 을 조용히 덮어쓰지 않고 `ScheduleChange` 를 남긴다.
 * 종료된 작업의 일정은 바꾸지 않는다.
 */
export async function rescheduleJobAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const orderId = text(formData, "orderId");
  await openOrder(ctx, orderId);

  const kind = text(formData, "kind");
  const jobId = text(formData, "jobId");
  const newScheduledAt = optionalDateTime(formData, "scheduledAt");
  if (!newScheduledAt) back(orderId, "bad-input");

  const reason = optionalText(formData, "reason");

  if (kind === "delivery") {
    const job = await prisma.deliveryJob.findFirst({
      where: { id: jobId, orderId },
      select: { id: true, status: true, scheduledAt: true },
    });
    if (!job) notFound();
    if (job.status === "DELIVERED" || job.status === "CANCELLED") {
      back(orderId, "invalid-transition", `${job.status} 상태의 배송 일정은 변경할 수 없습니다`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.scheduleChange.create({
        data: {
          deliveryJobId: job.id,
          previousScheduledAt: job.scheduledAt,
          newScheduledAt,
          reason,
          changedById: ctx.manager.id,
        },
      });
      await tx.deliveryJob.update({
        where: { id: job.id },
        // 실패한 배송의 일정을 다시 잡으면 예정 상태로 되돌린다 — 유일하게 허용되는 후진이고
        // 위에서 ScheduleChange 로 기록된다.
        data: {
          scheduledAt: newScheduledAt,
          ...(job.status === "FAILED" ? { status: "SCHEDULED" } : {}),
        },
      });
      await syncOrderStatus(tx, orderId);
    });
  } else {
    const job = await prisma.installJob.findFirst({
      where: { id: jobId, orderId },
      select: { id: true, status: true, scheduledAt: true },
    });
    if (!job) notFound();
    if (job.status === "COMPLETED" || job.status === "CANCELLED") {
      back(orderId, "invalid-transition", `${job.status} 상태의 설치 일정은 변경할 수 없습니다`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.scheduleChange.create({
        data: {
          installJobId: job.id,
          previousScheduledAt: job.scheduledAt,
          newScheduledAt,
          reason,
          changedById: ctx.manager.id,
        },
      });
      await tx.installJob.update({
        where: { id: job.id },
        data: {
          scheduledAt: newScheduledAt,
          ...(job.status === "FAILED" ? { status: "SCHEDULED" } : {}),
        },
      });
      await syncOrderStatus(tx, orderId);
    });
  }

  revalidatePath(`/deliveries/${orderId}`);
  back(orderId, "rescheduled");
}
