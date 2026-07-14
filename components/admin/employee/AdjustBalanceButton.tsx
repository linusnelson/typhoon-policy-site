"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { Banner, Button, Input } from "@/components/ui";
import { adminAdjustLeaveBalance } from "@/actions/leave";
import type { ActionState } from "@/lib/action-utils";

const initial: ActionState = { ok: false };

export interface AdjustableBalance {
  typeId: string;
  code: string;
  name: string;
  remaining: number;
}

// Admin bumps an employee's available leave up or down for the current year.
// Every adjustment requires a comment — it's stored in the append-only
// leave_balance_adjustments audit trail and sent to the employee.
export function AdjustBalanceButton({
  employeeId,
  balance,
}: {
  employeeId: string;
  balance: AdjustableBalance;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(adminAdjustLeaveBalance, initial);
  const [delta, setDelta] = useState("");

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  const preview = Number(delta);
  const after =
    delta !== "" && Number.isFinite(preview) ? balance.remaining + preview : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-ink hover:border-brand hover:bg-brand-soft"
      >
        <SlidersHorizontal className="h-3 w-3" /> Adjust
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-card border border-gray-200 bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-bold text-ink">
              Adjust {balance.code} balance
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">
              {balance.name} — {balance.remaining.toFixed(2)} day(s) available
              this year. The employee is notified with your comment.
            </p>

            {state.error && (
              <div className="mt-3">
                <Banner tone="warning">{state.error}</Banner>
              </div>
            )}

            <form action={action} className="mt-4 space-y-4">
              <input type="hidden" name="employeeId" value={employeeId} />
              <input type="hidden" name="leaveTypeId" value={balance.typeId} />

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink">
                  Adjustment (days)
                </span>
                <Input
                  name="delta"
                  type="number"
                  step="0.25"
                  required
                  placeholder="e.g. 2 to add, -0.5 to remove"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                />
                {after != null && (
                  <span className="mt-1 block text-xs text-gray-500">
                    After adjustment: {after.toFixed(2)} day(s) available
                  </span>
                )}
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink">
                  Comment
                </span>
                <Input
                  name="comment"
                  required
                  placeholder="Why the balance is being adjusted"
                />
              </label>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Adjust balance"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
