import { Badge, Notice, type BadgeTone } from "@/components/ui";
import type { DeliveryStatus, InstallStatus, OrderStatus } from "@/lib/enums";
import {
  DELIVERY_STATUS_LABEL,
  INSTALL_STATUS_LABEL,
  ORDER_STATUS_LABEL,
} from "@/lib/orders";
import type { DeliveryNotice } from "@/lib/order-actions";

const DELIVERY_TONE: Record<DeliveryStatus, BadgeTone> = {
  SCHEDULED: "neutral",
  PREPARING: "info",
  IN_TRANSIT: "info",
  DELIVERED: "success",
  FAILED: "error",
  CANCELLED: "neutral",
};

const INSTALL_TONE: Record<InstallStatus, BadgeTone> = {
  SCHEDULED: "neutral",
  ASSIGNED: "info",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  FAILED: "error",
  CANCELLED: "neutral",
};

const ORDER_TONE: Record<OrderStatus, BadgeTone> = {
  PLACED: "neutral",
  PREPARING: "info",
  SHIPPING: "info",
  DELIVERED: "success",
  INSTALLED: "success",
  COMPLETED: "success",
  CANCELLED: "neutral",
};

export function DeliveryStatusBadge({ status }: { status: string }) {
  const known = (status in DELIVERY_TONE ? status : "SCHEDULED") as DeliveryStatus;
  return <Badge tone={DELIVERY_TONE[known]}>{DELIVERY_STATUS_LABEL[known]}</Badge>;
}

export function InstallStatusBadge({ status }: { status: string }) {
  const known = (status in INSTALL_TONE ? status : "SCHEDULED") as InstallStatus;
  return <Badge tone={INSTALL_TONE[known]}>{INSTALL_STATUS_LABEL[known]}</Badge>;
}

export function OrderStatusBadge({ status }: { status: string }) {
  const known = (status in ORDER_TONE ? status : "PLACED") as OrderStatus;
  return <Badge tone={ORDER_TONE[known]}>{ORDER_STATUS_LABEL[known]}</Badge>;
}

export function DelayBadge() {
  return <Badge tone="warning">지연</Badge>;
}

const NOTICE_TEXT: Record<DeliveryNotice, { tone: BadgeTone; message: string }> = {
  "job-created": { tone: "success", message: "작업을 등록했습니다." },
  "status-changed": { tone: "success", message: "상태를 변경했습니다." },
  rescheduled: { tone: "success", message: "일정을 변경하고 이력에 기록했습니다." },
  "invalid-transition": {
    tone: "error",
    message: "허용되지 않는 상태 변경입니다.",
  },
  "install-blocked": {
    tone: "error",
    message: "설치를 완료할 수 없습니다.",
  },
  "bad-input": { tone: "error", message: "입력값을 확인해 주세요." },
  "order-cancelled": { tone: "error", message: "취소된 주문에는 작업을 추가할 수 없습니다." },
};

export function DeliveryNoticeBanner({
  notice,
  detail,
}: {
  notice: string | undefined;
  detail?: string;
}) {
  if (!notice || !(notice in NOTICE_TEXT)) return null;
  const { tone, message } = NOTICE_TEXT[notice as DeliveryNotice];
  return (
    <Notice tone={tone} className="mb-lg">
      {message}
      {detail && <span className="ml-sm font-semibold">{detail}</span>}
    </Notice>
  );
}
