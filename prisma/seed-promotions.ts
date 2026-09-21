import type { PrismaClient } from "@prisma/client";

// Phase 5 시드. 파생 상태(진행중 / 신규 / 종료임박 / 진행예정 / 종료 / 취소)가 화면에서
// 전부 보이도록 기준시각 기준 상대 날짜로 깐다. 재시드하면 날짜가 다시 당겨진다.
//
// prisma/seed.ts 가 seedPromotions(prisma) 한 줄로 호출한다 (worker-3 의 seed-catalog 와 같은 형태).

const DAY = 86_400_000;

interface PromotionSeed {
  code: string;
  title: string;
  description: string;
  benefitType: string;
  benefitValue: number;
  conditions: Record<string, unknown> | null;
  status: string;
  /** 기준시각 대비 일수. 음수는 과거. */
  startsInDays: number;
  endsInDays: number;
  createdInDays: number;
  modelCodes: string[];
}

const PROMOTIONS: PromotionSeed[] = [
  {
    code: "NEWYEAR-PKG",
    title: "신혼 혼수 패키지 10% 할인",
    description: "혼수 대상 프리미엄 가전을 2개 이상 구매하면 정률 할인이 적용됩니다.",
    benefitType: "PERCENT_DISCOUNT",
    benefitValue: 10,
    conditions: { minQty: 2, maxDiscount: 500000, note: "타 정률 할인과 중복 적용 불가" },
    status: "ACTIVE",
    startsInDays: -20,
    endsInDays: 40,
    createdInDays: -25,
    modelCodes: ["M872MEE011", "FX25ESE", "W24EE", "RH20ETN", "S5MOC"],
  },
  {
    code: "OLED-TRADE",
    title: "OLED TV 보상판매 30만원 할인",
    description: "사용하던 TV를 반납하면 대상 OLED 모델을 개당 30만원 할인해 드립니다.",
    benefitType: "AMOUNT_DISCOUNT",
    benefitValue: 300000,
    conditions: { note: "기존 TV 반납 확인 후 적용" },
    status: "ACTIVE",
    startsInDays: -10,
    endsInDays: 25,
    createdInDays: -12,
    modelCodes: ["OLED65G4KNA", "OLED55C4KNA"],
  },
  {
    code: "AIRCON-EARLY",
    title: "에어컨 사전예약 15% 할인",
    description: "성수기 이전 사전예약 고객 대상 정률 할인. 설치 일정은 순차 배정됩니다.",
    benefitType: "PERCENT_DISCOUNT",
    benefitValue: 15,
    conditions: { maxDiscount: 300000 },
    status: "ACTIVE",
    startsInDays: -30,
    endsInDays: 4,
    createdInDays: -32,
    modelCodes: ["FQ19ED9WA2", "FQ17ETNBA2", "ZRNQ0580T2S", "SQ06EDAWAS"],
  },
  {
    code: "CLEAN-GIFT",
    title: "코드제로 구매 시 전용 거치대 증정",
    description: "대상 청소기 구매 고객에게 전용 충전 거치대를 증정합니다.",
    benefitType: "GIFT",
    benefitValue: 0,
    conditions: { note: "사은품 재고 소진 시 조기 종료" },
    status: "ACTIVE",
    startsInDays: -5,
    endsInDays: 60,
    createdInDays: -5,
    modelCodes: ["AO9781WKS", "AX9884IKS", "R585BKA"],
  },
  {
    code: "DISH-CASHBACK",
    title: "식기세척기 10만원 캐시백",
    description: "100만원 이상 구매 시 카드사 캐시백 10만원이 별도 지급됩니다.",
    benefitType: "CASHBACK",
    benefitValue: 100000,
    conditions: { minAmount: 1000000, note: "캐시백은 익월 카드 청구 시 반영" },
    status: "ACTIVE",
    startsInDays: -15,
    endsInDays: 30,
    createdInDays: -15,
    modelCodes: ["DUE4FA", "DUBJ4EA", "DFB22SA"],
  },
  {
    code: "STYLER-LAUNCH",
    title: "스타일러 신모델 런칭 기념 12% 할인",
    description: "신모델 출시를 기념해 스타일러 전 모델을 정률 할인합니다.",
    benefitType: "PERCENT_DISCOUNT",
    benefitValue: 12,
    conditions: { maxDiscount: 250000 },
    status: "ACTIVE",
    startsInDays: -2,
    endsInDays: 45,
    createdInDays: -2,
    modelCodes: ["S5MOC", "S3MFC", "S3RERB"],
  },
  {
    code: "WASH-DRY-BUNDLE",
    title: "세탁기 + 건조기 동시구매 번들 혜택",
    description: "세탁기와 건조기를 함께 구매하면 설치비 면제와 번들 혜택이 제공됩니다.",
    benefitType: "BUNDLE",
    benefitValue: 200000,
    conditions: { minQty: 2, note: "세탁기 1대 + 건조기 1대 이상 구성 시" },
    status: "ACTIVE",
    startsInDays: -18,
    endsInDays: 6,
    createdInDays: -18,
    modelCodes: ["W24EE", "FX25ESE", "F21VDSK", "TR19DK", "RH20ETN", "RH16ESE"],
  },
  {
    code: "SUMMER-TV-PRE",
    title: "여름 프리미엄 TV 사전판매 8% 할인",
    description: "사전판매 기간에만 적용되는 정률 할인입니다. 아직 시작 전입니다.",
    benefitType: "PERCENT_DISCOUNT",
    benefitValue: 8,
    conditions: { maxDiscount: 400000 },
    status: "ACTIVE",
    startsInDays: 10,
    endsInDays: 40,
    createdInDays: -3,
    modelCodes: ["OLED65G4KNA", "OLED55C4KNA", "75QNED85", "27ART10", "50UT8300"],
  },
  {
    code: "SPRING-KITCHEN",
    title: "봄맞이 주방가전 5% 할인",
    description: "종료된 프로모션입니다. 견적에 적용할 수 없습니다.",
    benefitType: "PERCENT_DISCOUNT",
    benefitValue: 5,
    conditions: { maxDiscount: 200000 },
    status: "ENDED",
    startsInDays: -70,
    endsInDays: -10,
    createdInDays: -75,
    modelCodes: ["M872MEE011", "M623MWW042", "K334MC13", "B301S32", "DUE4FA", "DUBJ4EA"],
  },
  {
    code: "VIP-RENTAL",
    title: "VIP 한정 렌탈 전환 7% 할인",
    description: "내부 정책 변경으로 취소된 프로모션입니다.",
    benefitType: "PERCENT_DISCOUNT",
    benefitValue: 7,
    conditions: { note: "VIP 등급 고객 한정" },
    status: "CANCELLED",
    startsInDays: -20,
    endsInDays: 20,
    createdInDays: -22,
    modelCodes: ["M872MEE011", "M623MWW042"],
  },
];

interface HistorySeed {
  code: string;
  action: string;
  inDays: number;
  before: unknown;
  after: unknown;
}

// P1 변경 이력 — 별도 테이블 없이 Phase 0 의 AuditLog 를 쓴다.
const HISTORY: HistorySeed[] = [
  {
    code: "AIRCON-EARLY",
    action: "PROMOTION_CREATED",
    inDays: -32,
    before: null,
    after: { title: "에어컨 사전예약 15% 할인", benefitValue: 15, productCount: 3 },
  },
  {
    code: "AIRCON-EARLY",
    action: "PROMOTION_PRODUCTS_CHANGED",
    inDays: -9,
    before: { modelCodes: ["FQ19ED9WA2", "FQ17ETNBA2", "ZRNQ0580T2S"] },
    after: { modelCodes: ["FQ19ED9WA2", "FQ17ETNBA2", "ZRNQ0580T2S", "SQ06EDAWAS"] },
  },
  {
    code: "AIRCON-EARLY",
    action: "PROMOTION_PERIOD_CHANGED",
    inDays: -6,
    before: { endsAtOffsetDays: -3 },
    after: { endsAtOffsetDays: 4 },
  },
  {
    code: "NEWYEAR-PKG",
    action: "PROMOTION_CREATED",
    inDays: -25,
    before: null,
    after: { title: "신혼 혼수 패키지 10% 할인", benefitValue: 10, productCount: 5 },
  },
  {
    code: "NEWYEAR-PKG",
    action: "PROMOTION_CONDITIONS_CHANGED",
    inDays: -8,
    before: { minQty: 3, maxDiscount: 300000 },
    after: { minQty: 2, maxDiscount: 500000 },
  },
  {
    code: "OLED-TRADE",
    action: "PROMOTION_CREATED",
    inDays: -12,
    before: null,
    after: { title: "OLED TV 보상판매 30만원 할인", benefitValue: 300000, productCount: 1 },
  },
  {
    code: "OLED-TRADE",
    action: "PROMOTION_PRODUCTS_CHANGED",
    inDays: -4,
    before: { modelCodes: ["OLED65G4KNA"] },
    after: { modelCodes: ["OLED65G4KNA", "OLED55C4KNA"] },
  },
  {
    code: "WASH-DRY-BUNDLE",
    action: "PROMOTION_CONDITIONS_CHANGED",
    inDays: -7,
    before: { minQty: 2, note: "세탁기 1대 + 건조기 1대" },
    after: { minQty: 2, note: "세탁기 1대 + 건조기 1대 이상 구성 시" },
  },
];

export async function seedPromotions(prisma: PrismaClient) {
  const now = Date.now();
  const at = (days: number) => new Date(now + days * DAY);

  const products = await prisma.product.findMany({ select: { id: true, modelCode: true } });
  const productIdByModel = new Map(products.map((p) => [p.modelCode, p.id]));

  // 프로모션 작성자는 본사 담당자 (계획 §1 — HQ 는 전용 UI 없이 데이터로만 존재).
  const hq = await prisma.manager.findFirst({ where: { role: "HQ" }, select: { id: true } });

  const promotionIdByCode = new Map<string, string>();

  for (const seed of PROMOTIONS) {
    const data = {
      title: seed.title,
      description: seed.description,
      benefitType: seed.benefitType,
      benefitValue: seed.benefitValue,
      conditionsJson: seed.conditions ? JSON.stringify(seed.conditions) : null,
      status: seed.status,
      startsAt: at(seed.startsInDays),
      endsAt: at(seed.endsInDays),
      createdAt: at(seed.createdInDays),
      createdById: hq?.id ?? null,
    };

    const promotion = await prisma.promotion.upsert({
      where: { code: seed.code },
      update: data,
      create: { code: seed.code, ...data },
      select: { id: true },
    });
    promotionIdByCode.set(seed.code, promotion.id);

    const productIds = seed.modelCodes.flatMap((code) => {
      const id = productIdByModel.get(code);
      if (!id) throw new Error(`알 수 없는 모델코드: ${code} (${seed.code})`);
      return [id];
    });

    await prisma.promotionProduct.deleteMany({ where: { promotionId: promotion.id } });
    await prisma.promotionProduct.createMany({
      data: productIds.map((productId) => ({ promotionId: promotion.id, productId })),
    });
  }

  const linkCount = PROMOTIONS.reduce((sum, p) => sum + p.modelCodes.length, 0);
  console.log(`seeded ${PROMOTIONS.length} promotions (${linkCount} product links)`);

  await prisma.auditLog.deleteMany({ where: { entityType: "Promotion" } });
  await prisma.auditLog.createMany({
    data: HISTORY.map((entry) => {
      const entityId = promotionIdByCode.get(entry.code);
      if (!entityId) throw new Error(`알 수 없는 프로모션 코드: ${entry.code}`);
      return {
        entityType: "Promotion",
        entityId,
        action: entry.action,
        actorManagerId: hq?.id ?? null,
        beforeJson: entry.before ? JSON.stringify(entry.before) : null,
        afterJson: entry.after ? JSON.stringify(entry.after) : null,
        createdAt: at(entry.inDays),
      };
    }),
  });
  console.log(`seeded ${HISTORY.length} promotion audit log entries`);
}
