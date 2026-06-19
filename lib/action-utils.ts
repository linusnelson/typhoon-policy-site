// Shared helpers for Server Actions.

export interface ActionState {
  ok: boolean;
  error?: string;
  message?: string;
}

export const idleState: ActionState = { ok: false };

// Trimmed string form value, or null when empty/missing.
export function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

export function num(formData: FormData, key: string): number | null {
  const v = str(formData, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function bool(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  return v === "true" || v === "on" || v === "1";
}
