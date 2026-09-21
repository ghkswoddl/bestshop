"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NAV_ITEMS } from "./nav";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="주요 메뉴"
      className="flex h-full w-60 shrink-0 flex-col border-r border-gray-200 bg-white"
    >
      <div className="flex h-16 items-center gap-sm border-b border-gray-200 px-lg">
        <span className="text-h3 font-bold text-lg-red">LG Bestshop</span>
      </div>
      <ul className="flex flex-1 flex-col gap-xs overflow-y-auto p-md">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
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
