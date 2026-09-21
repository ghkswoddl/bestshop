"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireManager, scopeToStore } from "./auth";
import type { AuthContext } from "./auth";
import { isConsultationTerminal } from "./consultations";
import { FOLLOW_UP_TYPE, type FollowUpType } from "./enums";
import { prisma } from "./prisma";

export type ConsultationNotice =
  | "note-added"
  | "note-updated"
  | "note-removed"
  | "closed"
  | "summary-saved"
  | "followup-added"
  | "followup-done"
  | "followup-cancelled"
  | "already-closed"
  | "bad-input"
  | "not-author";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value === "" ? null : value;
}

function optionalDate(formData: FormData, key: string): Date | null {
  const value = text(formData, key);
  if (!value) return null;
  const date = new Date(value.length <= 10 ? `${value}T18:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function back(consultationId: string, notice: ConsultationNotice): never {
  redirect(`/consultations/${consultationId}?consultation=${notice}`);
}

/** 상담에는 storeId 컬럼이 있으므로 scopeToStore 를 그대로 쓴다. */
async function openConsultation(ctx: AuthContext, consultationId: string) {
  const consultation = await prisma.consultation.findFirst({
    where: { id: consultationId, ...scopeToStore(ctx) },
    select: { id: true, stage: true, customerId: true },
  });
  if (!consultation) notFound();
  return consultation;
}

// -------------------------------------------------------------- 상담 메모

export async function addConsultationNoteAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const consultationId = text(formData, "consultationId");
  await openConsultation(ctx, consultationId);

  const content = text(formData, "content");
  if (!content) back(consultationId, "bad-input");

  await prisma.consultationNote.create({
    data: { consultationId, managerId: ctx.manager.id, content },
  });

  revalidatePath(`/consultations/${consultationId}`);
  back(consultationId, "note-added");
}

/** 메모는 작성자만 고칠 수 있다 — 남의 상담 기록을 대신 고쳐 쓰면 이력의 의미가 없다. */
export async function updateConsultationNoteAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const consultationId = text(formData, "consultationId");
  await openConsultation(ctx, consultationId);

  const content = text(formData, "content");
  if (!content) back(consultationId, "bad-input");

  const note = await prisma.consultationNote.findFirst({
    where: { id: text(formData, "noteId"), consultationId },
    select: { id: true, managerId: true },
  });
  if (!note) notFound();
  if (note.managerId !== ctx.manager.id) back(consultationId, "not-author");

  await prisma.consultationNote.update({ where: { id: note.id }, data: { content } });

  revalidatePath(`/consultations/${consultationId}`);
  back(consultationId, "note-updated");
}

export async function deleteConsultationNoteAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const consultationId = text(formData, "consultationId");
  await openConsultation(ctx, consultationId);

  const note = await prisma.consultationNote.findFirst({
    where: { id: text(formData, "noteId"), consultationId },
    select: { id: true, managerId: true },
  });
  if (!note) notFound();
  if (note.managerId !== ctx.manager.id) back(consultationId, "not-author");

  await prisma.consultationNote.delete({ where: { id: note.id } });

  revalidatePath(`/consultations/${consultationId}`);
  back(consultationId, "note-removed");
}

// -------------------------------------------------------------- 상담 종료

/**
 * 상담 종료 (PRD §3 "상담 내용을 기록하고 종료").
 *
 * 판매로 이어지지 않은 상담을 매니저가 직접 닫는다 — 주문 완료로 자동 전이되는
 * `COMPLETED` 와 구분해 `CLOSED` 를 쓴다. 이미 종착 단계면 안내만 하고 아무것도 바꾸지 않는다.
 *
 * 다른 단계 전이(QUOTED/CONTRACTED/DELIVERING/COMPLETED)는 전부 부수적으로 일어나는 반면
 * 이것만 사용자가 명시적으로 누르는 전이라, 여기서는 조용히 무시하지 않고 결과를 알려 준다.
 */
export async function closeConsultationAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const consultationId = text(formData, "consultationId");
  const consultation = await openConsultation(ctx, consultationId);

  if (isConsultationTerminal(consultation.stage)) back(consultationId, "already-closed");

  await prisma.consultation.update({
    where: { id: consultation.id },
    data: {
      stage: "CLOSED",
      endedAt: new Date(),
      summary: optionalText(formData, "summary"),
    },
  });

  revalidatePath(`/consultations/${consultationId}`);
  revalidatePath("/consultations");
  back(consultationId, "closed");
}

/** 종료하지 않고 상담 요약만 저장한다. */
export async function saveConsultationSummaryAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const consultationId = text(formData, "consultationId");
  await openConsultation(ctx, consultationId);

  await prisma.consultation.update({
    where: { id: consultationId },
    data: { summary: optionalText(formData, "summary") },
  });

  revalidatePath(`/consultations/${consultationId}`);
  back(consultationId, "summary-saved");
}

// ------------------------------------------------------------ 후속조치 (P1)

export async function addFollowUpAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const consultationId = text(formData, "consultationId");
  const consultation = await openConsultation(ctx, consultationId);

  const dueAt = optionalDate(formData, "dueAt");
  if (!dueAt) back(consultationId, "bad-input");

  const typeInput = text(formData, "type");
  const type: FollowUpType = (FOLLOW_UP_TYPE as readonly string[]).includes(typeInput)
    ? (typeInput as FollowUpType)
    : "CALL";

  await prisma.followUp.create({
    data: {
      consultationId,
      customerId: consultation.customerId,
      managerId: ctx.manager.id,
      type,
      status: "PENDING",
      dueAt,
      content: optionalText(formData, "content"),
    },
  });

  revalidatePath(`/consultations/${consultationId}`);
  revalidatePath("/consultations");
  back(consultationId, "followup-added");
}

export async function completeFollowUpAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const consultationId = text(formData, "consultationId");
  await openConsultation(ctx, consultationId);

  // consultationId 를 조건에 함께 넣어 타 상담의 후속조치를 건드리지 못하게 한다.
  await prisma.followUp.updateMany({
    where: { id: text(formData, "followUpId"), consultationId, status: "PENDING" },
    data: { status: "DONE", completedAt: new Date() },
  });

  revalidatePath(`/consultations/${consultationId}`);
  revalidatePath("/consultations");
  back(consultationId, "followup-done");
}

export async function cancelFollowUpAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const consultationId = text(formData, "consultationId");
  await openConsultation(ctx, consultationId);

  await prisma.followUp.updateMany({
    where: { id: text(formData, "followUpId"), consultationId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });

  revalidatePath(`/consultations/${consultationId}`);
  revalidatePath("/consultations");
  back(consultationId, "followup-cancelled");
}
