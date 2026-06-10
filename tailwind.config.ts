import type { Config } from "tailwindcss";

// ── Typhoon Electronic Solutions Design System tokens ──────────────────────────
// Forked from the Genbays industrial DNA, recolored around the brand purple
// #6C1262. One signal hue carries every CTA, link, and highlight; neutrals are
// warm with a faint plum undertone (never blue-gray). "Datasheet" (light)
// direction — the catalog-grade surface used for this policy site.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand signal hue — the deep purple does all the talking.
        brand: {
          DEFAULT: "#6C1262", // ★ p-700 — brand
          hover: "#85187A", // p-600
          press: "#4E0E46", // p-800
          soft: "#FBEEF9", // p-50 — accent-soft on light
          fg: "#FFFFFF", // text on a brand fill
        },
        // Full purple ramp, built around #6C1262.
        purple: {
          50: "#FBEEF9",
          100: "#F6D9F1",
          200: "#EBADE1",
          300: "#D873CC",
          400: "#C13BB2",
          500: "#A11E94",
          600: "#85187A",
          700: "#6C1262",
          800: "#4E0E46",
          900: "#320A2D",
          950: "#1E0619",
        },
        ink: "#181520", // fg-1 — near-black plum ink
        offwhite: "#FBFAFB", // bg-0 — warm paper
        // Warm neutral ramp — faint plum undertone, never blue-gray.
        gray: {
          0: "#FFFFFF",
          50: "#FAF8FA",
          100: "#F3F0F3",
          200: "#E6E1E7",
          300: "#CFC8D1",
          400: "#A099A3",
          500: "#6F6872",
          600: "#4F4952",
          700: "#343037",
          800: "#201D23",
          900: "#131016",
          950: "#0B090E",
        },
        // Semantic — muted, never competing with purple. `deep` = readable text.
        success: { DEFAULT: "#1F9D57", soft: "#DBF4E5", deep: "#157045" },
        warning: { DEFAULT: "#D98A0B", soft: "#FBEFD4", deep: "#9A6207" },
        danger: { DEFAULT: "#D23B3B", soft: "#FBE3E3", deep: "#A52828" },
        info: { DEFAULT: "#3163C4", soft: "#DEE8FB", deep: "#234A97" },
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        sans: ["var(--font-open-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        // Warm, diffuse, tinted toward plum — never blue.
        sm: "0 1px 2px rgba(50,10,45,0.07), 0 1px 1px rgba(50,10,45,0.04)",
        md: "0 6px 16px rgba(50,10,45,0.08), 0 2px 5px rgba(50,10,45,0.05)",
        lg: "0 18px 38px rgba(50,10,45,0.10)",
        accent: "0 10px 26px rgba(108,18,98,0.26)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
