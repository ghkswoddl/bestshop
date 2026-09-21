// SQLite 는 Prisma enum 을 지원하지 않는다.
// 스키마의 String 컬럼에 들어갈 수 있는 값은 이 파일이 단일 진실 공급원이다.

export const MANAGER_ROLE = ["MANAGER", "STORE_ADMIN", "HQ"] as const;
export type ManagerRole = (typeof MANAGER_ROLE)[number];

export const CONSENT_TYPE = ["MARKETING", "THIRD_PARTY", "PRIVACY"] as const;
export type ConsentType = (typeof CONSENT_TYPE)[number];

export const PRODUCT_STATUS = ["ON_SALE", "DISCONTINUED", "NOT_CARRIED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[number];

export const INVENTORY_STATUS = [
  "IN_STOCK",
  "LOW_STOCK",
  "OUT_OF_STOCK",
  "NOT_CARRIED",
  "SALE_STOPPED",
] as const;
export type InventoryStatus = (typeof INVENTORY_STATUS)[number];

export const TRANSFER_STATUS = [
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "IN_TRANSIT",
  "COMPLETED",
  "CANCELLED",
] as const;
export type TransferStatus = (typeof TRANSFER_STATUS)[number];

export const PROMOTION_BENEFIT_TYPE = [
  "PERCENT_DISCOUNT",
  "AMOUNT_DISCOUNT",
  "GIFT",
  "CASHBACK",
  "BUNDLE",
] as const;
export type PromotionBenefitType = (typeof PROMOTION_BENEFIT_TYPE)[number];

export const PROMOTION_STATUS = ["DRAFT", "ACTIVE", "ENDED", "CANCELLED"] as const;
export type PromotionStatus = (typeof PROMOTION_STATUS)[number];

export const QUOTE_STATUS = [
  "DRAFT",
  "SENT",
  "LOCKED",
  "CONVERTED",
  "EXPIRED",
  "CANCELLED",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUS)[number];

export const FINANCE_TYPE = ["LUMP", "CARD", "INSTALLMENT", "RENTAL"] as const;
export type FinanceType = (typeof FINANCE_TYPE)[number];

export const PAYMENT_PLAN_STATUS = ["DRAFT", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type PaymentPlanStatus = (typeof PAYMENT_PLAN_STATUS)[number];

export const CONTRACT_STATUS = [
  "DRAFT",
  "PENDING_SIGNATURE",
  "SIGNED",
  "CHANGED",
  "CANCELLED",
] as const;
export type ContractStatus = (typeof CONTRACT_STATUS)[number];

export const SIGNATURE_STATUS = [
  "PENDING",
  "SENT",
  "SIGNED",
  "EXPIRED",
  "INVALIDATED",
] as const;
export type SignatureStatus = (typeof SIGNATURE_STATUS)[number];

export const ORDER_STATUS = [
  "PLACED",
  "PREPARING",
  "SHIPPING",
  "DELIVERED",
  "INSTALLED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];

export const DELIVERY_STATUS = [
  "SCHEDULED",
  "PREPARING",
  "IN_TRANSIT",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUS)[number];

export const INSTALL_STATUS = [
  "SCHEDULED",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type InstallStatus = (typeof INSTALL_STATUS)[number];

/**
 * 상담 진행 단계. 배열 순서가 곧 진행 순서이며 **뒤로 가지 않는다**.
 * COMPLETED / CLOSED / CANCELLED 는 종착 단계다 (consultations.ts 의 CONSULTATION_TERMINAL).
 */
export const CONSULTATION_STAGE = [
  "IN_PROGRESS",
  "QUOTED",
  "CONTRACTED",
  "DELIVERING",
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
] as const;
export type ConsultationStage = (typeof CONSULTATION_STAGE)[number];

export const CONSULTATION_CHANNEL = ["VISIT", "PHONE", "ONLINE"] as const;
export type ConsultationChannel = (typeof CONSULTATION_CHANNEL)[number];

export const FOLLOW_UP_TYPE = ["CALL", "VISIT", "MESSAGE", "OTHER"] as const;
export type FollowUpType = (typeof FOLLOW_UP_TYPE)[number];

export const FOLLOW_UP_STATUS = ["PENDING", "DONE", "CANCELLED"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUS)[number];

export const RECENT_TARGET_TYPE = ["CUSTOMER", "PRODUCT"] as const;
export type RecentTargetType = (typeof RECENT_TARGET_TYPE)[number];

export const SAVED_SEARCH_SCOPE = ["CUSTOMER", "PRODUCT", "CONSULTATION"] as const;
export type SavedSearchScope = (typeof SAVED_SEARCH_SCOPE)[number];

export const MANAGER_ROLE_LABEL: Record<ManagerRole, string> = {
  MANAGER: "상담매니저",
  STORE_ADMIN: "점장",
  HQ: "본사",
};

export const CONSENT_TYPE_LABEL: Record<ConsentType, string> = {
  MARKETING: "마케팅 수신",
  THIRD_PARTY: "제3자 제공",
  PRIVACY: "개인정보 처리",
};

export const CONSULTATION_CHANNEL_LABEL: Record<ConsultationChannel, string> = {
  VISIT: "내방",
  PHONE: "전화",
  ONLINE: "온라인",
};

export const CONSULTATION_STAGE_LABEL: Record<ConsultationStage, string> = {
  IN_PROGRESS: "진행중",
  QUOTED: "견적",
  CONTRACTED: "계약",
  DELIVERING: "배송",
  COMPLETED: "완료",
  CLOSED: "상담종료",
  CANCELLED: "취소",
};

export const FOLLOW_UP_TYPE_LABEL: Record<FollowUpType, string> = {
  CALL: "전화",
  VISIT: "방문",
  MESSAGE: "문자",
  OTHER: "기타",
};

export const FOLLOW_UP_STATUS_LABEL: Record<FollowUpStatus, string> = {
  PENDING: "예정",
  DONE: "완료",
  CANCELLED: "취소",
};

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  ON_SALE: "판매중",
  DISCONTINUED: "단종",
  NOT_CARRIED: "매장 미취급",
};

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  REQUESTED: "요청",
  APPROVED: "승인",
  REJECTED: "반려",
  IN_TRANSIT: "이동중",
  COMPLETED: "완료",
  CANCELLED: "취소",
};

export const PROMOTION_STATUS_LABEL: Record<PromotionStatus, string> = {
  DRAFT: "작성중",
  ACTIVE: "게시중",
  ENDED: "종료",
  CANCELLED: "취소",
};

export const PROMOTION_BENEFIT_TYPE_LABEL: Record<PromotionBenefitType, string> = {
  PERCENT_DISCOUNT: "정률 할인",
  AMOUNT_DISCOUNT: "정액 할인",
  GIFT: "사은품 증정",
  CASHBACK: "캐시백",
  BUNDLE: "번들 혜택",
};

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: "작성중",
  SENT: "고객 발송",
  LOCKED: "확정",
  CONVERTED: "계약 전환",
  EXPIRED: "만료",
  CANCELLED: "취소",
};

export const INVENTORY_STATUS_LABEL: Record<InventoryStatus, string> = {
  IN_STOCK: "재고있음",
  LOW_STOCK: "재고부족",
  OUT_OF_STOCK: "품절",
  NOT_CARRIED: "미취급",
  SALE_STOPPED: "판매중지",
};
