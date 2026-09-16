import { NextResponse } from "next/server";
import { requireAppAccess, AuthzError } from "@/lib/auth";
import { PRICE_COMPARATOR_SLUG } from "@/lib/apps/registry";
import { compareLine } from "@/lib/apps/price-comparator/compare";
import { loadVendorSettings } from "@/lib/apps/price-comparator/settings";
import { vendors } from "@/lib/apps/price-comparator/vendors";
import type { BomLine } from "@/lib/apps/price-comparator/types";

export const runtime = "nodejs";
// Vendor calls time out at 30 s each and run in parallel.
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "private, no-store" };

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

// Prices ONE BOM line across the selected vendors. The browser drives the run
// line by line (a few in parallel) — serverless functions keep no in-memory
// job between requests, and one line always fits in a function's time limit.
//
// Body: { line: {mpn, qty, manufacturer?}, fxRate: number, refresh?: boolean,
//         vendors?: string[] }
export async function POST(req: Request) {
  let me;
  try {
    me = await requireAppAccess(PRICE_COMPARATOR_SLUG);
  } catch (e) {
    if (e instanceof AuthzError) return bad(e.message, 403);
    throw e;
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Invalid JSON body.");
  }

  const raw = (body.line ?? {}) as Record<string, unknown>;
  const mpn = String(raw.mpn ?? "").trim();
  if (!mpn || mpn.length > 100) return bad("A part number (max 100 characters) is required.");
  const manufacturer = raw.manufacturer ? String(raw.manufacturer).trim().slice(0, 100) : "";
  const line: BomLine = {
    mpn,
    qty: Math.min(10_000_000, Math.max(1, Math.round(Number(raw.qty) || 1))),
    manufacturer: manufacturer || undefined,
  };

  const fxRate = Number(body.fxRate);
  if (!(fxRate > 0) || !Number.isFinite(fxRate)) return bad("fxRate must be a positive number.");

  const known = new Set(vendors.map((v) => v.name));
  const vendorNames = Array.isArray(body.vendors)
    ? body.vendors.map((v) => String(v)).filter((v) => known.has(v))
    : undefined;

  const settings = await loadVendorSettings(me.org_id);
  const result = await compareLine(
    me.org_id,
    line,
    settings,
    fxRate,
    Boolean(body.refresh),
    vendorNames
  );
  return NextResponse.json(result, { headers: NO_STORE });
}
