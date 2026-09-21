// 견적 금액 계산 불변식 검증 (계획 §7 "금액 계산 유닛 테스트").
//
//   npm run check:quote-calc
//
// 아직 테스트 러너가 없어 tsx 로 직접 도는 단독 스크립트다. Phase 7 이 할부 라운딩
// 테스트를 만들면서 러너를 세우면, 이 파일의 단언들을 그대로 옮겨 담으면 된다
// (Phase 5 handoff 의 권고). 그때까지는 이 스크립트가 금액 회귀를 막는 그물이다.

import {
  computeQuoteTotals,
  isQuoteEditable,
  lineTotalOf,
  quoteLockReason,
  quoteValidity,
} from "@/lib/quotes";
import {
  aprLabel,
  canReplacePlan,
  computeSchedule,
  financeIneligibleReason,
  isPlanEditable,
  termLabel,
} from "@/lib/payments";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

const DAY = 86_400_000;
const NOW = new Date("2026-09-20T12:00:00+09:00");

console.log("\n== lineTotalOf ==");
check("단가×수량 − 할인", lineTotalOf({ unitPriceSnapshot: 1_000_000, qty: 3, discountAmount: 200_000 }) === 2_800_000);
check("할인 0", lineTotalOf({ unitPriceSnapshot: 990_000, qty: 1, discountAmount: 0 }) === 990_000);
check("수량 0 이면 음수 할인만 남지 않는다", lineTotalOf({ unitPriceSnapshot: 500, qty: 0, discountAmount: 0 }) === 0);

console.log("\n== computeQuoteTotals ==");
{
  const empty = computeQuoteTotals([], { deliveryFee: 0, installFee: 0 });
  check("빈 견적은 전부 0", empty.subtotal === 0 && empty.discountTotal === 0 && empty.grandTotal === 0);
}
{
  const t = computeQuoteTotals(
    [
      { unitPriceSnapshot: 2_190_000, qty: 1, discountAmount: 300_000 },
      { unitPriceSnapshot: 1_290_000, qty: 2, discountAmount: 0 },
    ],
    { deliveryFee: 30_000, installFee: 50_000 },
  );
  check("상품 합계", t.subtotal === 2_190_000 + 2_580_000, String(t.subtotal));
  check("할인 합계", t.discountTotal === 300_000, String(t.discountTotal));
  check("배송·설치비 반영", t.deliveryFee === 30_000 && t.installFee === 50_000);
  check("총액 = 합계 − 할인 + 비용", t.grandTotal === 4_770_000 - 300_000 + 80_000, String(t.grandTotal));
}
{
  const t = computeQuoteTotals([{ unitPriceSnapshot: 1_000_000, qty: 1, discountAmount: 1_000_000 }], {
    deliveryFee: 0,
    installFee: 0,
  });
  check("할인이 상품합계와 같으면 총액 0", t.grandTotal === 0, String(t.grandTotal));
}
{
  // 라인 할인은 promotions.ts 가 라인합계 이하로 clamp 하지만, 집계 단계에서도 음수 총액이
  // 고객에게 보이지 않아야 한다.
  const t = computeQuoteTotals([{ unitPriceSnapshot: 1_000_000, qty: 1, discountAmount: 3_000_000 }], {
    deliveryFee: 0,
    installFee: 0,
  });
  check("과다 할인이 들어와도 총액은 음수가 되지 않는다", t.grandTotal === 0, String(t.grandTotal));
}
{
  const t = computeQuoteTotals([{ unitPriceSnapshot: 100, qty: 1, discountAmount: 0 }], {
    deliveryFee: -5_000,
    installFee: -1,
  });
  check("음수 배송비는 0 으로 막는다", t.deliveryFee === 0 && t.installFee === 0);
  check("음수 비용이 총액을 깎지 않는다", t.grandTotal === 100, String(t.grandTotal));
}
{
  const t = computeQuoteTotals(
    [
      { unitPriceSnapshot: 1_333_333, qty: 3, discountAmount: 199_999 },
      { unitPriceSnapshot: 777_777, qty: 7, discountAmount: 1 },
    ],
    { deliveryFee: 12_345, installFee: 6_789 },
  );
  const allInt = [t.subtotal, t.discountTotal, t.deliveryFee, t.installFee, t.grandTotal].every(
    Number.isInteger,
  );
  check("모든 합계가 정수(KRW Int)", allInt);
}

console.log("\n== quoteValidity ==");
check("유효기간 미설정", quoteValidity({ validUntil: null }, NOW).level === "NONE");
check(
  "30일 남음 → VALID",
  quoteValidity({ validUntil: new Date(NOW.getTime() + 30 * DAY) }, NOW).level === "VALID",
);
check(
  "3일 남음 → EXPIRING",
  quoteValidity({ validUntil: new Date(NOW.getTime() + 3 * DAY) }, NOW).level === "EXPIRING",
);
check(
  "정확히 7일 남음 → EXPIRING (경계)",
  quoteValidity({ validUntil: new Date(NOW.getTime() + 7 * DAY) }, NOW).level === "EXPIRING",
);
check(
  "8일 남음 → VALID (경계 바깥)",
  quoteValidity({ validUntil: new Date(NOW.getTime() + 8 * DAY) }, NOW).level === "VALID",
);
check(
  "지난 날짜 → EXPIRED",
  quoteValidity({ validUntil: new Date(NOW.getTime() - 5 * DAY) }, NOW).level === "EXPIRED",
);
{
  const expired = quoteValidity({ validUntil: new Date(NOW.getTime() - 5 * DAY) }, NOW);
  check("경과 일수 문구", expired.label.includes("5일 경과"), expired.label);
}

console.log("\n== 편집 가능성 ==");
check("DRAFT 만 편집 가능", isQuoteEditable({ status: "DRAFT" }) === true);
for (const status of ["SENT", "LOCKED", "CONVERTED", "EXPIRED", "CANCELLED"]) {
  check(`${status} 는 편집 불가`, isQuoteEditable({ status }) === false);
}
check("DRAFT 는 잠김 사유 없음", quoteLockReason({ status: "DRAFT" }) === null);
check(
  "LOCKED 잠김 사유에 한국어 라벨",
  (quoteLockReason({ status: "LOCKED" }) ?? "").includes("확정"),
  String(quoteLockReason({ status: "LOCKED" })),
);

// ------------------------------------------------------------ 할부 계산 (Phase 7)

console.log("\n== computeSchedule — 일시납 ==");
for (const terms of [
  { type: "LUMP", months: 0, apr: 0 },
  { type: "LUMP", months: 12, apr: 990 }, // 잘못 설정된 LUMP 도 일시납으로 본다
  { type: "CARD", months: 0, apr: 590 },
]) {
  const s = computeSchedule(terms, { principal: 3_000_000, downPayment: 0 });
  check(
    `${terms.type}/${terms.months}개월 → 회차 0`,
    s.months === 0 && s.monthlyAmount === 0 && s.lastMonthAmount === 0,
    JSON.stringify(s),
  );
  check(`${terms.type}/${terms.months}개월 → 이자 0`, s.interestTotal === 0);
  check(`${terms.type}/${terms.months}개월 → 총액 = 원금`, s.totalPayable === 3_000_000);
}

console.log("\n== computeSchedule — 무이자 할부 ==");
{
  const s = computeSchedule({ type: "INSTALLMENT", months: 3, apr: 0 }, { principal: 3_000_000, downPayment: 0 });
  check("무이자는 이자 0", s.interestTotal === 0);
  check("정확히 나눠떨어지면 균등", s.monthlyAmount === 1_000_000 && s.lastMonthAmount === 1_000_000);
  check("총액 = 원금", s.totalPayable === 3_000_000);
}
{
  // 나눠떨어지지 않는 금액: 올림 배분 + 마지막 회차가 잔액 흡수
  const s = computeSchedule({ type: "INSTALLMENT", months: 3, apr: 0 }, { principal: 1_000_000, downPayment: 0 });
  check("올림 배분", s.monthlyAmount === 333_334, String(s.monthlyAmount));
  check("마지막 회차가 잔액 흡수", s.lastMonthAmount === 333_332, String(s.lastMonthAmount));
  check(
    "회차 합계 === 총 납입액 − 선납금",
    s.monthlyAmount * (s.months - 1) + s.lastMonthAmount === s.totalPayable - s.downPayment,
  );
}

console.log("\n== computeSchedule — 유이자 할부 ==");
{
  const s = computeSchedule({ type: "INSTALLMENT", months: 12, apr: 790 }, { principal: 6_000_000, downPayment: 1_000_000 });
  check("할부원금 = 원금 − 선납금", s.financedAmount === 5_000_000);
  // 단리: 5,000,000 × 790 / 10000 × 12 / 12 = 395,000
  check("단리 수수료", s.interestTotal === 395_000, String(s.interestTotal));
  check("총 납입액 = 원금 + 이자", s.totalPayable === 6_000_000 + 395_000, String(s.totalPayable));
  check(
    "회차 합계 === 총 납입액 − 선납금",
    s.monthlyAmount * (s.months - 1) + s.lastMonthAmount === s.totalPayable - s.downPayment,
  );
  check("이자는 정수", Number.isInteger(s.interestTotal));
}

console.log("\n== computeSchedule — 렌탈 ==");
{
  const s = computeSchedule({ type: "RENTAL", months: 60, apr: 0 }, { principal: 2_400_000, downPayment: 0 });
  check("렌탈 60개월 균등", s.monthlyAmount === 40_000 && s.lastMonthAmount === 40_000, JSON.stringify(s));
  check("렌탈 무이자", s.interestTotal === 0);
}
{
  // 원금 0 렌탈 — 0 나눗셈이나 NaN 이 나오면 안 된다.
  const s = computeSchedule({ type: "RENTAL", months: 60, apr: 0 }, { principal: 0, downPayment: 0 });
  const values = [s.principal, s.financedAmount, s.interestTotal, s.monthlyAmount, s.lastMonthAmount, s.totalPayable];
  check("원금 0 렌탈이 전부 0", values.every((v) => v === 0), JSON.stringify(s));
  check("원금 0 렌탈에 NaN 없음", values.every(Number.isFinite));
}

console.log("\n== computeSchedule — 경계 ==");
{
  const s = computeSchedule({ type: "INSTALLMENT", months: 1, apr: 0 }, { principal: 990_000, downPayment: 0 });
  check("1개월 할부", s.monthlyAmount === 990_000 && s.lastMonthAmount === 990_000, JSON.stringify(s));
  check(
    "1개월도 합계 불변식 성립",
    s.monthlyAmount * (s.months - 1) + s.lastMonthAmount === s.totalPayable - s.downPayment,
  );
}
{
  // 총액이 회차 수보다 훨씬 작은 퇴화 구간 — 올림 배분이면 마지막 회차가 음수가 된다.
  const s = computeSchedule({ type: "INSTALLMENT", months: 24, apr: 0 }, { principal: 100, downPayment: 0 });
  check("퇴화 구간에서도 음수 회차 없음", s.monthlyAmount >= 0 && s.lastMonthAmount >= 0, JSON.stringify(s));
  check(
    "퇴화 구간에서도 합계 불변식 성립",
    s.monthlyAmount * (s.months - 1) + s.lastMonthAmount === s.totalPayable - s.downPayment,
    JSON.stringify(s),
  );
}
{
  const s = computeSchedule({ type: "INSTALLMENT", months: 12, apr: 990 }, { principal: 1_000_000, downPayment: 9_999_999 });
  check("선납금이 원금을 넘으면 원금으로 clamp", s.downPayment === 1_000_000);
  check("전액 선납이면 할부원금 0", s.financedAmount === 0 && s.interestTotal === 0);
  check("전액 선납 총액 = 원금", s.totalPayable === 1_000_000);
}
{
  const s = computeSchedule({ type: "INSTALLMENT", months: 12, apr: 790 }, { principal: -5_000, downPayment: -100 });
  check("음수 입력은 0 으로 막는다", s.principal === 0 && s.downPayment === 0 && s.totalPayable === 0);
}

console.log("\n== 합계 불변식 (다양한 조합) ==");
{
  let violations = 0;
  let lumpViolations = 0;
  let nonInteger = 0;
  let negative = 0;
  let combos = 0;
  for (const principal of [0, 1, 999, 100_000, 1_234_567, 9_876_543, 50_000_000]) {
    for (const months of [0, 1, 3, 6, 12, 24, 36, 60]) {
      for (const apr of [0, 590, 790, 990, 1_190]) {
        for (const downPayment of [0, 1, 300_000, principal]) {
          combos++;
          const s = computeSchedule({ type: "INSTALLMENT", months, apr }, { principal, downPayment });

          if (s.months > 0) {
            // 회차가 있을 때만 배분 불변식이 성립한다.
            const scheduled = s.monthlyAmount * (s.months - 1) + s.lastMonthAmount;
            if (scheduled !== s.totalPayable - s.downPayment) violations++;
          } else if (s.totalPayable - s.downPayment !== s.financedAmount) {
            // 회차가 없으면 할부원금 전액이 일시에 청구된다.
            lumpViolations++;
          }
          if (
            ![s.principal, s.downPayment, s.financedAmount, s.interestTotal, s.monthlyAmount, s.lastMonthAmount, s.totalPayable].every(
              Number.isInteger,
            )
          ) {
            nonInteger++;
          }
          if (s.monthlyAmount < 0 || s.lastMonthAmount < 0 || s.totalPayable < 0) negative++;
        }
      }
    }
  }
  check(`${combos}개 조합에서 회차 합계 === 총 납입액 − 선납금`, violations === 0, `위반 ${violations}건`);
  check("일시납 조합에서 총 납입액 − 선납금 === 할부원금", lumpViolations === 0, `위반 ${lumpViolations}건`);
  check("모든 조합에서 금액이 정수", nonInteger === 0, `위반 ${nonInteger}건`);
  check("모든 조합에서 음수 없음", negative === 0, `위반 ${negative}건`);
}

console.log("\n== 적용 가능성 / 표시 ==");
check("비활성 상품", financeIneligibleReason({ active: false, minAmount: null, maxAmount: null }, 1_000_000) != null);
check(
  "최소금액 미달",
  (financeIneligibleReason({ active: true, minAmount: 1_000_000, maxAmount: null }, 500_000) ?? "").includes("최소"),
);
check(
  "최대금액 초과",
  (financeIneligibleReason({ active: true, minAmount: null, maxAmount: 1_000_000 }, 5_000_000) ?? "").includes("최대"),
);
check("조건 충족", financeIneligibleReason({ active: true, minAmount: 100, maxAmount: 10_000_000 }, 1_000_000) === null);
check("apr 0 은 무이자 표기", aprLabel(0) === "무이자");
check("apr 590 → 5.90%", aprLabel(590) === "5.90%", aprLabel(590));
check("apr 1190 → 11.90%", aprLabel(1_190) === "11.90%", aprLabel(1_190));
check("apr 1000 → 10.00%", aprLabel(1_000) === "10.00%", aprLabel(1_000));
check("일시납 기간 표기", termLabel({ type: "LUMP", months: 0, apr: 0 }) === "일시납");
check("할부 기간 표기", termLabel({ type: "INSTALLMENT", months: 12, apr: 0 }) === "12개월");

console.log("\n== 결제설계 편집 가능성 ==");
check("설계 없음은 편집 가능", isPlanEditable(null) === true);
check("DRAFT 편집 가능", isPlanEditable({ status: "DRAFT" }) === true);
for (const status of ["APPROVED", "REJECTED"]) {
  check(`${status} 는 편집 불가`, isPlanEditable({ status }) === false);
}
check("CANCELLED 는 승인/거절 대상이 아니다", isPlanEditable({ status: "CANCELLED" }) === false);

console.log("\n== 결제설계 덮어쓰기 가능성 ==");
check("설계 없음은 덮어쓰기 가능", canReplacePlan(null) === true);
check("DRAFT 덮어쓰기 가능", canReplacePlan({ status: "DRAFT" }) === true);
// 취소본 위에 다시 설계할 수 없으면 그 견적은 영영 결제설계를 붙일 수 없다 (검증에서 잡힌 버그).
check("CANCELLED 위에 재설계 가능", canReplacePlan({ status: "CANCELLED" }) === true);
for (const status of ["APPROVED", "REJECTED"]) {
  check(`${status} 는 덮어쓰기 불가 — 먼저 취소해야 한다`, canReplacePlan({ status }) === false);
}

console.log(`\n결과: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
