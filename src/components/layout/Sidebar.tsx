"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { CloseIcon } from "@/components/ui/icons";
import { NAV_ITEMS } from "./nav";
import { useSidebar } from "./SidebarContext";

/**
 * `lg`(1024px) 이상에서는 항상 보이는 고정 사이드바. 그 아래에서는 `open` 상태에 따라
 * 화면 밖으로 밀려나 있다가(`-translate-x-full`) 열리는 오버레이 드로어가 된다 — 레이아웃을
 * 밀어내지 않도록 `fixed` 로 띄운다. 배경 오버레이/햄버거 버튼은 `AppShell`/`Header` 가 맡는다.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { open, setOpen } = useSidebar();

  return (
    <nav
      aria-label="주요 메뉴"
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex h-full w-60 shrink-0 flex-col border-r border-gray-200 bg-white transition-transform duration-200",
        "lg:static lg:z-auto lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex h-16 items-center justify-between gap-sm border-b border-gray-200 px-lg">
        <span className="text-h3 font-bold text-lg-red">LG Bestshop</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="메뉴 닫기"
          className="flex h-10 w-10 items-center justify-center rounded-control text-gray-700 hover:bg-gray-100 lg:hidden"
        >
          <CloseIcon />
        </button>
      </div>
      <ul className="flex flex-1 flex-col gap-xs overflow-y-auto p-md">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex h-10 items-center rounded-control px-md text-body transition-colors",
                  active
                    ? "bg-lg-red-light font-semibold text-lg-red"
                    : "text-gray-700 hover:bg-gray-100",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
