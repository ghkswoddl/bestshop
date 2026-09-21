// 사이드바 내비게이션 — PRD §4 기능 영역과 1:1 대응.
// 각 Phase는 담당 화면을 만들 때 해당 라우트 파일만 추가하면 된다.
export const NAV_ITEMS = [
  { href: "/dashboard", label: "상담대시보드" },
  { href: "/consultations", label: "상담이력관리" },
  { href: "/customers", label: "고객조회" },
  { href: "/products", label: "상품탐색" },
  { href: "/compare", label: "상품비교" },
  { href: "/inventory", label: "재고 및 매장확인" },
  { href: "/promotions", label: "프로모션 공지" },
  { href: "/quotes", label: "견적서 작성" },
  { href: "/contracts", label: "계약 및 전자서명" },
  { href: "/deliveries", label: "배송 및 설치 추적" },
  { href: "/store", label: "매장 및 매니저 정보" },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];
