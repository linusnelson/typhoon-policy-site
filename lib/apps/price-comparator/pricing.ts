import type { EvaluatedOffer, LineResult, Offer, VendorResult } from "./types";

// Pure pricing rules — no I/O, unit-tested in pricing.test.ts.

function toUsd(amount: number, currency: string, inrPerUsd: number): number {
  if (currency === "USD") return amount;
  if (currency === "INR") return amount / inrPerUsd;
  throw new Error(`No FX rate for currency ${currency}`);
}

/**
 * Price an offer at the BOM line's required quantity:
 * order at least MOQ, round up to the order multiple, apply the price break
 * for the resulting order quantity, and spread the total over the required
 * qty so MOQ overbuy is reflected in the ranking.
 */
export function evaluateOffer(
  offer: Offer,
  requiredQty: number,
  inrPerUsd: number
): EvaluatedOffer {
  let orderQty = Math.max(requiredQty, offer.moq || 1);
  const mult = offer.orderMultiple || 1;
  if (mult > 1) orderQty = Math.ceil(orderQty / mult) * mult;

  const breaks = offer.priceBreaks; // sorted ascending by qty
  let applicable = breaks.filter((b) => b.qty <= orderQty).at(-1);
  if (!applicable) {
    // Smallest purchasable amount is the first break
    orderQty = breaks[0].qty;
    applicable = breaks[0];
  }

  const lineTotalNative = applicable.unitPrice * orderQty;
  const lineTotalUsd = toUsd(lineTotalNative, offer.currency, inrPerUsd);
  const inStock = offer.stock >= orderQty;
  return {
    ...offer,
    orderQty,
    breakUnitPrice: applicable.unitPrice,
    lineTotalNative,
    lineTotalUsd,
    effectiveUnitUsd: lineTotalUsd / requiredQty,
    inStock,
    // "nearly matching" stock: less than 20% headroom over what must be ordered
    lowStock: inStock && offer.stock < orderQty * 1.2,
    moqConflict: orderQty > requiredQty,
  };
}

// Cheapest in-stock offer, else the cheapest overall.
export function pickBest(offers: EvaluatedOffer[]): EvaluatedOffer | undefined {
  if (offers.length === 0) return undefined;
  const ranked = [...offers].sort((a, b) => a.effectiveUnitUsd - b.effectiveUnitUsd);
  return ranked.find((o) => o.inStock) ?? ranked[0];
}

// Narrow to the BOM's manufacturer when it disambiguates; keep all otherwise.
export function filterByManufacturer(offers: Offer[], manufacturer?: string): Offer[] {
  if (!manufacturer || offers.length <= 1) return offers;
  const needle = manufacturer.trim().toLowerCase();
  const filtered = offers.filter((o) => {
    const have = o.manufacturer.toLowerCase();
    return have.includes(needle) || needle.includes(have);
  });
  return filtered.length > 0 ? filtered : offers;
}

// Cross-vendor pick: cheapest in-stock vendor, falling back to the cheapest
// out-of-stock one, with a note explaining a non-obvious choice.
export function selectVendor(vendorResults: VendorResult[]): {
  selectedVendor?: string;
  selectionNote?: string;
} {
  const candidates = vendorResults
    .filter((r) => r.status === "ok" && r.best)
    .map((r) => ({ vendor: r.vendor, best: r.best! }));
  if (candidates.length === 0) return {};

  const cheapest = (pool: typeof candidates) =>
    pool.reduce((a, b) => (b.best.effectiveUnitUsd < a.best.effectiveUnitUsd ? b : a));

  const inStock = candidates.filter((c) => c.best.inStock);
  const winner = cheapest(inStock.length > 0 ? inStock : candidates);
  if (inStock.length === 0) {
    return {
      selectedVendor: winner.vendor,
      selectionNote: "No vendor has sufficient stock — cheapest out-of-stock offer selected",
    };
  }
  const absoluteCheapest = cheapest(candidates);
  return {
    selectedVendor: winner.vendor,
    selectionNote:
      absoluteCheapest.vendor !== winner.vendor
        ? `${absoluteCheapest.vendor} is cheaper but lacks stock`
        : undefined,
  };
}

// Re-rank a priced line at a different INR/USD rate. Offers keep their raw
// price breaks, so a rate change re-prices on the client without asking the
// vendors again. Used when an admin changes the override mid-session.
export function repriceLine(result: LineResult, inrPerUsd: number): LineResult {
  const vendors = result.vendors.map((v): VendorResult => {
    if (v.status !== "ok" || v.offers.length === 0) return v;
    const offers = v.offers
      .map((o) => evaluateOffer(o, result.line.qty, inrPerUsd))
      .sort((a, b) => a.effectiveUnitUsd - b.effectiveUnitUsd);
    return { ...v, offers, best: pickBest(offers) };
  });
  return { line: result.line, vendors, ...selectVendor(vendors) };
}
