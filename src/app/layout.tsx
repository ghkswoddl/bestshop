import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "LG Bestshop 고객상담 매니저",
  description: "LG Best Shop 매장 상담 매니저를 위한 고객·상품·견적·계약·배송 통합 업무 화면",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* Pretendard는 Google Fonts에 없어 next/font/google을 쓸 수 없다.
            공식 jsDelivr 웹폰트를 사용하고, 로드 실패 시 tailwind.config.ts의
            system-ui / Apple SD Gothic Neo / Malgun Gothic 스택으로 폴백된다. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
