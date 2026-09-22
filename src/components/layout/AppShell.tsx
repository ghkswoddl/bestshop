"use client";

import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { SidebarProvider, useSidebar } from "./SidebarContext";

function Overlay() {
  const { open, setOpen } = useSidebar();
  if (!open) return null;
  return (
    <button
      type="button"
      aria-label="메뉴 닫기"
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-40 bg-black/50 lg:hidden"
    />
  );
}

/** 인증 후 화면 전체를 감싸는 셸. 사이드바 열림 상태를 Header 의 햄버거 버튼과 공유한다. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden bg-gray-100">
        <Overlay />
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </SidebarProvider>
  );
}
