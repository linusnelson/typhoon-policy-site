"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Banknote } from "lucide-react";
import { Banner, Button } from "@/components/ui";
import {
  bulkMarkRepaymentsPaid,
  type BulkPaidState,
} from "@/actions/advances";
import { formatINR } from "@/lib/format";

// Per-installment selection for the monthly-deductions view, shared between
// the sticky action bar and the checkboxes in the table. Same shape as
// components/admin/expenses/BulkReimburse — the provider is a client boundary
// that takes the server-rendered table as `children`.

interface SelectionContext {
  selected: ReadonlyMap<string, number>; // repayment id → amount
  toggle: (id: string, amount: number) => void;
  setMany: (rows: Array<{ id: string; amount: number }>, on: boolean) => void;
}

const Ctx = createContext<SelectionContext | null>(null);

function useSelection(): SelectionContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("Bulk mark-paid checkbox rendered outside its provider.");
  }
  return ctx;
}

export function BulkMarkPaidProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Map<string, number>>(new Map());

  const toggle = useCallback((id: string, amount: number) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, amount);
      return next;
    });
  }, []);

  const setMany = useCallback(
    (rows: Array<{ id: string; amount: number }>, on: boolean) => {
      setSelected((prev) => {
        const next = new Map(prev);
        for (const r of rows) {
          if (on) next.set(r.id, r.amount);
          else next.delete(r.id);
        }
        return next;
      });
    },
    []
  );

  const value = useMemo(
    () => ({ selected, toggle, setMany }),
    [selected, toggle, setMany]
  );

  return (
    <Ctx.Provider value={value}>
      <BulkMarkPaidBar />
      {children}
    </Ctx.Provider>
  );
}

export function RepaymentCheckbox({
  id,
  amount,
  label,
}: {
  id: string;
  amount: number;
  label: string;
}) {
  const { selected, toggle } = useSelection();
  return (
    <input
      type="checkbox"
      checked={selected.has(id)}
      onChange={() => toggle(id, amount)}
      aria-label={`Select ${label} to mark paid`}
      className="h-4 w-4 rounded border-gray-300"
    />
  );
}

// Header checkbox: only the still-scheduled rows are selectable, so "select
// all" must not appear to cover the paid and waived ones already in the table.
export function SelectAllScheduled({
  rows,
}: {
  rows: Array<{ id: string; amount: number }>;
}) {
  const { selected, setMany } = useSelection();
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someOn = rows.some((r) => selected.has(r.id));
  return (
    <input
      type="checkbox"
      checked={allOn}
      disabled={rows.length === 0}
      ref={(el) => {
        if (el) el.indeterminate = someOn && !allOn;
      }}
      onChange={(e) => setMany(rows, e.target.checked)}
      aria-label="Select all scheduled deductions"
      className="h-4 w-4 rounded border-gray-300 disabled:opacity-30"
    />
  );
}

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || count === 0}>
      <Banknote className="h-4 w-4" />
      {pending ? `Marking ${count}…` : `Mark ${count} paid`}
    </Button>
  );
}

const idleBulkPaidState: BulkPaidState = { ok: false };

function BulkMarkPaidBar() {
  const { selected } = useSelection();
  const [state, action] = useActionState(
    bulkMarkRepaymentsPaid,
    idleBulkPaidState
  );

  const ids = [...selected.keys()];
  const total = [...selected.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="sticky top-0 z-10 space-y-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.ok && state.message && (
        <Banner tone="success">{state.message}</Banner>
      )}
      <form action={action} className="flex flex-wrap items-center justify-between gap-3">
        <input type="hidden" name="ids" value={JSON.stringify(ids)} />
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Selected
          </div>
          <div className="font-display font-bold text-ink">
            {ids.length === 0
              ? "Nothing selected"
              : `${ids.length} deduction${ids.length === 1 ? "" : "s"} · ${formatINR(total)}`}
          </div>
        </div>
        <SubmitButton count={ids.length} />
      </form>
      <p className="text-xs text-gray-400">
        Tick the installments payroll actually deducted this month, then record
        them here. A loan whose last installment is marked paid closes
        automatically and the employee is notified.
      </p>
    </div>
  );
}
