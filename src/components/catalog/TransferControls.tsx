import { Badge, Button, Notice } from "@/components/ui";
import { createTransferRequestAction } from "@/lib/catalog-actions";
import { TRANSFER_STATUS, TRANSFER_STATUS_LABEL, type TransferStatus } from "@/lib/enums";

const TRANSFER_TONE = {
  REQUESTED: "info",
  APPROVED: "success",
  REJECTED: "error",
  IN_TRANSIT: "info",
  COMPLETED: "success",
  CANCELLED: "neutral",
} as const;

export function TransferStatusBadge({ status }: { status: string }) {
  const key = (
    TRANSFER_STATUS.includes(status as TransferStatus) ? status : "REQUESTED"
  ) as TransferStatus;
  return <Badge tone={TRANSFER_TONE[key]}>{TRANSFER_STATUS_LABEL[key]}</Badge>;
}

/** 출고 매장에 가용 재고가 있을 때만 노출하는 이동요청 버튼. 재고 수량은 건드리지 않는다. */
export function RequestTransfer({
  productId,
  fromStoreId,
  returnTo,
  disabled,
}: {
  productId: string;
  fromStoreId: string;
  returnTo: string;
  disabled?: boolean;
}) {
  return (
    <form action={createTransferRequestAction}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="fromStoreId" value={fromStoreId} />
      <input type="hidden" name="quantity" value="1" />
      <input type="hidden" name="returnTo" value={returnTo} />
      <Button type="submit" variant="ghost" disabled={disabled}>
        이동요청
      </Button>
    </form>
  );
}

const TRANSFER_FEEDBACK = {
  requested: { tone: "success", text: "이동요청을 등록했습니다. 출고 매장의 승인 후 이동이 시작됩니다." },
  insufficient: { tone: "warning", text: "출고 매장의 가용 재고가 부족해 요청하지 못했습니다." },
  "same-store": { tone: "info", text: "소속 매장으로는 이동요청을 보낼 수 없습니다." },
  invalid: { tone: "error", text: "요청 정보를 확인할 수 없습니다." },
} as const;

export function TransferNotice({ state }: { state?: string }) {
  const feedback = state && state in TRANSFER_FEEDBACK
    ? TRANSFER_FEEDBACK[state as keyof typeof TRANSFER_FEEDBACK]
    : null;
  if (!feedback) return null;
  return <Notice tone={feedback.tone}>{feedback.text}</Notice>;
}
