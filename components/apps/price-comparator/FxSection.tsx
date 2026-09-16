"use client";

import { useState, useTransition } from "react";
import { Badge, Button } from "@/components/ui";
import { setPriceProbeFxOverride } from "@/actions/price-comparator";
import type { FxState } from "@/lib/apps/price-comparator/types";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-7 pr-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";

// INR/USD rate used to rank element14 (INR) against the USD vendors.
// Everyone sees the rate; only admins can set or clear the org-wide override
// (tucked behind "Set override"). `onChange` receives the saved state so
// results on screen re-price immediately.
export function FxSection({
  fx,
  isAdmin,
  onChange,
}: {
  fx: FxState;
  isAdmin: boolean;
  onChange: (fx: FxState) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const overridden = fx.override !== null;

  function save(override: number | null) {
    setError("");
    startTransition(async () => {
      const res = await setPriceProbeFxOverride(override);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      setDraft("");
      onChange(res.fx);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">Exchange rate</h2>
        {overridden ? <Badge tone="warning">Override</Badge> : <Badge tone="success">Live</Badge>}
      </div>
      <div className="font-display text-xl font-bold text-ink">
        ₹{fx.effective.rate.toFixed(2)}
        <span className="ml-1 text-sm font-medium text-gray-400">per USD</span>
      </div>
      <p className="text-xs text-gray-400">
        {overridden
          ? `Set by an admin. Live rate is ₹${fx.live.rate.toFixed(2)}.`
          : fx.live.source}
      </p>

      {isAdmin && !editing && (
        <div className="flex gap-3 pt-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setDraft(fx.override?.toString() ?? "");
              setEditing(true);
            }}
            className="text-brand hover:underline"
          >
            {overridden ? "Change override" : "Set override"}
          </button>
          {overridden && (
            <button
              type="button"
              disabled={pending}
              onClick={() => save(null)}
              className="text-gray-500 hover:text-ink hover:underline disabled:opacity-50"
            >
              {pending ? "Saving…" : "Use live rate"}
            </button>
          )}
        </div>
      )}

      {isAdmin && editing && (
        <form
          className="space-y-2 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            const value = Number(draft);
            if (draft.trim() === "" || !(value > 0)) {
              setError("Enter a positive INR per USD rate.");
              return;
            }
            save(value);
          }}
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">
              ₹
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="INR per 1 USD"
              className={inputCls}
              aria-label="Override rate, INR per USD"
            />
          </div>
          <p className="text-[11px] text-gray-400">Applies to everyone in the organization.</p>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1 py-1.5" disabled={pending}>
              {pending ? "Saving…" : "Apply"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="py-1.5"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setError("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {error && <p className="text-xs text-danger-deep">{error}</p>}
    </div>
  );
}
