# LG Bestshop 고객상담 매니저

LG Best Shop 매장 상담 매니저가 고객·상품·재고·견적·계약·배송 정보를 단일 화면에서 조회·처리할 수 있도록 지원하는 업무용 웹 애플리케이션입니다. 상담 → 상품탐색/비교 → 재고확인 → 견적 → 결제/금융설계 → 계약/전자서명 → 배송/설치 추적 → 상담이력 기록까지, 고객 구매 여정 전체를 하나의 흐름으로 관리합니다.

> exam/연습 프로젝트입니다. 실제 LG 백엔드 시스템과의 연동은 없으며, 결제 승인과 전자서명은 모의(mock) 구현입니다.

## 기술 스택

- **프론트엔드**: Next.js 16 (App Router) · React 19 · TypeScript
- **스타일**: Tailwind CSS v3 (`tailwind.config.ts`에 [design-system.md](./design-system.md) 토큰 전체 반영)
- **백엔드**: Next.js Route Handlers / Server Actions
- **DB/ORM**: SQLite + Prisma 6

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

`.env.example`을 복사해 `.env`를 만들고 `SESSION_SECRET`을 임의의 값으로 채웁니다.

```bash
cp .env.example .env
```

### 3. DB 마이그레이션 + 시드

```bash
npm run db:migrate   # 스키마 적용 (최초 1회, 또는 스키마 변경 시)
npm run db:seed       # 매장/매니저/상품/고객/프로모션 등 기본 데이터 시드
```

`db:seed`만으로는 견적·계약·배송이 없는 빈 상태입니다. 상담→견적→계약→배송까지 이어지는 11개 시나리오 고객을 채우려면 개발 서버를 띄운 상태에서 아래 명령을 추가로 실행합니다 (서버 액션을 실제로 호출해 시드하므로 `npm run dev`가 먼저 실행 중이어야 합니다).

```bash
npm run dev            # 별도 터미널에서 먼저 실행
npm run seed:scenarios  # 위 서버가 떠 있는 상태에서 실행
```

### 4. 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000/login](http://localhost:3000/login) 에서 아래 계정으로 로그인합니다. 비밀번호는 전부 `bestshop1234` 입니다.

| 사번 | 이름 | 역할 | 매장 |
|---|---|---|---|
| M1001 | 김민수 | MANAGER | 강남점 |
| M1003 | 박서준 | STORE_ADMIN | 강남점 |
| M1004 | 최유진 | MANAGER | 잠실점 |
| M9001 | 한지훈 | HQ | - |

## 주요 명령어

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 프로덕션 빌드 |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Prisma 마이그레이션 적용 |
| `npm run db:seed` | 기본 데이터 시드 (upsert, 반복 실행 안전) |
| `npm run db:reset` | DB 초기화 후 마이그레이션+시드 재실행 |
| `npm run db:studio` | Prisma Studio |
| `npm run seed:scenarios` | 상담→견적→계약→배송 end-to-end 시나리오 시드 (`dev` 서버 필요) |
| `npm run check:quote-calc` | 견적/할부 금액 계산 불변식 테스트 |
| `npm run check:delivery-state` | 배송/설치 상태머신 전이 테스트 |

## 기능 구성

| 영역 | 라우트 |
|---|---|
| 상담대시보드 | `/dashboard` |
| 고객조회 · 고객상세 | `/customers`, `/customers/[id]` |
| 상품탐색 · 상세 | `/products`, `/products/[id]` |
| 상품비교 | `/compare` |
| 재고 및 매장확인 | `/inventory`, `/inventory/transfers` |
| 프로모션 공지 | `/promotions`, `/promotions/[id]` |
| 견적서 작성 | `/quotes`, `/quotes/[id]`, `/quotes/[id]/print` |
| 결제 및 금융설계 | `/quotes/[id]/payment` |
| 계약확인 및 전자서명 | `/contracts`, `/contracts/[id]`, `/sign/[token]` (고객용, 비로그인) |
| 배송 및 설치 추적 | `/deliveries`, `/deliveries/[id]`, `/track/[token]` (고객용, 비로그인) |
| 상담이력관리 | `/consultations`, `/consultations/[id]` |
| 매장 및 매니저 정보 | `/store` |

PRD 전체 요구사항(P0/P1)은 [PRD.md](./PRD.md), 디자인 토큰/컴포넌트 규격은 [design-system.md](./design-system.md)를 참고하세요.

## 프로젝트 규약

인증/스코핑 헬퍼, 금액 계산 규칙, 상태머신, 각 Phase에서 확정된 설계 결정은 [AGENTS.md](./AGENTS.md)에 정리되어 있습니다. 코드를 수정하기 전에 먼저 읽어보는 것을 권장합니다.
