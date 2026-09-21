import { InventoryBadge } from "@/components/ui";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { StockView } from "@/lib/inventory";

/** 재고 배지 + 수량. 배지는 색상 단독이 아니라 아이콘 + 한국어 라벨을 함께 낸다. */
export function StockCell({ view }: { view: StockView }) {
  return (
    <div className="flex items-center gap-sm">
      <InventoryBadge status={view.status} />
      {view.status !== "NOT_CARRIED" && (
        <span className="tabular-nums text-caption text-gray-700">
          {view.available}개
          {view.reservedQty > 0 && ` (예약 ${view.reservedQty}개 제외)`}
        </span>
      )}
    </div>
  );
}

/** PRD §4 재고 P0 — 기준시각은 재고가 보이는 모든 화면에 항상 표시한다. */
export function AsOfAt({ value }: { value: Date | null }) {
  if (!value) return <span className="text-caption text-gray-400">-</span>;
  return (
    <span className="whitespace-nowrap tabular-nums text-caption text-gray-700">
      {formatDateTime(value)}
      <span className="ml-xs text-gray-400">({formatRelative(value)})</span>
    </span>
  );
}
