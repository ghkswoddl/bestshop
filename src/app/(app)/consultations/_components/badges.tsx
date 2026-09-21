import { Badge, Notice, type BadgeTone } from "@/components/ui";
import {
  FOLLOW_UP_URGENCY_LABEL,
  type FollowUpState,
  type TimelineKind,
} from "@/lib/consultations";
import {
  CONSULTATION_STAGE_LABEL,
  FOLLOW_UP_TYPE_LABEL,
  type ConsultationStage,
  type FollowUpType,
} from "@/lib/enums";
import type { ConsultationNotice } from "@/lib/consultation-actions";

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

const URGENCY_TONE: Record<FollowUpState["urgency"], BadgeTone> = {
  OVERDUE: "error",
  SOON: "warning",
  UPCOMING: "neutral",
  DONE: "success",
  CANCELLED: "neutral",
};

export function FollowUpBadge({ state }: { state: FollowUpState }) {
  return (
    <Badge
      tone={URGENCY_TONE[state.urgency]}
      showIcon={state.urgency === "OVERDUE" || state.urgency === "SOON"}
    >
      {FOLLOW_UP_URGENCY_LABEL[state.urgency]} · {state.label}
    </Badge>
  );
}

export function FollowUpTypeBadge({ type }: { type: string }) {
  const known = (type in FOLLOW_UP_TYPE_LABEL ? type : "OTHER") as FollowUpType;
  return (
    <Badge tone="neutral" showIcon={false}>
      {FOLLOW_UP_TYPE_LABEL[known]}
    </Badge>
  );
}

const TIMELINE_TONE: Record<TimelineKind, BadgeTone> = {
  CONSULTATION: "neutral",
  NOTE: "neutral",
  QUOTE: "info",
  PAYMENT: "info",
  CONTRACT: "success",
  SIGNATURE: "success",
  ORDER: "info",
  DELIVERY: "success",
  INSTALL: "success",
  FOLLOW_UP: "warning",
};

const TIMELINE_LABEL: Record<TimelineKind, string> = {
  CONSULTATION: "상담",
  NOTE: "메모",
  QUOTE: "견적",
  PAYMENT: "결제",
  CONTRACT: "계약",
  SIGNATURE: "서명",
  ORDER: "주문",
  DELIVERY: "배송",
  INSTALL: "설치",
  FOLLOW_UP: "후속",
};

export function TimelineBadge({ kind }: { kind: TimelineKind }) {
  return (
    <Badge tone={TIMELINE_TONE[kind]} showIcon={false}>
      {TIMELINE_LABEL[kind]}
    </Badge>
  );
}

const NOTICE_TEXT: Record<ConsultationNotice, { tone: BadgeTone; message: string }> = {
  "note-added": { tone: "success", message: "상담 메모를 등록했습니다." },
  "note-updated": { tone: "success", message: "상담 메모를 수정했습니다." },
  "note-removed": { tone: "success", message: "상담 메모를 삭제했습니다." },
  closed: { tone: "success", message: "상담을 종료했습니다." },
  "summary-saved": { tone: "success", message: "상담 요약을 저장했습니다." },
  "followup-added": { tone: "success", message: "후속조치를 등록했습니다." },
  "followup-done": { tone: "success", message: "후속조치를 완료 처리했습니다." },
  "followup-cancelled": { tone: "success", message: "후속조치를 취소했습니다." },
  "already-closed": {
    tone: "warning",
    message: "이미 종료된 상담입니다. 단계는 뒤로 되돌릴 수 없습니다.",
  },
  "bad-input": { tone: "error", message: "입력값을 확인해 주세요." },
  "not-author": {
    tone: "error",
    message: "메모는 작성한 매니저만 수정·삭제할 수 있습니다.",
  },
};

export function ConsultationNoticeBanner({ notice }: { notice: string | undefined }) {
  if (!notice || !(notice in NOTICE_TEXT)) return null;
  const { tone, message } = NOTICE_TEXT[notice as ConsultationNotice];
  return (
    <Notice tone={tone} className="mb-lg">
      {message}
    </Notice>
  );
}
