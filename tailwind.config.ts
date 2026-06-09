import type { Config } from "tailwindcss";

// ── Genbays Design System tokens (ported from clock_bays/lib/app/theme.dart) ──
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        amber: {
          DEFAULT: "#F8A71B",
          hover: "#FFB833",
          press: "#E0930A",
          soft: "#FEF1D4",
        },
        ink: "#0A0A0A",
        offwhite: "#FDFDFD",
        gray: {
          0: "#FFFFFF",
          50: "#FAFAF9",
          100: "#F4F4F2",
          200: "#E7E7E3",
          300: "#D1D1CC",
          400: "#A3A39C",
          500: "#72726C",
          600: "#52524D",
          700: "#363632",
          800: "#1F1F1C",
          900: "#0A0A0A",
        },
        success: { DEFAULT: "#16A34A", soft: "#DCFCE7" },
        warning: { DEFAULT: "#F59E0B", soft: "#FEF3C7" },
        danger: { DEFAULT: "#DC2626", soft: "#FEE2E2" },
        info: { DEFAULT: "#2563EB", soft: "#DBEAFE" },
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        sans: ["var(--font-open-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "12px",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
