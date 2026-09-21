import { Badge, Notice, type BadgeTone } from "@/components/ui";
import { QUOTE_STATUS_LABEL, type PaymentPlanStatus, type QuoteStatus } from "@/lib/enums";
import { PAYMENT_PLAN_STATUS_LABEL } from "@/lib/payments";
import type { QuoteValidity, QuoteValidityLevel } from "@/lib/quotes";
import type { QuoteNotice } from "@/lib/quote-actions";
import type { PaymentNotice } from "@/lib/payment-actions";

const STATUS_TONE: Record<QuoteStatus, BadgeTone> = {
  DRAFT: "info",
  SENT: "info",
  LOCKED: "success",
  CONVERTED: "success",
  EXPIRED: "neutral",
  CANCELLED: "neutral",
};

export function QuoteStatusBadge({ status }: { status: string }) {
  const known = (status in STATUS_TONE ? status : "DRAFT") as QuoteStatus;
  return <Badge tone={STATUS_TONE[known]}>{QUOTE_STATUS_LABEL[known]}</Badge>;
}

const VALIDITY_TONE: Record<QuoteValidityLevel, BadgeTone> = {
  NONE: "neutral",
  VALID: "neutral",
  EXPIRING: "warning",
  EXPIRED: "error",
};

export function ValidityBadge({ validity }: { validity: QuoteValidity }) {
  return (
    <Badge
      tone={VALIDITY_TONE[validity.level]}
      showIcon={validity.level === "EXPIRING" || validity.level === "EXPIRED"}
    >
      {validity.label}
    </Badge>
  );
}

const NOTICE_TEXT: Record<QuoteNotice, { tone: BadgeTone; message: string }> = {
  created: { tone: "success", message: "견적을 생성했습니다. 상품과 금액을 이어서 작성하세요." },
  "item-added": { tone: "success", message: "상품을 추가했습니다." },
  "item-updated": { tone: "success", message: "라인을 수정하고 합계를 다시 계산했습니다." },
  "item-removed": { tone: "success", message: "상품을 삭제했습니다." },
  saved: { tone: "success", message: "견적을 저장했습니다." },
  repriced: { tone: "success", message: "현재 시점 기준으로 프로모션을 다시 적용했습니다." },
  forked: { tone: "success", message: "새 버전을 만들었습니다. 원본은 그대로 유지됩니다." },
  deleted: { tone: "success", message: "견적을 삭제했습니다." },
  locked: {
    tone: "error",
    message: "수정할 수 없는 견적입니다. 새 버전을 만들어 이어서 작성하세요.",
  },
  "no-customer": { tone: "error", message: "고객을 먼저 선택해 주세요." },
  "no-items": { tone: "error", message: "견적에 담을 상품을 하나 이상 선택해 주세요." },
  "bad-qty": { tone: "error", message: "수량은 1개 이상이어야 합니다." },
  "duplicate-item": {
    tone: "warning",
    message: "이미 견적에 담긴 상품입니다. 수량을 조정해 주세요.",
  },
};

export function QuoteNoticeBanner({ notice }: { notice: string | undefined }) {
  if (!notice || !(notice in NOTICE_TEXT)) return null;
  const { tone, message } = NOTICE_TEXT[notice as QuoteNotice];
  return (
    <Notice tone={tone} className="print-hidden mb-lg">
      {message}
    </Notice>
  );
}

const PLAN_TONE: Record<PaymentPlanStatus, BadgeTone> = {
  DRAFT: "info",
  APPROVED: "success",
  REJECTED: "error",
  CANCELLED: "neutral",
};

export function PaymentStatusBadge({ status }: { status: string }) {
  const known = (status in PLAN_TONE ? status : "DRAFT") as PaymentPlanStatus;
  return <Badge tone={PLAN_TONE[known]}>{PAYMENT_PLAN_STATUS_LABEL[known]}</Badge>;
}

const PAY_NOTICE_TEXT: Record<PaymentNotice, { tone: BadgeTone; message: string }> = {
  saved: {
    tone: "success",
    message: "결제설계를 저장했습니다. 견적은 '고객 발송' 상태가 되어 금액 수정이 잠깁니다.",
  },
  approved: { tone: "success", message: "결제 승인 처리했습니다 (모의 승인)." },
  rejected: { tone: "error", message: "결제가 거절 처리되었습니다. 사유를 확인하세요." },
  cancelled: {
    tone: "success",
    message: "결제설계를 취소했습니다. 견적이 다시 '작성중' 으로 돌아가 수정할 수 있습니다.",
  },
  "no-product": { tone: "error", message: "금융상품을 선택해 주세요." },
  ineligible: { tone: "error", message: "이 결제금액에는 적용할 수 없는 금융상품입니다." },
  "bad-downpayment": { tone: "error", message: "선납금은 결제금액을 넘을 수 없습니다." },
  "plan-locked": {
    tone: "warning",
    message: "승인·거절된 결제설계는 수정할 수 없습니다. 취소 후 다시 설계하세요.",
  },
  "quote-locked": {
    tone: "error",
    message: "계약 단계로 넘어간 견적의 결제설계는 변경할 수 없습니다.",
  },
};

export function PaymentNoticeBanner({ notice }: { notice: string | undefined }) {
  if (!notice || !(notice in PAY_NOTICE_TEXT)) return null;
  const { tone, message } = PAY_NOTICE_TEXT[notice as PaymentNotice];
  return (
    <Notice tone={tone} className="mb-lg">
      {message}
    </Notice>
  );
}
