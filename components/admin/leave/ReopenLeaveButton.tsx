"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { Banner, Button, Textarea } from "@/components/ui";
import { adminReopenLeave } from "@/actions/leave";
import { idleState } from "@/lib/action-utils";

// Puts a rejected request back in the pending queue. The comment is mandatory:
// re-opening clears the rejection's reviewer stamp, so this note is the only
// record of why the decision was revisited.
export function ReopenLeaveButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(adminReopenLeave, idleState);

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:border-brand hover:bg-brand-soft"
      >
        <Undo2 className="h-4 w-4" /> Re-open
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
              Re-open this request?
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              It goes back to pending, the rejection is cleared, and the employee
              is notified. No balance moves until someone approves it.
            </p>

            <form action={action} className="mt-4 space-y-4">
              <input type="hidden" name="id" value={id} />
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Why is this being re-opened?
                </label>
                <Textarea
                  name="comment"
                  rows={3}
                  required
                  className="mt-1"
                  placeholder="e.g. Rejected in error — employee produced the medical certificate."
                />
              </div>

              {state.error && <Banner tone="danger">{state.error}</Banner>}

              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setOpen(false)}
                >
                  Close
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Re-opening…" : "Re-open request"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
