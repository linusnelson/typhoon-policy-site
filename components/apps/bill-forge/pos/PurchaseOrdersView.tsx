"use client";

import { BILL_FORGE } from "@/lib/apps/bill-forge/routes";
import Link from "next/link";
import GroupDialog from "@/components/apps/bill-forge/pos/GroupDialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PO_STAGES, PurchaseOrder, VENDOR_LABEL, api } from "@/lib/apps/bill-forge/api";
import { Banner, Button, Card, Input } from "@/components/ui";
import { DataTable, EmptyRow, TBody, THead, Th } from "@/components/ui/DataTable";
import { useOrgs } from "@/components/apps/bill-forge/useOrgs";
import { useIsAdmin } from "@/components/apps/bill-forge/useIsAdmin";
import { StageDialog } from "@/components/apps/bill-forge/pos/StageDialog";
import { RegisterRow } from "@/components/apps/bill-forge/pos/RegisterRow";

export function PurchaseOrdersView() {
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [stage, setStage] = useState<string[]>([]);
  const [vendor, setVendor] = useState<string[]>([]);
  const [hsn, setHsn] = useState<"" | "blank" | "flagged" | "clean">("");
  const [boe, setBoe] = useState<"" | "yes" | "no">("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  const [grouping, setGrouping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // One org and the column says nothing; two or more and it is the first thing to check.
  const { showChips: showOrg } = useOrgs();
  // Manual stage moves are admin writes (they assert what happened in Zoho); the API
  // refuses them with 403 for anyone else, so the control is not offered.
  const isAdmin = useIsAdmin();

  const load = useCallback(async () => {
    try {
      const body = await api.pos({
        stage,
        vendor,
        q: search,
        hsn: hsn || undefined,
        has_boe: boe === "" ? undefined : boe === "yes",
      });
      setRows(body.purchase_orders);
      setTotal(body.total);
      setError(null);
    } catch (err) {
      // A 401 is handled inside the api layer (sign out, then /login?redirect=…).
      setError(err instanceof Error ? err.message : "could not load the register");
    } finally {
      setLoading(false);
    }
  }, [stage, vendor, search, hsn, boe]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const selected = useMemo(
    () => rows.filter((r) => chosen.includes(r.po_number)),
    [rows, chosen],
  );
  // D09 and D03 in the list, so the constraint is visible before the dialog opens.
  const notInvoiceable = useMemo(
    () => selected.filter((r) => !r.invoiceable || r.hsn_blank_count > 0),
    [selected],
  );
  const selectedValue = useMemo(
    () => selected.reduce((sum, r) => sum + Number(r.goods_total || 0), 0),
    [selected],
  );

  async function applyStage(next: string, note: string) {
    await api.setPoStages(chosen, next, note);
    setDialog(false);
    setChosen([]);
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Purchase orders</h2>
          <p className="mt-1 text-sm text-gray-500">
            One row per supplier invoice — the Zoho purchase-order number. This is the
            work in flight; a batch is how it arrived.
          </p>
        </div>
        <Link
          href={BILL_FORGE.upload}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg shadow-sm transition-all hover:bg-brand-hover hover:shadow-accent"
        >
          New batch
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {PO_STAGES.map((s) => (
          <button
            key={s.id}
            onClick={() => toggle(stage, setStage, s.id)}
            title={s.hint}
            className={`rounded-full px-3 py-1 font-semibold transition-colors ${
              stage.includes(s.id)
                ? "bg-brand text-brand-fg"
                : "border border-gray-300 bg-white text-gray-700 hover:border-ink"
            }`}
          >
            {s.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-gray-200" />
        {Object.entries(VENDOR_LABEL).map(([id, label]) => (
          <button
            key={id}
            onClick={() => toggle(vendor, setVendor, id)}
            className={`rounded-full px-3 py-1 font-semibold transition-colors ${
              vendor.includes(id)
                ? "bg-brand text-brand-fg"
                : "border border-gray-300 bg-white text-gray-700 hover:border-ink"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-gray-200" />
        <select
          value={hsn}
          onChange={(e) => setHsn(e.target.value as typeof hsn)}
          className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30"
        >
          <option value="">Any HSN</option>
          <option value="blank">Has a blank HSN</option>
          <option value="flagged">Flagged for the CA</option>
          <option value="clean">All resolved</option>
        </select>
        <select
          value={boe}
          onChange={(e) => setBoe(e.target.value as typeof boe)}
          className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30"
        >
          <option value="">Any BOE</option>
          <option value="yes">BOE received</option>
          <option value="no">Awaiting BOE</option>
        </select>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
          }}
          className="ml-auto"
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="PO number, BOE, note…"
            className="w-56 py-1.5 text-xs"
          />
        </form>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {notice && (
        <Banner tone="success">
          {notice}{" "}
          <Link href={BILL_FORGE.documents} className="underline">
            Open Documents
          </Link>
        </Banner>
      )}

      <DataTable>
        <THead>
          <tr>
            <Th className="w-8" />
            <Th>PO number</Th>
            {showOrg && <Th>Org</Th>}
            <Th>Vendor</Th>
            <Th>Date</Th>
            <Th className="text-right">Lines</Th>
            <Th className="text-right">Value</Th>
            <Th className="text-center">HSN</Th>
            <Th className="text-center">BOE</Th>
            <Th>Stage</Th>
          </tr>
        </THead>
        <TBody>
          {rows.map((po) => (
            <RegisterRow
              key={po.po_number}
              po={po}
              showOrg={showOrg}
              checked={chosen.includes(po.po_number)}
              onCheck={() => toggle(chosen, setChosen, po.po_number)}
              expanded={expanded === po.po_number}
              onExpand={() =>
                setExpanded(expanded === po.po_number ? null : po.po_number)
              }
            />
          ))}
          {rows.length === 0 && !loading && (
            <EmptyRow colSpan={showOrg ? 10 : 9}>
              Nothing matches these filters. A purchase order appears here once a batch
              has produced files for it.
            </EmptyRow>
          )}
        </TBody>
      </DataTable>

      <p className="text-xs text-gray-500">
        {rows.length} of {total} purchase order{total === 1 ? "" : "s"}
      </p>

      {chosen.length > 0 && (
        <Card className="sticky bottom-4 flex items-center gap-4 border-gray-300 px-4 py-3 shadow-lg">
          <span className="text-sm text-ink">
            <strong>{chosen.length}</strong> selected · <span className="font-mono">$
            {selectedValue.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}</span>
          </span>
          <button
            onClick={() => setChosen([])}
            className="text-sm text-gray-500 hover:text-ink"
          >
            Clear
          </button>
          {notInvoiceable.length > 0 && (
            <span className="text-xs text-warning-deep">
              {notInvoiceable.length} of these cannot be invoiced yet
            </span>
          )}
          <div className="ml-auto flex gap-2">
            {isAdmin && (
              <Button variant="secondary" onClick={() => setDialog(true)} className="py-2">
                Set stage…
              </Button>
            )}
            <Button
              onClick={() => setGrouping(true)}
              disabled={notInvoiceable.length > 0}
              title={
                notInvoiceable.length > 0
                  ? "Every purchase order must have its Bill of Entry and no blank HSN"
                  : undefined
              }
              className="py-2"
            >
              Group into invoice →
            </Button>
          </div>
        </Card>
      )}

      {dialog && (
        <StageDialog
          count={chosen.length}
          onCancel={() => setDialog(false)}
          onConfirm={applyStage}
        />
      )}

      {grouping && (
        <GroupDialog
          selected={selected}
          onCancel={() => setGrouping(false)}
          onCreated={(count) => {
            setGrouping(false);
            setChosen([]);
            setNotice(
              `${count} sales invoice${count === 1 ? "" : "s"} generated. ` +
                "Find them under Documents.",
            );
            load();
          }}
        />
      )}
    </div>
  );
}
