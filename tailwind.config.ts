import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        label: "rgb(var(--label-rgb) / <alpha-value>)",
        sys: {
          bg: "var(--sys-bg)",
          card: "var(--sys-card)",
          card2: "var(--sys-card-2)",
          sep: "var(--sep)",
          fill: "var(--fill)",
          label2: "var(--label-2)",
          label3: "var(--label-3)",
        },
        club: {
          field: "var(--club-field)",
          stub: "var(--club-stub)",
          on: "var(--club-on-field)",
          tint: "var(--club-tint)",
        },
      },
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        num: ["var(--font-num)", "Pretendard Variable", "sans-serif"],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
    },
  },
  plugins: [],
};

export default config;
