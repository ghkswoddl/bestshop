import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { requireManager } from "@/lib/auth";

// 인증 후 셸. 비로그인 요청은 requireManager()가 /login 으로 리다이렉트한다.
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireManager();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
