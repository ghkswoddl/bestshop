// 재고 표시 상태의 단일 진실 공급원.
//
// InventoryItem.status 컬럼은 시드/배치가 써 두는 값일 뿐이고, 화면에 보이는 상태는
// 항상 여기서 수량으로부터 파생시킨다. Phase 8 이 계약 생성 시 수량만 조건부로 차감해도
// (status 컬럼을 건드리지 않아도) 표시가 자동으로 맞는다.
//
// 이 모듈은 순수 함수만 담는다 — prisma/seed 에서도 그대로 import 한다.

import type { InventoryStatus, ProductStatus } from "./enums";

/** safetyStock 이 0 인 재고의 '재고부족' 판정 기준. 가용수량이 이 값 이하면 LOW_STOCK. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 3;

export interface InventoryFacts {
  quantity: number;
  reservedQty: number;
  safetyStock: number;
  status: string;
  asOfAt: Date;
}

export interface StockView {
  status: InventoryStatus;
  /** 창고 수량. */
  quantity: number;
  /** 예약분을 뺀 실제 판매가능 수량. */
  available: number;
  reservedQty: number;
  threshold: number;
  asOfAt: Date | null;
  /** 재고부족·품절 배너 대상인지. */
  needsAttention: boolean;
}

const MISSING: StockView = {
  status: "NOT_CARRIED",
  quantity: 0,
  available: 0,
  reservedQty: 0,
  threshold: 0,
  asOfAt: null,
  needsAttention: false,
};

export function lowStockThreshold(safetyStock: number): number {
  return safetyStock > 0 ? safetyStock : DEFAULT_LOW_STOCK_THRESHOLD;
}

/**
 * 재고 행 + 상품 판매상태 → 화면 상태.
 *
 * - 재고 행이 없으면 그 매장은 해당 상품을 취급하지 않는다 (미취급).
 * - 상품 자체가 NOT_CARRIED / DISCONTINUED 면 수량과 무관하게 판매중지로 본다.
 */
export function deriveStock(
  item: InventoryFacts | null | undefined,
  productStatus: ProductStatus | string = "ON_SALE",
): StockView {
  if (!item) return MISSING;

  const available = Math.max(0, item.quantity - item.reservedQty);
  const threshold = lowStockThreshold(item.safetyStock);
  const base = {
    quantity: item.quantity,
    available,
    reservedQty: item.reservedQty,
    threshold,
    asOfAt: item.asOfAt,
  };

  if (productStatus === "NOT_CARRIED") {
    return { ...base, status: "NOT_CARRIED", needsAttention: false };
  }
  if (item.status === "SALE_STOPPED" || productStatus === "DISCONTINUED") {
    return { ...base, status: "SALE_STOPPED", needsAttention: false };
  }
  if (available <= 0) {
    return { ...base, status: "OUT_OF_STOCK", needsAttention: true };
  }
  if (available <= threshold) {
    return { ...base, status: "LOW_STOCK", needsAttention: true };
  }
  return { ...base, status: "IN_STOCK", needsAttention: false };
}

/** 이 매장에서 다른 매장으로 n개를 넘겨줄 수 있는가 (TransferRequest 가능 여부 조회용). */
export function canTransferOut(view: StockView, quantity = 1): boolean {
  return view.available - quantity >= 0 && view.status !== "NOT_CARRIED";
}
