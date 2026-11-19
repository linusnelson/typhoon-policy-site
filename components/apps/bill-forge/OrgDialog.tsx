"use client";

import { useState } from "react";
import { ApiError, Org, OrgEffective, OrgInput, OrgOverrides, api } from "@/lib/apps/bill-forge/api";
import {
  OVERRIDE_FIELDS,
  emptyOrgInput,
  normaliseOrgInput,
  orgToInput,
  validateOrgInput,
  panOf,
} from "@/lib/apps/bill-forge/orgs";
import { Banner, Button } from "@/components/ui";
import { Dialog } from "@/components/ui/Dialog";

const INPUT =
  "mt-1 block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-ink placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

/** Create or edit one Zoho organisation.
 *
 *  The five Zoho-side names default to business.yaml. Each shows its effective value
 *  with an "Override" checkbox: unchecked sends null (use the default), checked
 *  enables the input and sends the typed value. For a new org the default comes from
 *  whichever existing org still uses it; if none does, the form says so. */
export function OrgDialog({
  org,
  defaults,
  onCancel,
  onSaved,
}: {
  /** Null for a new org. */
  org: Org | null;
  /** The yaml defaults, as far as the loaded orgs reveal them. */
  defaults: Partial<OrgEffective>;
  onCancel: () => void;
  onSaved: (org: Org) => void;
}) {
  const [draft, setDraft] = useState<OrgInput>(() =>
    org ? orgToInput(org) : emptyOrgInput(),
  );
  // The text under each override while it is switched off, so toggling it back on
  // brings back what was typed rather than an empty box.
  const [overrideText, setOverrideText] = useState<Record<keyof OrgOverrides, string>>(
    () =>
      Object.fromEntries(
        OVERRIDE_FIELDS.map(({ key }) => [key, org?.[key] ?? ""]),
      ) as Record<keyof OrgOverrides, string>,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof OrgInput>(key: K, value: OrgInput[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const effectiveOf = (key: keyof OrgOverrides): string | undefined =>
    org?.effective?.[key] ?? defaults[key];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const normalised = normaliseOrgInput(draft);
    const problem = validateOrgInput(normalised);
    if (problem) return setError(problem);
    // The server derives PAN from the GSTIN (characters 3–12) and rejects unknown keys.
    const { pan: _pan, ...body } = normalised;
    setBusy(true);
    setError(null);
    try {
      const saved = org ? await api.orgs.update(org.id, body) : await api.orgs.create(body);
      onSaved(saved);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "could not save the organisation",
      );
      setBusy(false);
    }
  }

  return (
    <Dialog
      size="xl"
      onClose={onCancel}
      title={org ? `Edit ${org.display_name}` : "New organisation"}
      description="An organisation is a Zoho Books org a supplier can bill. Its GSTIN, IEC and PAN are how a batch is matched to it, so they must be exactly what the supplier prints."
    >
      <form onSubmit={submit} className="space-y-5">

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Slug" hint="Short, stable id; lower-case">
            <input
              value={draft.slug}
              onChange={(e) => set("slug", e.target.value)}
              placeholder="raphael"
              disabled={!!org}
              className={`${INPUT} font-mono disabled:opacity-60`}
            />
          </Field>
          <Field label="Display name">
            <input
              value={draft.display_name}
              onChange={(e) => set("display_name", e.target.value)}
              placeholder="Raphael Electronics"
              className={INPUT}
            />
          </Field>
          <Field label="Legal name" hint="As registered under GST">
            <input
              value={draft.legal_name}
              onChange={(e) => set("legal_name", e.target.value)}
              className={`${INPUT} sm:col-span-2`}
            />
          </Field>
          <Field label="GSTIN">
            <input
              value={draft.gstin}
              onChange={(e) => set("gstin", e.target.value)}
              placeholder="33AARFT4502F1ZA"
              maxLength={15}
              className={`${INPUT} font-mono uppercase`}
            />
          </Field>
          <Field label="PAN" hint="Derived from the GSTIN (characters 3–12)">
            <input
              value={panOf(draft.gstin) ?? org?.pan ?? ""}
              readOnly
              tabIndex={-1}
              placeholder="AARFT4502F"
              className={`${INPUT} font-mono uppercase opacity-60`}
            />
          </Field>
          <Field label="IEC" hint="Import-export code, as the Bill of Entry prints it">
            <input
              value={draft.iec}
              onChange={(e) => set("iec", e.target.value)}
              className={`${INPUT} font-mono`}
            />
          </Field>
          <Field label="State code">
            <input
              value={draft.state_code}
              onChange={(e) => set("state_code", e.target.value)}
              placeholder="TN"
              maxLength={2}
              className={`${INPUT} font-mono uppercase`}
            />
          </Field>
          <Field label="GST treatment">
            <select
              value={draft.gst_treatment}
              onChange={(e) => set("gst_treatment", e.target.value)}
              className={INPUT}
            >
              <option value="business_gst">business_gst</option>
              <option value="business_none">business_none</option>
              <option value="business_sez">business_sez</option>
              <option value="overseas">overseas</option>
              <option value="consumer">consumer</option>
            </select>
          </Field>
          <Field label="Default branch">
            <input
              value={draft.default_branch}
              onChange={(e) => set("default_branch", e.target.value)}
              className={INPUT}
            />
          </Field>
          <Field label="Default warehouse">
            <input
              value={draft.default_warehouse}
              onChange={(e) => set("default_warehouse", e.target.value)}
              className={INPUT}
            />
          </Field>
          <Field
            label="Sales invoice number pattern"
            hint="Regular expression the RE number must match (rule D04)"
          >
            <input
              value={draft.sales_number_pattern}
              onChange={(e) => set("sales_number_pattern", e.target.value)}
              className={`${INPUT} font-mono`}
            />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => set("is_active", e.target.checked)}
              className="accent-brand"
            />
            Active — can be billed and can import
          </label>
        </div>

        <fieldset className="space-y-3 rounded-card border border-gray-200 bg-gray-50/60 p-4">
          <legend className="px-1 font-display text-xs font-bold uppercase tracking-wide text-gray-500">
            Zoho names
          </legend>
          <p className="text-xs text-gray-500">
            These default to business.yaml and are usually the same in every org. Tick
            Override only where this org&apos;s Zoho uses a different name.
          </p>
          {OVERRIDE_FIELDS.map(({ key, label, hint }) => {
            const overridden = draft[key] !== null;
            const effective = effectiveOf(key);
            return (
              <div key={key} className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
                <div>
                  <span className="text-xs font-medium text-gray-600">{label}</span>
                  <span className="block text-xs text-gray-500">{hint}</span>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={overridden}
                    onChange={(e) =>
                      set(key, e.target.checked ? overrideText[key] : null)
                    }
                    className="accent-brand"
                  />
                  Override
                </label>
                {overridden ? (
                  <input
                    value={draft[key] ?? ""}
                    onChange={(e) => {
                      setOverrideText((t) => ({ ...t, [key]: e.target.value }));
                      set(key, e.target.value);
                    }}
                    placeholder={effective ?? ""}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30"
                  />
                ) : (
                  <span
                    className="truncate rounded-lg border border-transparent px-3 py-1.5 text-sm text-gray-600"
                    title={effective ? `business.yaml default: ${effective}` : undefined}
                  >
                    {effective ?? (
                      <span className="italic text-gray-400">
                        business.yaml default
                      </span>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </fieldset>

        {error && <Banner tone="danger">{error}</Banner>}

        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : org ? "Save changes" : "Create organisation"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
