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
import { Banner, Button, Input } from "@/components/ui";
import { bulkMarkReimbursed, type BulkReimburseState } from "@/actions/expenses";
import { formatINR } from "@/lib/format";

// Per-claim selection for the "To reimburse" queue, shared between the sticky
// action bar and the checkboxes scattered through the server-rendered list.
// The provider is a client boundary that takes the list as `children`, so the
// group cards stay server components — only the checkboxes are interactive.

interface SelectionContext {
  selected: ReadonlyMap<string, number>; // claim id → reimbursable amount
  toggle: (id: string, amount: number) => void;
  setMany: (claims: Array<{ id: string; amount: number }>, on: boolean) => void;
}

const Ctx = createContext<SelectionContext | null>(null);

function useSelection(): SelectionContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("Bulk reimburse checkbox rendered outside its provider.");
  }
  return ctx;
}

export function BulkReimburseProvider({
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
    (claims: Array<{ id: string; amount: number }>, on: boolean) => {
      setSelected((prev) => {
        const next = new Map(prev);
        for (const c of claims) {
          if (on) next.set(c.id, c.amount);
          else next.delete(c.id);
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
      <BulkReimburseBar />
      {children}
    </Ctx.Provider>
  );
}

// Stops the click reaching the <Link> the claim row is wrapped in.
function swallow(e: React.MouseEvent) {
  e.stopPropagation();
  e.preventDefault();
}

export function ClaimCheckbox({
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
    <span onClick={swallow} className="flex items-center">
      <input
        type="checkbox"
        checked={selected.has(id)}
        onChange={() => toggle(id, amount)}
        aria-label={`Select ${label} for reimbursement`}
        className="h-4 w-4 rounded border-gray-300"
      />
    </span>
  );
}

export function GroupSelectAll({
  claims,
  label,
}: {
  claims: Array<{ id: string; amount: number }>;
  label: string;
}) {
  const { selected, setMany } = useSelection();
  const allOn = claims.length > 0 && claims.every((c) => selected.has(c.id));
  const someOn = claims.some((c) => selected.has(c.id));
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-gray-500">
      <input
        type="checkbox"
        checked={allOn}
        ref={(el) => {
          if (el) el.indeterminate = someOn && !allOn;
        }}
        onChange={(e) => setMany(claims, e.target.checked)}
        aria-label={`Select all claims for ${label}`}
        className="h-4 w-4 rounded border-gray-300"
      />
      Select all
    </label>
  );
}

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || count === 0}>
      <Banknote className="h-4 w-4" />
      {pending
        ? `Marking ${count}…`
        : `Mark ${count} reimbursed`}
    </Button>
  );
}

const idleBulkState: BulkReimburseState = { ok: false };

function BulkReimburseBar() {
  const { selected } = useSelection();
  const [state, action] = useActionState(bulkMarkReimbursed, idleBulkState);

  const ids = [...selected.keys()];
  const total = [...selected.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="sticky top-0 z-10 space-y-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.ok && state.message && (
        <Banner tone="success">{state.message}</Banner>
      )}
      <form action={action} className="flex flex-wrap items-end justify-between gap-3">
        <input type="hidden" name="ids" value={JSON.stringify(ids)} />
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Selected
          </div>
          <div className="font-display font-bold text-ink">
            {ids.length === 0
              ? "Nothing selected"
              : `${ids.length} claim${ids.length === 1 ? "" : "s"} · ${formatINR(total)}`}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-52">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Payment reference (optional)
            </label>
            <Input name="paymentReference" placeholder="UTR / payout batch" />
          </div>
          <SubmitButton count={ids.length} />
        </div>
      </form>
      <p className="text-xs text-gray-400">
        Pay outside the app (bank/UPI/cash), then record it here — one reference
        is stamped on every selected claim and each employee gets a single
        notification. Claims closed this way still print on that month&apos;s
        payslip, marked as already paid.
      </p>
    </div>
  );
}
