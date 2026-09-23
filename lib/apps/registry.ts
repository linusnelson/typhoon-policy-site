// Catalogue of internal applications hosted under /applications/<slug>.
// The code is the source of truth for WHAT exists; application_access (DB)
// only records WHO may open each app. Admins always have access.
//
// Adding an app: add an entry here, build its pages under
// app/(employee)/applications/<slug>/ (the layout must call
// requireAppAccessView), and guard every route handler with requireAppAccess.

export interface AppDef {
  slug: string;
  name: string;
  description: string;
}

export const PRICE_COMPARATOR_SLUG = "price-comparator";
export const BEL_RFX_SLUG = "bel-rfx";

export const APPS: AppDef[] = [
  {
    slug: PRICE_COMPARATOR_SLUG,
    name: "PriceProbe",
    description:
      "Price an electronics BOM across DigiKey, Mouser and element14 India, and pick the best vendor per line.",
  },
  {
    slug: BEL_RFX_SLUG,
    name: "BEL RFx Extractor",
    description:
      "Turn BEL Bid Invitation PDFs into tracking-sheet rows: RFx, plant, due date, BEL PN, make, MPN, qty.",
  },
];

export function getApp(slug: string): AppDef | undefined {
  return APPS.find((a) => a.slug === slug);
}

export function appHref(slug: string): string {
  return `/applications/${slug}`;
}
