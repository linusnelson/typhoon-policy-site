"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { Banner, Button } from "@/components/ui";
import { adminCancelLeave } from "@/actions/leave";

// Admin cancel from the register. Destructive: an approved request restores the
// balance, and for leave that has already been taken that restoration puts the
// register out of step with the month's attendance/muster — so past-dated
// cancels say so explicitly before you commit.
export function CancelLeaveButton({
  id,
  days,
  typeCode,
  wasApproved,
  hasStarted,
  hasEnded,
}: {
  id: string;
  days: number;
  typeCode: string | null;
  wasApproved: boolean;
  hasStarted: boolean;
  hasEnded: boolean;
}) {
  const [open, setOpen] = useState(false);
  const restores = wasApproved ? `${days} day${days === 1 ? "" : "s"}` : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-danger-deep hover:border-danger hover:bg-danger-soft"
      >
        <Ban className="h-4 w-4" /> Cancel
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
              Cancel this leave?
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {restores
                ? `The request is marked cancelled, ${restores} of ${typeCode ?? "leave"} goes back to the balance, and the employee is notified.`
                : "The request is marked cancelled and the employee is notified. Nothing was deducted, so no balance changes."}
            </p>

            {wasApproved && hasEnded && (
              <div className="mt-4">
                <Banner tone="warning">
                  This leave has already been taken. Restoring {restores} now
                  will disagree with the attendance and muster already recorded
                  for those days — re-check that month&rsquo;s report, or use a
                  balance adjustment on the employee instead.
                </Banner>
              </div>
            )}
            {wasApproved && hasStarted && !hasEnded && (
              <div className="mt-4">
                <Banner tone="warning">
                  This leave is already under way. Days taken so far stay in the
                  attendance record even though the balance is restored in full.
                </Banner>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
                Keep it
              </Button>
              <form action={adminCancelLeave}>
                <input type="hidden" name="id" value={id} />
                <Button variant="danger" type="submit">
                  Cancel leave
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
