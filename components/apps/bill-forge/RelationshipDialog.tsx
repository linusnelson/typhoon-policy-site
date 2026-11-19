"use client";

import { useState } from "react";
import { Org, Relationship, RelationshipInput, api } from "@/lib/apps/bill-forge/api";
import {
  TaxRow,
  emptyRelationshipInput,
  relationshipToInput,
  taxMapFromRows,
  taxRowsFromMap,
  validateRelationshipInput,
} from "@/lib/apps/bill-forge/orgs";
import { HsnTaxEditor } from "@/components/apps/bill-forge/HsnTaxEditor";
import { Banner, Button } from "@/components/ui";
import { Dialog } from "@/components/ui/Dialog";

const INPUT =
  "mt-1 block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-ink placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";

/** Create or edit one seller → buyer relationship, from the seller's side.
 *
 *  The two name fields are the strings each org's accountant typed for the other in
 *  their Zoho contact list — they belong to the pair, which is why they live here and
 *  not on either org. */
export function RelationshipDialog({
  seller,
  orgs,
  relationship,
  taken,
  onCancel,
  onSaved,
}: {
  seller: Org;
  orgs: Org[];
  /** Null for a new relationship. */
  relationship: Relationship | null;
  /** Buyer ids this seller already has a relationship with (one row per pair). */
  taken: string[];
  onCancel: () => void;
  onSaved: (relationship: Relationship) => void;
}) {
  const [draft, setDraft] = useState<RelationshipInput>(() =>
    relationship ? relationshipToInput(relationship) : emptyRelationshipInput(seller.id),
  );
  const [taxRows, setTaxRows] = useState<TaxRow[]>(() =>
    taxRowsFromMap(relationship?.item_tax_by_hsn ?? {}),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof RelationshipInput>(key: K, value: RelationshipInput[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const buyers = orgs.filter(
    (o) =>
      o.id !== seller.id &&
      (o.is_active || o.id === relationship?.buyer_org_id) &&
      (!taken.includes(o.id) || o.id === relationship?.buyer_org_id),
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const { map, error: taxError } = taxMapFromRows(taxRows);
    if (taxError) return setError(taxError);
    const body: RelationshipInput = {
      ...draft,
      customer_name_in_seller_org: draft.customer_name_in_seller_org.trim(),
      vendor_name_in_buyer_org: draft.vendor_name_in_buyer_org.trim(),
      usd_multiplier: draft.usd_multiplier.trim(),
      item_tax_by_hsn: map,
    };
    const problem = validateRelationshipInput(body);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const saved = relationship
        ? await api.relationships.update(relationship.id, body)
        : await api.relationships.create(body);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not save the relationship");
      setBusy(false);
    }
  }

  return (
    <Dialog
      size="xl"
      onClose={onCancel}
      title={`${relationship ? "Edit relationship" : "New relationship"} — ${seller.display_name} sells to…`}
      description={`The sales invoice goes into ${seller.display_name}'s Zoho under the customer name below; its mirror bill goes into the buyer's Zoho under the vendor name. Both must match the contact exactly as typed there.`}
    >
      <form onSubmit={submit} className="space-y-5">

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-gray-700">Buying organisation</span>
            <select
              value={draft.buyer_org_id}
              onChange={(e) => set("buyer_org_id", e.target.value)}
              disabled={!!relationship}
              className={`${INPUT} disabled:opacity-60`}
            >
              <option value="">Choose…</option>
              {buyers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.display_name}
                  {!o.is_active ? " (inactive)" : ""}
                </option>
              ))}
            </select>
            {!relationship && buyers.length === 0 && (
              <span className="mt-1 block text-xs text-warning-deep">
                Every other active organisation already has a relationship with{" "}
                {seller.display_name}. Create the organisation first.
              </span>
            )}
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">
              Customer name in {seller.display_name}&apos;s Zoho
            </span>
            <input
              value={draft.customer_name_in_seller_org}
              onChange={(e) => set("customer_name_in_seller_org", e.target.value)}
              placeholder="Typhoon Electronic Solutions"
              className={INPUT}
            />
            <span className="mt-0.5 block text-xs text-gray-500">
              Stage 3 — &quot;Customer Name&quot; on the sales invoice
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">
              Vendor name in the buyer&apos;s Zoho
            </span>
            <input
              value={draft.vendor_name_in_buyer_org}
              onChange={(e) => set("vendor_name_in_buyer_org", e.target.value)}
              placeholder="RAPHAEL ELECTRONICS-CR"
              className={INPUT}
            />
            <span className="mt-0.5 block text-xs text-gray-500">
              Stage 4 — &quot;Vendor Name&quot; on the mirror bill
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">USD multiplier</span>
            <input
              value={draft.usd_multiplier}
              onChange={(e) => set("usd_multiplier", e.target.value)}
              inputMode="decimal"
              placeholder="110"
              className={`${INPUT} font-mono`}
            />
            <span className="mt-0.5 block text-xs text-gray-500">
              unit INR = round(unit USD × multiplier, 2). Existing invoices keep the
              multiplier they were generated with (D07).
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Payment terms (days)</span>
            <input
              type="number"
              min={0}
              step={1}
              value={draft.payment_terms_days}
              onChange={(e) => set("payment_terms_days", Number(e.target.value))}
              className={`${INPUT} font-mono`}
            />
          </label>

          <label className="flex items-start gap-2 pt-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={draft.carry_tax}
              onChange={(e) => set("carry_tax", e.target.checked)}
              className="mt-0.5 accent-brand"
            />
            <span>
              Mirror bill carries tax
              <span className="block text-xs text-gray-500">
                Off: the bill has no tax columns and Zoho applies its default on import
                (today&apos;s accepted sample). On: each line carries the invoice&apos;s
                tax and the total grosses up.
              </span>
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => set("is_active", e.target.checked)}
              className="accent-brand"
            />
            Active — offered in the &quot;Sell to&quot; picker
          </label>
        </div>

        <fieldset className="space-y-2 rounded-card border border-gray-200 bg-gray-50/60 p-4">
          <legend className="px-1 font-display text-xs font-bold uppercase tracking-wide text-gray-500">
            Item tax by HSN
          </legend>
          <HsnTaxEditor rows={taxRows} onChange={setTaxRows} />
        </fieldset>

        {error && <Banner tone="danger">{error}</Banner>}

        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : relationship ? "Save changes" : "Create relationship"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
