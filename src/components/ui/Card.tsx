import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** 카드 제목 (design-system §3 H3) */
  title?: ReactNode;
  action?: ReactNode;
  /** true 면 내부 padding 을 제거해 테이블 등을 가장자리까지 붙인다. */
  flush?: boolean;
}

export function Card({ title, action, flush, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-gray-200 bg-white shadow-card",
        !flush && "p-lg",
        className,
      )}
      {...props}
    >
      {(title || action) && (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-md",
            flush && "px-lg pt-lg",
          )}
        >
          {title ? <h3 className="text-h3 text-gray-900">{title}</h3> : <span />}
          {action}
        </div>
      )}
      <div className={cn((title || action) && "mt-md")}>{children}</div>
    </div>
  );
}

export function CardGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid grid-cols-12 gap-lg", className)} {...props} />;
}
