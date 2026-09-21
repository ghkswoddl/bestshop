// Phase 3 — 상품 카탈로그 / 스펙 / 재고 매트릭스 / 이동요청 시드.
//
// seed.ts 를 여러 Phase 가 동시에 건드리는 것을 피하려고 별도 모듈로 분리했다.
// seed.ts 는 `seedCatalog(prisma)` 한 줄만 호출한다.
//
// Phase 11 이 상품을 60개로 늘릴 때는 PRODUCTS 배열에 항목을 추가하기만 하면
// 스펙/재고/상태가 같은 규칙으로 따라온다.

import type { PrismaClient } from "@prisma/client";
import { deriveStock } from "../src/lib/inventory";

type Spec = [key: string, value: string, unit?: string];

interface ProductSeed {
  modelCode: string;
  name: string;
  categoryCode: string;
  basePrice: number;
  status?: "ON_SALE" | "DISCONTINUED" | "NOT_CARRIED";
  description: string;
  releasedAt: string;
  /** 앞에서부터 몇 개를 비교 테이블 기본 노출 스펙(isKey)으로 볼지. */
  keySpecs: number;
  specs: Spec[];
}

const PRODUCTS: ProductSeed[] = [
  // ------------------------------------------------------------------ 냉장고
  {
    modelCode: "M872MEE011",
    name: "DIOS 오브제컬렉션 냉장고 875L",
    categoryCode: "REF",
    basePrice: 3290000,
    releasedAt: "2026-01-15",
    description: "4도어 매직스페이스에 인버터 리니어 컴프레서를 적용한 대용량 플래그십 냉장고.",
    keySpecs: 4,
    specs: [
      ["용량", "875", "L"],
      ["도어타입", "4도어"],
      ["에너지효율", "1등급"],
      ["냉각방식", "인버터 리니어"],
      ["매직스페이스", "적용"],
      ["도어색상", "베이지 / 그린 / 실버"],
      ["외형치수", "912 x 1790 x 923", "mm"],
      ["보증기간", "컴프레서 10년"],
    ],
  },
  {
    modelCode: "M623MWW042",
    name: "DIOS 상냉장하냉동 냉장고 615L",
    categoryCode: "REF",
    basePrice: 1890000,
    releasedAt: "2025-09-01",
    description: "4인 가구 표준 용량의 상냉장·하냉동 구조. 신선칸 온도 편차를 줄인 모델.",
    keySpecs: 4,
    specs: [
      ["용량", "615", "L"],
      ["도어타입", "상냉장 하냉동"],
      ["에너지효율", "2등급"],
      ["냉각방식", "인버터 리니어"],
      ["야채실", "수분 케어"],
      ["도어색상", "메탈 화이트"],
      ["외형치수", "835 x 1855 x 738", "mm"],
    ],
  },
  {
    modelCode: "B301S32",
    name: "LG 일반형 냉장고 300L",
    categoryCode: "REF",
    basePrice: 690000,
    status: "NOT_CARRIED",
    releasedAt: "2024-03-01",
    description: "1~2인 가구용 소형 냉장고. 온라인 전용 모델로 매장에서는 취급하지 않는다.",
    keySpecs: 4,
    specs: [
      ["용량", "300", "L"],
      ["도어타입", "2도어"],
      ["에너지효율", "3등급"],
      ["냉각방식", "간접냉각"],
      ["도어색상", "샤인"],
      ["외형치수", "595 x 1700 x 680", "mm"],
    ],
  },
  {
    modelCode: "K334MC13",
    name: "DIOS 김치톡톡 스탠드형 김치냉장고 324L",
    categoryCode: "REF",
    basePrice: 1450000,
    releasedAt: "2025-10-10",
    description: "유산균 김치 모드와 3칸 독립 제어를 지원하는 스탠드형 김치냉장고.",
    keySpecs: 4,
    specs: [
      ["용량", "324", "L"],
      ["도어타입", "스탠드형 3도어"],
      ["에너지효율", "1등급"],
      ["보관모드", "김치 / 육류 / 주류"],
      ["유산균케어", "적용"],
      ["도어색상", "퓨어 화이트"],
    ],
  },

  // ------------------------------------------------------------------ 세탁기
  {
    modelCode: "FX25ESE",
    name: "트롬 오브제컬렉션 세탁기 25kg",
    categoryCode: "WASH",
    basePrice: 1690000,
    releasedAt: "2026-02-01",
    description: "6모션 DD 모터와 트루스팀을 적용한 대용량 드럼세탁기.",
    keySpecs: 4,
    specs: [
      ["세탁용량", "25", "kg"],
      ["모터", "인버터 DD"],
      ["에너지효율", "1등급"],
      ["스팀", "트루스팀"],
      ["세탁코스", "22종"],
      ["도어색상", "네이처 베이지"],
      ["외형치수", "700 x 985 x 800", "mm"],
    ],
  },
  {
    modelCode: "F21VDSK",
    name: "트롬 드럼세탁기 21kg",
    categoryCode: "WASH",
    basePrice: 1190000,
    releasedAt: "2025-06-20",
    description: "표준 용량 드럼세탁기. 통살균과 자동 세제 투입을 지원한다.",
    keySpecs: 4,
    specs: [
      ["세탁용량", "21", "kg"],
      ["모터", "인버터 DD"],
      ["에너지효율", "1등급"],
      ["스팀", "트루스팀"],
      ["자동세제투입", "지원"],
      ["도어색상", "미들 블랙"],
    ],
  },
  {
    modelCode: "TR19DK",
    name: "통돌이 세탁기 19kg",
    categoryCode: "WASH",
    basePrice: 690000,
    releasedAt: "2024-11-05",
    description: "전자동 통돌이 방식. 이불 빨래와 소량 세탁을 자주 하는 가구에 적합하다.",
    keySpecs: 4,
    specs: [
      ["세탁용량", "19", "kg"],
      ["세탁방식", "전자동 통돌이"],
      ["에너지효율", "2등급"],
      ["통살균", "지원"],
      ["세탁코스", "12종"],
      ["색상", "미들 프리 실버"],
    ],
  },
  {
    modelCode: "W24EE",
    name: "트롬 워시타워 세탁건조기 24kg",
    categoryCode: "WASH",
    basePrice: 2590000,
    releasedAt: "2026-03-01",
    description: "세탁 24kg + 건조 20kg 일체형. 상단 컨트롤 패널로 두 기기를 한 번에 조작한다.",
    keySpecs: 5,
    specs: [
      ["세탁용량", "24", "kg"],
      ["건조용량", "20", "kg"],
      ["모터", "인버터 DD"],
      ["에너지효율", "세탁 1등급 / 건조 1등급"],
      ["스팀", "트루스팀 + 알러지케어"],
      ["원바디 컨트롤", "지원"],
      ["외형치수", "686 x 1690 x 846", "mm"],
    ],
  },

  // ------------------------------------------------------------------ 건조기
  {
    modelCode: "RH20ETN",
    name: "트롬 건조기 20kg",
    categoryCode: "DRY",
    basePrice: 1390000,
    releasedAt: "2025-08-12",
    description: "인버터 히트펌프 저온제습 방식 대용량 건조기.",
    keySpecs: 4,
    specs: [
      ["건조용량", "20", "kg"],
      ["건조방식", "인버터 히트펌프"],
      ["에너지효율", "1등급"],
      ["살균", "트루스팀 알러지케어"],
      ["콘덴서 자동세척", "3중"],
      ["도어색상", "블랙 스테인리스"],
    ],
  },
  {
    modelCode: "RH16ESE",
    name: "트롬 오브제컬렉션 건조기 16kg",
    categoryCode: "DRY",
    basePrice: 1190000,
    releasedAt: "2026-02-01",
    description: "오브제컬렉션 색상을 적용한 16kg 히트펌프 건조기.",
    keySpecs: 4,
    specs: [
      ["건조용량", "16", "kg"],
      ["건조방식", "인버터 히트펌프"],
      ["에너지효율", "1등급"],
      ["살균", "트루스팀"],
      ["도어색상", "네이처 그린"],
      ["외형치수", "700 x 985 x 660", "mm"],
    ],
  },
  {
    modelCode: "RM05EN",
    name: "트롬 미니 건조기 5kg",
    categoryCode: "DRY",
    basePrice: 790000,
    status: "DISCONTINUED",
    releasedAt: "2023-05-10",
    description: "소형 보조 건조기. 단종 모델로 잔여 재고만 판매한다.",
    keySpecs: 4,
    specs: [
      ["건조용량", "5", "kg"],
      ["건조방식", "히트펌프"],
      ["에너지효율", "2등급"],
      ["설치방식", "벽걸이 / 스탠드"],
      ["색상", "화이트"],
    ],
  },

  // ---------------------------------------------------------------------- TV
  {
    modelCode: "OLED65G4KNA",
    name: "LG OLED evo G4 65형",
    categoryCode: "TV",
    basePrice: 3890000,
    releasedAt: "2026-03-20",
    description: "밝기를 끌어올린 OLED evo 패널과 α11 프로세서를 적용한 플래그십 TV.",
    keySpecs: 5,
    specs: [
      ["화면크기", "65", "형"],
      ["해상도", "4K UHD (3840x2160)"],
      ["패널", "OLED evo"],
      ["주사율", "144", "Hz"],
      ["프로세서", "α11 AI"],
      ["스마트OS", "webOS 24"],
      ["HDMI", "4개 (2.1)"],
      ["설치", "벽밀착 슬림핏"],
    ],
  },
  {
    modelCode: "OLED55C4KNA",
    name: "LG OLED evo C4 55형",
    categoryCode: "TV",
    basePrice: 2190000,
    releasedAt: "2025-04-15",
    description: "거실·안방 겸용 55형 OLED. 게이밍 144Hz를 지원한다.",
    keySpecs: 5,
    specs: [
      ["화면크기", "55", "형"],
      ["해상도", "4K UHD (3840x2160)"],
      ["패널", "OLED evo"],
      ["주사율", "144", "Hz"],
      ["프로세서", "α9 Gen7"],
      ["스마트OS", "webOS 24"],
      ["HDMI", "4개 (2.1)"],
    ],
  },
  {
    modelCode: "75QNED85",
    name: "LG QNED 75형",
    categoryCode: "TV",
    basePrice: 1990000,
    releasedAt: "2025-05-02",
    description: "퀀텀닷 + 나노셀 대화면 LED TV. 밝은 거실에 적합하다.",
    keySpecs: 5,
    specs: [
      ["화면크기", "75", "형"],
      ["해상도", "4K UHD (3840x2160)"],
      ["패널", "QNED (LED)"],
      ["주사율", "120", "Hz"],
      ["프로세서", "α8 AI"],
      ["스마트OS", "webOS 24"],
      ["HDMI", "4개"],
    ],
  },
  {
    modelCode: "50UT8300",
    name: "LG 울트라HD TV 50형",
    categoryCode: "TV",
    basePrice: 790000,
    releasedAt: "2025-02-10",
    description: "세컨드 TV 수요를 겨냥한 보급형 4K 모델.",
    keySpecs: 5,
    specs: [
      ["화면크기", "50", "형"],
      ["해상도", "4K UHD (3840x2160)"],
      ["패널", "LED"],
      ["주사율", "60", "Hz"],
      ["프로세서", "α5 AI"],
      ["스마트OS", "webOS 24"],
      ["HDMI", "3개"],
    ],
  },
  {
    modelCode: "27ART10",
    name: "LG 스탠바이미 2 27형",
    categoryCode: "TV",
    basePrice: 1490000,
    releasedAt: "2026-01-08",
    description: "무선 배터리 내장 이동형 스크린. 분리형 스탠드를 지원한다.",
    keySpecs: 5,
    specs: [
      ["화면크기", "27", "형"],
      ["해상도", "FHD (1920x1080)"],
      ["패널", "터치 LED"],
      ["주사율", "60", "Hz"],
      ["배터리", "최대 4시간"],
      ["스마트OS", "webOS 24"],
      ["이동", "무선 / 분리형 스탠드"],
    ],
  },

  // ---------------------------------------------------------------- 에어컨
  {
    modelCode: "FQ19ED9WA2",
    name: "휘센 타워 에어컨 2in1 19평",
    categoryCode: "AC",
    basePrice: 2690000,
    releasedAt: "2026-03-05",
    description: "거실 스탠드 + 방 벽걸이 2in1 구성. 인공지능 절전을 지원한다.",
    keySpecs: 4,
    specs: [
      ["냉방면적", "62.8", "㎡"],
      ["냉방능력", "7200", "W"],
      ["에너지효율", "1등급"],
      ["타입", "스탠드 2in1"],
      ["공기청정", "PM1.0 센서"],
      ["색상", "울트라 화이트"],
      ["실외기", "1대 공용"],
    ],
  },
  {
    modelCode: "SQ06EDAWAS",
    name: "휘센 벽걸이 에어컨 6평",
    categoryCode: "AC",
    basePrice: 590000,
    releasedAt: "2025-04-01",
    description: "원룸·작은 방용 벽걸이 인버터 에어컨.",
    keySpecs: 4,
    specs: [
      ["냉방면적", "19.8", "㎡"],
      ["냉방능력", "2300", "W"],
      ["에너지효율", "2등급"],
      ["타입", "벽걸이"],
      ["공기청정", "미적용"],
      ["색상", "화이트"],
    ],
  },
  {
    modelCode: "ZRNQ0580T2S",
    name: "휘센 시스템 에어컨 4way 16평",
    categoryCode: "AC",
    basePrice: 1890000,
    releasedAt: "2025-03-18",
    description: "천장형 4way 시스템 에어컨. 신축·리모델링 현장 설치용.",
    keySpecs: 4,
    specs: [
      ["냉방면적", "52.8", "㎡"],
      ["냉방능력", "5800", "W"],
      ["에너지효율", "1등급"],
      ["타입", "천장형 4way"],
      ["설치", "매립 (별도 시공)"],
      ["색상", "화이트"],
    ],
  },
  {
    modelCode: "FQ17ETNBA2",
    name: "휘센 오브제컬렉션 타워 17평",
    categoryCode: "AC",
    basePrice: 2390000,
    releasedAt: "2026-02-20",
    description: "오브제컬렉션 색상 스탠드형. 상·하 독립 냉방을 지원한다.",
    keySpecs: 4,
    specs: [
      ["냉방면적", "56.2", "㎡"],
      ["냉방능력", "6500", "W"],
      ["에너지효율", "1등급"],
      ["타입", "스탠드"],
      ["공기청정", "PM1.0 센서"],
      ["색상", "베이지"],
    ],
  },

  // ---------------------------------------------------------------- 청소기
  {
    modelCode: "AX9884IKS",
    name: "코드제로 A9S 오브제컬렉션",
    categoryCode: "CLEAN",
    basePrice: 1290000,
    releasedAt: "2025-11-01",
    description: "듀얼 배터리 무선 스틱 청소기. 물걸레 키트를 포함한다.",
    keySpecs: 4,
    specs: [
      ["흡입력", "220", "W"],
      ["배터리", "듀얼 (2개)"],
      ["사용시간", "최대 120", "분"],
      ["무게", "2.6", "kg"],
      ["물걸레", "파워드라이브 물걸레"],
      ["색상", "카밍 베이지"],
    ],
  },
  {
    modelCode: "AO9781WKS",
    name: "코드제로 오브제컬렉션 올인원 타워",
    categoryCode: "CLEAN",
    basePrice: 1690000,
    releasedAt: "2026-01-20",
    description: "먼지통 자동 비움 거치대를 포함한 올인원 무선 청소기.",
    keySpecs: 4,
    specs: [
      ["흡입력", "220", "W"],
      ["배터리", "듀얼 (2개)"],
      ["사용시간", "최대 120", "분"],
      ["먼지통비움", "자동 (올인원 타워)"],
      ["무게", "2.7", "kg"],
      ["색상", "네이처 그린"],
    ],
  },
  {
    modelCode: "R585BKA",
    name: "LG 로봇청소기 R5",
    categoryCode: "CLEAN",
    basePrice: 1090000,
    releasedAt: "2025-07-07",
    description: "라이다 매핑 기반 로봇청소기. 물걸레 자동 세척을 지원한다.",
    keySpecs: 4,
    specs: [
      ["흡입력", "6000", "Pa"],
      ["배터리", "5200", "mAh"],
      ["사용시간", "최대 100", "분"],
      ["매핑", "라이다 3D"],
      ["물걸레", "자동 세척·건조"],
      ["색상", "블랙"],
    ],
  },

  // ------------------------------------------------------------ 식기세척기
  {
    modelCode: "DUBJ4EA",
    name: "DIOS 식기세척기 12인용",
    categoryCode: "DISH",
    basePrice: 1090000,
    releasedAt: "2025-05-15",
    description: "표준 12인용 빌트인 식기세척기. 트루스팀 살균을 지원한다.",
    keySpecs: 4,
    specs: [
      ["인용", "12", "인용"],
      ["세척코스", "9종"],
      ["에너지효율", "1등급"],
      ["건조방식", "히팅 + 자동문열림"],
      ["소음", "42", "dB"],
      ["색상", "네이처 베이지"],
    ],
  },
  {
    modelCode: "DUE4FA",
    name: "DIOS 오브제컬렉션 식기세척기 14인용",
    categoryCode: "DISH",
    basePrice: 1490000,
    releasedAt: "2026-02-10",
    description: "대용량 14인용. 3단 바스켓과 스팀 불림을 지원한다.",
    keySpecs: 4,
    specs: [
      ["인용", "14", "인용"],
      ["세척코스", "11종"],
      ["에너지효율", "1등급"],
      ["건조방식", "히팅 + 자동문열림"],
      ["바스켓", "3단"],
      ["소음", "39", "dB"],
      ["색상", "솔리드 실버"],
    ],
  },
  {
    modelCode: "DFB22SA",
    name: "DIOS 식기세척기 6인용",
    categoryCode: "DISH",
    basePrice: 690000,
    releasedAt: "2024-09-01",
    description: "1~2인 가구용 소형 카운터탑 식기세척기.",
    keySpecs: 4,
    specs: [
      ["인용", "6", "인용"],
      ["세척코스", "6종"],
      ["에너지효율", "2등급"],
      ["건조방식", "잔열 건조"],
      ["소음", "48", "dB"],
      ["색상", "화이트"],
    ],
  },

  // -------------------------------------------------------------- 스타일러
  {
    modelCode: "S5MOC",
    name: "트롬 스타일러 오브제컬렉션 5벌",
    categoryCode: "STYLER",
    basePrice: 2090000,
    releasedAt: "2026-01-25",
    description: "상의 5벌 + 하의 1벌 용량. 무빙행어와 트루스팀 살균을 지원한다.",
    keySpecs: 4,
    specs: [
      ["수용벌수", "상의 5벌 + 하의 1벌"],
      ["스팀", "트루스팀"],
      ["살균", "99.9% 유해세균 제거"],
      ["건조", "저온 제습 건조"],
      ["바지관리기", "도어 내장"],
      ["색상", "미스티 그레이"],
    ],
  },
  {
    modelCode: "S3MFC",
    name: "트롬 스타일러 3벌",
    categoryCode: "STYLER",
    basePrice: 1590000,
    releasedAt: "2025-03-11",
    description: "상의 3벌 표준형 스타일러.",
    keySpecs: 4,
    specs: [
      ["수용벌수", "상의 3벌 + 하의 1벌"],
      ["스팀", "트루스팀"],
      ["살균", "99.9% 유해세균 제거"],
      ["건조", "저온 제습 건조"],
      ["색상", "미러 / 린넨 블랙"],
    ],
  },
  {
    modelCode: "S3RERB",
    name: "트롬 미니 스타일러",
    categoryCode: "STYLER",
    basePrice: 990000,
    releasedAt: "2025-09-30",
    description: "소형 공간용 스타일러. 아우터 2벌 기준.",
    keySpecs: 4,
    specs: [
      ["수용벌수", "상의 2벌"],
      ["스팀", "트루스팀"],
      ["살균", "99.9% 유해세균 제거"],
      ["건조", "저온 제습 건조"],
      ["색상", "에센스 화이트"],
    ],
  },

  // ================================================================
  // Phase 11a — 카탈로그 확장 (29 → 61). 위와 같은 카테고리별 스펙 키 규약을 따른다.
  // ================================================================

  // ------------------------------------------------------------- 냉장고 (+5)
  {
    modelCode: "S634MC70Q",
    name: "DIOS 얼음정수기냉장고 오브제컬렉션 610L",
    categoryCode: "REF",
    basePrice: 3690000,
    releasedAt: "2026-02-18",
    description: "정수기와 제빙기를 내장한 양문형 냉장고. 필터 교체 알림을 지원한다.",
    keySpecs: 4,
    specs: [
      ["용량", "610", "L"],
      ["도어타입", "양문형 2도어"],
      ["에너지효율", "1등급"],
      ["냉각방식", "인버터 리니어"],
      ["정수기", "내장 (UV 살균)"],
      ["도어색상", "클레이 브라운"],
      ["외형치수", "913 x 1790 x 918", "mm"],
      ["보증기간", "컴프레서 10년"],
    ],
  },
  {
    modelCode: "M874GBB071",
    name: "DIOS 오브제컬렉션 냉장고 870L 글라스",
    categoryCode: "REF",
    basePrice: 3490000,
    releasedAt: "2025-12-05",
    description: "글라스 도어를 적용한 4도어 대용량 냉장고.",
    keySpecs: 4,
    specs: [
      ["용량", "870", "L"],
      ["도어타입", "4도어"],
      ["에너지효율", "1등급"],
      ["냉각방식", "인버터 리니어"],
      ["매직스페이스", "적용"],
      ["도어색상", "글라스 블랙"],
      ["외형치수", "912 x 1790 x 923", "mm"],
    ],
  },
  {
    modelCode: "T501SG",
    name: "LG 일반형 냉장고 507L",
    categoryCode: "REF",
    basePrice: 1090000,
    releasedAt: "2025-01-20",
    description: "군더더기 없는 상냉장 하냉동 보급형 냉장고.",
    keySpecs: 4,
    specs: [
      ["용량", "507", "L"],
      ["도어타입", "상냉장 하냉동"],
      ["에너지효율", "2등급"],
      ["냉각방식", "간접냉각"],
      ["야채실", "수분 케어"],
      ["도어색상", "샤인"],
      ["외형치수", "700 x 1850 x 730", "mm"],
    ],
  },
  {
    modelCode: "K335MC19",
    name: "DIOS 김치톡톡 스탠드형 김치냉장고 313L",
    categoryCode: "REF",
    basePrice: 1690000,
    releasedAt: "2026-01-30",
    description: "3도어 스탠드형 김치냉장고. 칸별 독립 온도 제어를 지원한다.",
    keySpecs: 4,
    specs: [
      ["용량", "313", "L"],
      ["도어타입", "스탠드형 3도어"],
      ["에너지효율", "1등급"],
      ["보관모드", "김치 / 육류 / 주류 / 야채"],
      ["유산균케어", "적용"],
      ["도어색상", "오브제 베이지"],
    ],
  },
  {
    modelCode: "Q142MC11",
    name: "DIOS 김치톡톡 뚜껑형 김치냉장고 126L",
    categoryCode: "REF",
    basePrice: 790000,
    releasedAt: "2024-10-12",
    description: "소형 뚜껑형 김치냉장고. 보조 저장용으로 적합하다.",
    keySpecs: 4,
    specs: [
      ["용량", "126", "L"],
      ["도어타입", "뚜껑형"],
      ["에너지효율", "2등급"],
      ["보관모드", "김치 / 쌀"],
      ["도어색상", "화이트"],
    ],
  },

  // ------------------------------------------------------------- 세탁기 (+4)
  {
    modelCode: "FX23ENA",
    name: "트롬 세탁기 23kg",
    categoryCode: "WASH",
    basePrice: 1390000,
    releasedAt: "2025-11-18",
    description: "23kg 드럼세탁기. 인버터 DD 모터와 트루스팀을 적용했다.",
    keySpecs: 4,
    specs: [
      ["세탁용량", "23", "kg"],
      ["모터", "인버터 DD"],
      ["에너지효율", "1등급"],
      ["스팀", "트루스팀"],
      ["세탁코스", "18종"],
      ["도어색상", "미들 실버"],
      ["외형치수", "686 x 950 x 800", "mm"],
    ],
  },
  {
    modelCode: "F9WKA",
    name: "트롬 오브제컬렉션 미니워시 3.5kg",
    categoryCode: "WASH",
    basePrice: 690000,
    releasedAt: "2025-07-22",
    description: "드럼세탁기 하단 결합형 소형 세탁기. 속옷·아기옷 분리 세탁용.",
    keySpecs: 4,
    specs: [
      ["세탁용량", "3.5", "kg"],
      ["모터", "인버터 DD"],
      ["에너지효율", "1등급"],
      ["세탁방식", "드럼 (하단 결합형)"],
      ["세탁코스", "9종"],
      ["색상", "네이처 베이지"],
    ],
  },
  {
    modelCode: "TR16EK",
    name: "통돌이 세탁기 16kg",
    categoryCode: "WASH",
    basePrice: 590000,
    releasedAt: "2024-08-14",
    description: "보급형 전자동 통돌이 세탁기.",
    keySpecs: 4,
    specs: [
      ["세탁용량", "16", "kg"],
      ["세탁방식", "전자동 통돌이"],
      ["에너지효율", "3등급"],
      ["통살균", "지원"],
      ["세탁코스", "10종"],
      ["색상", "미들 프리 실버"],
    ],
  },
  {
    modelCode: "W17WA",
    name: "트롬 워시콤보 세탁건조기 25kg",
    categoryCode: "WASH",
    basePrice: 2990000,
    releasedAt: "2026-03-12",
    description: "한 통에서 세탁부터 건조까지 끝내는 올인원 세탁건조기.",
    keySpecs: 5,
    specs: [
      ["세탁용량", "25", "kg"],
      ["건조용량", "15", "kg"],
      ["모터", "인버터 DD"],
      ["에너지효율", "세탁 1등급 / 건조 1등급"],
      ["스팀", "트루스팀 + 알러지케어"],
      ["세탁코스", "24종"],
      ["외형치수", "700 x 985 x 800", "mm"],
    ],
  },

  // ------------------------------------------------------------- 건조기 (+4)
  {
    modelCode: "RH21ETNH",
    name: "트롬 건조기 21kg 스팀",
    categoryCode: "DRY",
    basePrice: 1590000,
    releasedAt: "2026-02-25",
    description: "대용량 히트펌프 건조기에 트루스팀 살균을 더한 상위 모델.",
    keySpecs: 4,
    specs: [
      ["건조용량", "21", "kg"],
      ["건조방식", "인버터 히트펌프"],
      ["에너지효율", "1등급"],
      ["살균", "트루스팀 알러지케어"],
      ["콘덴서 자동세척", "3중"],
      ["도어색상", "네이처 베이지"],
      ["외형치수", "700 x 985 x 660", "mm"],
    ],
  },
  {
    modelCode: "RH19ETN",
    name: "트롬 건조기 19kg 인버터",
    categoryCode: "DRY",
    basePrice: 1290000,
    releasedAt: "2025-06-08",
    description: "표준 용량 인버터 히트펌프 건조기.",
    keySpecs: 4,
    specs: [
      ["건조용량", "19", "kg"],
      ["건조방식", "인버터 히트펌프"],
      ["에너지효율", "1등급"],
      ["살균", "트루스팀"],
      ["콘덴서 자동세척", "3중"],
      ["도어색상", "미들 실버"],
    ],
  },
  {
    modelCode: "RH14EMN",
    name: "트롬 건조기 14kg",
    categoryCode: "DRY",
    basePrice: 990000,
    releasedAt: "2024-12-02",
    description: "1~2인 가구용 중형 건조기.",
    keySpecs: 4,
    specs: [
      ["건조용량", "14", "kg"],
      ["건조방식", "히트펌프"],
      ["에너지효율", "2등급"],
      ["살균", "미적용"],
      ["설치방식", "스탠드 / 직렬"],
      ["색상", "화이트"],
    ],
  },
  {
    modelCode: "RC90V9",
    name: "트롬 오브제컬렉션 건조기 9kg",
    categoryCode: "DRY",
    basePrice: 890000,
    status: "DISCONTINUED",
    releasedAt: "2023-09-15",
    description: "소용량 오브제컬렉션 건조기. 단종 모델로 잔여 재고만 판매한다.",
    keySpecs: 4,
    specs: [
      ["건조용량", "9", "kg"],
      ["건조방식", "히트펌프"],
      ["에너지효율", "2등급"],
      ["살균", "미적용"],
      ["색상", "카밍 베이지"],
    ],
  },

  // ------------------------------------------------------------------ TV (+5)
  {
    modelCode: "OLED77G4KNA",
    name: "LG OLED evo G4 77형",
    categoryCode: "TV",
    basePrice: 5690000,
    releasedAt: "2026-03-20",
    description: "77형 대화면 OLED evo. 거실 벽밀착 설치를 전제로 한 플래그십.",
    keySpecs: 5,
    specs: [
      ["화면크기", "77", "형"],
      ["해상도", "4K UHD (3840x2160)"],
      ["패널", "OLED evo"],
      ["주사율", "144", "Hz"],
      ["프로세서", "α11 AI"],
      ["스마트OS", "webOS 24"],
      ["HDMI", "4개 (2.1)"],
      ["설치", "벽밀착 슬림핏"],
    ],
  },
  {
    modelCode: "OLED48C4KNA",
    name: "LG OLED evo C4 48형",
    categoryCode: "TV",
    basePrice: 1690000,
    releasedAt: "2025-04-15",
    description: "게이밍·서재용 48형 OLED. 144Hz를 지원한다.",
    keySpecs: 5,
    specs: [
      ["화면크기", "48", "형"],
      ["해상도", "4K UHD (3840x2160)"],
      ["패널", "OLED evo"],
      ["주사율", "144", "Hz"],
      ["프로세서", "α9 Gen7"],
      ["스마트OS", "webOS 24"],
      ["HDMI", "4개 (2.1)"],
    ],
  },
  {
    modelCode: "65QNED80",
    name: "LG QNED 65형",
    categoryCode: "TV",
    basePrice: 1390000,
    releasedAt: "2025-05-02",
    description: "표준 거실 크기의 퀀텀닷 나노셀 LED TV.",
    keySpecs: 5,
    specs: [
      ["화면크기", "65", "형"],
      ["해상도", "4K UHD (3840x2160)"],
      ["패널", "QNED (LED)"],
      ["주사율", "120", "Hz"],
      ["프로세서", "α8 AI"],
      ["스마트OS", "webOS 24"],
      ["HDMI", "4개"],
    ],
  },
  {
    modelCode: "86UT9300",
    name: "LG 울트라HD TV 86형",
    categoryCode: "TV",
    basePrice: 2490000,
    releasedAt: "2025-08-19",
    description: "86형 초대형 LED TV. 넓은 거실·상업 공간용.",
    keySpecs: 5,
    specs: [
      ["화면크기", "86", "형"],
      ["해상도", "4K UHD (3840x2160)"],
      ["패널", "LED"],
      ["주사율", "120", "Hz"],
      ["프로세서", "α7 AI"],
      ["스마트OS", "webOS 24"],
      ["HDMI", "4개"],
    ],
  },
  {
    modelCode: "43UT7300",
    name: "LG 울트라HD TV 43형",
    categoryCode: "TV",
    basePrice: 590000,
    releasedAt: "2024-11-27",
    description: "원룸·주방용 소형 4K TV.",
    keySpecs: 5,
    specs: [
      ["화면크기", "43", "형"],
      ["해상도", "4K UHD (3840x2160)"],
      ["패널", "LED"],
      ["주사율", "60", "Hz"],
      ["프로세서", "α5 AI"],
      ["스마트OS", "webOS 24"],
      ["HDMI", "3개"],
    ],
  },

  // ----------------------------------------------------------- 에어컨 (+4)
  {
    modelCode: "FQ17DENBA2",
    name: "휘센 타워 에어컨 2in1 17평",
    categoryCode: "AC",
    basePrice: 2490000,
    releasedAt: "2025-03-28",
    description: "거실 스탠드 + 방 벽걸이 2in1. 실외기 1대를 공용한다.",
    keySpecs: 4,
    specs: [
      ["냉방면적", "56.2", "㎡"],
      ["냉방능력", "6500", "W"],
      ["에너지효율", "1등급"],
      ["타입", "스탠드 2in1"],
      ["공기청정", "PM1.0 센서"],
      ["색상", "울트라 화이트"],
      ["실외기", "1대 공용"],
    ],
  },
  {
    modelCode: "SQ11EDAWAS",
    name: "휘센 벽걸이 에어컨 11평",
    categoryCode: "AC",
    basePrice: 790000,
    releasedAt: "2025-04-01",
    description: "넓은 방용 벽걸이 인버터 에어컨.",
    keySpecs: 4,
    specs: [
      ["냉방면적", "36.3", "㎡"],
      ["냉방능력", "3600", "W"],
      ["에너지효율", "1등급"],
      ["타입", "벽걸이"],
      ["공기청정", "미세먼지 필터"],
      ["색상", "화이트"],
    ],
  },
  {
    modelCode: "FQ23ETNBA2",
    name: "휘센 오브제컬렉션 타워 23평",
    categoryCode: "AC",
    basePrice: 2990000,
    releasedAt: "2026-03-05",
    description: "대형 거실용 오브제컬렉션 스탠드 에어컨.",
    keySpecs: 4,
    specs: [
      ["냉방면적", "76.0", "㎡"],
      ["냉방능력", "8800", "W"],
      ["에너지효율", "1등급"],
      ["타입", "스탠드"],
      ["공기청정", "PM1.0 센서"],
      ["색상", "네이처 그린"],
    ],
  },
  {
    modelCode: "ZRNQ0720T2S",
    name: "휘센 시스템 에어컨 4way 20평",
    categoryCode: "AC",
    basePrice: 2190000,
    releasedAt: "2025-03-18",
    description: "천장형 4way 시스템 에어컨 대용량. 별도 시공이 필요하다.",
    keySpecs: 4,
    specs: [
      ["냉방면적", "66.1", "㎡"],
      ["냉방능력", "7200", "W"],
      ["에너지효율", "1등급"],
      ["타입", "천장형 4way"],
      ["설치", "매립 (별도 시공)"],
      ["색상", "화이트"],
    ],
  },

  // ----------------------------------------------------------- 청소기 (+4)
  {
    modelCode: "AX9500TKS",
    name: "코드제로 A9S 씽큐 스틱청소기",
    categoryCode: "CLEAN",
    basePrice: 990000,
    releasedAt: "2025-06-11",
    description: "표준형 무선 스틱 청소기. 배터리 1개 구성.",
    keySpecs: 4,
    specs: [
      ["흡입력", "210", "W"],
      ["배터리", "싱글 (1개)"],
      ["사용시간", "최대 60", "분"],
      ["무게", "2.5", "kg"],
      ["물걸레", "미포함"],
      ["색상", "아이언 그레이"],
    ],
  },
  {
    modelCode: "R9MASTER",
    name: "LG 로봇청소기 R9 마스터",
    categoryCode: "CLEAN",
    basePrice: 1690000,
    releasedAt: "2026-01-14",
    description: "상위 라인 로봇청소기. 먼지통 자동 비움 거치대를 포함한다.",
    keySpecs: 4,
    specs: [
      ["흡입력", "8000", "Pa"],
      ["배터리", "6400", "mAh"],
      ["사용시간", "최대 140", "분"],
      ["먼지통비움", "자동 (거치대)"],
      ["매핑", "라이다 3D"],
      ["색상", "화이트"],
    ],
  },
  {
    modelCode: "AO9571WKS",
    name: "코드제로 올인원 타워 화이트",
    categoryCode: "CLEAN",
    basePrice: 1590000,
    releasedAt: "2025-10-02",
    description: "먼지통 자동 비움 타워를 포함한 무선 청소기 화이트 구성.",
    keySpecs: 4,
    specs: [
      ["흡입력", "220", "W"],
      ["배터리", "듀얼 (2개)"],
      ["사용시간", "최대 120", "분"],
      ["먼지통비움", "자동 (올인원 타워)"],
      ["무게", "2.7", "kg"],
      ["색상", "에센스 화이트"],
    ],
  },
  {
    modelCode: "VS8401SCW",
    name: "코드제로 핸디스틱 청소기",
    categoryCode: "CLEAN",
    basePrice: 490000,
    status: "DISCONTINUED",
    releasedAt: "2023-04-20",
    description: "차량·책상용 소형 핸디 청소기. 단종 모델이다.",
    keySpecs: 4,
    specs: [
      ["흡입력", "120", "W"],
      ["배터리", "싱글 (1개)"],
      ["사용시간", "최대 30", "분"],
      ["무게", "1.2", "kg"],
      ["색상", "화이트"],
    ],
  },

  // ------------------------------------------------------- 식기세척기 (+3)
  {
    modelCode: "DUE7WA",
    name: "DIOS 오브제컬렉션 식기세척기 14인용 스팀",
    categoryCode: "DISH",
    basePrice: 1690000,
    releasedAt: "2026-03-02",
    description: "14인용 상위 모델. 스팀 불림과 3단 바스켓을 지원한다.",
    keySpecs: 4,
    specs: [
      ["인용", "14", "인용"],
      ["세척코스", "12종"],
      ["에너지효율", "1등급"],
      ["건조방식", "히팅 + 자동문열림"],
      ["바스켓", "3단"],
      ["소음", "38", "dB"],
      ["색상", "네이처 그린"],
    ],
  },
  {
    modelCode: "DUBJ2EA",
    name: "DIOS 식기세척기 12인용 베이직",
    categoryCode: "DISH",
    basePrice: 890000,
    releasedAt: "2024-07-09",
    description: "기본 코스 중심의 12인용 빌트인 식기세척기.",
    keySpecs: 4,
    specs: [
      ["인용", "12", "인용"],
      ["세척코스", "6종"],
      ["에너지효율", "2등급"],
      ["건조방식", "잔열 건조"],
      ["소음", "45", "dB"],
      ["색상", "화이트"],
    ],
  },
  {
    modelCode: "DFC22W",
    name: "DIOS 카운터탑 식기세척기 4인용",
    categoryCode: "DISH",
    basePrice: 490000,
    status: "NOT_CARRIED",
    releasedAt: "2024-05-30",
    description: "1인 가구용 카운터탑 식기세척기. 온라인 전용으로 매장에서는 취급하지 않는다.",
    keySpecs: 4,
    specs: [
      ["인용", "4", "인용"],
      ["세척코스", "5종"],
      ["에너지효율", "3등급"],
      ["건조방식", "잔열 건조"],
      ["소음", "52", "dB"],
      ["색상", "화이트"],
    ],
  },

  // --------------------------------------------------------- 스타일러 (+3)
  {
    modelCode: "S5BFO",
    name: "트롬 스타일러 오브제컬렉션 5벌 블랙",
    categoryCode: "STYLER",
    basePrice: 2290000,
    releasedAt: "2026-02-06",
    description: "5벌 대용량 스타일러 블랙 구성. 무빙행어와 바지관리기를 포함한다.",
    keySpecs: 4,
    specs: [
      ["수용벌수", "상의 5벌 + 하의 1벌"],
      ["스팀", "트루스팀"],
      ["살균", "99.9% 유해세균 제거"],
      ["건조", "저온 제습 건조"],
      ["바지관리기", "도어 내장"],
      ["색상", "린넨 블랙"],
    ],
  },
  {
    modelCode: "S3WFO",
    name: "트롬 스타일러 오브제컬렉션 3벌",
    categoryCode: "STYLER",
    basePrice: 1790000,
    releasedAt: "2025-11-11",
    description: "오브제컬렉션 색상을 적용한 3벌 스타일러.",
    keySpecs: 4,
    specs: [
      ["수용벌수", "상의 3벌 + 하의 1벌"],
      ["스팀", "트루스팀"],
      ["살균", "99.9% 유해세균 제거"],
      ["건조", "저온 제습 건조"],
      ["바지관리기", "도어 내장"],
      ["색상", "네이처 베이지"],
    ],
  },
  {
    modelCode: "S3BF",
    name: "트롬 스타일러 3벌 미러",
    categoryCode: "STYLER",
    basePrice: 1490000,
    releasedAt: "2025-02-24",
    description: "미러 도어를 적용한 3벌 스타일러.",
    keySpecs: 4,
    specs: [
      ["수용벌수", "상의 3벌"],
      ["스팀", "트루스팀"],
      ["살균", "99.9% 유해세균 제거"],
      ["건조", "저온 제습 건조"],
      ["색상", "미러"],
    ],
  },
];

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const SECOND_MS = 1_000;

/**
 * 결정적(deterministic) 재고 매트릭스.
 * 재시드해도 같은 분포가 나오도록 인덱스 기반 계산만 쓴다.
 * null 을 돌려주면 그 매장은 해당 상품을 취급하지 않는다(재고 행 없음 = 미취급).
 */
function inventoryPlan(productIndex: number, storeIndex: number, now: number) {
  const n = (productIndex * 7 + storeIndex * 13) % 17;
  if (n === 0) return null;

  const quantity = n <= 3 ? 0 : n <= 6 ? n - 3 : n;
  const reservedQty = quantity >= 5 ? (productIndex + storeIndex) % 3 : 0;
  const saleStopped = (productIndex * 5 + storeIndex) % 29 === 7;
  // 상품이 60개로 늘면서 (시, 분) 조합만으로는 기준시각이 겹친다. 초까지 흩어 놓는다.
  const ageHours = (productIndex * 3 + storeIndex * 5) % 40;
  const ageMinutes = (productIndex * 11 + storeIndex * 17) % 60;
  const ageSeconds = (productIndex * 23 + storeIndex * 41) % 60;

  return {
    quantity,
    reservedQty,
    safetyStock: 2,
    saleStopped,
    asOfAt: new Date(
      now - ageHours * HOUR_MS - ageMinutes * MINUTE_MS - ageSeconds * SECOND_MS,
    ),
  };
}

/** P1 이동요청 화면이 빈 상태로 보이지 않도록 상태별 표본을 심는다. */
const TRANSFERS = [
  { modelCode: "OLED65G4KNA", fromStore: "JS02", toStore: "GN01", quantity: 1, status: "REQUESTED", requestedBy: "M1001", note: "고객 방문 예약 건 — 주말까지 필요" },
  { modelCode: "FX25ESE", fromStore: "BD03", toStore: "GN01", quantity: 1, status: "APPROVED", requestedBy: "M1002", note: "혼수 패키지 상담 건" },
  { modelCode: "S5MOC", fromStore: "GN01", toStore: "JS02", quantity: 1, status: "IN_TRANSIT", requestedBy: "M1004", note: null },
  { modelCode: "AX9884IKS", fromStore: "IS04", toStore: "BD03", quantity: 2, status: "COMPLETED", requestedBy: "M1006", note: "프로모션 물량 보충" },
  { modelCode: "75QNED85", fromStore: "BS05", toStore: "GN01", quantity: 1, status: "REJECTED", requestedBy: "M1001", note: "출고 매장 재고 부족으로 반려" },
] as const;

export async function seedCatalog(prisma: PrismaClient) {
  const categories = await prisma.category.findMany({ select: { id: true, code: true } });
  const categoryIdByCode = new Map(categories.map((c) => [c.code, c.id]));

  for (const seed of PRODUCTS) {
    const categoryId = categoryIdByCode.get(seed.categoryCode);
    if (!categoryId) throw new Error(`알 수 없는 카테고리 코드: ${seed.categoryCode}`);

    const data = {
      name: seed.name,
      categoryId,
      basePrice: seed.basePrice,
      status: seed.status ?? "ON_SALE",
      description: seed.description,
      releasedAt: new Date(`${seed.releasedAt}T00:00:00+09:00`),
    };

    const product = await prisma.product.upsert({
      where: { modelCode: seed.modelCode },
      update: data,
      create: { modelCode: seed.modelCode, ...data },
    });

    // 스펙은 순서가 곧 표시순서라 통째로 다시 깐다 (참조하는 테이블이 없다).
    await prisma.productSpec.deleteMany({ where: { productId: product.id } });
    await prisma.productSpec.createMany({
      data: seed.specs.map(([key, value, unit], index) => ({
        productId: product.id,
        key,
        value,
        unit: unit ?? null,
        sortOrder: index,
        isKey: index < seed.keySpecs,
      })),
    });
  }
  console.log(`seeded ${PRODUCTS.length} products with specs`);

  const stores = await prisma.store.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true } });
  const products = await prisma.product.findMany({
    where: { modelCode: { in: PRODUCTS.map((p) => p.modelCode) } },
    select: { id: true, modelCode: true, status: true },
  });
  const productByCode = new Map(products.map((p) => [p.modelCode, p]));
  const storeIdByCode = new Map(stores.map((s) => [s.code, s.id]));

  const now = Date.now();
  let written = 0;
  let notCarried = 0;

  for (const [productIndex, seed] of PRODUCTS.entries()) {
    const product = productByCode.get(seed.modelCode);
    if (!product) continue;

    for (const [storeIndex, store] of stores.entries()) {
      const plan = inventoryPlan(productIndex, storeIndex, now);
      const key = { productId_storeId: { productId: product.id, storeId: store.id } };

      if (!plan) {
        await prisma.inventoryItem.deleteMany({ where: { productId: product.id, storeId: store.id } });
        notCarried += 1;
        continue;
      }

      const facts = {
        quantity: plan.quantity,
        reservedQty: plan.reservedQty,
        safetyStock: plan.safetyStock,
        status: plan.saleStopped ? "SALE_STOPPED" : "IN_STOCK",
        asOfAt: plan.asOfAt,
      };
      // status 컬럼도 파생 규칙과 같은 값으로 맞춰 둔다 (화면은 항상 deriveStock 을 다시 계산한다).
      const status = deriveStock(facts, product.status).status;

      await prisma.inventoryItem.upsert({
        where: key,
        update: { ...facts, status },
        create: { productId: product.id, storeId: store.id, ...facts, status },
      });
      written += 1;
    }
  }
  console.log(`seeded ${written} inventory rows (${notCarried} product/store pairs left 미취급)`);

  const managers = await prisma.manager.findMany({ select: { id: true, employeeNo: true } });
  const managerIdByNo = new Map(managers.map((m) => [m.employeeNo, m.id]));

  await prisma.transferRequest.deleteMany({});
  for (const transfer of TRANSFERS) {
    const product = productByCode.get(transfer.modelCode);
    const fromStoreId = storeIdByCode.get(transfer.fromStore);
    const toStoreId = storeIdByCode.get(transfer.toStore);
    const requestedById = managerIdByNo.get(transfer.requestedBy);
    if (!product || !fromStoreId || !toStoreId || !requestedById) continue;

    const requestedAt = new Date(now - (TRANSFERS.indexOf(transfer) + 1) * 26 * HOUR_MS);
    await prisma.transferRequest.create({
      data: {
        productId: product.id,
        fromStoreId,
        toStoreId,
        quantity: transfer.quantity,
        status: transfer.status,
        requestedById,
        note: transfer.note,
        requestedAt,
        respondedAt: transfer.status === "REQUESTED" ? null : new Date(requestedAt.getTime() + 6 * HOUR_MS),
        completedAt: transfer.status === "COMPLETED" ? new Date(requestedAt.getTime() + 20 * HOUR_MS) : null,
      },
    });
  }
  console.log(`seeded ${TRANSFERS.length} transfer requests`);
}

/**
 * Phase 11a — 확장된 카탈로그를 기존 프로모션에 추가로 엮는다.
 *
 * **반드시 seedPromotions(prisma) 뒤에 호출해야 한다.** seed-promotions.ts 는 자기 프로모션의
 * PromotionProduct 를 매번 deleteMany 후 재생성하므로, 먼저 붙이면 지워진다.
 * 새 Promotion 을 만들지는 않는다 — 프로모션 자체는 Phase 5(worker-1) 소관이고, 여기서는
 * 새 상품을 기존 프로모션에 연결만 한다.
 */
const EXTRA_PROMOTION_LINKS: { code: string; modelCodes: string[] }[] = [
  { code: "OLED-TRADE", modelCodes: ["OLED77G4KNA", "OLED48C4KNA"] },
  { code: "SUMMER-TV-PRE", modelCodes: ["65QNED80", "86UT9300", "43UT7300"] },
  { code: "AIRCON-EARLY", modelCodes: ["FQ17DENBA2", "SQ11EDAWAS", "FQ23ETNBA2", "ZRNQ0720T2S"] },
  { code: "CLEAN-GIFT", modelCodes: ["AX9500TKS", "R9MASTER", "AO9571WKS"] },
  { code: "DISH-CASHBACK", modelCodes: ["DUE7WA", "DUBJ2EA"] },
  { code: "STYLER-LAUNCH", modelCodes: ["S5BFO", "S3WFO", "S3BF"] },
  { code: "WASH-DRY-BUNDLE", modelCodes: ["FX23ENA", "W17WA", "RH21ETNH", "RH19ETN"] },
  { code: "SPRING-KITCHEN", modelCodes: ["S634MC70Q", "M874GBB071", "K335MC19"] },
  { code: "NEWYEAR-PKG", modelCodes: ["T501SG", "TR16EK", "RH14EMN"] },
];

export async function seedCatalogPromotionLinks(prisma: PrismaClient) {
  const promotions = await prisma.promotion.findMany({ select: { id: true, code: true } });
  const promotionIdByCode = new Map(promotions.map((p) => [p.code, p.id]));

  const modelCodes = EXTRA_PROMOTION_LINKS.flatMap((link) => link.modelCodes);
  const products = await prisma.product.findMany({
    where: { modelCode: { in: modelCodes } },
    select: { id: true, modelCode: true },
  });
  const productIdByModel = new Map(products.map((p) => [p.modelCode, p.id]));

  const rows = EXTRA_PROMOTION_LINKS.flatMap((link) => {
    const promotionId = promotionIdByCode.get(link.code);
    if (!promotionId) return [];
    return link.modelCodes.flatMap((code) => {
      const productId = productIdByModel.get(code);
      return productId ? [{ promotionId, productId }] : [];
    });
  });

  // SQLite 는 createMany 의 skipDuplicates 를 지원하지 않는다.
  // @@unique([promotionId, productId]) 를 직접 조회해 없는 것만 만든다 (재시드 안전).
  const existing = await prisma.promotionProduct.findMany({
    where: { promotionId: { in: [...promotionIdByCode.values()] } },
    select: { promotionId: true, productId: true },
  });
  const seen = new Set(existing.map((row) => `${row.promotionId}:${row.productId}`));
  const missing = rows.filter((row) => !seen.has(`${row.promotionId}:${row.productId}`));

  if (missing.length > 0) await prisma.promotionProduct.createMany({ data: missing });
  console.log(
    `linked ${missing.length} new promotion-product pairs (${rows.length} requested, ${
      rows.length - missing.length
    } already present)`,
  );
}
