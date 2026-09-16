import "server-only";
import type { Offer, VendorSettings } from "../types";
import type { VendorAdapter } from "./types";
import { VendorAuthError } from "./types";

// OAuth token memo for a warm serverless instance. Keyed by client id so a
// credential change (or a second org) never reuses another client's token.
let token: { clientId: string; value: string; expiresAt: number } | null = null;

async function getToken(settings: VendorSettings): Promise<string> {
  if (
    token &&
    token.clientId === settings.digikeyClientId &&
    Date.now() < token.expiresAt - 60_000
  ) {
    return token.value;
  }

  const res = await fetch("https://api.digikey.com/v1/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: settings.digikeyClientId,
      client_secret: settings.digikeyClientSecret,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 401 || res.status === 403 || res.status === 400) {
    throw new VendorAuthError(
      "DigiKey credentials rejected — check Client ID/Secret in Settings"
    );
  }
  if (!res.ok) throw new Error(`DigiKey token HTTP ${res.status}`);
  const data: any = await res.json();
  if (!data?.access_token) throw new VendorAuthError("DigiKey: no access token returned");
  token = {
    clientId: settings.digikeyClientId,
    value: String(data.access_token),
    expiresAt: Date.now() + (Number(data.expires_in) || 600) * 1000,
  };
  return token.value;
}

export const digikey: VendorAdapter = {
  name: "DigiKey",
  currency: "USD",

  hasCredentials(settings: VendorSettings): boolean {
    return Boolean(settings.digikeyClientId && settings.digikeyClientSecret);
  },

  async search(mpn: string, settings: VendorSettings): Promise<Offer[]> {
    const accessToken = await getToken(settings);
    const res = await fetch("https://api.digikey.com/products/v4/search/keyword", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-DIGIKEY-Client-Id": settings.digikeyClientId,
        "X-DIGIKEY-Locale-Site": "US",
        "X-DIGIKEY-Locale-Language": "en",
        "X-DIGIKEY-Locale-Currency": "USD",
      },
      body: JSON.stringify({ Keywords: mpn, Limit: 10, Offset: 0 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 401 || res.status === 403) {
      token = null;
      throw new VendorAuthError(
        "DigiKey API rejected the request — check credentials in Settings"
      );
    }
    if (!res.ok) throw new Error(`DigiKey search HTTP ${res.status}`);
    const data: any = await res.json();

    const products: any[] = data?.Products ?? [];
    const wanted = mpn.trim().toUpperCase();
    const offers: Offer[] = [];

    for (const p of products) {
      const productMpn = String(p?.ManufacturerProductNumber ?? "");
      if (productMpn.toUpperCase() !== wanted) continue;
      const manufacturer = String(p?.Manufacturer?.Name ?? "");
      const description = p?.Description?.ProductDescription
        ? String(p.Description.ProductDescription)
        : undefined;
      const leadWeeks = p?.ManufacturerLeadWeeks
        ? `${p.ManufacturerLeadWeeks} wk (mfr)`
        : undefined;

      // Each variation (cut tape / reel / tube ...) is its own offer
      for (const v of p?.ProductVariations ?? []) {
        const breaks = (v?.StandardPricing ?? [])
          .map((b: any) => ({
            qty: Number(b?.BreakQuantity) || 0,
            unitPrice: Number(b?.UnitPrice),
          }))
          .filter(
            (b: any) => b.qty > 0 && Number.isFinite(b.unitPrice) && b.unitPrice > 0
          )
          .sort((a: any, b: any) => a.qty - b.qty);
        if (breaks.length === 0) continue;
        offers.push({
          vendor: "DigiKey",
          sku: String(v?.DigiKeyProductNumber ?? ""),
          mpn: productMpn,
          manufacturer,
          description,
          packaging: v?.PackageType?.Name ? String(v.PackageType.Name) : undefined,
          currency: "USD",
          priceBreaks: breaks,
          stock: Number(v?.QuantityAvailableforPackageType ?? p?.QuantityAvailable) || 0,
          leadTime: leadWeeks,
          moq: Number(v?.MinimumOrderQuantity) || breaks[0].qty || 1,
          orderMultiple: 1,
          productUrl: p?.ProductUrl ? String(p.ProductUrl) : undefined,
        });
      }
    }
    return offers;
  },
};
