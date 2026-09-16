import "server-only";
import type { Offer, VendorSettings } from "../types";
import type { VendorAdapter } from "./types";
import { VendorAuthError } from "./types";

function parsePrice(s: unknown): number {
  // Mouser returns locale strings like "$1.23" / "1,23 €"
  if (typeof s === "number") return s;
  if (typeof s !== "string") return NaN;
  const cleaned = s.replace(/[^0-9.,]/g, "");
  // If both separators appear, the last one is the decimal point
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const normalized =
    lastComma > lastDot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  return Number(normalized);
}

function parseStock(availability: unknown): number {
  if (typeof availability !== "string") return 0;
  const m = availability.match(/([\d,]+)\s*In Stock/i);
  return m ? Number(m[1].replace(/,/g, "")) : 0;
}

export const mouser: VendorAdapter = {
  name: "Mouser",
  currency: "USD",

  hasCredentials(settings: VendorSettings): boolean {
    return Boolean(settings.mouserApiKey);
  },

  async search(mpn: string, settings: VendorSettings): Promise<Offer[]> {
    const url = `https://api.mouser.com/api/v1/search/partnumber?apiKey=${encodeURIComponent(settings.mouserApiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        SearchByPartRequest: { mouserPartNumber: mpn, partSearchOptions: "" },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 401 || res.status === 403) {
      throw new VendorAuthError("Mouser API key rejected — check Settings");
    }
    if (!res.ok) throw new Error(`Mouser HTTP ${res.status}`);
    const data: any = await res.json();

    const apiErrors = data?.Errors;
    if (Array.isArray(apiErrors) && apiErrors.length > 0) {
      const msg = apiErrors.map((e: any) => e?.Message ?? e?.Code).join("; ");
      if (/api.?key/i.test(msg)) throw new VendorAuthError(`Mouser: ${msg}`);
      throw new Error(`Mouser: ${msg}`);
    }

    const parts: any[] = data?.SearchResults?.Parts ?? [];
    const wanted = mpn.trim().toUpperCase();

    return parts
      .filter((p) => String(p?.ManufacturerPartNumber ?? "").toUpperCase() === wanted)
      .map((p): Offer | null => {
        const breaks = (p?.PriceBreaks ?? [])
          .map((b: any) => ({
            qty: Number(b?.Quantity) || 0,
            unitPrice: parsePrice(b?.Price),
          }))
          .filter(
            (b: any) => b.qty > 0 && Number.isFinite(b.unitPrice) && b.unitPrice > 0
          )
          .sort((a: any, b: any) => a.qty - b.qty);
        if (breaks.length === 0) return null;
        return {
          vendor: "Mouser",
          sku: String(p?.MouserPartNumber ?? ""),
          mpn: String(p?.ManufacturerPartNumber ?? mpn),
          manufacturer: String(p?.Manufacturer ?? ""),
          description: p?.Description ? String(p.Description) : undefined,
          currency: "USD",
          priceBreaks: breaks,
          stock: parseStock(p?.Availability),
          leadTime: p?.LeadTime ? String(p.LeadTime) : undefined,
          moq: Number(p?.Min) || 1,
          orderMultiple: Number(p?.Mult) || 1,
          productUrl: p?.ProductDetailUrl ? String(p.ProductDetailUrl) : undefined,
        };
      })
      .filter((o): o is Offer => o !== null);
  },
};
