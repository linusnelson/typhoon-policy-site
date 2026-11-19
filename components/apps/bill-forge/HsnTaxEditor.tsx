"use client";

import { TaxRow, newTaxRow } from "@/lib/apps/bill-forge/orgs";

/** Key → {name, type, rate} as a small table. Rows are free to be half-typed while
 *  editing; `taxMapFromRows` in lib/apps/bill-forge/orgs rejects anything incomplete on save. */
export function HsnTaxEditor({
  rows,
  onChange,
}: {
  rows: TaxRow[];
  onChange: (rows: TaxRow[]) => void;
}) {
  const update = (key: number, patch: Partial<TaxRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="py-1 pr-2 font-medium">HSN</th>
              <th className="py-1 pr-2 font-medium">Zoho tax name</th>
              <th className="py-1 pr-2 font-medium">Type</th>
              <th className="py-1 pr-2 font-medium">Rate %</th>
              <th className="w-8 py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-gray-100">
                <td className="py-1 pr-2">
                  <input
                    value={row.hsn}
                    onChange={(e) => update(row.key, { hsn: e.target.value })}
                    placeholder="8517"
                    inputMode="numeric"
                    maxLength={8}
                    className="w-24 font-mono rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30"
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    value={row.name}
                    onChange={(e) => update(row.key, { name: e.target.value })}
                    placeholder="GST5"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30"
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    value={row.type}
                    onChange={(e) => update(row.key, { type: e.target.value })}
                    list="hsn-tax-types"
                    placeholder="Group"
                    className="w-28 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30"
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    value={row.rate}
                    onChange={(e) => update(row.key, { rate: e.target.value })}
                    placeholder="5"
                    inputMode="decimal"
                    className="w-20 font-mono rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30"
                  />
                </td>
                <td className="py-1 text-right">
                  <button
                    type="button"
                    onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                    className="text-gray-400 hover:text-danger"
                    aria-label={`Remove HSN ${row.hsn || "row"}`}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <datalist id="hsn-tax-types">
        <option value="Simple" />
        <option value="Group" />
      </datalist>
      <button
        type="button"
        onClick={() => onChange([...rows, newTaxRow()])}
        className="text-xs font-semibold text-brand hover:underline"
      >
        + HSN tax override
      </button>
      {rows.length === 0 && (
        <p className="text-xs text-gray-500">
          None — every line takes the org&apos;s tax group. Add a row only for an HSN
          that Zoho taxes at a different rate.
        </p>
      )}
    </div>
  );
}
