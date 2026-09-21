<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# LG Bestshop — 프로젝트 규약

계획: `.omc/plans/lg-bestshop-project-plan.md` · 요구사항: `PRD.md` · 디자인: `design-system.md`

## 스택
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS **v3** (`tailwind.config.ts`) · Prisma **6** + SQLite

## 반드시 지킬 것
- **금액은 모두 `Int` (KRW).** 스키마·계산·API 어디에도 `Float` 금지. 이율은 basis point Int (590 = 5.90%).
- **SQLite 제약**: Prisma `enum`/`Json` 사용 불가. 상태값은 `String` 컬럼 + `src/lib/enums.ts`의 유니온 타입이 단일 진실 공급원. JSON은 문자열로 저장하고 필드명에 `Json` 접미사를 붙인다.
- **디자인 토큰만 사용.** 컴포넌트에 hex 값을 직접 쓰지 않는다. `bg-lg-red`, `text-gray-700`, `rounded-card`, `text-display` 등 `tailwind.config.ts`의 토큰을 쓴다.
- **상태를 색상만으로 전달하지 않는다** (design-system §7). `Badge`는 기본적으로 아이콘+텍스트를 함께 렌더한다.
- **공통 UI는 `src/components/ui`에서 import** (`@/components/ui`). 새 프리미티브가 필요하면 거기에 추가한다.
- **재고 차감은 `prisma.$transaction` + 조건부 `updateMany(where: { quantity: { gte: n } })`.** read-then-write 금지.
- **목록 조회는 매장 범위로 스코프.** 공용 헬퍼(Phase 1에서 추가)를 라우트 핸들러 최초 작성 시점부터 사용한다.

## 인증/인가 (Phase 1에서 확정 — API 고정)

`src/lib/auth.ts` 에서 import 한다. 직접 쿠키를 읽거나 매장 필터를 손으로 쓰지 않는다.

```ts
interface AuthContext { manager: Manager; store: Store; role: ManagerRole; isHQ: boolean; isStoreAdmin: boolean }

requireManager(): Promise<AuthContext>          // 화면/액션용. 비로그인이면 /login 리다이렉트
getAuthContext(): Promise<AuthContext | null>   // Route Handler 용. 비로그인이면 null → 401
scopeToStore(ctx): { storeId?: string }         // storeId 컬럼이 있는 모델의 where 에 spread
scopeCustomerToStore(ctx): { consultations?: { some: { storeId: string } } }  // Customer 전용
canAccessStore(ctx, storeId): boolean           // 단건 소유권 확인
assertStoreAccess(ctx, storeId): Promise<void>  // 실패 시 notFound()
```

```ts
const ctx = await requireManager();
const quotes = await prisma.quote.findMany({ where: { ...scopeToStore(ctx), status: "DRAFT" } });
```

- 세션은 HttpOnly 쿠키 `bestshop_session` = `base64url(payload).HMAC-SHA256`, `SESSION_SECRET` 로 서명, 8시간 만료.
- `createSession()` / `destroySession()` 은 쿠키를 쓰므로 **Server Action 또는 Route Handler 에서만** 호출한다.
- 인증 후 화면은 `<PageHeader title="..." />` 를 쓴다 (매니저/매장명/로그아웃 자동 처리).
- HQ 는 전 매장 조회 가능하지만 전용 UI 는 만들지 않는다 (계획 §1).

## 고객 (Phase 2에서 확정)

- **Customer 를 읽는 모든 쿼리는 `customerAccessWhere(ctx)`** (`src/lib/customers.ts`) 를 쓴다.
  `scopeCustomerToStore` 만 쓰면 상담 이력이 아직 없는 워크인 신규 고객을 영영 찾을 수 없다.
  `customerAccessWhere` 는 (1) 이 매장 상담 이력 (2) 그 고객으로 병합된 중복 레코드
  (3) 어디에도 귀속되지 않은 신규 고객 — 세 갈래를 OR 로 묶는다. 관계 필터에도 그대로 쓸 수 있다
  (`recentlyViewed.findMany({ where: { customer: { is: customerAccessWhere(ctx) } } })`).
- **고객을 쓰는 모든 경로는 `phoneNormalized` 를 함께 채운다** — `normalizePhone()` (`src/lib/phone.ts`).
  표시용 하이픈은 `formatPhone()`.
- **Consultation 은 매니저가 명시적으로 시작할 때만 생성한다** (계획 §1). 고객조회/상세 렌더는 상담을 만들지 않는다.
  생성 액션은 `startConsultationAction` 이고 시작 단계는 `enums.ts` 의 `IN_PROGRESS`.
- **고객을 수정/삭제하는 액션은 `customerAccessWhere` 가 아니라 `customerMutationAccessWhere`** (`src/lib/customers.ts`)
  를 쓴다. 상담 이력이 아직 없는 워크인 고객은 어느 매장이든 **조회**할 수 있어야 하지만, PII 를
  **쓰는** 건 그 고객을 등록한 매장(`Customer.registeredByStoreId`)으로 좁힌다 — 아니면 타 매장이
  남의 워크인 고객 정보를 상담 시작 전에 덮어쓸 수 있다 (최종 보안 리뷰 LOW-4). `registeredByStoreId`
  는 `createCustomerAction` 이 생성 시점에 채우고, 비어 있으면(레거시 시드) 여전히 누구나 쓸 수 있다.
- **`"use server"` 파일은 async 함수만 export 할 수 있다.** 폼 상태 타입/상수는 `src/lib/form-state.ts` 에 둔다.
- 날짜·금액 표기는 `src/lib/format.ts` (`formatDate` / `formatDateTime` / `formatKRW` / `toDateInputValue`) 를 쓴다. 시간대는 KST 고정.
- 고객상세의 보유가전은 `/products?categoryId=<Category.id>&category=<Category.code>` 로 링크한다.
  **Phase 3(상품탐색)은 둘 중 하나를 받으면 된다** — 둘 다 붙여 두었으니 어느 쪽을 구현하든 링크가 깨지지 않는다.
  카테고리 필터를 만들 때 `Category.parentId` 하위 카테고리가 생기면 자식까지 매칭할지 정해야 한다(현재 시드는 전부 flat).

## 견적 (Phase 6에서 확정)

- **`Quote` / `QuoteItem` 쓰기는 `src/lib/quote-actions.ts` 를 거친다.** 라인·수수료가 바뀌면
  `recalculateQuote()` 가 합계를 다시 계산해 저장한다. `Quote.subtotal/discountTotal/grandTotal` 을
  직접 update 하지 말 것 — 라인과 어긋나면 상세 화면이 경고를 띄운다.
- **DRAFT 만 편집 가능.** `isQuoteEditable(quote)` 가 단일 판정자이고, 모든 쓰기 액션이 첫 줄에서
  확인한다. 잠긴 견적은 `forkQuoteAction` 으로 새 버전을 떠서 이어간다 (원본 불변).
- **단가는 담는 순간 `Product.basePrice` → `QuoteItem.unitPriceSnapshot` 으로 복사한다.**
  이후 어떤 경로에서도 스냅샷을 갱신하지 않는다. 프로모션 재적용조차 단가는 건드리지 않는다.
- **프로모션 할인은 `src/lib/promotions.ts` 가 이미 `0 <= discount <= lineTotal` 로 clamp 한다.**
  호출측에서 다시 clamp 하지 말 것. 견적 총액에만 별도로 0 하한을 둔다.
- 견적번호는 `Q-{매장코드}-{YYMMDD}-{일련번호}` (`nextQuoteNo`).
- 금액 계산 불변식은 `npm run check:quote-calc` 로 돌린다 (`scripts/quote-calc-check.ts`).

## 결제 및 금융설계 (Phase 7에서 확정)

- **할부 계산의 단일 진실 공급원은 `computeSchedule()`** (`src/lib/payments.ts`). 화면·비교표·저장
  경로가 전부 같은 함수를 쓴다. 회차 금액을 직접 계산하지 말 것.
- **불변식**: `monthlyAmount × (months − 1) + lastMonthAmount === totalPayable − downPayment`.
  회차가 없으면(`months === 0`) `totalPayable − downPayment === financedAmount`.
- **할부수수료는 단리** — `할부원금 × apr(bp) × 개월 ÷ (10000 × 12)`, 원 단위 절사.
  원리금 균등상환은 거듭제곱 때문에 부동소수점이 끼어 쓰지 않는다.
- **`Quote.status` 는 앞으로만 간다**: `DRAFT → SENT`(결제설계 저장) `→ LOCKED`(Phase 8 계약).
  유일한 예외가 **결제설계 취소**로, `SENT → DRAFT` 로 되돌린다 (원인을 거두면 결과도 거둔다).
- **`isPlanEditable` 과 `canReplacePlan` 은 다르다.** 전자는 승인/거절 가능 여부(DRAFT만),
  후자는 새 설계로 덮어쓰기 가능 여부(DRAFT + CANCELLED). 취소본 위에는 다시 설계할 수 있어야 한다.
- 결제 승인은 **모의 구현**이다 (전자서명과 같은 성격). 실제 PG 연동 없음.

## 계약 및 전자서명 (Phase 8에서 확정)

- **계약 생성은 단일 트랜잭션이다** (`createContractAction`): 견적 상태 재확인 → 재고 조건부
  차감 → Contract → 견적 LOCKED → 상담 CONTRACTED → SignatureRequest. 하나라도 실패하면
  전부 롤백된다. "재고는 빠졌는데 계약이 없는" 중간 상태가 존재할 수 없다.
- **재고 차감은 `updateMany({ where: { quantity: { gte: qty } } })` + `count === 1` 검사만 쓴다.**
  읽고 나서 쓰면 두 매니저가 마지막 1대를 동시에 판다. 실패는 트랜잭션 안에서 throw 해서
  이미 차감한 품목까지 롤백시킨다.
- **`/sign/[token]` 은 의도적으로 인증이 없다.** 고객은 계정이 없고, 접근 제어는 32바이트 난수
  토큰의 소지다. `(app)` 바깥에 두어 세션 가드와 앱 셸을 피한다. **스코프 누락이 아니다.**
- **계약 금액·고객·배송지·금융조건은 전부 계약 시점 스냅샷**이다. 원본이 바뀌어도 계약서는
  움직이지 않는다. `Contract.totalAmount` = `PaymentPlan.totalPayable` (이자 포함 실제 청구액).
- **계약 금액이 바뀌면 살아 있는 서명 요청을 자동 무효화**하고 새 링크를 발급한다.
- 서명이 완료되면 같은 트랜잭션에서 `Order` + `OrderItem` 을 만들고 견적을 `CONVERTED` 로 올린다.

## 배송 및 설치 (Phase 9에서 확정)

- **상태 전이는 `src/lib/orders.ts` 의 전이표가 유일한 판정자다.** 화면 버튼과 무관하게
  서버 액션이 같은 표로 다시 검사한다. 전이표에 없는 이동은 거부된다.
- **설치 완료는 대응하는 배송이 완료된 뒤에만 가능하다** (`canCompleteInstall`). 대응 관계는
  `deliveryJobId` 직접 지정 → 같은 `orderItemId` → 주문 전체 순으로 판정한다.
- **주문 상태는 작업들에서 파생한다** (`orderProgress`). 부분 배송을 전제로 **가장 덜 진행된
  작업**을 따르고, 취소된 작업은 집계에서 빠진다. `Order.status` 는 그 파생값의 캐시이고
  `syncOrderStatus()` 가 작업 변경 때마다 맞춘다. `INSTALLED` 는 파생되지 않는다.
- **지연은 저장하지 않고 조회 시점에 계산한다** (`isDeliveryDelayed`/`isInstallDelayed`).
  스키마의 `delayed` 컬럼은 쓰지 않는다 — 배치가 없어 항상 낡은 값이 된다.
- **일정 변경은 `ScheduleChange` 에 반드시 기록한다.** `scheduledAt` 을 조용히 덮어쓰지 않는다.
  실패한 작업의 일정을 다시 잡을 때만 `SCHEDULED` 로 후진하며, 그것도 이력에 남는다.
- **`/track/[token]` 은 의도적으로 인증이 없다** (`/sign/[token]` 과 같은 설계). 읽기 전용이고
  금액·담당자·내부 메모는 **조회 자체를 하지 않는다** (`findOrderByTrackingToken` 의 select).
- 상태머신 불변식은 `npm run check:delivery-state` 로 돌린다.

## 상담이력 (Phase 10a에서 확정)

- **상담 단계는 `advanceConsultationStage()` 하나로만 바꾼다** (`src/lib/consultations.ts`).
  `stage` 를 직접 update 하지 말 것 — 전진 판정이 흩어지면 뒤로 가는 경로가 생긴다.
- **단계는 앞으로만 간다.** `IN_PROGRESS → QUOTED → CONTRACTED → DELIVERING → COMPLETED`,
  종착은 `COMPLETED` · `CLOSED` · `CANCELLED` 셋이고 한 번 들어오면 나가지 않는다.
- 자동 전이 지점: 견적 생성 → `QUOTED`, 계약 생성 → `CONTRACTED`, 주문이 `PLACED` 를 벗어남
  → `DELIVERING`, 주문 완료 → `COMPLETED`, 계약 취소 → `CANCELLED`.
  사용자가 명시적으로 누르는 전이는 **상담 종료(`CLOSED`)** 하나뿐이다.
- **`CLOSED` 와 `COMPLETED` 는 다르다.** `COMPLETED` 는 주문까지 끝난 전환 성공,
  `CLOSED` 는 매니저가 판매 없이 닫은 상담, `CANCELLED` 는 무효화.
- **상담 메모는 작성자만 수정·삭제할 수 있다.** 남의 상담 기록을 대신 고쳐 쓰면 이력이 무의미해진다.
- `ConsultationNote`/`FollowUp` 에는 `storeId` 가 없다. 상담을 통해 스코프한다
  (`consultation: scopeToStore(ctx)`).
- **검색어에서 숫자를 뽑아 전화번호 절을 만들 때, 숫자가 없으면 절 자체를 빼라.**
  빈 문자열 `contains` 는 전 행과 매칭되어 스코프를 무력화한다.

## 시드 계정
비밀번호는 전부 `bestshop1234`. `M1001` 김민수(강남점 MANAGER) · `M1003` 박서준(강남점 STORE_ADMIN) · `M9001` 한지훈(HQ).

## 명령
`npm run dev` · `npm run build` · `npm run typecheck` · `npm run db:migrate` · `npm run db:seed` · `npm run db:reset`
