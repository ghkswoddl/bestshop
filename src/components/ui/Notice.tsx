import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon, XCircleIcon } from "./icons";
import { TONE_CLASS, type BadgeTone } from "./Badge";

const TONE_ICON: Record<BadgeTone, (props: { className?: string }) => ReactNode> = {
  success: CheckCircleIcon,
  warning: AlertTriangleIcon,
  error: XCircleIcon,
  info: InfoIcon,
  neutral: InfoIcon,
};

/**
 * 화면 상단 인라인 알림. design-system §7 에 따라 색상 단독이 아니라 아이콘 + 문구를 함께 낸다.
 * 상태 변화를 보조기술에 전달하기 위해 role="status" 를 붙인다.
 */
export function Notice({
  tone = "info",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  const Icon = TONE_ICON[tone];
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-sm rounded-card border px-lg py-md text-body",
        TONE_CLASS[tone],
        className,
      )}
    >
      <Icon className="mt-xs shrink-0" />
      <div>{children}</div>
    </div>
  );
}
