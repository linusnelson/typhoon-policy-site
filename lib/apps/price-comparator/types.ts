// PriceProbe — electronics BOM price comparator (DigiKey / Mouser /
// element14 India). Shared by the route handlers and the client UI, so this
// file must stay free of server-only imports.

export interface BomLine {
  mpn: string;
  qty: number;
  manufacturer?: string;
}

export interface PriceBreak {
  qty: number;
  unitPrice: number; // in the offer's native currency
}

export interface Offer {
  vendor: string;
  sku: string;
  mpn: string;
  manufacturer: string;
  description?: string;
  packaging?: string;
  currency: string; // 'USD' | 'INR'
  priceBreaks: PriceBreak[];
  stock: number;
  leadTime?: string;
  moq: number;
  orderMultiple: number;
  productUrl?: string;
}

export interface EvaluatedOffer extends Offer {
  orderQty: number; // what you'd actually have to order (MOQ / multiples)
  breakUnitPrice: number; // native currency, at the applicable break
  lineTotalNative: number; // breakUnitPrice * orderQty
  lineTotalUsd: number;
  effectiveUnitUsd: number; // lineTotalUsd / required qty — the ranking key
  inStock: boolean;
  lowStock: boolean; // in stock, but with little headroom over the order qty
  moqConflict: boolean; // orderQty > required qty
}

export type VendorStatus = "ok" | "not_found" | "error" | "no_key";

export interface VendorResult {
  vendor: string;
  status: VendorStatus;
  message?: string;
  best?: EvaluatedOffer;
  offers: EvaluatedOffer[];
  fromCache?: boolean;
}

export interface LineResult {
  line: BomLine;
  vendors: VendorResult[];
  selectedVendor?: string;
  selectionNote?: string;
}

// Client-side run state. There is no server job: the browser prices one BOM
// line per request (serverless functions keep no memory between calls), so
// `results` fills in by index as requests return.
export interface CompareJob {
  status: "running" | "done";
  total: number;
  completed: number;
  fxRate: number; // INR per 1 USD
  fxSource: string;
  results: Array<LineResult | undefined>;
}

// Vendor credentials + FX override, per org. Server-only data: the browser
// only ever sees VendorInfo / SettingsView (which say whether a key is set).
export interface VendorSettings {
  digikeyClientId: string;
  digikeyClientSecret: string;
  mouserApiKey: string;
  element14ApiKey: string;
  fxOverride: number | null; // INR per USD; null = use live rate
}

export interface VendorInfo {
  name: string;
  currency: string;
  hasCredentials: boolean;
}

export interface FxInfo {
  rate: number;
  source: string;
}

// What the Compare tab shows: the rate runs use (`effective`), the live
// interbank rate, and the org's admin override (null = none).
export interface FxState {
  effective: FxInfo;
  live: FxInfo;
  override: number | null;
}

// Upper bound on BOM size per run — each line is one request fanning out to
// every selected vendor, and vendor APIs have daily quotas.
export const MAX_BOM_LINES = 500;
