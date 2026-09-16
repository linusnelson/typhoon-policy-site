import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BomLine, LineResult, Offer, VendorResult, VendorSettings } from "./types";
import { evaluateOffer, filterByManufacturer, pickBest, selectVendor } from "./pricing";
import { vendors } from "./vendors";
import type { VendorAdapter } from "./vendors/types";
import { VendorAuthError } from "./vendors/types";

// Vendor prices are cached per org for 24 h in price_comparator_cache
// (service-role only). "Refresh prices" bypasses the read, not the write.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CacheRow = { vendor: string; status: "ok" | "not_found"; offers: Offer[] };

function mpnKey(mpn: string): string {
  return mpn.trim().toUpperCase();
}

async function readCache(
  orgId: string,
  mpn: string,
  vendorNames: string[]
): Promise<Map<string, CacheRow>> {
  const { data } = await createAdminClient()
    .from("price_comparator_cache")
    .select("vendor, status, offers")
    .eq("org_id", orgId)
    .eq("mpn_key", mpnKey(mpn))
    .in("vendor", vendorNames)
    .gte("fetched_at", new Date(Date.now() - CACHE_TTL_MS).toISOString());
  // A cache miss (or a failed read) just means a live vendor lookup.
  return new Map(((data as CacheRow[] | null) ?? []).map((r) => [r.vendor, r]));
}

async function writeCache(orgId: string, mpn: string, rows: CacheRow[]): Promise<void> {
  if (rows.length === 0) return;
  const fetchedAt = new Date().toISOString();
  await createAdminClient()
    .from("price_comparator_cache")
    .upsert(
      rows.map((r) => ({
        org_id: orgId,
        vendor: r.vendor,
        mpn_key: mpnKey(mpn),
        status: r.status,
        offers: r.offers,
        fetched_at: fetchedAt,
      }))
    );
}

async function searchVendor(
  adapter: VendorAdapter,
  line: BomLine,
  settings: VendorSettings,
  inrPerUsd: number,
  cached: CacheRow | undefined,
  fresh: CacheRow[]
): Promise<VendorResult> {
  if (!adapter.hasCredentials(settings)) {
    return { vendor: adapter.name, status: "no_key", offers: [], message: "No API key configured" };
  }

  let offers: Offer[];
  const fromCache = Boolean(cached);
  if (cached) {
    offers = cached.offers;
  } else {
    try {
      offers = await adapter.search(line.mpn, settings);
      fresh.push({
        vendor: adapter.name,
        status: offers.length > 0 ? "ok" : "not_found",
        offers,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        vendor: adapter.name,
        status: "error",
        offers: [],
        message: err instanceof VendorAuthError ? message : `Search failed: ${message}`,
      };
    }
  }

  offers = filterByManufacturer(offers, line.manufacturer);
  if (offers.length === 0) {
    return { vendor: adapter.name, status: "not_found", offers: [], fromCache };
  }

  const evaluated = offers
    .map((o) => evaluateOffer(o, line.qty, inrPerUsd))
    .sort((a, b) => a.effectiveUnitUsd - b.effectiveUnitUsd);
  return {
    vendor: adapter.name,
    status: "ok",
    offers: evaluated,
    best: pickBest(evaluated),
    fromCache,
  };
}

export async function compareLine(
  orgId: string,
  line: BomLine,
  settings: VendorSettings,
  inrPerUsd: number,
  refresh: boolean,
  vendorNames?: string[]
): Promise<LineResult> {
  const active =
    vendorNames && vendorNames.length > 0
      ? vendors.filter((v) => vendorNames.includes(v.name))
      : vendors;

  const cache = refresh
    ? new Map<string, CacheRow>()
    : await readCache(
        orgId,
        line.mpn,
        active.map((v) => v.name)
      );
  const fresh: CacheRow[] = [];
  const vendorResults = await Promise.all(
    active.map((v) => searchVendor(v, line, settings, inrPerUsd, cache.get(v.name), fresh))
  );
  await writeCache(orgId, line.mpn, fresh);

  return { line, vendors: vendorResults, ...selectVendor(vendorResults) };
}
