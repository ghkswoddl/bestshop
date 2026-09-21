"use server";

import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { createSession, destroySession, verifyPassword } from "./auth";

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const employeeNo = String(formData.get("employeeNo") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!employeeNo || !password) {
    return { error: "사번과 비밀번호를 입력하세요." };
  }

  const manager = await prisma.manager.findUnique({ where: { employeeNo } });
  // 사번 존재 여부를 구분해서 알려주지 않는다.
  const failure = { error: "사번 또는 비밀번호가 올바르지 않습니다." };
  if (!manager || !manager.active) return failure;
  if (!(await verifyPassword(password, manager.passwordHash))) return failure;

  await createSession(manager.id);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
