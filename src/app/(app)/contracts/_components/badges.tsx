import { Badge, Notice, type BadgeTone } from "@/components/ui";
import {
  CONTRACT_STATUS_LABEL,
  SIGNATURE_PHASE_LABEL,
  type SignatureState,
} from "@/lib/contracts";
import type { ContractStatus } from "@/lib/enums";
import type { ContractNotice } from "@/lib/contract-actions";

const CONTRACT_TONE: Record<ContractStatus, BadgeTone> = {
  DRAFT: "neutral",
  PENDING_SIGNATURE: "warning",
  SIGNED: "success",
  CHANGED: "info",
  CANCELLED: "neutral",
};

export function ContractStatusBadge({ status }: { status: string }) {
  const known = (status in CONTRACT_TONE ? status : "DRAFT") as ContractStatus;
  return <Badge tone={CONTRACT_TONE[known]}>{CONTRACT_STATUS_LABEL[known]}</Badge>;
}

const PHASE_TONE: Record<SignatureState["phase"], BadgeTone> = {
  SIGNABLE: "warning",
  SIGNED: "success",
  EXPIRED: "error",
  INVALIDATED: "neutral",
};

export function SignaturePhaseBadge({ state }: { state: SignatureState }) {
  return (
    <Badge tone={PHASE_TONE[state.phase]}>
      {SIGNATURE_PHASE_LABEL[state.phase]}
      {state.phase === "SIGNABLE" && state.expiresInDays != null
        ? ` (${state.expiresInDays}일 남음)`
        : ""}
    </Badge>
  );
}

const NOTICE_TEXT: Record<ContractNotice, { tone: BadgeTone; message: string }> = {
  created: {
    tone: "success",
    message: "계약을 생성했습니다. 재고가 차감되고 서명 요청이 만들어졌습니다.",
  },
  resent: { tone: "success", message: "서명 요청을 다시 보냈습니다." },
  amended: { tone: "success", message: "계약을 변경했습니다." },
  cancelled: {
    tone: "success",
    message: "계약을 취소했습니다. 차감했던 재고를 되돌렸습니다.",
  },
  signed: { tone: "success", message: "서명이 완료되었습니다." },
  "quote-not-sent": {
    tone: "error",
    message: "결제설계가 끝난 견적만 계약할 수 있습니다.",
  },
  "plan-not-approved": {
    tone: "error",
    message: "결제 승인이 완료되지 않았습니다. 결제 및 금융설계에서 승인 처리하세요.",
  },
  "out-of-stock": {
    tone: "error",
    message: "재고가 부족해 계약을 생성하지 못했습니다. 차감된 재고는 없습니다.",
  },
  "already-contracted": {
    tone: "warning",
    message: "이미 계약이 만들어진 견적입니다.",
  },
  busy: {
    tone: "warning",
    message: "다른 계약이 같은 재고를 처리 중입니다. 잠시 후 다시 시도하세요.",
  },
  "cannot-cancel": {
    tone: "error",
    message: "이 상태의 계약은 변경하거나 취소할 수 없습니다.",
  },
  "nothing-to-resend": {
    tone: "warning",
    message: "서명이 끝났거나 취소된 계약은 재전송할 수 없습니다.",
  },
  "bad-amount": { tone: "error", message: "계약금액은 1원 이상이어야 합니다." },
};

export function ContractNoticeBanner({
  notice,
  detail,
}: {
  notice: string | undefined;
  detail?: string;
}) {
  if (!notice || !(notice in NOTICE_TEXT)) return null;
  const { tone, message } = NOTICE_TEXT[notice as ContractNotice];
  return (
    <Notice tone={tone} className="mb-lg">
      {message}
      {detail && <span className="ml-sm font-semibold">({detail})</span>}
    </Notice>
  );
}
