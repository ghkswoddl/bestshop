"use client";

import type { ReactNode } from "react";
import { MenuIcon } from "@/components/ui/icons";
import { useSidebar } from "./SidebarContext";

export interface HeaderProps {
  title: ReactNode;
  /** Phase 1의 세션에서 주입된다. 그 전까지는 비워둔다. */
  managerName?: string;
  storeName?: string;
  actions?: ReactNode;
}

/**
 * `lg` 미만에서는 고정 높이(h-16)를 포기하고 자유롭게 줄바꿈한다 — 제목 옆에 액션 버튼이
 * 여러 개 붙는 화면(계약/서명 등)이 한 줄에 다 안 들어가면 잘리는 대신 다음 줄로 넘어간다.
 */
export function Header({ title, managerName, storeName, actions }: HeaderProps) {
  const { setOpen } = useSidebar();

  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-md border-b border-gray-200 bg-white px-lg py-sm print:hidden lg:h-16 lg:flex-nowrap lg:gap-lg lg:px-xl lg:py-0">
      <div className="flex min-w-0 items-center gap-sm">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="메뉴 열기"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-gray-700 hover:bg-gray-100 lg:hidden"
        >
          <MenuIcon />
        </button>
        <h1 className="truncate text-h2 text-gray-900 lg:text-h1">{title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-md lg:flex-nowrap lg:gap-lg">
        {actions}
        {(managerName || storeName) && (
          <div className="text-right">
            <p className="text-body font-semibold text-gray-900">{managerName}</p>
            <p className="text-caption text-gray-700">{storeName}</p>
          </div>
        )}
      </div>
    </header>
  );
}
