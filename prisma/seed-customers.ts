import type { PrismaClient } from "@prisma/client";

// Phase 2: 고객 / 동의 / 보유가전 / 상담 골격 시드.
// Phase 11 의 50 고객 데이터셋으로 확장될 때 이 파일을 대체하거나 흡수하면 된다.
//
// 구매일은 Category.replacementCycleMonths 와 맞물려 교체주기 배지(경과/임박/정상)가
// 화면에 골고루 나오도록 의도적으로 흩뿌려 두었다.

interface ApplianceSeed {
  categoryCode: string;
  modelName: string;
  brand?: string;
  purchasedAt?: string;
  purchasePrice?: number;
  note?: string;
}

interface ConsultationSeed {
  storeCode: string;
  employeeNo: string;
  stage: string;
  channel: string;
  daysAgo: number;
  summary?: string;
  note?: string;
}

interface CustomerSeed {
  name: string;
  phone: string;
  memberNo?: string;
  birthDate?: string;
  address?: string;
  addressDetail?: string;
  email?: string;
  note?: string;
  consents?: { type: string; granted: boolean }[];
  appliances?: ApplianceSeed[];
  consultations?: ConsultationSeed[];
  /** 같은 번호로 중복 등록된 레코드 — 검색 결과 통합 표시 확인용. */
  duplicateOf?: string;
  /** P1 후속조치. dueDaysFromNow 가 음수면 기한 경과 건이 된다. */
  followUps?: { type: string; dueDaysFromNow: number; content: string }[];
  /**
   * 열린 상담의 `updatedAt` 을 과거로 민다 (일 단위).
   *
   * 대시보드의 '미처리' 는 `updatedAt` 기준 파생값인데, 시드가 방금 쓴 행은 `updatedAt` 이
   * 항상 오늘이라 그대로 두면 미처리가 0건으로 보인다. **이 조작은 시드 전용이며 실제
   * 서버 액션은 절대 `updatedAt` 을 과거로 쓰지 않는다** (Prisma `@updatedAt` 이 관리한다).
   */
  staleDays?: number;
}

const ALL_CONSENTS = [
  { type: "PRIVACY", granted: true },
  { type: "MARKETING", granted: true },
  { type: "THIRD_PARTY", granted: false },
];

const CUSTOMERS: CustomerSeed[] = [
  {
    name: "김서연",
    phone: "010-3111-2201",
    memberNo: "LG10001",
    birthDate: "1982-04-11",
    address: "서울특별시 강남구 역삼로 120",
    addressDetail: "101동 1203호",
    email: "seoyeon.kim@example.com",
    note: "프리미엄 라인 선호. 방문 시 항상 배우자 동반.",
    consents: ALL_CONSENTS,
    appliances: [
      {
        categoryCode: "TV",
        modelName: "OLED55C9",
        purchasedAt: "2016-03-12",
        purchasePrice: 2190000,
        note: "화면 잔상 문제로 교체 문의. 65인치 이상 희망.",
      },
      {
        categoryCode: "REF",
        modelName: "DIOS-R823",
        purchasedAt: "2023-05-20",
        purchasePrice: 2890000,
      },
    ],
    consultations: [
      {
        storeCode: "GN01",
        employeeNo: "M1001",
        stage: "IN_PROGRESS",
        channel: "VISIT",
        daysAgo: 2,
        summary: "TV 교체 상담 진행중",
        note: "65인치 OLED 2종 비교 요청. 예산 300만원대.",
      },
      {
        storeCode: "GN01",
        employeeNo: "M1001",
        stage: "CLOSED",
        channel: "VISIT",
        daysAgo: 420,
        summary: "냉장고 구매 완료",
      },
    ],
  },
  {
    name: "박준호",
    phone: "01041235678",
    memberNo: "LG10002",
    birthDate: "1975-09-02",
    address: "서울특별시 강남구 도곡로 405",
    email: "junho.park@example.com",
    consents: [
      { type: "PRIVACY", granted: true },
      { type: "MARKETING", granted: false },
    ],
    appliances: [
      {
        categoryCode: "WASH",
        modelName: "TROMM-F21",
        purchasedAt: "2015-11-30",
        purchasePrice: 1290000,
        note: "탈수 소음 심함. 건조기 일체형 관심.",
      },
      { categoryCode: "CLEAN", modelName: "CORDZERO-A9", purchasedAt: "2022-02-14", purchasePrice: 890000 },
    ],
    consultations: [
      {
        storeCode: "GN01",
        employeeNo: "M1002",
        stage: "IN_PROGRESS",
        channel: "VISIT",
        daysAgo: 5,
        summary: "세탁기+건조기 패키지 견적",
        note: "워시타워 견적 요청. 설치 공간 실측 필요.",
      },
    ],
  },
  {
    name: "이수민",
    phone: "010 5522 7788",
    memberNo: "LG10003",
    birthDate: "1990-01-25",
    address: "서울특별시 서초구 반포대로 58",
    addressDetail: "302호",
    consents: ALL_CONSENTS,
    appliances: [
      { categoryCode: "STYLER", modelName: "STYLER-S3", purchasedAt: "2019-08-01", purchasePrice: 1690000 },
      {
        categoryCode: "AC",
        modelName: "WHISEN-BQ",
        purchasedAt: "2014-06-18",
        purchasePrice: 1980000,
        note: "실외기 소음 민원. 교체 검토중.",
      },
    ],
    consultations: [
      {
        storeCode: "GN01",
        employeeNo: "M1001",
        stage: "IN_PROGRESS",
        channel: "PHONE",
        daysAgo: 18,
        summary: "에어컨 계약 완료",
      },
    ],
  },
  {
    name: "정다은",
    phone: "010-7788-1122",
    memberNo: "LG10004",
    birthDate: "1988-12-03",
    address: "서울특별시 강남구 논현로 508",
    email: "daeun.jung@example.com",
    consents: [
      { type: "PRIVACY", granted: true },
      { type: "MARKETING", granted: true },
    ],
    appliances: [
      { categoryCode: "DISH", modelName: "DIOS-DW60", purchasedAt: "2021-04-09", purchasePrice: 1090000 },
    ],
    consultations: [
      {
        storeCode: "GN01",
        employeeNo: "M1002",
        stage: "IN_PROGRESS",
        channel: "ONLINE",
        daysAgo: 1,
        summary: "식기세척기 추가 문의",
      },
    ],
  },
  {
    name: "최민재",
    phone: "010-2244-9900",
    memberNo: "LG10005",
    birthDate: "1979-07-16",
    address: "서울특별시 강남구 선릉로 221",
    consents: ALL_CONSENTS,
    appliances: [
      {
        categoryCode: "REF",
        modelName: "DIOS-R700",
        purchasedAt: "2015-02-11",
        purchasePrice: 2390000,
        note: "제빙기 고장. 오브제컬렉션 관심.",
      },
      { categoryCode: "TV", modelName: "NANO75", purchasedAt: "2021-11-05", purchasePrice: 1290000 },
    ],
    consultations: [
      {
        storeCode: "GN01",
        employeeNo: "M1003",
        stage: "IN_PROGRESS",
        channel: "VISIT",
        daysAgo: 9,
        summary: "냉장고 배송 진행중",
      },
    ],
  },
  {
    name: "한지우",
    phone: "010-6161-3030",
    memberNo: "LG10006",
    birthDate: "1995-05-28",
    address: "서울특별시 강남구 테헤란로 301",
    addressDetail: "1804호",
    consents: [{ type: "PRIVACY", granted: true }],
    appliances: [
      { categoryCode: "CLEAN", modelName: "CORDZERO-A7", purchasedAt: "2020-09-22", purchasePrice: 690000 },
    ],
    consultations: [
      {
        storeCode: "GN01",
        employeeNo: "M1001",
        stage: "CANCELLED",
        channel: "PHONE",
        daysAgo: 60,
        summary: "구매 보류",
      },
    ],
  },
  {
    name: "오세훈",
    phone: "010-8080-4141",
    memberNo: "LG10007",
    birthDate: "1968-02-19",
    address: "서울특별시 강남구 압구정로 210",
    consents: ALL_CONSENTS,
    appliances: [
      {
        categoryCode: "DRY",
        modelName: "TROMM-DRY16",
        purchasedAt: "2017-10-02",
        purchasePrice: 1390000,
        note: "건조 시간 길어짐. 신형 인버터 관심.",
      },
      { categoryCode: "WASH", modelName: "TROMM-F24", purchasedAt: "2017-10-02", purchasePrice: 1590000 },
    ],
    consultations: [
      {
        storeCode: "GN01",
        employeeNo: "M1002",
        stage: "IN_PROGRESS",
        channel: "VISIT",
        daysAgo: 0,
        summary: "건조기 교체 상담",
        note: "세탁기와 세트 교체 고민중. 다음 주 재방문 예정.",
      },
    ],
  },
  {
    name: "윤가람",
    phone: "010-3131-5959",
    memberNo: "LG10008",
    birthDate: "1993-11-07",
    address: "서울특별시 송파구 올림픽로 300",
    consents: ALL_CONSENTS,
    appliances: [
      { categoryCode: "TV", modelName: "OLED65G3", purchasedAt: "2024-01-15", purchasePrice: 3890000 },
    ],
    consultations: [
      {
        storeCode: "JS02",
        employeeNo: "M1004",
        stage: "IN_PROGRESS",
        channel: "VISIT",
        daysAgo: 200,
        summary: "TV 구매 완료",
      },
    ],
  },
  {
    name: "장현우",
    phone: "010-4242-6767",
    memberNo: "LG10009",
    birthDate: "1985-03-30",
    address: "서울특별시 송파구 백제고분로 45",
    consents: [
      { type: "PRIVACY", granted: true },
      { type: "MARKETING", granted: false },
    ],
    appliances: [
      {
        categoryCode: "AC",
        modelName: "WHISEN-DUAL",
        purchasedAt: "2013-05-21",
        purchasePrice: 1690000,
        note: "냉방 효율 저하. 2in1 모델 문의.",
      },
    ],
    consultations: [
      {
        storeCode: "JS02",
        employeeNo: "M1004",
        stage: "IN_PROGRESS",
        channel: "VISIT",
        daysAgo: 7,
        summary: "에어컨 견적 발송",
      },
    ],
  },
  {
    name: "서지호",
    phone: "010-5050-8282",
    memberNo: "LG10010",
    birthDate: "1991-08-08",
    address: "서울특별시 송파구 가락로 100",
    consents: ALL_CONSENTS,
    appliances: [
      { categoryCode: "REF", modelName: "OBJET-R873", purchasedAt: "2022-06-30", purchasePrice: 3190000 },
      { categoryCode: "DISH", modelName: "DIOS-DW50", purchasedAt: "2018-03-17", purchasePrice: 890000 },
    ],
    consultations: [
      {
        storeCode: "JS02",
        employeeNo: "M1005",
        stage: "IN_PROGRESS",
        channel: "ONLINE",
        daysAgo: 3,
        summary: "식기세척기 교체 문의",
      },
    ],
  },
  {
    name: "임채원",
    phone: "010-9393-1717",
    memberNo: "LG10011",
    birthDate: "1997-06-14",
    address: "경기도 성남시 분당구 정자일로 95",
    consents: [{ type: "PRIVACY", granted: true }],
    appliances: [
      { categoryCode: "STYLER", modelName: "STYLER-S5", purchasedAt: "2023-02-10", purchasePrice: 1990000 },
    ],
    consultations: [
      {
        storeCode: "BD03",
        employeeNo: "M1006",
        stage: "IN_PROGRESS",
        channel: "VISIT",
        daysAgo: 4,
        summary: "세탁기 신규 구매 상담",
      },
    ],
  },
  {
    name: "강태윤",
    phone: "010-1818-2626",
    memberNo: "LG10012",
    birthDate: "1972-10-21",
    address: "경기도 성남시 분당구 서현로 180",
    consents: ALL_CONSENTS,
    appliances: [
      {
        categoryCode: "WASH",
        modelName: "TROMM-F18",
        purchasedAt: "2014-12-05",
        purchasePrice: 1190000,
        note: "누수 이력. 교체 시급.",
      },
      { categoryCode: "CLEAN", modelName: "CORDZERO-A5", purchasedAt: "2019-07-19", purchasePrice: 590000 },
    ],
    consultations: [
      {
        storeCode: "BD03",
        employeeNo: "M1006",
        stage: "IN_PROGRESS",
        channel: "VISIT",
        daysAgo: 12,
        summary: "세탁기 계약 완료",
      },
    ],
  },
  {
    name: "문소영",
    phone: "010-7373-4848",
    memberNo: "LG10013",
    birthDate: "1986-01-09",
    address: "경기도 고양시 일산동구 정발산로 24",
    consents: [
      { type: "PRIVACY", granted: true },
      { type: "MARKETING", granted: true },
    ],
    appliances: [
      { categoryCode: "TV", modelName: "QNED80", purchasedAt: "2020-05-02", purchasePrice: 1590000 },
      {
        categoryCode: "REF",
        modelName: "DIOS-R600",
        purchasedAt: "2013-09-14",
        purchasePrice: 1890000,
        note: "냉동실 성에. 4도어 오브제 희망.",
      },
    ],
    consultations: [
      {
        storeCode: "IS04",
        employeeNo: "M1007",
        stage: "IN_PROGRESS",
        channel: "PHONE",
        daysAgo: 6,
        summary: "냉장고 교체 상담",
        note: "주방 폭 900mm 제약 있음.",
      },
    ],
  },
  {
    name: "배도현",
    phone: "010-2727-9494",
    memberNo: "LG10014",
    birthDate: "1994-04-04",
    address: "경기도 고양시 일산서구 중앙로 1500",
    consents: ALL_CONSENTS,
    appliances: [
      { categoryCode: "DRY", modelName: "TROMM-DRY20", purchasedAt: "2023-11-11", purchasePrice: 1490000 },
    ],
    consultations: [
      {
        storeCode: "IS04",
        employeeNo: "M1007",
        stage: "IN_PROGRESS",
        channel: "VISIT",
        daysAgo: 150,
        summary: "건조기 구매 완료",
      },
    ],
  },
  {
    name: "신예린",
    phone: "010-6464-3535",
    memberNo: "LG10015",
    birthDate: "1999-02-27",
    address: "부산광역시 부산진구 가야대로 700",
    consents: [{ type: "PRIVACY", granted: true }],
    appliances: [
      { categoryCode: "CLEAN", modelName: "CORDZERO-A9S", purchasedAt: "2021-10-30", purchasePrice: 990000 },
    ],
    consultations: [
      {
        storeCode: "BS05",
        employeeNo: "M1008",
        stage: "IN_PROGRESS",
        channel: "VISIT",
        daysAgo: 8,
        summary: "청소기 업그레이드 상담",
      },
    ],
  },
  {
    name: "홍지환",
    phone: "010-8585-1212",
    memberNo: "LG10016",
    birthDate: "1980-06-06",
    address: "부산광역시 부산진구 중앙대로 800",
    consents: ALL_CONSENTS,
    appliances: [
      {
        categoryCode: "AC",
        modelName: "WHISEN-STAND",
        purchasedAt: "2012-07-01",
        purchasePrice: 2290000,
        note: "노후 스탠드형. 여름 전 교체 희망.",
      },
    ],
    consultations: [
      {
        storeCode: "BS05",
        employeeNo: "M1008",
        stage: "IN_PROGRESS",
        channel: "PHONE",
        daysAgo: 20,
        summary: "에어컨 견적 검토중",
      },
    ],
  },

  // --- 상담 이력이 아직 없는 워크인 신규 고객 (검색 결과의 '신규' 배지 확인용) ---
  {
    name: "노아름",
    phone: "010-1357-2468",
    memberNo: "LG10017",
    birthDate: "1996-09-13",
    address: "서울특별시 강남구 강남대로 390",
    consents: [{ type: "PRIVACY", granted: true }],
    appliances: [
      { categoryCode: "TV", modelName: "UHD70", purchasedAt: "2018-12-24", purchasePrice: 990000 },
    ],
  },
  {
    name: "구본환",
    phone: "010-9753-8642",
    birthDate: "1965-11-30",
    address: "서울특별시 서초구 서초대로 300",
  },

  // --- 같은 번호로 중복 등록된 레코드 (검색 결과 통합 표시 확인용) ---
  {
    name: "김서연",
    phone: "01031112201",
    memberNo: "LG19001",
    address: "서울특별시 강남구 역삼로 120",
    note: "전화 접수 시 중복 등록된 레코드. 통합 확인 필요.",
    duplicateOf: "LG10001",
  },
  {
    name: "박준호(회사)",
    phone: "010-4123-5678",
    address: "서울특별시 강남구 도곡로 405",
    note: "법인 명의로 별도 등록된 레코드.",
    duplicateOf: "LG10002",
  },
];

/**
 * Phase 11 확장분 30명. 앞의 20명과 합쳐 50명이 된다.
 *
 * 단계 구성 원칙 (Phase 10a handoff): **하위 데이터가 필요한 단계는 여기서 만들지 않는다.**
 * `QUOTED`/`CONTRACTED`/`DELIVERING`/`COMPLETED` 는 견적·계약·주문이 있어야 상담 상세의
 * '견적·계약·배송 연결' 표가 비지 않으므로, `scripts/seed-scenarios.ts` 가 **실제 서버 액션**으로
 * 만든다. 이 배열은 하위 데이터가 필요 없는 `IN_PROGRESS` / `CLOSED` / `CANCELLED` 와
 * 상담 이력이 없는 워크인 고객만 담는다.
 */
const MORE_CUSTOMERS: CustomerSeed[] = [
  // ------------------------------------------------------------- 강남점 GN01
  {
    name: "조은별", phone: "010-2211-0101", memberNo: "LG10021", birthDate: "1989-03-21",
    address: "서울특별시 강남구 도산대로 120", email: "eunbyul.cho@example.com",
    consents: ALL_CONSENTS,
    appliances: [{ categoryCode: "REF", modelName: "DIOS-R750", purchasedAt: "2016-04-02", purchasePrice: 2090000, note: "냉동실 소음. 교체 검토." }],
    consultations: [{ storeCode: "GN01", employeeNo: "M1001", stage: "IN_PROGRESS", channel: "VISIT", daysAgo: 1, summary: "냉장고 교체 상담", note: "4도어 오브제 선호." }],
    followUps: [{ type: "CALL", dueDaysFromNow: -5, content: "오브제 컬렉션 재안내 전화" }],
  },
  {
    name: "권나연", phone: "010-2211-0202", memberNo: "LG10022", birthDate: "1994-07-09",
    address: "서울특별시 강남구 언주로 300",
    consents: [{ type: "PRIVACY", granted: true }],
    appliances: [{ categoryCode: "STYLER", modelName: "STYLER-S3", purchasedAt: "2018-05-11", purchasePrice: 1590000 }],
    consultations: [{ storeCode: "GN01", employeeNo: "M1002", stage: "IN_PROGRESS", channel: "PHONE", daysAgo: 6, summary: "스타일러 상급 모델 문의" }],
    staleDays: 6,
    followUps: [{ type: "MESSAGE", dueDaysFromNow: -2, content: "신모델 입고 안내 문자" }],
  },
  {
    name: "황도경", phone: "010-2211-0303", memberNo: "LG10023", birthDate: "1977-11-14",
    address: "서울특별시 강남구 삼성로 500",
    consents: ALL_CONSENTS,
    appliances: [{ categoryCode: "TV", modelName: "OLED55B8", purchasedAt: "2015-09-20", purchasePrice: 1890000, note: "화면 번짐. 교체 시급." }],
    consultations: [{ storeCode: "GN01", employeeNo: "M1001", stage: "CLOSED", channel: "VISIT", daysAgo: 30, summary: "타사 제품 구매로 종료" }],
  },
  {
    name: "안세진", phone: "010-2211-0404", memberNo: "LG10024", birthDate: "1992-01-30",
    address: "서울특별시 강남구 봉은사로 210", email: "sejin.ahn@example.com",
    consents: ALL_CONSENTS,
    appliances: [{ categoryCode: "CLEAN", modelName: "CORDZERO-A9P", purchasedAt: "2021-06-15", purchasePrice: 890000 }],
    consultations: [{ storeCode: "GN01", employeeNo: "M1002", stage: "IN_PROGRESS", channel: "VISIT", daysAgo: 4, summary: "식기세척기 신규 설치 상담" }],
    staleDays: 4,
  },
  {
    name: "류진호", phone: "010-2211-0505", memberNo: "LG10025", birthDate: "1985-08-08",
    address: "서울특별시 강남구 학동로 88",
    consents: [{ type: "PRIVACY", granted: true }, { type: "MARKETING", granted: false }],
    appliances: [{ categoryCode: "WASH", modelName: "TROMM-F20", purchasedAt: "2014-03-03", purchasePrice: 1190000, note: "탈수 진동 심함." }],
    consultations: [{ storeCode: "GN01", employeeNo: "M1003", stage: "CANCELLED", channel: "PHONE", daysAgo: 45, summary: "이사 일정 변경으로 취소" }],
  },
  {
    name: "백소윤", phone: "010-2211-0606", memberNo: "LG10026", birthDate: "1996-12-25",
    address: "서울특별시 강남구 역삼로 200",
    consents: ALL_CONSENTS,
    appliances: [{ categoryCode: "AC", modelName: "WHISEN-WALL", purchasedAt: "2019-05-30", purchasePrice: 1090000 }],
    consultations: [{ storeCode: "GN01", employeeNo: "M1001", stage: "IN_PROGRESS", channel: "ONLINE", daysAgo: 2, summary: "에어컨 추가 설치 문의" }],
    followUps: [{ type: "VISIT", dueDaysFromNow: 2, content: "실측 방문 예정" }],
  },
  {
    name: "신동하", phone: "010-2211-0707", memberNo: "LG10027", birthDate: "1981-02-17",
    address: "서울특별시 서초구 강남대로 480",
    consents: ALL_CONSENTS,
    appliances: [{ categoryCode: "DRY", modelName: "TROMM-DRY14", purchasedAt: "2016-11-08", purchasePrice: 1290000, note: "건조 성능 저하." }],
    consultations: [{ storeCode: "GN01", employeeNo: "M1002", stage: "IN_PROGRESS", channel: "VISIT", daysAgo: 8, summary: "건조기 교체 상담" }],
    staleDays: 8,
  },
  {
    name: "고예원", phone: "010-2211-0808", memberNo: "LG10028", birthDate: "1998-06-02",
    address: "서울특별시 서초구 사평대로 100",
    consents: [{ type: "PRIVACY", granted: true }],
  },
  {
    name: "표민석", phone: "010-2211-0909", memberNo: "LG10029", birthDate: "1973-04-19",
    address: "서울특별시 강남구 남부순환로 2700",
    consents: ALL_CONSENTS,
    appliances: [{ categoryCode: "DISH", modelName: "DIOS-DW40", purchasedAt: "2017-07-07", purchasePrice: 790000 }],
    consultations: [{ storeCode: "GN01", employeeNo: "M1001", stage: "CLOSED", channel: "VISIT", daysAgo: 60, summary: "예산 미달로 보류 후 종료" }],
  },
  {
    name: "심아름", phone: "010-2211-1010", memberNo: "LG10030", birthDate: "1990-09-09",
    address: "서울특별시 강남구 테헤란로 400", email: "areum.shim@example.com",
    consents: ALL_CONSENTS,
    appliances: [{ categoryCode: "REF", modelName: "OBJET-R820", purchasedAt: "2023-01-20", purchasePrice: 3090000 }],
    consultations: [{ storeCode: "GN01", employeeNo: "M1002", stage: "IN_PROGRESS", channel: "VISIT", daysAgo: 0, summary: "TV 신규 구매 상담" }],
  },

  // ------------------------------------------------------------- 잠실점 JS02
  {
    name: "우재혁", phone: "010-3322-0101", memberNo: "LG10031", birthDate: "1987-05-05",
    address: "서울특별시 송파구 잠실로 100",
    consents: ALL_CONSENTS,
    appliances: [{ categoryCode: "TV", modelName: "NANO86", purchasedAt: "2020-02-14", purchasePrice: 1490000 }],
    consultations: [{ storeCode: "JS02", employeeNo: "M1004", stage: "IN_PROGRESS", channel: "VISIT", daysAgo: 3, summary: "사운드바 추가 문의" }],
    followUps: [{ type: "CALL", dueDaysFromNow: -1, content: "사운드바 견적 회신" }],
  },
  {
    name: "명지아", phone: "010-3322-0202", memberNo: "LG10032", birthDate: "1993-10-11",
    address: "서울특별시 송파구 송파대로 550",
    consents: [{ type: "PRIVACY", granted: true }],
    appliances: [{ categoryCode: "WASH", modelName: "TROMM-F22", purchasedAt: "2019-12-01", purchasePrice: 1390000 }],
    consultations: [{ storeCode: "JS02", employeeNo: "M1005", stage: "IN_PROGRESS", channel: "PHONE", daysAgo: 5, summary: "건조기 추가 상담" }],
    staleDays: 5,
  },
  {
    name: "차원우", phone: "010-3322-0303", memberNo: "LG10033", birthDate: "1979-01-23",
    address: "서울특별시 송파구 올림픽로 35",
    consents: ALL_CONSENTS,
    appliances: [{ categoryCode: "AC", modelName: "WHISEN-DUAL2", purchasedAt: "2015-06-06", purchasePrice: 1790000, note: "냉방 약함." }],
    consultations: [{ storeCode: "JS02", employeeNo: "M1004", stage: "CANCELLED", channel: "VISIT", daysAgo: 25, summary: "타 매장 구매로 취소" }],
  },
  {
    name: "구서영", phone: "010-3322-0404", memberNo: "LG10034", birthDate: "1995-03-15",
    address: "서울특별시 송파구 가락로 200", email: "seoyoung.koo@example.com",
    consents: ALL_CONSENTS,
    appliances: [{ categoryCode: "CLEAN", modelName: "CORDZERO-A5S", purchasedAt: "2018-08-18", purchasePrice: 590000 }],
    consultations: [{ storeCode: "JS02", employeeNo: "M1005", stage: "IN_PROGRESS", channel: "ONLINE", daysAgo: 1, summary: "청소기 교체 문의" }],
  },
  {
    name: "정태민", phone: "010-3322-0505", memberNo: "LG10035", birthDate: "1984-11-27",
    address: "서울특별시 송파구 백제고분로 300",
    consents: ALL_CONSENTS,
    appliances: [{ categoryCode: "REF", modelName: "DIOS-R680", purchasedAt: "2013-02-02", purchasePrice: 1990000, note: "10년 경과. 교체 문의." }],
    consultations: [{ storeCode: "JS02", employeeNo: "M1004", stage: "CLOSED", channel: "PHONE", daysAgo: 40, summary: "가격 부담으로 종료" }],
  },
  {
    name: "하윤슬", phone: "010-3322-0606", memberNo: "LG10036", birthDate: "1999-07-31",
    address: "서울특별시 송파구 위례성대로 10",
    consents: [{ type: "PRIVACY", granted: true }],
  },
  {
    name: "배성민", phone: "010-3322-0707", memberNo: "LG10037", birthDate: "1976-09-13",
    address: "서울특별시 송파구 마천로 88",
    consents: ALL_CONSENTS,
    appliances: [{ categoryCode: "STYLER", modelName: "STYLER-S5W", purchasedAt: "2022-04-04", purchasePrice: 1890000 }],
    consultations: [{ storeCode: "JS02", employeeNo: "M1005", stage: "IN_PROGRESS", channel: "VISIT", daysAgo: 7, summary: "세탁기 교체 상담" }],
    staleDays: 7,
    followUps: [{ type: "CALL", dueDaysFromNow: -4, content: "워시타워 재안내" }],
  },

  // ------------------------------------------------------------- 분당점 BD03
  {
    name: "손하윤", phone: "010-4433-0101", memberNo: "LG10038", birthDate: "1991-04-25",
    address: "경기도 성남시 분당구 판교역로 200", email: "hayoon.son@example.com",
    consents: ALL_CONSENTS,
    appliances: [{ categoryCode: "TV", modelName: "OLED48C2", purchasedAt: "2021-03-10", purchasePrice: 1690000 }],
    consultations: [{ storeCode: "BD03", employeeNo: "M1006", stage: "IN_PROGRESS", channel: "VISIT", daysAgo: 2, summary: "냉장고 신규 구매 상담" }],
  },
  {
    name: "전유하", phone: "010-4433-0202", memberNo: "LG10039", birthDate: "1988-08-19",
    address: "경기도 성남시 분당구 대왕판교로 606",
    consents: [{ type: "PRIVACY", granted: true }],
    appliances: [{ categoryCode: "DISH", modelName: "DIOS-DW55", purchasedAt: "2020-10-10", purchasePrice: 990000 }],
    consultations: [{ storeCode: "BD03", employeeNo: "M1006", stage: "IN_PROGRESS", channel: "PHONE", daysAgo: 9, summary: "식기세척기 고장 문의" }],
    staleDays: 9,
    followUps: [{ type: "VISIT", dueDaysFromNow: 1, content: "AS 기사 방문 조율" }],
  },
  {
    name: "오지환", phone: "010-4433-0303", memberNo: "LG10040", birthDate: "1982-12-08",
    address: "경기도 성남시 분당구 정자로 100",
    consents: ALL_CONSENTS,
    appliances: [{ categoryCode: "AC", modelName: "WHISEN-CEILING", purchasedAt: "2014-05-25", purchasePrice: 2490000, note: "시스템 에어컨 교체 검토." }],
    consultations: [{ storeCode: "BD03", employeeNo: "M1006", stage: "CLOSED", channel: "VISIT", daysAgo: 35, summary: "시공 일정 불가로 종료" }],
  },
  {
    name: "임세라", phone: "010-4433-0404", memberNo: "LG10041", birthDate: "1997-02-14",
    address: "경기도 성남시 분당구 야탑로 50",
    consents: ALL_CONSENTS,
  },
  {
    name: "박건우", phone: "010-4433-0505", memberNo: "LG10042", birthDate: "1975-06-30",
    address: "경기도 성남시 분당구 수내로 30",
    consents: ALL_CONSENTS,
    appliances: [{ categoryCode: "WASH", modelName: "TROMM-F19", purchasedAt: "2015-01-15", purchasePrice: 1290000 }],
    consultations: [{ storeCode: "BD03", employeeNo: "M1006", stage: "IN_PROGRESS", channel: "VISIT", daysAgo: 4, summary: "세탁·건조 세트 상담" }],
    staleDays: 4,
  },

  // ------------------------------------------------------------- 일산점 IS04
  {
    name: "윤채이", phone: "010-5544-0101", memberNo: "LG10043", birthDate: "1993-05-18",
    address: "경기도 고양시 일산동구 무궁화로 20", email: "chaei.yoon@example.com",
    consents: ALL_CONSENTS,
    appliances: [{ categoryCode: "CLEAN", modelName: "CORDZERO-A9K", purchasedAt: "2022-09-09", purchasePrice: 990000 }],
    consultations: [{ storeCode: "IS04", employeeNo: "M1007", stage: "IN_PROGRESS", channel: "VISIT", daysAgo: 1, summary: "스타일러 구매 상담" }],
    followUps: [{ type: "MESSAGE", dueDaysFromNow: 3, content: "프로모션 종료 전 안내" }],
  },
  {
    name: "김노아", phone: "010-5544-0202", memberNo: "LG10044", birthDate: "1986-10-22",
    address: "경기도 고양시 일산서구 주엽로 15",
    consents: [{ type: "PRIVACY", granted: true }],
    appliances: [{ categoryCode: "REF", modelName: "DIOS-R710", purchasedAt: "2016-08-08", purchasePrice: 2290000, note: "제빙 불량." }],
    consultations: [{ storeCode: "IS04", employeeNo: "M1007", stage: "IN_PROGRESS", channel: "PHONE", daysAgo: 6, summary: "냉장고 AS 후 교체 검토" }],
    staleDays: 6,
  },
  {
    name: "장미르", phone: "010-5544-0303", memberNo: "LG10045", birthDate: "1979-03-07",
    address: "경기도 고양시 일산동구 백석로 70",
    consents: ALL_CONSENTS,
    consultations: [{ storeCode: "IS04", employeeNo: "M1007", stage: "CANCELLED", channel: "ONLINE", daysAgo: 20, summary: "연락 두절로 취소" }],
  },
  {
    name: "서하람", phone: "010-5544-0404", memberNo: "LG10046", birthDate: "2000-01-01",
    address: "경기도 고양시 일산서구 킨텍스로 200",
    consents: ALL_CONSENTS,
  },

  // ---------------------------------------------------------- 부산서면점 BS05
  {
    name: "정우성", phone: "010-6655-0101", memberNo: "LG10047", birthDate: "1983-07-12",
    address: "부산광역시 부산진구 서면로 100",
    consents: ALL_CONSENTS,
    appliances: [{ categoryCode: "TV", modelName: "QNED75", purchasedAt: "2019-11-11", purchasePrice: 1390000 }],
    consultations: [{ storeCode: "BS05", employeeNo: "M1008", stage: "IN_PROGRESS", channel: "VISIT", daysAgo: 3, summary: "TV 업그레이드 상담" }],
  },
  {
    name: "한소율", phone: "010-6655-0202", memberNo: "LG10048", birthDate: "1996-04-28",
    address: "부산광역시 부산진구 동천로 50", email: "soyul.han@example.com",
    consents: ALL_CONSENTS,
    appliances: [{ categoryCode: "DRY", modelName: "TROMM-DRY18", purchasedAt: "2021-12-20", purchasePrice: 1390000 }],
    consultations: [{ storeCode: "BS05", employeeNo: "M1008", stage: "CLOSED", channel: "PHONE", daysAgo: 50, summary: "단순 문의로 종료" }],
  },
  {
    name: "조민규", phone: "010-6655-0303", memberNo: "LG10049", birthDate: "1971-08-16",
    address: "부산광역시 부산진구 가야대로 300",
    consents: [{ type: "PRIVACY", granted: true }],
    appliances: [{ categoryCode: "AC", modelName: "WHISEN-CLASSIC", purchasedAt: "2011-05-05", purchasePrice: 1590000, note: "15년 경과. 교체 필수." }],
    consultations: [{ storeCode: "BS05", employeeNo: "M1008", stage: "IN_PROGRESS", channel: "VISIT", daysAgo: 10, summary: "에어컨 교체 상담" }],
    staleDays: 10,
    followUps: [{ type: "CALL", dueDaysFromNow: -7, content: "설치 일정 확정 전화" }],
  },
  {
    name: "남지우", phone: "010-6655-0404", memberNo: "LG10050", birthDate: "1994-09-24",
    address: "부산광역시 부산진구 중앙대로 900",
    consents: ALL_CONSENTS,
  },
];

/** 시드가 다루는 전체 고객 — 기본 20명 + 확장 30명 = 50명. */
const ALL_CUSTOMERS: CustomerSeed[] = [...CUSTOMERS, ...MORE_CUSTOMERS];

/** 종착 단계 — 시드가 endedAt 을 찍어야 하는 값들 (src/lib/consultations.ts 와 같은 집합). */
const TERMINAL_STAGES = ["COMPLETED", "CLOSED", "CANCELLED"];

function normalize(phone: string): string {
  return phone.replace(/\D/g, "");
}

function daysAgoDate(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function seedCustomers(prisma: PrismaClient): Promise<void> {
  const [categories, managers] = await Promise.all([
    prisma.category.findMany({ select: { id: true, code: true } }),
    prisma.manager.findMany({ select: { id: true, employeeNo: true } }),
  ]);
  const stores = await prisma.store.findMany({ select: { id: true, code: true } });

  const categoryIdByCode = new Map(categories.map((c) => [c.code, c.id]));
  const managerIdByNo = new Map(managers.map((m) => [m.employeeNo, m.id]));
  const storeIdByCode = new Map(stores.map((s) => [s.code, s.id]));
  const customerIdByMemberNo = new Map<string, string>();
  const seededIds: string[] = [];

  for (const seed of ALL_CUSTOMERS) {
    const phoneNormalized = normalize(seed.phone);
    const data = {
      name: seed.name,
      phone: seed.phone,
      phoneNormalized,
      memberNo: seed.memberNo ?? null,
      birthDate: seed.birthDate ? new Date(`${seed.birthDate}T00:00:00Z`) : null,
      address: seed.address ?? null,
      addressDetail: seed.addressDetail ?? null,
      email: seed.email ?? null,
      note: seed.note ?? null,
      mergedIntoId: null as string | null,
    };

    // 재실행 식별자: 회원번호가 있으면 회원번호, 없으면 이름+정규화번호.
    // 중복 고객 레코드는 원본과 이름/번호가 같으므로 회원번호를 먼저 봐야 원본을 덮어쓰지 않는다.
    const existing = seed.memberNo
      ? await prisma.customer.findUnique({ where: { memberNo: seed.memberNo }, select: { id: true } })
      : await prisma.customer.findFirst({
          where: { name: seed.name, phoneNormalized, memberNo: null },
          select: { id: true },
        });

    const customer = existing
      ? await prisma.customer.update({ where: { id: existing.id }, data, select: { id: true } })
      : await prisma.customer.create({ data, select: { id: true } });

    seededIds.push(customer.id);
    if (seed.memberNo) customerIdByMemberNo.set(seed.memberNo, customer.id);

    for (const consent of seed.consents ?? []) {
      await prisma.customerConsent.upsert({
        where: { customerId_type: { customerId: customer.id, type: consent.type } },
        update: { granted: consent.granted, grantedAt: consent.granted ? new Date() : null },
        create: {
          customerId: customer.id,
          type: consent.type,
          granted: consent.granted,
          grantedAt: consent.granted ? new Date() : null,
          channel: "STORE",
        },
      });
    }

    for (const appliance of seed.appliances ?? []) {
      const categoryId = categoryIdByCode.get(appliance.categoryCode);
      if (!categoryId) throw new Error(`알 수 없는 카테고리 코드: ${appliance.categoryCode}`);

      const applianceData = {
        customerId: customer.id,
        categoryId,
        modelName: appliance.modelName,
        brand: appliance.brand ?? "LG",
        purchasedAt: appliance.purchasedAt ? new Date(`${appliance.purchasedAt}T00:00:00Z`) : null,
        purchasePrice: appliance.purchasePrice ?? null,
        note: appliance.note ?? null,
      };

      const existingAppliance = await prisma.ownedAppliance.findFirst({
        where: { customerId: customer.id, modelName: appliance.modelName },
        select: { id: true },
      });
      if (existingAppliance) {
        await prisma.ownedAppliance.update({
          where: { id: existingAppliance.id },
          data: applianceData,
        });
      } else {
        await prisma.ownedAppliance.create({ data: applianceData });
      }
    }

    // 상담은 재실행 시 중복 생성하지 않는다 — 이미 있으면 통째로 건너뛴다.
    const consultationCount = await prisma.consultation.count({
      where: { customerId: customer.id },
    });
    if (consultationCount === 0) {
      for (const consultation of seed.consultations ?? []) {
        const storeId = storeIdByCode.get(consultation.storeCode);
        const managerId = managerIdByNo.get(consultation.employeeNo);
        if (!storeId) throw new Error(`알 수 없는 매장 코드: ${consultation.storeCode}`);
        if (!managerId) throw new Error(`알 수 없는 사번: ${consultation.employeeNo}`);

        const startedAt = daysAgoDate(consultation.daysAgo);
        const created = await prisma.consultation.create({
          data: {
            customerId: customer.id,
            managerId,
            storeId,
            stage: consultation.stage,
            channel: consultation.channel,
            startedAt,
            endedAt: TERMINAL_STAGES.includes(consultation.stage) ? startedAt : null,
            summary: consultation.summary ?? null,
          },
          select: { id: true },
        });

        if (consultation.note) {
          await prisma.consultationNote.create({
            data: { consultationId: created.id, managerId, content: consultation.note },
          });
        }
      }
    }
  }

  // ------------------------------------------- 상담 담당자 정합성 복구
  //
  // 불변식: **상담의 담당 매니저는 그 상담이 열린 매장 소속이어야 한다.**
  // 초기 시드가 부산서면점 상담을 강남점 매니저에게 붙여 두어, 해당 고객이 어느 매니저
  // 화면에서도 열리지 않았다 (매장 스코프가 담당자가 아니라 storeId 를 따르기 때문).
  // 상담 생성은 "이미 있으면 건너뜀" 이라 데이터를 고치려면 별도 복구가 필요하다.
  const allManagers = await prisma.manager.findMany({ select: { id: true, storeId: true } });
  const managerStore = new Map(allManagers.map((m) => [m.id, m.storeId]));
  const firstManagerOfStore = new Map<string, string>();
  for (const manager of allManagers) {
    if (!firstManagerOfStore.has(manager.storeId)) {
      firstManagerOfStore.set(manager.storeId, manager.id);
    }
  }

  let repaired = 0;
  const mismatched = await prisma.consultation.findMany({
    select: { id: true, storeId: true, managerId: true },
  });
  for (const row of mismatched) {
    if (managerStore.get(row.managerId) === row.storeId) continue;
    const replacement = firstManagerOfStore.get(row.storeId);
    if (!replacement) continue;
    await prisma.consultation.update({
      where: { id: row.id },
      data: { managerId: replacement },
    });
    repaired++;
  }
  if (repaired > 0) console.log(`  repaired ${repaired} consultations assigned to an out-of-store manager`);

  // ------------------------------------------- 상담 단계 정합성 복구
  //
  // 불변식: **견적 없이 `QUOTED` 이상 단계에 있는 상담은 존재할 수 없다.**
  // 그런 행은 상담 상세의 '견적·계약·배송 연결' 표가 비어 화면이 거짓말을 한다.
  // 초기 시드가 하위 데이터 없이 단계만 올려 둔 행이 남아 있을 수 있어 여기서 정리한다
  // (상담 생성은 "이미 있으면 건너뜀" 이라 배열을 고쳐도 기존 행은 그대로다).
  //
  // 판매 기록이 없는 채로 닫힌 상담이므로 `CLOSED` 로 맞춘다. 시나리오 스크립트가
  // 실제로 견적을 붙인 상담은 quotes 가 있으므로 여기 걸리지 않는다.
  const incoherent = await prisma.consultation.findMany({
    where: { stage: { in: ["QUOTED", "CONTRACTED", "DELIVERING", "COMPLETED"] }, quotes: { none: {} } },
    select: { id: true, startedAt: true, summary: true },
  });
  for (const row of incoherent) {
    await prisma.consultation.update({
      where: { id: row.id },
      data: {
        stage: "CLOSED",
        endedAt: row.startedAt,
        summary: row.summary ?? "판매 기록 없이 종료된 과거 상담",
      },
    });
  }
  if (incoherent.length > 0) {
    console.log(`  repaired ${incoherent.length} consultations advanced without a quote -> CLOSED`);
  }

  // ---------------------------------------------------------- 후속조치 (P1)
  // 상담이 있어야 붙일 수 있으므로 상담 생성 루프가 끝난 뒤에 돈다.
  let followUpCount = 0;
  for (const [index, seed] of ALL_CUSTOMERS.entries()) {
    if (!seed.followUps?.length) continue;
    const customerId = seededIds[index];

    const consultation = await prisma.consultation.findFirst({
      where: { customerId },
      orderBy: { startedAt: "desc" },
      select: { id: true, managerId: true },
    });
    if (!consultation) continue;

    for (const followUp of seed.followUps) {
      const dueAt = daysAgoDate(-followUp.dueDaysFromNow);
      const existing = await prisma.followUp.findFirst({
        where: { consultationId: consultation.id, content: followUp.content },
        select: { id: true },
      });
      if (existing) continue;

      await prisma.followUp.create({
        data: {
          consultationId: consultation.id,
          customerId,
          managerId: consultation.managerId,
          type: followUp.type,
          status: "PENDING",
          dueAt,
          content: followUp.content,
        },
      });
      followUpCount++;
    }
  }

  // ------------------------------------------------ 미처리 상담 (대시보드용)
  //
  // **시드 전용 조작이다.** 대시보드의 '미처리' 는 `updatedAt` 이 N일 이상 멈춘 열린 상담을
  // 조회 시점에 파생한 값인데, 시드가 방금 쓴 행은 `updatedAt` 이 항상 오늘이라 그대로 두면
  // 미처리가 0건으로 보인다. Prisma 의 `@updatedAt` 은 일반 update 로 과거 값을 쓸 수 없어
  // raw SQL 로 직접 민다. **어떤 서버 액션도 이런 일을 하지 않으며, 해서도 안 된다.**
  let staleCount = 0;
  for (const [index, seed] of ALL_CUSTOMERS.entries()) {
    if (seed.staleDays == null) continue;

    const consultation = await prisma.consultation.findFirst({
      where: { customerId: seededIds[index], stage: { in: ["IN_PROGRESS", "QUOTED"] } },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });
    if (!consultation) continue;

    // Prisma 의 SQLite 커넥터는 DateTime 을 **epoch 밀리초 INTEGER** 로 저장한다.
    // ISO 문자열을 넣으면 쓰기는 되지만 이후 읽기가 "Conversion failed" 로 깨진다.
    await prisma.$executeRawUnsafe(
      `UPDATE Consultation SET updatedAt = ? WHERE id = ?`,
      daysAgoDate(seed.staleDays).getTime(),
      consultation.id,
    );
    staleCount++;
  }

  // 중복 레코드를 원본에 연결한다. 숨기지는 않고 통합 표시에만 쓴다.
  for (const [index, seed] of ALL_CUSTOMERS.entries()) {
    if (!seed.duplicateOf) continue;
    const targetId = customerIdByMemberNo.get(seed.duplicateOf);
    if (!targetId) throw new Error(`알 수 없는 병합 대상 회원번호: ${seed.duplicateOf}`);

    await prisma.customer.update({
      where: { id: seededIds[index] },
      data: { mergedIntoId: targetId },
    });
  }

  console.log(
    `seeded ${ALL_CUSTOMERS.length} customers ` +
      `(consents / appliances / consultations, ${followUpCount} follow-ups, ${staleCount} backdated as 미처리)`,
  );
}
