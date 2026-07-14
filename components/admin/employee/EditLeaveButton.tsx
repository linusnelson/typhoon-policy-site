"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Banner, Button, Input } from "@/components/ui";
import { adminEditPendingLeave } from "@/actions/leave";
import type { ActionState } from "@/lib/action-utils";
import type { ApplyLeaveTypeOption } from "./AdminApplyLeaveButton";

const initial: ActionState = { ok: false };

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";

export interface EditableLeaveRequest {
  id: string;
  leaveTypeId: string | null;
  durationType: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  reason: string;
  daysCount: number;
  adminComment: string | null;
}

// Admin edits a still-pending leave request. Same form as apply-on-behalf but
// prefilled from the request; the action rejects anything no longer pending.
export function EditLeaveButton({
  request,
  types,
}: {
  request: EditableLeaveRequest;
  types: ApplyLeaveTypeOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(adminEditPendingLeave, initial);
  const [typeId, setTypeId] = useState(request.leaveTypeId ?? types[0]?.id ?? "");
  const [duration, setDuration] = useState(request.durationType);
  const [daysOverride, setDaysOverride] = useState("");

  const selected = useMemo(
    () => types.find((t) => t.id === typeId),
    [types, typeId]
  );

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  if (types.length === 0) return null;

  const durations = [
    { value: "full_day", label: "Full day", show: true },
    { value: "half_day_morning", label: "Half day (morning)", show: selected?.allowHalfDay ?? true },
    { value: "half_day_afternoon", label: "Half day (afternoon)", show: selected?.allowHalfDay ?? true },
    { value: "quarter_day", label: "Quarter day (2h)", show: selected?.allowQuarterDay ?? true },
  ].filter((d) => d.show || d.value === duration);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand hover:bg-brand-soft"
      >
        <Pencil className="h-3 w-3" /> Edit
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
              Edit pending leave
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">
              The request stays pending — days are recalculated and the employee
              is notified.
            </p>

            {state.error && (
              <div className="mt-3">
                <Banner tone="warning">{state.error}</Banner>
              </div>
            )}

            <form action={action} className="mt-4 space-y-4">
              <input type="hidden" name="id" value={request.id} />

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink">
                  Leave type
                </span>
                <select
                  name="leaveTypeId"
                  className={selectCls}
                  value={typeId}
                  onChange={(e) => setTypeId(e.target.value)}
                >
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.name}
                    </option>
                  ))}
                </select>
                {selected && (
                  <span className="mt-1 block text-xs text-gray-500">
                    {selected.isUnlimited
                      ? "Unlimited balance"
                      : `${selected.remaining.toFixed(1)} day(s) remaining`}
                  </span>
                )}
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink">
                  Duration
                </span>
                <select
                  name="durationType"
                  className={selectCls}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                >
                  {durations.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-ink">
                    {duration === "full_day" ? "Start date" : "Date"}
                  </span>
                  <Input
                    name="startDate"
                    type="date"
                    required
                    defaultValue={request.startDate}
                  />
                </label>
                {duration === "full_day" && (
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-ink">
                      End date
                    </span>
                    <Input
                      name="endDate"
                      type="date"
                      defaultValue={request.endDate}
                    />
                  </label>
                )}
              </div>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink">
                  Reason
                </span>
                <Input name="reason" required defaultValue={request.reason} />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink">
                  Days count
                </span>
                <Input
                  name="daysOverride"
                  type="number"
                  step="0.25"
                  min="0.25"
                  placeholder={`Auto — recalculated from dates (currently ${request.daysCount.toFixed(2)})`}
                  value={daysOverride}
                  onChange={(e) => setDaysOverride(e.target.value)}
                />
                <span className="mt-1 block text-xs text-gray-500">
                  Leave blank to recalculate from the dates. Set a value to
                  override (e.g. waive sandwich days).
                </span>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink">
                  Admin comment{daysOverride ? "" : " (optional)"}
                </span>
                <Input
                  name="adminComment"
                  required={daysOverride !== ""}
                  defaultValue={request.adminComment ?? ""}
                  placeholder={
                    daysOverride
                      ? "Why the days count was overridden"
                      : "Note shown to the employee"
                  }
                />
              </label>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
