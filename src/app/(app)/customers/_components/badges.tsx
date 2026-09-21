import { Badge, type BadgeTone } from "@/components/ui";
import {
  CONSENT_TYPE,
  CONSENT_TYPE_LABEL,
  CONSULTATION_STAGE_LABEL,
  type ConsentType,
  type ConsultationStage,
} from "@/lib/enums";
import type { ReplacementLevel } from "@/lib/customers";

const STAGE_TONE: Record<ConsultationStage, BadgeTone> = {
  IN_PROGRESS: "info",
  QUOTED: "info",
  CONTRACTED: "success",
  DELIVERING: "warning",
  COMPLETED: "success",
  CLOSED: "neutral",
  CANCELLED: "neutral",
};

export function StageBadge({ stage }: { stage: string }) {
  const known = (stage in STAGE_TONE ? stage : "IN_PROGRESS") as ConsultationStage;
  return <Badge tone={STAGE_TONE[known]}>{CONSULTATION_STAGE_LABEL[known]}</Badge>;
}

const REPLACEMENT_TONE: Record<ReplacementLevel, BadgeTone> = {
  OVERDUE: "error",
  DUE_SOON: "warning",
  OK: "neutral",
  UNKNOWN: "neutral",
};

export function ReplacementBadge({ level, label }: { level: ReplacementLevel; label: string }) {
  return (
    <Badge tone={REPLACEMENT_TONE[level]} showIcon={level === "OVERDUE" || level === "DUE_SOON"}>
      {label}
    </Badge>
  );
}

export interface ConsentRow {
  type: string;
  granted: boolean;
  revokedAt: Date | null;
}

/** 동의하지 않은 항목도 '미동의'로 함께 노출한다 — 누락과 거절을 구분해야 하기 때문. */
export function ConsentBadges({ consents }: { consents: ConsentRow[] }) {
  const byType = new Map(consents.map((c) => [c.type, c]));
  return (
    <div className="flex flex-wrap gap-sm">
      {CONSENT_TYPE.map((type: ConsentType) => {
        const row = byType.get(type);
        const revoked = row?.revokedAt != null;
        const granted = row?.granted === true && !revoked;
        return (
          <Badge key={type} tone={granted ? "success" : revoked ? "error" : "neutral"}>
            {CONSENT_TYPE_LABEL[type]} {granted ? "동의" : revoked ? "철회" : "미동의"}
          </Badge>
        );
      })}
    </div>
  );
}
