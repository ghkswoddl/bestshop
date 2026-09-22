import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { requireManager } from "@/lib/auth";

// 인증 후 셸. 비로그인 요청은 requireManager()가 /login 으로 리다이렉트한다.
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireManager();

  return <AppShell>{children}</AppShell>;
}
