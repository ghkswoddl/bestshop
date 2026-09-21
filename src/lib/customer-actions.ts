"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireManager, scopeToStore } from "./auth";
import type { AuthContext } from "./auth";
import { customerMutationAccessWhere } from "./customers";
import { normalizePhone } from "./phone";
import { prisma } from "./prisma";
import { CONSULTATION_CHANNEL, type ConsultationChannel } from "./enums";
import type { FormState } from "./form-state";

// ------------------------------------------------------------------- 유틸

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
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function optionalInt(formData: FormData, key: string): number | null {
  const value = text(formData, key).replace(/[,\s]/g, "");
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 이 매니저가 접근할 수 있는 고객인지 확인한다. 아니면 404 (타 매장 존재 여부를 숨긴다). */
async function assertCustomerAccess(ctx: AuthContext, customerId: string): Promise<void> {
  const found = await prisma.customer.findFirst({
    where: { AND: [{ id: customerId }, customerMutationAccessWhere(ctx)] },
    select: { id: true },
  });
  if (!found) notFound();
}

// ------------------------------------------------------------------- 고객

export async function createCustomerAction(formData: FormData): Promise<FormState> {
  const ctx = await requireManager();

  const name = text(formData, "name");
  const phone = text(formData, "phone");
  if (!name) return { error: "고객명을 입력해 주세요." };

  const phoneNormalized = normalizePhone(phone);
  if (phoneNormalized.length < 9) return { error: "휴대폰번호를 정확히 입력해 주세요." };

  const memberNo = optionalText(formData, "memberNo")?.toUpperCase() ?? null;
  if (memberNo) {
    const taken = await prisma.customer.findUnique({ where: { memberNo }, select: { id: true } });
    if (taken) return { error: `이미 사용 중인 회원번호입니다: ${memberNo}` };
  }

  const created = await prisma.customer.create({
    data: {
      name,
      phone,
      phoneNormalized,
      memberNo,
      birthDate: optionalDate(formData, "birthDate"),
      address: optionalText(formData, "address"),
      addressDetail: optionalText(formData, "addressDetail"),
      email: optionalText(formData, "email"),
      note: optionalText(formData, "note"),
      registeredByStoreId: ctx.store.id,
    },
    select: { id: true },
  });

  redirect(`/customers/${created.id}`);
}

export async function updateCustomerAction(formData: FormData): Promise<FormState> {
  const ctx = await requireManager();
  const customerId = text(formData, "customerId");
  await assertCustomerAccess(ctx, customerId);

  const name = text(formData, "name");
  const phone = text(formData, "phone");
  if (!name) return { error: "고객명을 입력해 주세요." };

  const phoneNormalized = normalizePhone(phone);
  if (phoneNormalized.length < 9) return { error: "휴대폰번호를 정확히 입력해 주세요." };

  const memberNo = optionalText(formData, "memberNo")?.toUpperCase() ?? null;
  if (memberNo) {
    const taken = await prisma.customer.findUnique({ where: { memberNo }, select: { id: true } });
    if (taken && taken.id !== customerId) {
      return { error: `이미 사용 중인 회원번호입니다: ${memberNo}` };
    }
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      name,
      phone,
      phoneNormalized,
      memberNo,
      birthDate: optionalDate(formData, "birthDate"),
      address: optionalText(formData, "address"),
      addressDetail: optionalText(formData, "addressDetail"),
      email: optionalText(formData, "email"),
    },
  });

  revalidatePath(`/customers/${customerId}`);
  return { error: null, ok: true };
}

export async function saveCustomerNoteAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const customerId = text(formData, "customerId");
  await assertCustomerAccess(ctx, customerId);

  await prisma.customer.update({
    where: { id: customerId },
    data: { note: optionalText(formData, "note") },
  });
  revalidatePath(`/customers/${customerId}`);
}

// ---------------------------------------------------------------- 보유가전

export async function saveApplianceAction(formData: FormData): Promise<FormState> {
  const ctx = await requireManager();
  const customerId = text(formData, "customerId");
  await assertCustomerAccess(ctx, customerId);

  const categoryId = text(formData, "categoryId");
  const modelName = text(formData, "modelName");
  if (!categoryId) return { error: "품목을 선택해 주세요." };
  if (!modelName) return { error: "모델명을 입력해 주세요." };

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  if (!category) return { error: "알 수 없는 품목입니다." };

  const purchasePrice = optionalInt(formData, "purchasePrice");
  if (purchasePrice != null && purchasePrice < 0) {
    return { error: "구매가격은 0원 이상이어야 합니다." };
  }

  const data = {
    categoryId,
    modelName,
    brand: text(formData, "brand") || "LG",
    purchasedAt: optionalDate(formData, "purchasedAt"),
    purchasePrice,
    note: optionalText(formData, "note"),
  };

  const applianceId = text(formData, "applianceId");
  if (applianceId) {
    const existing = await prisma.ownedAppliance.findFirst({
      where: { id: applianceId, customerId },
      select: { id: true },
    });
    if (!existing) notFound();
    await prisma.ownedAppliance.update({ where: { id: applianceId }, data });
  } else {
    await prisma.ownedAppliance.create({ data: { ...data, customerId } });
  }

  revalidatePath(`/customers/${customerId}`);
  return { error: null, ok: true };
}

export async function deleteApplianceAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const customerId = text(formData, "customerId");
  await assertCustomerAccess(ctx, customerId);

  // customerId 를 조건에 함께 넣어 타 고객의 레코드를 지울 수 없게 한다.
  await prisma.ownedAppliance.deleteMany({
    where: { id: text(formData, "applianceId"), customerId },
  });
  revalidatePath(`/customers/${customerId}`);
}

// -------------------------------------------------------------------- 상담

/** 고객조회만으로는 상담이 생기지 않는다 (계획 §1). 매니저가 이 액션을 눌러야 생성된다. */
export async function startConsultationAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const customerId = text(formData, "customerId");
  await assertCustomerAccess(ctx, customerId);

  const channelInput = text(formData, "channel");
  const channel = (CONSULTATION_CHANNEL as readonly string[]).includes(channelInput)
    ? (channelInput as ConsultationChannel)
    : "VISIT";

  await prisma.consultation.create({
    data: {
      customerId,
      managerId: ctx.manager.id,
      storeId: ctx.store.id,
      stage: "IN_PROGRESS",
      channel,
    },
  });

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
}

export async function addConsultationNoteAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const consultationId = text(formData, "consultationId");
  const content = text(formData, "content");
  if (!content) return;

  const consultation = await prisma.consultation.findFirst({
    where: { id: consultationId, ...scopeToStore(ctx) },
    select: { customerId: true },
  });
  if (!consultation) notFound();

  await prisma.consultationNote.create({
    data: { consultationId, managerId: ctx.manager.id, content },
  });
  revalidatePath(`/customers/${consultation.customerId}`);
}

// --------------------------------------------------------- 검색조건 저장 (P1)

export async function saveSearchAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const name = text(formData, "name");
  if (!name) return;

  const params = {
    q: text(formData, "q"),
    consultation: text(formData, "consultation") || "all",
    sort: text(formData, "sort") || "recent",
  };

  await prisma.savedSearch.upsert({
    where: { managerId_scope_name: { managerId: ctx.manager.id, scope: "CUSTOMER", name } },
    update: { paramsJson: JSON.stringify(params) },
    create: {
      managerId: ctx.manager.id,
      scope: "CUSTOMER",
      name,
      paramsJson: JSON.stringify(params),
    },
  });

  revalidatePath("/customers");
}

export async function deleteSavedSearchAction(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  await prisma.savedSearch.deleteMany({
    where: { id: text(formData, "savedSearchId"), managerId: ctx.manager.id },
  });
  revalidatePath("/customers");
}
