// ── Typhoon Electronic Solutions — PDF palette ─────────────────────────────────
// Shared design tokens for the signed-policy PDF (@react-pdf/renderer). Mirrors
// the "Datasheet" (light) direction of the Typhoon design system: one signal
// hue (brand purple) over warm, faintly-plum neutrals — never blue-gray.
export const PDF = {
  ink: "#181520", // fg-1 — near-black plum ink
  brand: "#6C1262", // ★ p-700 — brand signal hue
  brandPress: "#4E0E46", // p-800 — link / pressed accent text
  gray700: "#343037",
  gray500: "#6F6872",
  gray300: "#CFC8D1",
  gray200: "#E6E1E7",
  gray100: "#F3F0F3",
} as const;
