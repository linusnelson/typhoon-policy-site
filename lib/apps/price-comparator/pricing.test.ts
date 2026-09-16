import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateOffer,
  filterByManufacturer,
  pickBest,
  repriceLine,
  selectVendor,
} from "./pricing";
import type { Offer, VendorResult } from "./types";

function offer(over: Partial<Offer> = {}): Offer {
  return {
    vendor: "Mouser",
    sku: "SKU-1",
    mpn: "PART",
    manufacturer: "Acme",
    currency: "USD",
    priceBreaks: [
      { qty: 1, unitPrice: 1.0 },
      { qty: 10, unitPrice: 0.5 },
      { qty: 100, unitPrice: 0.2 },
    ],
    stock: 1000,
    moq: 1,
    orderMultiple: 1,
    ...over,
  };
}

test("applies the price break for the required quantity", () => {
  const e = evaluateOffer(offer(), 12, 88);
  assert.equal(e.orderQty, 12);
  assert.equal(e.breakUnitPrice, 0.5);
  assert.equal(e.lineTotalUsd, 6);
  assert.equal(e.effectiveUnitUsd, 0.5);
  assert.equal(e.moqConflict, false);
});

test("MOQ overbuy is spread over the required qty", () => {
  const e = evaluateOffer(offer({ moq: 100 }), 10, 88);
  assert.equal(e.orderQty, 100);
  assert.equal(e.lineTotalUsd, 20);
  assert.equal(e.effectiveUnitUsd, 2); // $20 for the 10 actually needed
  assert.equal(e.moqConflict, true);
});

test("rounds up to the order multiple", () => {
  const e = evaluateOffer(offer({ orderMultiple: 25 }), 30, 88);
  assert.equal(e.orderQty, 50);
});

test("smallest break above the order qty becomes the minimum purchase", () => {
  const e = evaluateOffer(offer({ priceBreaks: [{ qty: 50, unitPrice: 0.1 }] }), 5, 88);
  assert.equal(e.orderQty, 50);
  assert.equal(e.breakUnitPrice, 0.1);
});

test("converts INR to USD at the given rate", () => {
  const e = evaluateOffer(
    offer({ currency: "INR", priceBreaks: [{ qty: 1, unitPrice: 88 }] }),
    2,
    88
  );
  assert.equal(e.lineTotalNative, 176);
  assert.equal(e.lineTotalUsd, 2);
});

test("stock flags: out, low (<20% headroom), ok", () => {
  assert.equal(evaluateOffer(offer({ stock: 5 }), 10, 88).inStock, false);
  const low = evaluateOffer(offer({ stock: 11 }), 10, 88);
  assert.equal(low.inStock, true);
  assert.equal(low.lowStock, true);
  assert.equal(evaluateOffer(offer({ stock: 12 }), 10, 88).lowStock, false);
});

test("pickBest prefers the cheapest in-stock offer", () => {
  const cheapOut = evaluateOffer(offer({ sku: "A", stock: 0 }), 10, 88);
  const pricierIn = evaluateOffer(
    offer({ sku: "B", priceBreaks: [{ qty: 1, unitPrice: 0.9 }] }),
    10,
    88
  );
  assert.equal(pickBest([cheapOut, pricierIn])?.sku, "B");
  assert.equal(pickBest([cheapOut])?.sku, "A");
  assert.equal(pickBest([]), undefined);
});

test("manufacturer filter narrows only when it matches something", () => {
  const offers = [offer({ manufacturer: "Texas Instruments" }), offer({ manufacturer: "onsemi" })];
  assert.equal(filterByManufacturer(offers, "texas").length, 1);
  assert.equal(filterByManufacturer(offers, "Nobody").length, 2);
  assert.equal(filterByManufacturer(offers, undefined).length, 2);
});

function vendorResult(vendor: string, unitPrice: number, stock: number): VendorResult {
  const best = evaluateOffer(offer({ vendor, stock, priceBreaks: [{ qty: 1, unitPrice }] }), 10, 88);
  return { vendor, status: "ok", offers: [best], best };
}

test("selectVendor: cheapest in-stock wins, with a note when cheaper lacks stock", () => {
  const pick = selectVendor([vendorResult("DigiKey", 0.3, 0), vendorResult("Mouser", 0.5, 100)]);
  assert.equal(pick.selectedVendor, "Mouser");
  assert.equal(pick.selectionNote, "DigiKey is cheaper but lacks stock");
});

test("selectVendor: nobody in stock falls back to the cheapest", () => {
  const pick = selectVendor([vendorResult("DigiKey", 0.3, 0), vendorResult("Mouser", 0.5, 0)]);
  assert.equal(pick.selectedVendor, "DigiKey");
  assert.match(pick.selectionNote ?? "", /No vendor has sufficient stock/);
});

test("selectVendor: no priced vendors selects nothing", () => {
  assert.deepEqual(selectVendor([{ vendor: "Mouser", status: "not_found", offers: [] }]), {});
});

test("repriceLine: a new INR rate can flip the vendor pick", () => {
  const line = { mpn: "PART", qty: 10 };
  const inr = (rate: number) => {
    const best = evaluateOffer(
      offer({ vendor: "element14", currency: "INR", priceBreaks: [{ qty: 1, unitPrice: 45 }] }),
      10,
      rate
    );
    return { vendor: "element14", status: "ok" as const, offers: [best], best };
  };
  // At ₹100/$ element14 is $0.45 vs Mouser $0.50 → element14 wins.
  const at100 = { line, vendors: [inr(100), vendorResult("Mouser", 0.5, 100)] };
  const before = { ...at100, ...selectVendor(at100.vendors) };
  assert.equal(before.selectedVendor, "element14");
  // At ₹80/$ element14 is $0.5625 → Mouser wins, offers re-evaluated.
  const after = repriceLine(before, 80);
  assert.equal(after.selectedVendor, "Mouser");
  assert.equal(after.vendors[0].best?.effectiveUnitUsd, 0.5625);
  // USD vendors are unaffected.
  assert.equal(after.vendors[1].best?.effectiveUnitUsd, 0.5);
});
