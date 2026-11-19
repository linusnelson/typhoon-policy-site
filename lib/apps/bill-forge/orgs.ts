/** Pure helpers around Zoho orgs and seller → buyer relationships.
 *
 *  No JSX here (the policy-site tailwind does not scan lib/), and nothing React-bound
 *  except the one module-level cache: /api/orgs is fetched once per page load and
 *  shared by every chip that needs to know whether more than one org exists. */

import {
  HsnTax,
  Org,
  OrgEffective,
  OrgInput,
  OrgOverrides,
  OrgRef,
  Relationship,
  RelationshipInput,
  api,
} from "@/lib/apps/bill-forge/api";

let orgsPromise: Promise<Org[]> | null = null;

/** The org list, fetched once and shared. A failed fetch is not cached, so the next
 *  caller retries. Admin mutations call `invalidateOrgs()` so chips catch up. */
export function fetchOrgsOnce(): Promise<Org[]> {
  if (!orgsPromise) {
    orgsPromise = api.orgs.list().catch((err) => {
      orgsPromise = null;
      throw err;
    });
  }
  return orgsPromise;
}

export function invalidateOrgs(): void {
  orgsPromise = null;
}

export function activeOrgs(orgs: Org[]): Org[] {
  return orgs.filter((o) => o.is_active);
}

/** Chips carry information only when there is something to tell apart. */
export function showOrgChips(orgs: Org[]): boolean {
  return activeOrgs(orgs).length > 1;
}

export function orgName(orgs: Pick<Org, "id" | "display_name">[], id: string): string {
  return orgs.find((o) => o.id === id)?.display_name ?? id.slice(0, 8);
}

export interface IssuingOrgResolution {
  /** The one org every row was billed to, when there is exactly one. */
  org: OrgRef | null;
  /** The selection spans more than one issuing org — cannot share an invoice (D02). */
  mixed: boolean;
  /** No row carries an org at all (a batch that never passed E01). */
  unknown: boolean;
}

/** Which org the selected purchase orders were billed to. Rows without an org are
 *  ignored for the "mixed" test but reported through `unknown` when they are all
 *  there is. */
export function issuingOrgOf(rows: { org: OrgRef | null }[]): IssuingOrgResolution {
  const byId = new Map<string, OrgRef>();
  for (const row of rows) if (row.org) byId.set(row.org.id, row.org);
  if (byId.size === 0) return { org: null, mixed: false, unknown: rows.length > 0 };
  if (byId.size > 1) return { org: null, mixed: true, unknown: false };
  return { org: byId.values().next().value ?? null, mixed: false, unknown: false };
}

export const OVERRIDE_FIELDS: { key: keyof OrgOverrides; label: string; hint: string }[] = [
  { key: "tax_group_inter_state", label: "Tax group (inter-state)", hint: "IGST on a sale across state lines" },
  { key: "tax_group_intra_state", label: "Tax group (intra-state)", hint: "CGST + SGST within the state" },
  { key: "account_sales", label: "Sales account", hint: "Account on the sales invoice lines" },
  { key: "account_purchase", label: "Purchase account", hint: "Account on the bill / PO lines" },
  { key: "account_inventory", label: "Inventory account", hint: "Account on the Items import" },
];

/** The business.yaml defaults, as far as the loaded orgs reveal them: any org that
 *  does not override a field shows the yaml value as its effective one. A field no
 *  org leaves at default stays undefined — the form then says so. */
export function yamlDefaults(orgs: Org[]): Partial<OrgEffective> {
  const out: Partial<OrgEffective> = {};
  for (const { key } of OVERRIDE_FIELDS) {
    const witness = orgs.find((o) => o[key] === null && o.effective?.[key]);
    if (witness) out[key] = witness.effective[key];
  }
  return out;
}

export function emptyOrgInput(): OrgInput {
  return {
    slug: "",
    display_name: "",
    legal_name: "",
    gstin: "",
    iec: "",
    pan: "",
    state_code: "TN",
    gst_treatment: "business_gst",
    default_branch: "Head Office",
    default_warehouse: "Head Office",
    sales_number_pattern: "^RE[0-9]{7}$",
    is_active: true,
    tax_group_inter_state: null,
    tax_group_intra_state: null,
    account_sales: null,
    account_purchase: null,
    account_inventory: null,
  };
}

export function orgToInput(org: Org): OrgInput {
  const { id: _id, effective: _effective, gstin, iec, pan, ...fields } = org;
  void _id;
  void _effective;
  // The draft edits identifiers as strings; an org may have none on record (null).
  return { ...fields, gstin: gstin ?? "", iec: iec ?? "", pan: pan ?? "" };
}

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Client-side sanity only; the API is the authority and its `detail` is shown as is. */
export function validateOrgInput(input: OrgInput): string | null {
  if (!input.slug.trim()) return "A slug is required.";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(input.slug.trim()))
    return "The slug is lower-case letters, digits and hyphens.";
  if (!input.display_name.trim()) return "A display name is required.";
  if (!input.legal_name.trim()) return "The legal name is required.";
  if (input.gstin.trim() && !GSTIN.test(input.gstin.trim()))
    return "That does not look like a GSTIN (15 characters, e.g. 33AARFT4502F1ZA).";
  if (input.pan.trim() && !PAN.test(input.pan.trim()))
    return "That does not look like a PAN (10 characters, e.g. AARFT4502F).";
  if (!/^[A-Z]{2}$/.test(input.state_code.trim()))
    return "The state code is two capital letters, e.g. TN.";
  if (input.sales_number_pattern.trim()) {
    try {
      new RegExp(input.sales_number_pattern.trim());
    } catch {
      return "The sales number pattern is not a valid regular expression.";
    }
  }
  for (const { key, label } of OVERRIDE_FIELDS) {
    const value = input[key];
    if (value !== null && !value.trim()) return `${label} is overridden but empty.`;
  }
  return null;
}

/** Trim every string once, at the edge, so the stored values never carry stray spaces. */
export function normaliseOrgInput(input: OrgInput): OrgInput {
  const out = { ...input };
  (Object.keys(out) as (keyof OrgInput)[]).forEach((key) => {
    const value = out[key];
    if (typeof value === "string") (out as Record<string, unknown>)[key] = value.trim();
  });
  out.gstin = out.gstin.toUpperCase();
  out.pan = out.pan.toUpperCase();
  out.state_code = out.state_code.toUpperCase();
  return out;
}

export function emptyRelationshipInput(sellerOrgId: string): RelationshipInput {
  return {
    seller_org_id: sellerOrgId,
    buyer_org_id: "",
    customer_name_in_seller_org: "",
    vendor_name_in_buyer_org: "",
    usd_multiplier: "110",
    payment_terms_days: 30,
    carry_tax: false,
    item_tax_by_hsn: {},
    is_active: true,
  };
}

export function relationshipToInput(r: Relationship): RelationshipInput {
  const { id: _id, ...fields } = r;
  void _id;
  return { ...fields, item_tax_by_hsn: { ...fields.item_tax_by_hsn } };
}

export function validateRelationshipInput(input: RelationshipInput): string | null {
  if (!input.buyer_org_id) return "Choose the buying organisation.";
  if (input.buyer_org_id === input.seller_org_id)
    return "An organisation cannot sell to itself.";
  if (!input.customer_name_in_seller_org.trim())
    return "The customer name in the seller's Zoho is required.";
  if (!input.vendor_name_in_buyer_org.trim())
    return "The vendor name in the buyer's Zoho is required.";
  if (!/^\d+(\.\d+)?$/.test(input.usd_multiplier.trim()) || Number(input.usd_multiplier) <= 0)
    return "The USD multiplier is a positive decimal, e.g. 110 or 112.5.";
  if (!Number.isInteger(input.payment_terms_days) || input.payment_terms_days < 0)
    return "Payment terms are a whole number of days.";
  return null;
}

/** "×110" — the multiplier as the register and the dialog print it. */
export function formatMultiplier(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? `×${n}` : `×${value}`;
}

/** One editable row of the HSN → tax table. Kept as strings while editing so a
 *  half-typed rate does not fight the input. */
export interface TaxRow {
  key: number;
  hsn: string;
  name: string;
  type: string;
  rate: string;
}

let nextTaxRowKey = 1;

export function newTaxRow(partial: Partial<Omit<TaxRow, "key">> = {}): TaxRow {
  return { key: nextTaxRowKey++, hsn: "", name: "", type: "Group", rate: "", ...partial };
}

export function taxRowsFromMap(map: Record<string, HsnTax>): TaxRow[] {
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hsn, tax]) =>
      newTaxRow({ hsn, name: tax.name, type: tax.type, rate: String(tax.rate) }),
    );
}

/** Rows back into the JSON the API stores. Empty rows are dropped; anything else must
 *  be complete, because a half-filled override would silently change a tax rate. */
export function taxMapFromRows(
  rows: TaxRow[],
): { map: Record<string, HsnTax>; error: string | null } {
  const map: Record<string, HsnTax> = {};
  for (const row of rows) {
    const hsn = row.hsn.trim();
    const name = row.name.trim();
    const type = row.type.trim();
    const rate = row.rate.trim();
    if (!hsn && !name && !rate) continue;
    if (!/^\d{2,8}$/.test(hsn)) return { map, error: `"${hsn}" is not an HSN (2 to 8 digits).` };
    if (hsn in map) return { map, error: `HSN ${hsn} appears twice.` };
    if (!name) return { map, error: `HSN ${hsn} needs the Zoho tax name.` };
    if (!type) return { map, error: `HSN ${hsn} needs the tax type (Simple or Group).` };
    const n = Number(rate);
    if (!Number.isFinite(n) || n < 0 || n > 100)
      return { map, error: `HSN ${hsn}: the rate is a percentage between 0 and 100.` };
    map[hsn] = { name, type, rate: n };
  }
  return { map, error: null };
}

/** Short description of a relationship for lists and the picker. */
export function relationshipLabel(
  r: Relationship,
  orgs: Pick<Org, "id" | "display_name">[],
): string {
  return `${orgName(orgs, r.buyer_org_id)} — "${r.customer_name_in_seller_org}"`;
}

/** PAN as the GSTIN carries it: characters 3–12 of a 15-character GSTIN, else null.
 *  Mirrors `pan_of` in api/services/orgs.py; the server is the one that stores it. */
export function panOf(gstin: string): string | null {
  const g = gstin.trim().toUpperCase();
  return g.length === 15 ? g.slice(2, 12) : null;
}
