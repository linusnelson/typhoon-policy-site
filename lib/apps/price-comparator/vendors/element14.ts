import "server-only";
import type { Offer, VendorSettings } from "../types";
import type { VendorAdapter } from "./types";
import { VendorAuthError } from "./types";

const STORE = "in.element14.com"; // element14 India storefront, prices in INR

export const element14: VendorAdapter = {
  name: "element14",
  currency: "INR",

  hasCredentials(settings: VendorSettings): boolean {
    return Boolean(settings.element14ApiKey);
  },

  async search(mpn: string, settings: VendorSettings): Promise<Offer[]> {
    const params = new URLSearchParams({
      term: `manuPartNum:${mpn}`,
      "storeInfo.id": STORE,
      "resultsSettings.offset": "0",
      "resultsSettings.numberOfResults": "10",
      "resultsSettings.responseGroup": "large",
      "callInfo.responseDataFormat": "JSON",
      "callInfo.apiKey": settings.element14ApiKey,
    });
    const res = await fetch(`https://api.element14.com/catalog/products?${params}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 401 || res.status === 403) {
      throw new VendorAuthError("element14 API key rejected — check Settings");
    }
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`element14: non-JSON response (HTTP ${res.status})`);
    }

    // Errors come back as {Fault: ...} with HTTP 200 sometimes
    const fault = data?.Fault ?? data?.fault;
    if (fault) {
      const msg = JSON.stringify(fault?.Detail ?? fault).slice(0, 200);
      if (/key|credential|auth/i.test(msg))
        throw new VendorAuthError(`element14: ${msg}`);
      // "no results" faults mean the part isn't carried
      if (/200003|no results/i.test(msg)) return [];
      throw new Error(`element14: ${msg}`);
    }
    if (!res.ok) throw new Error(`element14 HTTP ${res.status}`);

    const ret =
      data?.manufacturerPartNumberSearchReturn ??
      data?.premierFarnellPartNumberReturn ??
      data?.keywordSearchReturn;
    const products: any[] = ret?.products ?? [];
    const wanted = mpn.trim().toUpperCase();

    return products
      .filter((p) => {
        const m = String(p?.translatedManufacturerPartNumber ?? "").toUpperCase();
        return m === wanted;
      })
      .map((p): Offer | null => {
        const breaks = (Array.isArray(p?.prices) ? p.prices : p?.prices ? [p.prices] : [])
          .map((b: any) => ({ qty: Number(b?.from) || 0, unitPrice: Number(b?.cost) }))
          .filter(
            (b: any) => b.qty > 0 && Number.isFinite(b.unitPrice) && b.unitPrice > 0
          )
          .sort((a: any, b: any) => a.qty - b.qty);
        if (breaks.length === 0) return null;

        const stock = Number(p?.stock?.level ?? p?.inv) || 0;
        const leadDays = Number(p?.stock?.leastLeadTime);
        const sku = String(p?.sku ?? "");
        return {
          vendor: "element14",
          sku,
          mpn: String(p?.translatedManufacturerPartNumber ?? mpn),
          manufacturer: String(p?.vendorName ?? p?.brandName ?? ""),
          description: p?.displayName ? String(p.displayName) : undefined,
          packaging: p?.unitOfMeasure ? String(p.unitOfMeasure) : undefined,
          currency: "INR",
          priceBreaks: breaks,
          stock,
          leadTime:
            Number.isFinite(leadDays) && leadDays > 0 ? `${leadDays} days` : undefined,
          moq: Number(p?.translatedMinimumOrderQuality) || breaks[0].qty || 1,
          orderMultiple: 1,
          productUrl: sku
            ? `https://${STORE}/w/search?st=${encodeURIComponent(sku)}`
            : undefined,
        };
      })
      .filter((o): o is Offer => o !== null);
  },
};
