import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#000000",
          900: "#0a0a0a",
          800: "#141414",
          700: "#1c1c1c",
          600: "#2a2a2a",
          500: "#3a3a3a",
          400: "#5a5a5a",
          300: "#8a8a8a",
          200: "#b5b5b5",
          100: "#e5e5e5",
        },
      },
      fontFamily: {
        sans: [
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
    },
  },
  plugins: [],
};

export default config;
