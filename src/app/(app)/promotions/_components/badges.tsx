import { Badge, type BadgeTone } from "@/components/ui";
import { PROMOTION_PHASE_LABEL, type PromotionFlags, type PromotionPhase } from "@/lib/promotions";

const PHASE_TONE: Record<PromotionPhase, BadgeTone> = {
  ACTIVE: "success",
  UPCOMING: "info",
  EXPIRED: "neutral",
  DRAFT: "neutral",
  CANCELLED: "error",
};

export function PhaseBadge({ phase }: { phase: PromotionPhase }) {
  return <Badge tone={PHASE_TONE[phase]}>{PROMOTION_PHASE_LABEL[phase]}</Badge>;
}

/** P1 파생 알림 배지 — 저장된 알림이 아니라 조회 시점 계산값이다. */
export function AlertBadges({ flags }: { flags: PromotionFlags }) {
  if (!flags.isNew && !flags.isEndingSoon) {
    return <span className="text-caption text-gray-400">-</span>;
  }
  return (
    <span className="flex flex-wrap gap-xs">
      {flags.isNew && <Badge tone="info">신규</Badge>}
      {flags.isEndingSoon && (
        <Badge tone="warning">
          {flags.daysUntilEnd === 0 ? "오늘 종료" : `D-${flags.daysUntilEnd} 종료임박`}
        </Badge>
      )}
    </span>
  );
}
