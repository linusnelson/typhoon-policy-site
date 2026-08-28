"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from "lucide-react";
import { Badge, Banner, Button, Card, Input } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { savePayslipComponents } from "@/actions/payslip-components";
import {
  isPinnedComponent,
  validateComponentLabel,
  validateComponents,
  type PayslipComponent,
} from "@/lib/engine/payslip-components";
import { PAYSLIP_MAX_COMPONENTS_PER_SIDE } from "@/lib/engine/payslip-import";
import { formatINR } from "@/lib/format";

const labelCls =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Saving…" : "Save components"}
    </Button>
  );
}

// Editor for the org's payslip earning/deduction components. The list drives
// the downloadable import template only — the CSV parser still accepts any
// "E:"/"D:" column, so an ad-hoc one-off column added by hand in Excel keeps
// working without being registered here.
export function PayslipComponentManager({
  initial,
}: {
  initial: PayslipComponent[];
}) {
  const [state, action] = useActionState(savePayslipComponents, idleState);
  const [items, setItems] = useState<PayslipComponent[]>(initial);
  const [newLabel, setNewLabel] = useState("");
  const [newSide, setNewSide] = useState<"E" | "D">("E");
  const [addError, setAddError] = useState<string | null>(null);

  const earningCount = items.filter((c) => c.side === "E").length;
  const deductionCount = items.length - earningCount;
  const errors = useMemo(() => validateComponents(items), [items]);

  function update(index: number, patch: Partial<PayslipComponent>) {
    setItems((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c))
    );
  }

  function move(index: number, delta: number) {
    setItems((prev) => {
      // Reorder within the same side — earnings and deductions are separate
      // blocks in the template, so hopping the boundary would be meaningless.
      const side = prev[index].side;
      const siblings = prev
        .map((c, i) => ({ c, i }))
        .filter((x) => x.c.side === side);
      const at = siblings.findIndex((x) => x.i === index);
      const target = siblings[at + delta];
      if (!target) return prev;
      const next = [...prev];
      next[index] = prev[target.i];
      next[target.i] = prev[index];
      return next;
    });
  }

  function remove(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function add() {
    const labelError = validateComponentLabel(newLabel);
    if (labelError) {
      setAddError(labelError);
      return;
    }
    const label = newLabel.trim().replace(/\s+/g, " ").toUpperCase();
    if (items.some((c) => c.side === newSide && c.label === label)) {
      setAddError(`"${label}" already exists.`);
      return;
    }
    const sideCount = items.filter((c) => c.side === newSide).length;
    if (sideCount >= PAYSLIP_MAX_COMPONENTS_PER_SIDE) {
      setAddError(
        `Maximum ${PAYSLIP_MAX_COMPONENTS_PER_SIDE} ${newSide === "E" ? "earnings" : "deductions"} — an A4 payslip can't print more.`
      );
      return;
    }
    setAddError(null);
    setNewLabel("");
    setItems((prev) => [
      ...prev,
      { label, side: newSide, defaultAmount: 0, appliesToAll: false },
    ]);
  }

  function renderSide(side: "E" | "D") {
    const rows = items
      .map((c, i) => ({ c, i }))
      .filter((x) => x.c.side === side);

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-ink">
            {side === "E" ? "Earnings" : "Deductions"}
          </h3>
          <span className="text-xs text-gray-400">
            {rows.length} of {PAYSLIP_MAX_COMPONENTS_PER_SIDE}
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">
            None yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map(({ c, i }, position) => {
              const pinned = isPinnedComponent(c.label);
              return (
                <li
                  key={`${c.side}-${c.label}`}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                >
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={position === 0}
                      aria-label={`Move ${c.label} up`}
                      className="text-gray-300 transition-colors hover:text-ink disabled:opacity-30 disabled:hover:text-gray-300"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={position === rows.length - 1}
                      aria-label={`Move ${c.label} down`}
                      className="text-gray-300 transition-colors hover:text-ink disabled:opacity-30 disabled:hover:text-gray-300"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="min-w-40 flex-1">
                    <span className="font-medium text-ink">{c.label}</span>
                    {pinned && (
                      <span className="ml-2 inline-flex items-center gap-1 align-middle">
                        <Badge tone="neutral">
                          <Lock className="mr-1 inline h-3 w-3" />
                          Auto-filled
                        </Badge>
                      </span>
                    )}
                  </div>

                  {pinned ? (
                    <p className="flex-1 text-xs text-gray-400">
                      Filled per employee from the{" "}
                      {c.label === "REIMBURSEMENT" ? "Expenses" : "Advances"}{" "}
                      module.
                    </p>
                  ) : (
                    <>
                      <label className="flex items-center gap-2 text-xs text-gray-500">
                        <input
                          type="checkbox"
                          checked={c.appliesToAll}
                          onChange={(e) =>
                            update(i, { appliesToAll: e.target.checked })
                          }
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        Applies to all
                      </label>
                      <div className="w-32">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={String(c.defaultAmount)}
                          disabled={!c.appliesToAll}
                          onChange={(e) =>
                            update(i, {
                              defaultAmount: Number(e.target.value),
                            })
                          }
                          aria-label={`Default amount for ${c.label}`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        aria-label={`Remove ${c.label}`}
                        className="text-gray-300 transition-colors hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  const prefilled = items.filter((c) => c.appliesToAll && c.defaultAmount > 0);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="components" value={JSON.stringify(items)} />

      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.ok && state.message && (
        <Banner tone="success">{state.message}</Banner>
      )}
      {errors.length > 0 && <Banner tone="danger">{errors.join(" ")}</Banner>}

      <Card className="space-y-5 p-5">
        {renderSide("E")}
        {renderSide("D")}
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="font-display text-sm font-bold text-ink">
          Add a component
        </h3>
        {addError && <Banner tone="danger">{addError}</Banner>}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1">
            <label className={labelCls}>Name</label>
            <Input
              value={newLabel}
              placeholder="HRA, SPECIAL ALLOWANCE, PF…"
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                // Enter inside the add row must not submit the outer form.
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
          </div>
          <div>
            <label className={labelCls}>Side</label>
            <select
              value={newSide}
              onChange={(e) => setNewSide(e.target.value as "E" | "D")}
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-ink"
            >
              <option value="E">Earning</option>
              <option value="D">Deduction</option>
            </select>
          </div>
          <Button variant="secondary" type="button" onClick={add}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        <p className="text-xs text-gray-400">
          Names are stored uppercase and print on the payslip exactly as shown.
          {prefilled.length > 0 && (
            <>
              {" "}
              Every employee&apos;s template row will arrive carrying{" "}
              {prefilled
                .map((c) => `${c.label} ${formatINR(c.defaultAmount)}`)
                .join(", ")}
              .
            </>
          )}
        </p>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <SaveButton disabled={errors.length > 0} />
        <span className="text-xs text-gray-400">
          {earningCount} earning{earningCount === 1 ? "" : "s"} ·{" "}
          {deductionCount} deduction{deductionCount === 1 ? "" : "s"}
        </span>
      </div>
    </form>
  );
}
