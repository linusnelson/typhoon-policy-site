"use client";

import { AlertTriangle } from "lucide-react";
import type { BidInvitation } from "@/lib/apps/bel-rfx";
import { formatSheetDate, formatSheetTime } from "@/lib/apps/bel-rfx";
import { Card } from "@/components/ui";

export type ItemField = "desc" | "qty" | "unit";
export type MakeField = "make" | "mpn";

export interface EditHandlers {
  onInvitation: (file: string, patch: Partial<Pick<BidInvitation, "rfxNo" | "plant" | "notes">>) => void;
  onItem: (file: string, itemNo: string, field: ItemField, value: string) => void;
  onMake: (file: string, itemNo: string, index: number, field: MakeField, value: string) => void;
  onRemove: (file: string) => void;
}

// Everything the sheet gets, editable in place. Edits go back into the parsed
// invitation (the single source for CSV/TSV), never into a separate row model.
export function ReviewTable({ invitations, edit }: { invitations: BidInvitation[]; edit: EditHandlers }) {
  return (
    <div className="space-y-6">
      {invitations.map((inv) => (
        <Card key={inv.sourceFile} className="overflow-hidden">
          <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-100 px-4 py-3">
            <div className="font-mono text-sm font-semibold text-ink">{inv.rfxNo || "—"}</div>
            <div className="text-xs text-gray-500">{inv.sourceFile}</div>
            <div className="text-xs text-gray-500">
              Due {formatSheetDate(inv.dueDate) || "?"} {formatSheetTime(inv.endTime)}
            </div>
            {inv.contact.length > 0 && (
              <div className="truncate text-xs text-gray-500" title={inv.contact.join(" · ")}>
                {inv.contact[0]}
              </div>
            )}
            <button
              type="button"
              onClick={() => edit.onRemove(inv.sourceFile)}
              className="ml-auto text-xs text-gray-400 hover:text-danger"
            >
              Remove
            </button>
          </header>

          {inv.warnings.length > 0 && (
            <ul className="space-y-1 border-b border-warning-soft bg-warning-soft px-4 py-2 text-xs text-warning-deep">
              {inv.warnings.map((w, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {w.message}
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
            <Field label="Plant" value={inv.plant} onChange={(v) => edit.onInvitation(inv.sourceFile, { plant: v })} mono />
            <Field
              label="Notes"
              value={inv.notes.join(" | ")}
              onChange={(v) => edit.onInvitation(inv.sourceFile, { notes: v ? v.split(" | ") : [] })}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">BEL PN</th>
                  <th className="px-3 py-2">Desc</th>
                  <th className="px-3 py-2">Make</th>
                  <th className="px-3 py-2">MPN</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {inv.items.flatMap((item) => {
                  const makes = item.makes.length ? item.makes : [{ raw: "", make: "", mpn: "" }];
                  return makes.map((m, mi) => (
                    <tr key={`${item.itemNo}-${mi}`} className="align-top">
                      {mi === 0 ? (
                        <>
                          <td className="px-3 py-1.5 font-mono text-gray-600" rowSpan={makes.length}>{item.itemNo}</td>
                          <td className="px-3 py-1.5 font-mono" rowSpan={makes.length}>{item.belPn}</td>
                          <td className="px-3 py-1.5 min-w-[16rem]" rowSpan={makes.length}>
                            <Cell value={item.desc} onChange={(v) => edit.onItem(inv.sourceFile, item.itemNo, "desc", v)} />
                          </td>
                        </>
                      ) : null}
                      <td className="px-3 py-1.5 min-w-[14rem]">
                        <Cell value={m.make} onChange={(v) => edit.onMake(inv.sourceFile, item.itemNo, mi, "make", v)} />
                      </td>
                      <td className="px-3 py-1.5 min-w-[10rem]">
                        <Cell
                          value={m.mpn}
                          warn={!m.mpn && !!m.raw}
                          onChange={(v) => edit.onMake(inv.sourceFile, item.itemNo, mi, "mpn", v)}
                        />
                      </td>
                      {mi === 0 ? (
                        <>
                          <td className="px-3 py-1.5 w-24" rowSpan={makes.length}>
                            <Cell value={item.qty} warn={!item.qty} onChange={(v) => edit.onItem(inv.sourceFile, item.itemNo, "qty", v)} />
                          </td>
                          <td className="px-3 py-1.5 w-20" rowSpan={makes.length}>
                            <Cell value={item.unit} onChange={(v) => edit.onItem(inv.sourceFile, item.itemNo, "unit", v)} />
                          </td>
                        </>
                      ) : null}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Field({ label, value, onChange, mono }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <label className="block text-xs text-gray-500">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 block w-full rounded border border-gray-200 px-2 py-1 text-sm text-ink focus:border-brand ${mono ? "font-mono" : ""}`}
      />
    </label>
  );
}

function Cell({ value, onChange, warn }: { value: string; onChange: (v: string) => void; warn?: boolean }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`block w-full rounded border bg-transparent px-1.5 py-0.5 text-sm text-ink focus:border-brand ${
        warn ? "border-warning bg-warning-soft" : "border-transparent hover:border-gray-200"
      }`}
    />
  );
}
