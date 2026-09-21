import type { ReactNode } from "react";

export interface HeaderProps {
  title: ReactNode;
  /** Phase 1의 세션에서 주입된다. 그 전까지는 비워둔다. */
  managerName?: string;
  storeName?: string;
  actions?: ReactNode;
}

export function Header({ title, managerName, storeName, actions }: HeaderProps) {
  return (
    <header className="print:hidden flex h-16 shrink-0 items-center justify-between gap-lg border-b border-gray-200 bg-white px-xl">
      <h1 className="text-h1 text-gray-900">{title}</h1>
      <div className="flex items-center gap-lg">
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
