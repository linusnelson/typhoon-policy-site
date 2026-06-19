"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Banner, Button, Input } from "@/components/ui";
import { adminApplyLeave } from "@/actions/leave";
import type { ActionState } from "@/lib/action-utils";

const initial: ActionState = { ok: false };

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";

export interface ApplyLeaveTypeOption {
  id: string;
  code: string;
  name: string;
  isUnlimited: boolean;
  allowHalfDay: boolean;
  allowQuarterDay: boolean;
  remaining: number;
}

export function AdminApplyLeaveButton({
  employeeId,
  types,
}: {
  employeeId: string;
  types: ApplyLeaveTypeOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(adminApplyLeave, initial);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [duration, setDuration] = useState("full_day");

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
  ].filter((d) => d.show);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Apply leave
      </Button>

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
              Apply leave on behalf
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">
              Applied as approved — the balance is deducted immediately.
            </p>

            {state.error && (
              <div className="mt-3">
                <Banner tone="warning">{state.error}</Banner>
              </div>
            )}

            <form action={action} className="mt-4 space-y-4">
              <input type="hidden" name="employeeId" value={employeeId} />

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
                  <Input name="startDate" type="date" required />
                </label>
                {duration === "full_day" && (
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-ink">
                      End date
                    </span>
                    <Input name="endDate" type="date" />
                  </label>
                )}
              </div>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink">
                  Reason
                </span>
                <Input name="reason" required placeholder="e.g. Approved sick leave" />
              </label>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Applying…" : "Apply & approve"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
