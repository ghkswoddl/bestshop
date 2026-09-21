import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AlertTriangleIcon, CheckCircleIcon, DotIcon, InfoIcon, XCircleIcon } from "./icons";
import type { InventoryStatus } from "@/lib/enums";
import { INVENTORY_STATUS_LABEL } from "@/lib/enums";

export type BadgeTone = "success" | "warning" | "error" | "info" | "neutral";

/** 톤별 배경/테두리/글자색. Notice 등 다른 상태 표시 컴포넌트가 재사용한다. */
export const TONE_CLASS: Record<BadgeTone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  // text-warning 토큰(#E8A317)은 bg-warning/10 위에서 WCAG AA 명도 대비를 못 채워 더 어두운
  // 값으로 내렸다. 토큰과 다르다고 되돌리지 말 것 — design-system §7 대비 기준 때문에 의도적이다.
  warning: "border-warning/40 bg-warning/10 text-[#8A6100]",
  error: "border-error/30 bg-error/10 text-error",
  info: "border-info/30 bg-info/10 text-info",
  neutral: "border-gray-200 bg-gray-100 text-gray-700",
};

const TONE_ICON: Record<BadgeTone, (props: { className?: string }) => ReactNode> = {
  success: CheckCircleIcon,
  warning: AlertTriangleIcon,
  error: XCircleIcon,
  info: InfoIcon,
  neutral: DotIcon,
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** design-system §7 — 상태를 색상만으로 전달하지 않기 위해 기본 노출. */
  showIcon?: boolean;
}

export function Badge({
  tone = "neutral",
  showIcon = true,
  className,
  children,
  ...props
}: BadgeProps) {
  const Icon = TONE_ICON[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-xs whitespace-nowrap rounded-control border px-sm py-xs text-caption font-medium",
        TONE_CLASS[tone],
        className,
      )}
      {...props}
    >
      {showIcon && <Icon className="shrink-0" />}
      {children}
    </span>
  );
}

const INVENTORY_TONE: Record<InventoryStatus, BadgeTone> = {
  IN_STOCK: "success",
  LOW_STOCK: "warning",
  OUT_OF_STOCK: "error",
  // 미취급(이 매장에 재고 행 자체가 없음)과 판매중지(단종 등 편집상 중단)는 서로 다른 상태라
  // 색상도 구분한다 — neutral 을 공유하면 텍스트로만 구분되어 "서로 다른 배지 색상" 기준을 못 채운다.
  NOT_CARRIED: "neutral",
  SALE_STOPPED: "info",
};

export function InventoryBadge({ status }: { status: InventoryStatus }) {
  return <Badge tone={INVENTORY_TONE[status]}>{INVENTORY_STATUS_LABEL[status]}</Badge>;
}
