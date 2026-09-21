import { Button, Notice } from "@/components/ui";
import { addToComparisonAction } from "@/lib/catalog-actions";
import { COMPARISON_LIMIT } from "@/lib/catalog";

/**
 * Phase 4(상품비교)의 진입점. 여기서 담은 항목이 /compare 의 비교함이 된다.
 * 서버 액션 폼이라 자바스크립트 없이도 동작하고, 결과는 쿼리스트링으로 되돌려 받는다.
 */
export function AddToCompare({
  productId,
  returnTo,
  inCart,
  fullWidth,
}: {
  productId: string;
  /** 액션이 되돌아올 경로 (쿼리스트링 포함). */
  returnTo: string;
  inCart: boolean;
  fullWidth?: boolean;
}) {
  return (
    <form action={addToComparisonAction}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <Button
        type="submit"
        variant={inCart ? "secondary" : "ghost"}
        disabled={inCart}
        fullWidth={fullWidth}
      >
        {inCart ? "비교함에 담김" : "비교함에 추가"}
      </Button>
    </form>
  );
}

const COMPARE_FEEDBACK = {
  added: { tone: "success", text: "비교함에 추가했습니다." },
  exists: { tone: "info", text: "이미 비교함에 담긴 상품입니다." },
  full: {
    tone: "warning",
    text: `비교함은 최대 ${COMPARISON_LIMIT}개까지 담을 수 있습니다. 기존 항목을 제거한 뒤 다시 시도하세요.`,
  },
  invalid: { tone: "error", text: "상품을 확인할 수 없어 비교함에 담지 못했습니다." },
  removed: { tone: "success", text: "비교함에서 제거했습니다." },
  cleared: { tone: "success", text: "비교함을 비웠습니다." },
  picked: { tone: "success", text: "견적 대상으로 선택했습니다." },
  unpicked: { tone: "info", text: "견적 대상에서 해제했습니다." },
  saved: { tone: "success", text: "비교 결과를 저장했습니다. 다음 비교는 새 비교함에서 시작합니다." },
  reopened: { tone: "success", text: "저장된 비교를 새 비교함으로 복제했습니다." },
  empty: { tone: "warning", text: "비교함이 비어 있어 저장할 수 없습니다." },
  locked: {
    tone: "warning",
    text: "저장된 비교 결과는 상담 이력의 스냅샷이라 수정할 수 없습니다. '다시 비교하기'로 복제하세요.",
  },
  "no-consultation": {
    tone: "error",
    text: "연결할 상담을 찾을 수 없습니다 (다른 매장의 상담일 수 있습니다).",
  },
} as const;

export function CompareNotice({ state }: { state?: string }) {
  const feedback = state && state in COMPARE_FEEDBACK
    ? COMPARE_FEEDBACK[state as keyof typeof COMPARE_FEEDBACK]
    : null;
  if (!feedback) return null;
  return <Notice tone={feedback.tone}>{feedback.text}</Notice>;
}
