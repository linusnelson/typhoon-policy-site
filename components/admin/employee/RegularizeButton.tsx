"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Banner, Button, Input } from "@/components/ui";
import { correctPunch, markAbsent } from "@/actions/regularization";
import type { ActionState } from "@/lib/action-utils";

const initial: ActionState = { ok: false };

const WORK_TYPES = [
  { value: "office", label: "Office" },
  { value: "wfh", label: "WFH" },
  { value: "client_visit", label: "Client visit" },
  { value: "event", label: "Event" },
];

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";

export function RegularizeButton({
  employeeId,
  date,
  dateDisplay,
  currentIn,
  currentOut,
  workType,
}: {
  employeeId: string;
  date: string;
  dateDisplay: string;
  currentIn: string | null;
  currentOut: string | null;
  workType: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [correctState, correctAction, correctPending] = useActionState(
    correctPunch,
    initial
  );
  const [absentState, absentAction, absentPending] = useActionState(
    markAbsent,
    initial
  );

  // Close + refresh once either action succeeds.
  useEffect(() => {
    if (correctState.ok || absentState.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [correctState.ok, absentState.ok, router]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-ink"
        title="Correct attendance"
      >
        <Pencil className="h-3.5 w-3.5" />
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
              Correct attendance
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">{dateDisplay}</p>

            {(correctState.error || absentState.error) && (
              <div className="mt-3">
                <Banner tone="warning">
                  {correctState.error || absentState.error}
                </Banner>
              </div>
            )}

            <form action={correctAction} className="mt-4 space-y-4">
              <input type="hidden" name="employeeId" value={employeeId} />
              <input type="hidden" name="punchDate" value={date} />
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-ink">
                    Punch in
                  </span>
                  <Input
                    name="correctedIn"
                    type="time"
                    required
                    defaultValue={currentIn ?? ""}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-ink">
                    Punch out
                  </span>
                  <Input
                    name="correctedOut"
                    type="time"
                    defaultValue={currentOut ?? ""}
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink">
                  Work type
                </span>
                <select
                  name="workType"
                  className={selectCls}
                  defaultValue={workType ?? "office"}
                >
                  {WORK_TYPES.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink">
                  Reason
                </span>
                <Input name="reason" required placeholder="e.g. Forgot to punch out" />
              </label>
              <div className="flex items-center justify-between gap-2">
                <MarkAbsentForm
                  employeeId={employeeId}
                  date={date}
                  action={absentAction}
                  pending={absentPending}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={correctPending}>
                    {correctPending ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// Separate form so "Mark absent" submits independently of the correction form.
function MarkAbsentForm({
  employeeId,
  date,
  action,
  pending,
}: {
  employeeId: string;
  date: string;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="punchDate" value={date} />
      <input type="hidden" name="reason" value="Marked absent by admin" />
      <button
        type="submit"
        disabled={pending}
        className="text-sm font-semibold text-danger-deep hover:underline disabled:opacity-50"
      >
        {pending ? "Marking…" : "Mark absent"}
      </button>
    </form>
  );
}
