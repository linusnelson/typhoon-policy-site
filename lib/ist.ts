// IST (Asia/Kolkata, UTC+5:30) normalization for the web client.
// Mirrors clock_bays lib/core/ist.dart — keep in sync. The DB stores
// timestamptz; here we format/derive calendar values in IST so the web renders
// identically to the Flutter app.

const IST_OFFSET_MIN = 5 * 60 + 30; // +05:30

// The wall-clock Date "shifted" so its UTC fields read as IST local time.
// Use ONLY for extracting IST calendar parts (date, hour) — never persist it.
function toIstParts(input: string | Date): Date {
  const d = typeof input === "string" ? new Date(input) : input;
  return new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
}

// "YYYY-MM-DD" for the given instant in IST (the attendance "business day").
export function istDateKey(input: string | Date): string {
  return toIstParts(input).toISOString().slice(0, 10);
}

// Today's IST date key.
export function istToday(): string {
  return istDateKey(new Date());
}

// UTC instant bounds [start, end) for an IST calendar day — used to query
// timestamptz columns for "today" in IST. Defaults to today (IST).
export function istDayBoundsUtc(dateKey: string = istToday()): {
  startUtc: string;
  endUtc: string;
} {
  const start = new Date(`${dateKey}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}

// Minutes-since-midnight of an instant, in IST (e.g. 09:15 IST → 555).
export function istMinutesOfDay(input: string | Date): number {
  const ist = toIstParts(input);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

const IST_LOCALE = "en-IN";
const IST_TZ = "Asia/Kolkata";

export function formatIstTime(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return d.toLocaleTimeString(IST_LOCALE, {
    timeZone: IST_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatIstDate(
  input: string | Date,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }
): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return d.toLocaleDateString(IST_LOCALE, { timeZone: IST_TZ, ...opts });
}

export function formatIstDateTime(input: string | Date): string {
  return `${formatIstDate(input)} · ${formatIstTime(input)}`;
}
