import "server-only";
import type { FxInfo, FxState } from "./types";

// Per-instance memo. Serverless instances come and go, so this only saves
// repeat lookups on a warm instance — correctness never depends on it.
let cached: { info: FxInfo; at: number } | null = null;
const TTL_MS = 6 * 60 * 60 * 1000;

const FALLBACK_RATE = 88; // last-resort INR/USD if every source is unreachable

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

function inrRate(data: unknown): number {
  const rates = (data as { rates?: { INR?: unknown } } | null)?.rates;
  return Number(rates?.INR);
}

/** Interbank mid-market INR per 1 USD. */
export async function getLiveFxRate(): Promise<FxInfo> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.info;

  const sources: Array<[string, string]> = [
    ["https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR", "frankfurter.dev (ECB mid-market)"],
    ["https://open.er-api.com/v6/latest/USD", "open.er-api.com (mid-market)"],
  ];
  for (const [url, source] of sources) {
    try {
      const rate = inrRate(await fetchJson(url));
      if (rate > 0) {
        cached = { info: { rate, source }, at: Date.now() };
        return cached.info;
      }
    } catch {
      // fall through to next source
    }
  }

  return { rate: FALLBACK_RATE, source: "built-in fallback — an admin can set an override" };
}

// The rate a comparison run uses: the org's admin override when set, else live.
export async function resolveFx(override: number | null): Promise<FxState> {
  const live = await getLiveFxRate();
  return {
    effective: override ? { rate: override, source: "admin override" } : live,
    live,
    override,
  };
}
