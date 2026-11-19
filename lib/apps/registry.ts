// Catalogue of internal applications hosted under /applications/<slug>.
// The code is the source of truth for WHAT exists; application_access (DB)
// only records WHO may open each app. Admins always have access.
//
// Adding an app: add an entry here, build its pages under
// app/(employee)/applications/<slug>/ (the layout must call
// requireAppAccessView), and guard every route handler with requireAppAccess.
//
// An app hosted elsewhere sets `href` (absolute URL). Grants still live here,
// the launcher card opens the URL in a new tab, and the external app checks
// application_access for its own slug.

export interface AppDef {
  slug: string;
  name: string;
  description: string;
  /** Absolute URL when the app is hosted outside this site. Omit for local apps. */
  href?: string;
}

export const PRICE_COMPARATOR_SLUG = "price-comparator";
export const BEL_RFX_SLUG = "bel-rfx";
export const BILL_FORGE_SLUG = "bill-forge";

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
  {
    slug: BILL_FORGE_SLUG,
    name: "BillForge",
    description:
      "Supplier invoice PDFs and Bills of Entry into Zoho Books import files — purchase orders, bills, sales invoices and their mirror bills.",
  },
];

export function getApp(slug: string): AppDef | undefined {
  return APPS.find((a) => a.slug === slug);
}

export function appHref(slug: string): string {
  return `/applications/${slug}`;
}

/** Where the launcher card points: the app's own URL if hosted elsewhere, else its local route. */
export function launchHref(app: AppDef): string {
  return app.href ?? appHref(app.slug);
}

/** True for an absolute http(s) URL — rendered as a plain <a target="_blank">, not <Link>. */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}
