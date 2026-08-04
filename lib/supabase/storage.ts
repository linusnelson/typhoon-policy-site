// Display URLs for the private Storage buckets.
//
// NOTHING HERE MINTS A SIGNED URL, deliberately. A Supabase signed URL is a
// bearer token — valid for anyone holding it, with no login, until it expires
// — so a link leaking via chat, browser history or a proxy log exposed the
// file. Instead every stored path is turned into a link to our own proxy,
// which re-authorises the caller's session on each request and streams the
// bytes: app/(employee)/media/[bucket]/[...path]/route.ts.
//
// These are pure string builders: no `await`, no round-trip to Storage. That
// also removes the per-page signing calls these helpers used to make (an
// employee list signed one URL per avatar just to render the page).
//
// Payslips are NOT here — they have their own id-addressed download route so
// the storage path is never exposed. See that route for the reasoning.

const MEDIA_ROOT = "/media";

// Percent-encode each path segment but keep the separators, so a key like
// `<employee_id>/<claim_id>/1712_receipt (1).webp` survives the round trip.
function mediaUrl(bucket: string, key: string): string {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `${MEDIA_ROOT}/${bucket}/${encoded}`;
}

// ── Selfies bucket ───────────────────────────────────────────────────────────
// RLS-scoped (clock_bays 20260619150000 + 20260619170000): biometric selfies
// (`selfies/<employee_id>/…`) are readable only by the subject, a
// same-department manager, or a same-org admin, while profile avatars
// (`profile/<auth_uid>.webp`) are readable by any signed-in org member.

// Stored values are normally bare object keys (e.g. `profile/<id>.webp` or
// `selfies/<employee_id>/<file>.webp`). Legacy visit rows stored a full
// getPublicUrl() string; extract the key after `/selfies/`. Returns null when
// there is nothing usable.
export function selfieKey(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!/^https?:\/\//.test(stored)) return stored;
  const marker = "/selfies/";
  const idx = stored.indexOf(marker);
  if (idx === -1) return null;
  const key = stored.slice(idx + marker.length).split("?")[0];
  return key || null;
}

// Display URL for one stored selfie path. Null when there is nothing usable.
// Unlike the old signing helper this cannot report "denied" — authorisation
// happens when the browser fetches it, and a denied read renders as a broken
// image rather than a missing one.
export function selfieUrl(stored: string | null | undefined): string | null {
  const key = selfieKey(stored);
  return key ? mediaUrl("selfies", key) : null;
}

// Map of ORIGINAL stored value → display URL, so callers can look up by
// whatever string they hold. Kept as a Map (and the plural name) to match the
// call sites that batch-resolved avatars.
export function selfieUrls(
  stored: Array<string | null | undefined>
): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of stored) {
    if (!s || out.has(s)) continue;
    const url = selfieUrl(s);
    if (url) out.set(s, url);
  }
  return out;
}

// ── Announcements bucket ─────────────────────────────────────────────────────
// Private `announcements` bucket (clock_bays 20260708100000): org-readable via
// can_read_announcement_file(). Paths are `<org_id>/<announcement_id>/<file>`.
export function announcementUrl(
  path: string | null | undefined
): string | null {
  return path ? mediaUrl("announcements", path) : null;
}

// ── Expense bills bucket ─────────────────────────────────────────────────────
// Private `expense-bills` bucket (clock_bays 20260710000001): readable by the
// subject employee, a same-org admin, or a same-org expense approver via
// can_read_expense_file(). Paths are bare keys
// (`<employee_id>/<claim_id>/<millis>_<filename>`).
export function expenseBillUrl(path: string | null | undefined): string | null {
  return path ? mediaUrl("expense-bills", path) : null;
}
