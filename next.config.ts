import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 여러 Phase가 병렬로 화면을 추가하는 동안, 아직 만들어지지 않은 라우트로의
  // <Link>가 타입 에러를 내지 않도록 typedRoutes를 끈다.
  typedRoutes: false,
};

export default nextConfig;
