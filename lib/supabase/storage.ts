import { createClient } from "@/lib/supabase/server";

// Resolve display URLs for the private `selfies` Storage bucket.
//
// The bucket is RLS-scoped (clock_bays migrations 20260619150000 +
// 20260619170000): biometric selfies (`selfies/<employee_id>/…`) are readable
// only by the subject, a same-department manager, or a same-org admin, while
// profile avatars (`profile/<auth_uid>.webp`) are readable by any signed-in
// user. `getPublicUrl` 403s on a private bucket, so every stored path must be
// turned into a short-lived signed URL. Mirrors clock_bays
// SupabaseClientWrapper.selfieSignedUrl + employee_detail_screen.dart _resolve().

const BUCKET = "selfies";

// Stored values are normally bare object keys (e.g. `profile/<id>.webp` or
// `selfies/<employee_id>/<file>.webp`). Legacy visit rows stored a full
// getPublicUrl() string; extract the key after `/selfies/`. Returns null when
// there is nothing usable to sign.
export function selfieKey(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!/^https?:\/\//.test(stored)) return stored;
  const marker = "/selfies/";
  const idx = stored.indexOf(marker);
  if (idx === -1) return null;
  const key = stored.slice(idx + marker.length).split("?")[0];
  return key || null;
}

// Sign a single stored path. Returns null if unusable or the RLS policy denies
// the read (e.g. a manager requesting a selfie outside their department).
export async function signSelfieUrl(
  stored: string | null | undefined,
  expiresIn = 3600
): Promise<string | null> {
  const key = selfieKey(stored);
  if (!key) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(key, expiresIn);
  return data?.signedUrl ?? null;
}

// ── Payslips bucket ──────────────────────────────────────────────────────────
// Private `payslips` bucket (clock_bays migration 20260707100001): readable by
// the subject employee or a same-org admin via can_read_payslip(). Paths are
// always bare keys (`<employee_id>/<YYYY-MM>.pdf`) — no legacy URL handling.
export async function signPayslipUrl(
  path: string | null | undefined,
  expiresIn = 3600
): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("payslips")
    .createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

// ── Announcements bucket ─────────────────────────────────────────────────────
// Private `announcements` bucket (clock_bays migration 20260708100000):
// org-readable via can_read_announcement_file(). Paths are
// `<org_id>/<announcement_id>/<filename>`.
export async function signAnnouncementUrl(
  path: string | null | undefined,
  expiresIn = 3600
): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("announcements")
    .createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

// ── Expense bills bucket ─────────────────────────────────────────────────────
// Private `expense-bills` bucket (clock_bays migration 20260710000001):
// readable by the subject employee, a same-org admin, or a same-org expense
// approver via can_read_expense_file(). Paths are bare keys
// (`<employee_id>/<claim_id>/<millis>_<filename>`).
export async function signExpenseBillUrl(
  path: string | null | undefined,
  expiresIn = 3600
): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("expense-bills")
    .createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

// Batch-sign many stored paths in one request. Returns a Map keyed by the
// ORIGINAL stored value, so callers can look up by whatever string they hold.
// Deduplicates keys and skips unusable/denied paths.
export async function signSelfieUrls(
  stored: Array<string | null | undefined>,
  expiresIn = 3600
): Promise<Map<string, string>> {
  const keyByOriginal = new Map<string, string>();
  for (const s of stored) {
    if (!s || keyByOriginal.has(s)) continue;
    const k = selfieKey(s);
    if (k) keyByOriginal.set(s, k);
  }

  const out = new Map<string, string>();
  const keys = [...new Set(keyByOriginal.values())];
  if (keys.length === 0) return out;

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(keys, expiresIn);

  const byKey = new Map<string, string>();
  for (const r of data ?? []) {
    if (r.path && r.signedUrl) byKey.set(r.path, r.signedUrl);
  }
  for (const [original, key] of keyByOriginal) {
    const url = byKey.get(key);
    if (url) out.set(original, url);
  }
  return out;
}
