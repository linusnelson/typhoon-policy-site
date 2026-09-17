"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { csvCell } from "@/lib/csv";
import type {
  CompareJob,
  EvaluatedOffer,
  LineResult,
  VendorResult,
} from "@/lib/apps/price-comparator/types";

function usd(n: number): string {
  return n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;
}

function nativePrice(o: EvaluatedOffer): string {
  const sym = o.currency === "INR" ? "₹" : "$";
  const p = o.breakUnitPrice;
  return `${sym}${p >= 1 ? p.toFixed(2) : p.toFixed(4)}`;
}

/** Stable identity for an offer within a vendor, used to remember the user's choice. */
function offerKey(o: EvaluatedOffer): string {
  return `${o.sku}|${o.packaging ?? ""}`;
}

interface Adjustment {
  vendorOverride?: string;
  /** vendor name -> offerKey the user picked inside that vendor */
  offerChoice?: Record<string, string | undefined>;
  /** replaces the effective unit price, in USD */
  priceOverrideUsd?: number;
  markupPct?: number;
}

type Adjustments = Record<number, Adjustment>;

interface Resolved {
  vendor?: string;
  offer?: EvaluatedOffer;
  manualVendor: boolean;
  finalUnitUsd: number;
  lineTotalUsd: number;
}

function chosenOffer(result: VendorResult, adj: Adjustment | undefined): EvaluatedOffer | undefined {
  const key = adj?.offerChoice?.[result.vendor];
  if (key) {
    const found = result.offers.find((o) => offerKey(o) === key);
    if (found) return found;
  }
  return result.best;
}

function resolveLine(r: LineResult, adj: Adjustment | undefined): Resolved {
  const vendorName = adj?.vendorOverride ?? r.selectedVendor;
  const vendorResult = r.vendors.find((v) => v.vendor === vendorName);
  const offer = vendorResult ? chosenOffer(vendorResult, adj) : undefined;

  const baseUnitUsd = adj?.priceOverrideUsd ?? offer?.effectiveUnitUsd ?? 0;
  const finalUnitUsd = baseUnitUsd * (1 + (adj?.markupPct ?? 0) / 100);
  return {
    vendor: vendorName,
    offer,
    manualVendor: Boolean(adj?.vendorOverride),
    finalUnitUsd,
    lineTotalUsd: finalUnitUsd * r.line.qty,
  };
}

function stockCls(o: EvaluatedOffer): string {
  if (!o.inStock) return "font-semibold text-danger-deep";
  if (o.lowStock) return "font-semibold text-warning-deep";
  return "text-success-deep";
}

function stockLabel(o: EvaluatedOffer): string {
  const base = `${o.stock.toLocaleString()} in stock`;
  return o.inStock && o.lowStock ? `${base} · low` : base;
}

const linkBtn = "text-xs font-medium text-brand hover:underline";
const tdCls = "border-b border-gray-100 px-3 py-2.5 align-top";

function OfferCell({
  result,
  selected,
  adj,
  onChooseOffer,
}: {
  result: VendorResult;
  selected: boolean;
  adj: Adjustment | undefined;
  onChooseOffer: (vendor: string, key: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (result.status === "no_key") {
    return <td className={`${tdCls} text-xs text-gray-400`}>Not configured</td>;
  }
  if (result.status === "error") {
    return (
      <td className={`${tdCls} max-w-[220px]`} title={result.message}>
        <div className="text-xs font-semibold text-danger-deep">Search failed</div>
        {result.message && (
          <div className="line-clamp-2 text-xs text-gray-500">
            {result.message.replace(/^Search failed:\s*/, "")}
          </div>
        )}
      </td>
    );
  }
  if (result.status === "not_found" || !result.best) {
    return <td className={`${tdCls} text-xs text-gray-400`}>Not carried</td>;
  }

  const o = chosenOffer(result, adj)!;
  const manualOffer = Boolean(adj?.offerChoice?.[result.vendor]);

  return (
    <td
      className={[
        tdCls,
        selected ? "bg-success-soft/60 shadow-[inset_2px_0_0_theme(colors.success.DEFAULT)]" : "",
      ].join(" ")}
    >
      <div className="text-[15px] font-bold text-ink">
        {nativePrice(o)}
        {o.currency === "INR" && (
          <span className="text-xs font-medium text-gray-400"> ≈ {usd(o.lineTotalUsd / o.orderQty)}</span>
        )}
        <span className="text-xs font-normal text-gray-400">/pc</span>
      </div>
      <div className="text-xs text-gray-500" title="Line total spread over required qty, in USD">
        eff {usd(o.effectiveUnitUsd)}/pc · total {usd(o.lineTotalUsd)}
      </div>
      <div className={`mt-0.5 text-xs ${stockCls(o)}`}>
        {stockLabel(o)}
        {o.leadTime ? ` · ${o.leadTime}` : ""}
      </div>
      {o.moqConflict && (
        <div className="mt-0.5 inline-block rounded bg-warning-soft px-1.5 text-xs text-warning-deep">
          MOQ: must order {o.orderQty.toLocaleString()}
        </div>
      )}
      <div className="mt-0.5 text-xs text-gray-400">
        {o.productUrl ? (
          <a href={o.productUrl} target="_blank" rel="noreferrer" className="hover:text-brand hover:underline">
            {o.sku}
          </a>
        ) : (
          o.sku
        )}
        {o.packaging ? ` · ${o.packaging}` : ""}
        {result.fromCache ? " · cached" : ""}
      </div>
      {manualOffer && (
        <div className="mt-0.5 text-xs text-brand">
          chosen offer{" "}
          <button type="button" className={linkBtn} onClick={() => onChooseOffer(result.vendor, null)}>
            reset
          </button>
        </div>
      )}
      {result.offers.length > 1 && (
        <button type="button" className={linkBtn} onClick={() => setExpanded(!expanded)}>
          {expanded ? "hide offers" : `choose from ${result.offers.length} offers`}
        </button>
      )}
      {expanded && (
        <div className="mt-1">
          {result.offers.map((alt) => {
            const key = offerKey(alt);
            const isCurrent = key === offerKey(o);
            return (
              <label
                key={key}
                className={[
                  "flex cursor-pointer items-start gap-1.5 rounded border-t border-dashed border-gray-200 py-1 pr-1 text-xs hover:bg-gray-50",
                  isCurrent ? "text-ink" : "text-gray-500",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name={`offer-${result.vendor}-${o.mpn}`}
                  checked={isCurrent}
                  onChange={() => onChooseOffer(result.vendor, key)}
                  className="mt-0.5 accent-brand"
                />
                <span>
                  <strong>{nativePrice(alt)}</strong>/pc · eff {usd(alt.effectiveUnitUsd)} ·{" "}
                  <span className={stockCls(alt)}>{alt.stock.toLocaleString()} stk</span>
                  {alt.packaging ? ` · ${alt.packaging}` : ""}
                  {alt.moqConflict ? ` · MOQ ${alt.orderQty.toLocaleString()}` : ""}
                  <br />
                  <span className="text-gray-400">{alt.sku}</span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </td>
  );
}

function exportCsv(results: LineResult[], adjustments: Adjustments) {
  const header = [
    "MPN",
    "Make",
    "Make (BOM)",
    "Qty",
    "Vendor",
    "Pick Source",
    "SKU",
    "Packaging",
    "Unit Price (native)",
    "Currency",
    "MOQ",
    "Order Multiple",
    "Order Qty",
    "MOQ Overbuy",
    "Base Effective Unit (USD)",
    "Price Override (USD)",
    "Markup %",
    "Final Unit (USD)",
    "Line Total (USD)",
    "Stock",
    "Stock Status",
    "Lead Time",
    "Note",
  ];
  const rows = results.map((r, i) => {
    const adj = adjustments[i];
    const res = resolveLine(r, adj);
    const o = res.offer;
    const priced = Boolean(o) || adj?.priceOverrideUsd !== undefined;
    return [
      r.line.mpn,
      // Make of the picked offer as the vendor reports it; the BOM's make when
      // nothing was picked. "Make (BOM)" keeps exactly what was uploaded.
      o?.manufacturer || r.line.manufacturer || "",
      r.line.manufacturer ?? "",
      r.line.qty,
      res.vendor ?? "NONE FOUND",
      res.manualVendor ? "manual" : "auto",
      o?.sku ?? "",
      o?.packaging ?? "",
      o?.breakUnitPrice ?? "",
      o?.currency ?? "",
      o?.moq ?? "",
      o?.orderMultiple ?? "",
      o?.orderQty ?? "",
      o?.moqConflict ? `yes (+${(o.orderQty - r.line.qty).toLocaleString()})` : "no",
      o ? o.effectiveUnitUsd.toFixed(4) : "",
      adj?.priceOverrideUsd !== undefined ? adj.priceOverrideUsd.toFixed(4) : "",
      adj?.markupPct ?? "",
      priced ? res.finalUnitUsd.toFixed(4) : "",
      priced ? res.lineTotalUsd.toFixed(4) : "",
      o?.stock ?? "",
      o ? (!o.inStock ? "out of stock" : o.lowStock ? "low stock" : "in stock") : "",
      o?.leadTime ?? "",
      r.selectionNote ?? "",
    ];
  });
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "price-comparison.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

const numInput =
  "w-28 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";

export function ResultsTable({
  job,
  onRefresh,
  busy,
}: {
  job: CompareJob;
  onRefresh: () => void;
  busy: boolean;
}) {
  const [adjustments, setAdjustments] = useState<Adjustments>({});
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkMarkup, setBulkMarkup] = useState("");

  const vendorNames = job.results.find(Boolean)?.vendors.map((v) => v.vendor) ?? [];

  const resolved = useMemo(
    () => job.results.map((r, i) => (r ? resolveLine(r, adjustments[i]) : undefined)),
    [job.results, adjustments]
  );
  const grandTotal = resolved.reduce((sum, r) => sum + (r?.lineTotalUsd ?? 0), 0);
  const pricedCount = resolved.filter((r) => r && r.lineTotalUsd > 0).length;

  function patch(index: number, change: Partial<Adjustment>) {
    setAdjustments((prev) => ({ ...prev, [index]: { ...prev[index], ...change } }));
  }

  function toggleRow(index: number) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function applyToSelected(change: Partial<Adjustment>) {
    setAdjustments((prev) => {
      const next = { ...prev };
      for (const i of selectedRows) next[i] = { ...next[i], ...change };
      return next;
    });
  }

  const allSelected = selectedRows.size > 0 && selectedRows.size === job.results.length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-lg font-bold text-ink">Results</h2>
        <span
          className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-ink"
          title={job.fxSource}
        >
          1 USD = ₹{job.fxRate.toFixed(2)}
        </span>
        {job.status === "running" && (
          <span className="flex items-center gap-1.5 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            searching… {job.completed}/{job.total}
          </span>
        )}
        {job.status === "done" && (
          <>
            <span className="text-sm text-gray-500">
              {pricedCount} of {job.total} priced
            </span>
            {pricedCount > 0 && (
              <span className="text-sm font-bold text-ink">BOM total ≈ {usd(grandTotal)}</span>
            )}
            <Button
              variant="secondary"
              className="py-1.5"
              onClick={() => exportCsv(job.results.filter((r): r is LineResult => Boolean(r)), adjustments)}
            >
              Export CSV
            </Button>
            <Button variant="secondary" className="py-1.5" disabled={busy} onClick={onRefresh}>
              Refresh prices
            </Button>
          </>
        )}
      </div>

      {selectedRows.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-brand/20 bg-brand-soft px-4 py-2.5 text-sm">
          <strong className="text-ink">{selectedRows.size} selected</strong>
          <label className="flex items-center gap-2 text-gray-600">
            Set USD unit price
            <input
              type="number"
              step="0.0001"
              min="0"
              placeholder="e.g. 0.42"
              value={bulkPrice}
              onChange={(e) => setBulkPrice(e.target.value)}
              className={numInput}
            />
          </label>
          <Button
            className="py-1.5"
            onClick={() => {
              const v = Number(bulkPrice);
              if (bulkPrice !== "" && v >= 0) applyToSelected({ priceOverrideUsd: v });
            }}
          >
            Apply price
          </Button>
          <label className="flex items-center gap-2 text-gray-600">
            Markup %
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 15"
              value={bulkMarkup}
              onChange={(e) => setBulkMarkup(e.target.value)}
              className={numInput}
            />
          </label>
          <Button
            className="py-1.5"
            onClick={() => {
              const v = Number(bulkMarkup);
              if (bulkMarkup !== "" && Number.isFinite(v)) applyToSelected({ markupPct: v });
            }}
          >
            Apply markup
          </Button>
          <Button
            variant="secondary"
            className="py-1.5"
            onClick={() => applyToSelected({ priceOverrideUsd: undefined, markupPct: undefined })}
          >
            Clear overrides
          </Button>
          <Button variant="ghost" className="py-1.5" onClick={() => setSelectedRows(new Set())}>
            Deselect all
          </Button>
        </div>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-gray-400">
              <th className="w-9 border-b border-gray-200 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) =>
                    setSelectedRows(e.target.checked ? new Set(job.results.map((_, i) => i)) : new Set())
                  }
                  className="accent-brand"
                />
              </th>
              <th className="border-b border-gray-200 px-3 py-2.5">Part</th>
              <th className="border-b border-gray-200 px-3 py-2.5">Qty</th>
              {vendorNames.map((v) => (
                <th key={v} className="border-b border-gray-200 px-3 py-2.5">{v}</th>
              ))}
              <th className="border-b border-gray-200 px-3 py-2.5">Pick</th>
              <th className="min-w-[132px] border-b border-gray-200 px-3 py-2.5">Price (USD)</th>
            </tr>
          </thead>
          <tbody>
            {job.results.map((r, i) => {
              if (!r) {
                return (
                  <tr key={i}>
                    <td className={tdCls} />
                    <td className={`${tdCls} text-gray-400`} colSpan={4 + Math.max(vendorNames.length, 1)}>
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> searching…
                      </span>
                    </td>
                  </tr>
                );
              }
              const adj = adjustments[i];
              const res = resolved[i]!;
              const available = r.vendors.filter((v) => v.status === "ok" && v.best);
              const hasPriceEdit = adj?.priceOverrideUsd !== undefined || Boolean(adj?.markupPct);
              return (
                <tr key={i} className={selectedRows.has(i) ? "bg-brand-soft/40" : ""}>
                  <td className={tdCls}>
                    <input
                      type="checkbox"
                      checked={selectedRows.has(i)}
                      onChange={() => toggleRow(i)}
                      className="accent-brand"
                    />
                  </td>
                  <td className={`${tdCls} font-mono text-[13px] font-semibold text-ink`}>
                    {r.line.mpn}
                    {(res.offer?.manufacturer || r.line.manufacturer) && (
                      <div className="font-sans text-xs font-normal text-gray-400">
                        {res.offer?.manufacturer || r.line.manufacturer}
                      </div>
                    )}
                  </td>
                  <td className={tdCls}>{r.line.qty}</td>
                  {r.vendors.map((v) => (
                    <OfferCell
                      key={v.vendor}
                      result={v}
                      selected={v.vendor === res.vendor}
                      adj={adj}
                      onChooseOffer={(vendor, key) =>
                        patch(i, {
                          offerChoice: { ...adj?.offerChoice, [vendor]: key ?? undefined },
                        })
                      }
                    />
                  ))}
                  <td className={tdCls}>
                    {available.length > 0 ? (
                      <select
                        value={res.vendor ?? ""}
                        onChange={(e) =>
                          patch(i, {
                            vendorOverride: e.target.value === r.selectedVendor ? undefined : e.target.value,
                          })
                        }
                        className="min-w-[104px] rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm font-semibold text-ink focus:border-brand focus:outline-none"
                      >
                        {available.map((v) => (
                          <option key={v.vendor} value={v.vendor}>{v.vendor}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-400">none</span>
                    )}
                    {res.manualVendor ? (
                      <div className="mt-0.5 text-xs text-brand">
                        manual{" "}
                        <button type="button" className={linkBtn} onClick={() => patch(i, { vendorOverride: undefined })}>
                          reset
                        </button>
                      </div>
                    ) : (
                      r.selectionNote && <div className="mt-0.5 text-xs text-warning-deep">{r.selectionNote}</div>
                    )}
                  </td>
                  <td className={tdCls}>
                    {res.offer || adj?.priceOverrideUsd !== undefined ? (
                      <>
                        <div className="text-[15px] font-bold text-ink">{usd(res.finalUnitUsd)}/pc</div>
                        <div className="text-xs text-gray-400">total {usd(res.lineTotalUsd)}</div>
                        {hasPriceEdit && (
                          <div className="mt-0.5 flex flex-col items-start text-xs text-brand">
                            {adj?.priceOverrideUsd !== undefined && (
                              <span>
                                override {usd(adj.priceOverrideUsd)}
                                {res.offer && ` (was ${usd(res.offer.effectiveUnitUsd)})`}
                              </span>
                            )}
                            {Boolean(adj?.markupPct) && <span>+{adj!.markupPct}% markup</span>}
                            <button
                              type="button"
                              className={linkBtn}
                              onClick={() => patch(i, { priceOverrideUsd: undefined, markupPct: undefined })}
                            >
                              reset
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
