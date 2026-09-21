import type { PrismaClient } from "@prisma/client";

// Phase 7: 금융상품 (FinanceProduct).
//
// apr 은 basis point Int (590 = 5.90%). months 0 은 일시납.
// 계획 §1 대로 렌탈은 별도 계약 유형이 아니라 type = "RENTAL" 인 금융상품이다.
//
// 표본에 무이자(apr 0) · 유이자 · 금액 하한 · 금액 상한 · 렌탈 장기가 모두 들어 있어
// 결제수단 비교표와 적용 불가 사유가 처음부터 다 보인다.

const FINANCE_PRODUCTS = [
  {
    code: "LUMP-CASH",
    name: "일시불 (현금/계좌이체)",
    type: "LUMP",
    months: 0,
    apr: 0,
    provider: null,
    minAmount: null,
    maxAmount: null,
    benefitNote: "즉시 결제. 할부 수수료가 없습니다.",
  },
  {
    code: "CARD-LUMP",
    name: "카드 일시불",
    type: "CARD",
    months: 0,
    apr: 0,
    provider: "제휴 신용카드",
    minAmount: null,
    maxAmount: null,
    benefitNote: "카드사 청구할인 별도 적용 가능.",
  },
  {
    code: "CARD-03",
    name: "카드 3개월 무이자",
    type: "INSTALLMENT",
    months: 3,
    apr: 0,
    provider: "제휴 신용카드",
    minAmount: 300_000,
    maxAmount: null,
    benefitNote: "30만원 이상 결제 시 3개월 무이자.",
  },
  {
    code: "CARD-06",
    name: "카드 6개월 할부",
    type: "INSTALLMENT",
    months: 6,
    apr: 590,
    provider: "제휴 신용카드",
    minAmount: 300_000,
    maxAmount: null,
    benefitNote: null,
  },
  {
    code: "CARD-12",
    name: "카드 12개월 할부",
    type: "INSTALLMENT",
    months: 12,
    apr: 790,
    provider: "제휴 신용카드",
    minAmount: 500_000,
    maxAmount: null,
    benefitNote: null,
  },
  {
    code: "CARD-24",
    name: "카드 24개월 장기할부",
    type: "INSTALLMENT",
    months: 24,
    apr: 990,
    provider: "제휴 신용카드",
    minAmount: 1_000_000,
    maxAmount: null,
    benefitNote: "100만원 이상 결제 시 신청 가능.",
  },
  {
    code: "CARD-36",
    name: "카드 36개월 장기할부",
    type: "INSTALLMENT",
    months: 36,
    apr: 1_190,
    provider: "제휴 신용카드",
    minAmount: 3_000_000,
    maxAmount: null,
    benefitNote: "300만원 이상 고액 결제 전용.",
  },
  {
    code: "RENTAL-36",
    name: "LG 케어솔루션 렌탈 36개월",
    type: "RENTAL",
    months: 36,
    apr: 0,
    provider: "LG전자 케어솔루션",
    minAmount: 500_000,
    maxAmount: 5_000_000,
    benefitNote: "정기 방문관리 포함. 소유권은 약정 종료 후 이전됩니다.",
  },
  {
    code: "RENTAL-60",
    name: "LG 케어솔루션 렌탈 60개월",
    type: "RENTAL",
    months: 60,
    apr: 0,
    provider: "LG전자 케어솔루션",
    minAmount: 1_000_000,
    maxAmount: 8_000_000,
    benefitNote: "월 부담이 가장 낮은 구성. 중도 해지 위약금이 있습니다.",
  },
  {
    code: "CARD-18-OLD",
    name: "카드 18개월 할부 (판매중지)",
    type: "INSTALLMENT",
    months: 18,
    apr: 890,
    provider: "제휴 신용카드",
    minAmount: null,
    maxAmount: null,
    benefitNote: "제휴 종료로 신규 신청이 중단되었습니다.",
    active: false,
  },
];

export async function seedFinanceProducts(prisma: PrismaClient): Promise<void> {
  for (const product of FINANCE_PRODUCTS) {
    await prisma.financeProduct.upsert({
      where: { code: product.code },
      update: product,
      create: product,
    });
  }
  console.log(`seeded ${FINANCE_PRODUCTS.length} finance products`);
}
