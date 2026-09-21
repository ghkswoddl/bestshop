// 통합 시나리오 시드 — 고객을 **실제 서버 액션으로** 상담 파이프라인에 태운다.
//
//   1) npm run dev            (다른 터미널에서 서버를 띄워 둔다)
//   2) npm run db:seed        (기본 데이터)
//   3) npm run seed:scenarios (이 스크립트)
//
// 왜 raw insert 가 아니라 HTTP 인가:
//   견적 생성·재고 조건부 차감·스냅샷·상담 단계 전이는 전부 서버 액션 트랜잭션 안에 있다.
//   DB 에 직접 꽂으면 그 로직을 건너뛰어 "화면에서는 불가능한 상태" 의 데이터가 만들어진다.
//   여기서는 매니저가 화면에서 누르는 것과 **똑같은 경로**(Next 의 no-JS 폼 액션)로 만든다.
//   그래서 이 스크립트는 시드인 동시에 전 Phase 트랜잭션에 대한 통합 검증이기도 하다.
//
// `requireManager()` 가 세션 쿠키를 읽으므로 로그인 쿠키를 직접 서명해 붙인다
// (`SESSION_SECRET` 은 Phase 1 이 정한 HMAC 방식 그대로).

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.SCENARIO_BASE ?? "http://127.0.0.1:3002";
const prisma = new PrismaClient();

const env = readFileSync(".env", "utf8");
const SECRET = /^SESSION_SECRET\s*=\s*"?([^"\r\n]+)"?/m.exec(env)?.[1];
if (!SECRET) throw new Error("SESSION_SECRET 을 .env 에서 찾지 못했습니다.");

function cookieFor(managerId: string): string {
  const body = Buffer.from(
    JSON.stringify({ managerId, exp: Date.now() + 3_600_000 }),
  ).toString("base64url");
  const signature = createHmac("sha256", SECRET!).update(body).digest("base64url");
  return `bestshop_session=${body}.${signature}`;
}

/** dev 서버는 요청이 와야 라우트를 컴파일한다. 액션 id 를 읽기 전에 먼저 훑는다. */
async function warm(path: string, cookie: string): Promise<void> {
  await fetch(`${BASE}${path}`, { headers: { cookie } });
}

function actionIds(routePath: string): Record<string, string> {
  const file = `.next/dev/server/app/${routePath}/server-reference-manifest.json`;
  const manifest = JSON.parse(readFileSync(file, "utf8")).node as Record<
    string,
    { exportedName: string }
  >;
  const map: Record<string, string> = {};
  for (const [id, entry] of Object.entries(manifest)) map[entry.exportedName] = id;
  return map;
}

interface CallOptions {
  path: string;
  actionId: string;
  cookie: string;
  fields?: Record<string, string>;
  repeated?: Record<string, string[]>;
}

/** Next 의 no-JS 폼 경로로 서버 액션을 실행한다 (`$ACTION_ID_<id>` 히든 필드). */
async function call({ path, actionId, cookie, fields, repeated }: CallOptions) {
  const form = new FormData();
  form.set(`$ACTION_ID_${actionId}`, "");
  for (const [key, value] of Object.entries(fields ?? {})) form.set(key, value);
  for (const [key, values] of Object.entries(repeated ?? {})) {
    for (const value of values) form.append(key, value);
  }
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { cookie },
    body: form,
    redirect: "manual",
  });
  return { status: res.status, location: res.headers.get("location") ?? "" };
}

function fail(step: string, detail: string): never {
  throw new Error(`[${step}] 실패: ${detail}`);
}

// --------------------------------------------------------------- 시나리오 정의

/** 각 고객을 어느 단계까지 끌고 갈지. 앞 단계는 모두 거쳐 간다. */
type Target = "QUOTED" | "CONTRACTED" | "DELIVERING" | "COMPLETED" | "CONTRACT_CANCELLED";

interface Scenario {
  memberNo: string;
  target: Target;
  /** 견적에 담을 품목 수. */
  items: number;
  financeCode: string;
  downPayment?: number;
}

const SCENARIOS: Scenario[] = [
  // 견적까지
  { memberNo: "LG10002", target: "QUOTED", items: 2, financeCode: "CARD-12" },
  { memberNo: "LG10009", target: "QUOTED", items: 1, financeCode: "CARD-06" },
  { memberNo: "LG10016", target: "QUOTED", items: 1, financeCode: "LUMP-CASH" },
  // 계약까지 (서명 대기)
  { memberNo: "LG10003", target: "CONTRACTED", items: 2, financeCode: "CARD-12", downPayment: 500_000 },
  { memberNo: "LG10012", target: "CONTRACTED", items: 1, financeCode: "CARD-03" },
  // 배송 진행중
  { memberNo: "LG10005", target: "DELIVERING", items: 2, financeCode: "CARD-24", downPayment: 1_000_000 },
  { memberNo: "LG10010", target: "DELIVERING", items: 1, financeCode: "RENTAL-36" },
  // 배송·설치까지 완료
  { memberNo: "LG10008", target: "COMPLETED", items: 1, financeCode: "LUMP-CASH" },
  { memberNo: "LG10014", target: "COMPLETED", items: 2, financeCode: "CARD-06" },
  // 계약 취소 → 상담 CANCELLED
  { memberNo: "LG10013", target: "CONTRACT_CANCELLED", items: 1, financeCode: "CARD-12" },
  { memberNo: "LG10015", target: "CONTRACT_CANCELLED", items: 1, financeCode: "LUMP-CASH" },
];

// ------------------------------------------------------------------ 실행

async function runScenario(scenario: Scenario): Promise<string> {
  const customer = await prisma.customer.findUnique({
    where: { memberNo: scenario.memberNo },
    select: { id: true, name: true },
  });
  if (!customer) fail(scenario.memberNo, "고객을 찾지 못했습니다");

  const consultation = await prisma.consultation.findFirst({
    where: { customerId: customer.id },
    orderBy: { startedAt: "desc" },
    select: { id: true, managerId: true, storeId: true, stage: true },
  });
  if (!consultation) fail(scenario.memberNo, "상담이 없습니다");

  // 이미 견적이 붙어 있으면 이 시나리오는 지난 실행에서 끝났다 — 멱등하게 건너뛴다.
  const existing = await prisma.quote.count({ where: { consultationId: consultation.id } });
  if (existing > 0) return `${customer.name}: 이미 처리됨 (건너뜀)`;

  const cookie = cookieFor(consultation.managerId);

  // 해당 매장에 재고가 넉넉한 판매중 상품을 고른다 (계약 시 조건부 차감을 통과해야 한다).
  const inventory = await prisma.inventoryItem.findMany({
    where: { storeId: consultation.storeId, quantity: { gte: 3 }, product: { status: "ON_SALE" } },
    orderBy: { quantity: "desc" },
    take: scenario.items,
    select: { productId: true },
  });
  if (inventory.length < scenario.items) {
    fail(scenario.memberNo, `매장에 재고가 충분한 상품이 부족합니다 (${inventory.length}/${scenario.items})`);
  }
  const productIds = inventory.map((row) => row.productId);

  // 1) 견적 생성 (프로모션 자동 적용 + 단가 스냅샷 + 상담 QUOTED)
  await warm("/quotes/new", cookie);
  const quoteAction = actionIds("(app)/quotes/new/page").createQuoteAction;
  const created = await call({
    path: "/quotes/new",
    actionId: quoteAction,
    cookie,
    fields: { customerId: customer.id, consultationId: consultation.id },
    repeated: { productId: productIds },
  });
  if (!created.location.includes("/quotes/")) {
    fail(scenario.memberNo, `견적 생성 실패 (${created.location || created.status})`);
  }

  const quote = await prisma.quote.findFirst({
    where: { consultationId: consultation.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, grandTotal: true },
  });
  if (!quote) fail(scenario.memberNo, "생성된 견적을 찾지 못했습니다");
  if (scenario.target === "QUOTED") return `${customer.name}: 견적 ${quote.grandTotal.toLocaleString("ko-KR")}원`;

  // 2) 결제설계 저장 + 승인 (견적 SENT 로 잠김)
  const payPath = `/quotes/${quote.id}/payment`;
  await warm(payPath, cookie);
  const payActions = actionIds("(app)/quotes/[id]/payment/page");

  const finance = await prisma.financeProduct.findUnique({ where: { code: scenario.financeCode } });
  if (!finance) fail(scenario.memberNo, `금융상품 ${scenario.financeCode} 없음`);

  const saved = await call({
    path: payPath,
    actionId: payActions.savePaymentPlanAction,
    cookie,
    fields: {
      quoteId: quote.id,
      financeProductId: finance.id,
      downPayment: String(scenario.downPayment ?? 0),
    },
  });
  if (!saved.location.includes("pay=saved")) {
    fail(scenario.memberNo, `결제설계 실패 (${saved.location})`);
  }

  const approved = await call({
    path: payPath,
    actionId: payActions.decidePaymentPlanAction,
    cookie,
    fields: { quoteId: quote.id, decision: "approve" },
  });
  if (!approved.location.includes("pay=approved")) {
    fail(scenario.memberNo, `결제 승인 실패 (${approved.location})`);
  }

  // 3) 계약 생성 (재고 조건부 차감 + 스냅샷 + 견적 LOCKED + 상담 CONTRACTED + 서명요청)
  const quotePath = `/quotes/${quote.id}`;
  await warm(quotePath, cookie);
  const contractAction = actionIds("(app)/quotes/[id]/page").createContractAction;
  const contracted = await call({
    path: quotePath,
    actionId: contractAction,
    cookie,
    fields: { quoteId: quote.id },
  });
  if (!contracted.location.includes("/contracts/")) {
    fail(scenario.memberNo, `계약 생성 실패 (${contracted.location})`);
  }

  const contract = await prisma.contract.findUnique({
    where: { quoteId: quote.id },
    select: { id: true, contractNo: true, signatureRequests: { select: { token: true } } },
  });
  if (!contract) fail(scenario.memberNo, "생성된 계약을 찾지 못했습니다");

  if (scenario.target === "CONTRACTED") return `${customer.name}: 계약 ${contract.contractNo} (서명 대기)`;

  if (scenario.target === "CONTRACT_CANCELLED") {
    const contractPath = `/contracts/${contract.id}`;
    await warm(contractPath, cookie);
    const cancelAction = actionIds("(app)/contracts/[id]/page").cancelContractAction;
    const cancelled = await call({
      path: contractPath,
      actionId: cancelAction,
      cookie,
      fields: { contractId: contract.id, cancelReason: "고객 변심으로 계약 취소" },
    });
    if (!cancelled.location.includes("contract=cancelled")) {
      fail(scenario.memberNo, `계약 취소 실패 (${cancelled.location})`);
    }
    return `${customer.name}: 계약 ${contract.contractNo} 취소 → 상담 CANCELLED`;
  }

  // 4) 전자서명 (주문 + OrderItem 생성, 견적 CONVERTED)
  const token = contract.signatureRequests[0]?.token;
  if (!token) fail(scenario.memberNo, "서명 요청 토큰이 없습니다");

  const signPath = `/sign/${token}`;
  await fetch(`${BASE}${signPath}`);
  const signAction = actionIds("sign/[token]/page").signContractAction;
  const signed = await call({
    path: signPath,
    actionId: signAction,
    cookie: "",
    fields: {
      token,
      signerName: customer.name,
      // 1×1 투명 PNG — 모의 서명 이미지.
      signatureImage:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    },
  });
  if (!signed.location.includes("signed=1")) {
    fail(scenario.memberNo, `전자서명 실패 (${signed.location})`);
  }

  const order = await prisma.order.findUnique({
    where: { contractId: contract.id },
    select: { id: true, orderNo: true, items: { select: { id: true } } },
  });
  if (!order) fail(scenario.memberNo, "생성된 주문을 찾지 못했습니다");

  // 5) 배송 작업 등록 (주문이 PLACED 를 벗어나며 상담 DELIVERING)
  const deliveryPath = `/deliveries/${order.id}`;
  await warm(deliveryPath, cookie);
  const jobActions = actionIds("(app)/deliveries/[id]/page");

  const inDays = (days: number) => {
    const at = new Date(Date.now() + days * 86_400_000 + 9 * 3_600_000);
    return at.toISOString().slice(0, 16);
  };

  for (const item of order.items) {
    const madeJob = await call({
      path: deliveryPath,
      actionId: jobActions.createDeliveryJobAction,
      cookie,
      fields: {
        orderId: order.id,
        orderItemId: item.id,
        scheduledAt: inDays(scenario.target === "COMPLETED" ? -3 : 3),
        carrier: "LG 물류",
      },
    });
    if (!madeJob.location.includes("delivery=job-created")) {
      fail(scenario.memberNo, `배송 작업 등록 실패 (${madeJob.location})`);
    }
  }

  if (scenario.target === "DELIVERING") {
    // 한 건만 배송중으로 올려 '부분 배송' 상태를 만든다.
    const first = await prisma.deliveryJob.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (first) {
      await call({
        path: deliveryPath,
        actionId: jobActions.advanceDeliveryAction,
        cookie,
        fields: { orderId: order.id, jobId: first.id, status: "IN_TRANSIT" },
      });
    }
    return `${customer.name}: 주문 ${order.orderNo} 배송중`;
  }

  // 6) 배송 완료 → 설치 등록 → 설치 완료 (주문 COMPLETED → 상담 COMPLETED)
  const jobs = await prisma.deliveryJob.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  for (const job of jobs) {
    for (const status of ["IN_TRANSIT", "DELIVERED"]) {
      const moved = await call({
        path: deliveryPath,
        actionId: jobActions.advanceDeliveryAction,
        cookie,
        fields: { orderId: order.id, jobId: job.id, status },
      });
      if (!moved.location.includes("delivery=status-changed")) {
        fail(scenario.memberNo, `배송 전이 ${status} 실패 (${moved.location})`);
      }
    }
  }

  const firstItem = order.items[0];
  const installCreated = await call({
    path: deliveryPath,
    actionId: jobActions.createInstallJobAction,
    cookie,
    fields: {
      orderId: order.id,
      orderItemId: firstItem.id,
      scheduledAt: inDays(-1),
      technicianName: "설치기사 김철수",
    },
  });
  if (!installCreated.location.includes("delivery=job-created")) {
    fail(scenario.memberNo, `설치 작업 등록 실패 (${installCreated.location})`);
  }

  const install = await prisma.installJob.findFirst({
    where: { orderId: order.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!install) fail(scenario.memberNo, "설치 작업을 찾지 못했습니다");

  for (const status of ["ASSIGNED", "IN_PROGRESS", "COMPLETED"]) {
    const moved = await call({
      path: deliveryPath,
      actionId: jobActions.advanceInstallAction,
      cookie,
      fields: { orderId: order.id, jobId: install.id, status },
    });
    if (!moved.location.includes("delivery=status-changed")) {
      fail(scenario.memberNo, `설치 전이 ${status} 실패 (${moved.location})`);
    }
  }

  return `${customer.name}: 주문 ${order.orderNo} 배송·설치 완료`;
}

async function main(): Promise<void> {
  // 서버가 떠 있는지 먼저 확인한다 — 안 떠 있으면 원인이 분명한 메시지로 끝낸다.
  try {
    await fetch(`${BASE}/login`);
  } catch {
    throw new Error(
      `서버(${BASE})에 연결할 수 없습니다. 다른 터미널에서 \`npm run dev\` 를 먼저 실행하세요.`,
    );
  }

  console.log(`시나리오 시드 시작 (${SCENARIOS.length}건) → ${BASE}`);
  for (const scenario of SCENARIOS) {
    const result = await runScenario(scenario);
    console.log(`  ${scenario.target.padEnd(18)} ${result}`);
  }

  const stages = await prisma.consultation.groupBy({
    by: ["stage"],
    _count: { stage: true },
    orderBy: { stage: "asc" },
  });
  console.log("\n상담 단계 분포:");
  for (const row of stages) console.log(`  ${row.stage.padEnd(14)} ${row._count.stage}건`);

  console.log(
    `\n견적 ${await prisma.quote.count()} · 계약 ${await prisma.contract.count()} · ` +
      `주문 ${await prisma.order.count()} · 후속조치 ${await prisma.followUp.count()}`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
