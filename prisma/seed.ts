import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedCatalog, seedCatalogPromotionLinks } from "./seed-catalog";
import { seedCustomers } from "./seed-customers";
import { seedFinanceProducts } from "./seed-finance";
import { seedPromotions } from "./seed-promotions";

const prisma = new PrismaClient();

// Phase 0: 카테고리. Phase 1: 매장 + 매니저(로그인에 필요해 앞당김).
// 상품 60 / 고객 50 / 재고 매트릭스는 Phase 11에서 이 파일에 함수를 추가해 채운다.
//
// 시드 계정 공통 비밀번호는 SEED_PASSWORD.
const SEED_PASSWORD = "bestshop1234";

const CATEGORIES = [
  { code: "REF", name: "냉장고", replacementCycleMonths: 120, sortOrder: 1 },
  { code: "WASH", name: "세탁기", replacementCycleMonths: 108, sortOrder: 2 },
  { code: "DRY", name: "건조기", replacementCycleMonths: 108, sortOrder: 3 },
  { code: "TV", name: "TV", replacementCycleMonths: 84, sortOrder: 4 },
  { code: "AC", name: "에어컨", replacementCycleMonths: 120, sortOrder: 5 },
  { code: "CLEAN", name: "청소기", replacementCycleMonths: 60, sortOrder: 6 },
  { code: "DISH", name: "식기세척기", replacementCycleMonths: 96, sortOrder: 7 },
  { code: "STYLER", name: "스타일러", replacementCycleMonths: 96, sortOrder: 8 },
];

const STORES = [
  {
    code: "GN01",
    name: "강남점",
    address: "서울특별시 강남구 테헤란로 152",
    lat: 37.500713,
    lng: 127.036585,
    openTime: "10:00",
    closeTime: "20:00",
    holidays: "매월 2/4주 월요일",
    phone: "02-555-1001",
  },
  {
    code: "JS02",
    name: "잠실점",
    address: "서울특별시 송파구 올림픽로 240",
    lat: 37.51345,
    lng: 127.104,
    openTime: "10:00",
    closeTime: "20:00",
    holidays: "매월 2/4주 월요일",
    phone: "02-555-1002",
  },
  {
    code: "BD03",
    name: "분당점",
    address: "경기도 성남시 분당구 황새울로 246",
    lat: 37.381,
    lng: 127.1185,
    openTime: "10:00",
    closeTime: "20:00",
    holidays: "매월 2주 월요일",
    phone: "031-555-1003",
  },
  {
    code: "IS04",
    name: "일산점",
    address: "경기도 고양시 일산동구 중앙로 1275",
    lat: 37.6584,
    lng: 126.7715,
    openTime: "10:30",
    closeTime: "20:00",
    holidays: "매월 2/4주 월요일",
    phone: "031-555-1004",
  },
  {
    code: "BS05",
    name: "부산서면점",
    address: "부산광역시 부산진구 중앙대로 692",
    lat: 35.1579,
    lng: 129.0594,
    openTime: "10:30",
    closeTime: "20:30",
    holidays: "연중무휴",
    phone: "051-555-1005",
  },
];

const MANAGERS = [
  { employeeNo: "M1001", name: "김민수", role: "MANAGER", storeCode: "GN01", duty: "주방가전 상담", phone: "010-2001-1001", email: "minsu.kim@bestshop.example" },
  { employeeNo: "M1002", name: "이지은", role: "MANAGER", storeCode: "GN01", duty: "생활가전 상담", phone: "010-2001-1002", email: "jieun.lee@bestshop.example" },
  { employeeNo: "M1003", name: "박서준", role: "STORE_ADMIN", storeCode: "GN01", duty: "강남점 점장", phone: "010-2001-1003", email: "seojun.park@bestshop.example" },
  { employeeNo: "M1004", name: "최유진", role: "MANAGER", storeCode: "JS02", duty: "영상가전 상담", phone: "010-2002-1004", email: "yujin.choi@bestshop.example" },
  { employeeNo: "M1005", name: "정하늘", role: "STORE_ADMIN", storeCode: "JS02", duty: "잠실점 점장", phone: "010-2002-1005", email: "haneul.jung@bestshop.example" },
  { employeeNo: "M1006", name: "강도윤", role: "MANAGER", storeCode: "BD03", duty: "주방가전 상담", phone: "010-2003-1006", email: "doyun.kang@bestshop.example" },
  { employeeNo: "M1007", name: "윤세아", role: "MANAGER", storeCode: "IS04", duty: "생활가전 상담", phone: "010-2004-1007", email: "sea.yoon@bestshop.example" },
  { employeeNo: "M1008", name: "노경주", role: "MANAGER", storeCode: "BS05", duty: "영상가전 상담", phone: "010-2005-1008", email: "kyungju.no@bestshop.example" },
  { employeeNo: "M9001", name: "한지훈", role: "HQ", storeCode: "GN01", duty: "본사 프로모션 기획", phone: "010-9000-9001", email: "jihun.han@bestshop.example" },
];

async function seedCategories() {
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { code: category.code },
      update: category,
      create: category,
    });
  }
  console.log(`seeded ${CATEGORIES.length} categories`);
}

async function seedStores() {
  for (const store of STORES) {
    await prisma.store.upsert({
      where: { code: store.code },
      update: store,
      create: store,
    });
  }
  console.log(`seeded ${STORES.length} stores`);
}

async function seedManagers() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const stores = await prisma.store.findMany({ select: { id: true, code: true } });
  const storeIdByCode = new Map(stores.map((s) => [s.code, s.id]));

  for (const { storeCode, ...manager } of MANAGERS) {
    const storeId = storeIdByCode.get(storeCode);
    if (!storeId) throw new Error(`알 수 없는 매장 코드: ${storeCode}`);

    await prisma.manager.upsert({
      where: { employeeNo: manager.employeeNo },
      update: { ...manager, storeId },
      create: { ...manager, storeId, passwordHash },
    });
  }
  console.log(`seeded ${MANAGERS.length} managers (password: ${SEED_PASSWORD})`);
}

async function main() {
  await seedCategories();
  await seedStores();
  await seedManagers();
  await seedCatalog(prisma);
  await seedCustomers(prisma);
  await seedFinanceProducts(prisma);
  await seedPromotions(prisma);
  // seedPromotions 가 자기 PromotionProduct 를 지웠다 다시 만들기 때문에 반드시 그 뒤에 온다.
  await seedCatalogPromotionLinks(prisma);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
