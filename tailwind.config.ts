import type { Config } from "tailwindcss";

// Tokens mirror design-system.md §2~§6. Do not hardcode hex values in components.
const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    container: {
      center: true,
      padding: "24px",
      screens: { "2xl": "1440px" },
    },
    extend: {
      colors: {
        lg: {
          red: "#A50034",
          "red-dark": "#7A0026",
          "red-light": "#F5E6EB",
        },
        gray: {
          900: "#1A1A1A",
          700: "#4D4D4D",
          400: "#B3B3B3",
          200: "#E5E5E5",
          100: "#F5F5F5",
        },
        success: "#1E8A4C",
        warning: "#E8A317",
        error: "#D32F2F",
        info: "#2E6FDB",
      },
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Segoe UI",
          "Apple SD Gothic Neo",
          "Noto Sans KR",
          "Malgun Gothic",
          "sans-serif",
        ],
      },
      fontSize: {
        display: ["28px", { lineHeight: "36px", fontWeight: "700" }],
        h1: ["24px", { lineHeight: "32px", fontWeight: "700" }],
        h2: ["20px", { lineHeight: "28px", fontWeight: "700" }],
        h3: ["16px", { lineHeight: "24px", fontWeight: "600" }],
        body: ["14px", { lineHeight: "22px", fontWeight: "400" }],
        caption: ["12px", { lineHeight: "18px", fontWeight: "400" }],
        button: ["14px", { lineHeight: "20px", fontWeight: "600" }],
      },
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "24px",
        "2xl": "32px",
        "3xl": "48px",
      },
      maxWidth: {
        container: "1440px",
        modal: "480px",
        "modal-lg": "720px",
      },
      borderRadius: {
        card: "8px",
        control: "6px",
        modal: "12px",
      },
      boxShadow: {
        card: "0 1px 4px rgba(0,0,0,0.08)",
        modal: "0 8px 32px rgba(0,0,0,0.16)",
      },
      zIndex: {
        overlay: "40",
        modal: "50",
      },
    },
  },
  plugins: [],
};

export default config;
