"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Info } from "lucide-react";
import { Banner, Button, Card, Textarea } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { applyMyLeave } from "@/actions/employee-leave";
import { computeLeaveDays, type LeaveDuration } from "@/lib/engine/leave-days";
import type { ApplyLeaveType } from "@/lib/data/employee-leave";

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

function SubmitButton({ blocked }: { blocked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || blocked}>
      {pending ? "Submitting…" : "Submit request"}
    </Button>
  );
}

export function ApplyLeaveForm({
  types,
  holidays,
  today,
}: {
  types: ApplyLeaveType[];
  holidays: string[];
  today: string;
}) {
  const [state, action] = useActionState(applyMyLeave, idleState);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [duration, setDuration] = useState<LeaveDuration>("full_day");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);

  const selected = types.find((t) => t.id === typeId);
  const isMultiDay = duration === "full_day";

  const calc = useMemo(() => {
    if (!start) return null;
    const e = isMultiDay ? (end && end >= start ? end : start) : start;
    return computeLeaveDays({
      startKey: start,
      endKey: e,
      durationType: duration,
      sandwichRuleEnabled: selected?.sandwichRuleEnabled ?? true,
      holidays,
    });
  }, [start, end, duration, isMultiDay, selected, holidays]);

  const requested = calc?.totalDays ?? 0;
  const insufficient =
    !!selected && !selected.isUnlimited && requested > selected.remaining;

  return (
    <form action={action} className="space-y-5">
      {state.error && <Banner tone="danger">{state.error}</Banner>}

      <Card className="space-y-4 p-5">
        {/* Leave type */}
        <div>
          <label className={labelCls}>Leave type</label>
          <select
            name="leaveTypeId"
            className={selectCls}
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
          >
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} — {t.name}
                {t.isUnlimited ? " (unlimited)" : ` (${t.remaining} left)`}
              </option>
            ))}
          </select>
        </div>

        {/* Duration */}
        <div>
          <label className={labelCls}>Duration</label>
          <select
            name="durationType"
            className={selectCls}
            value={duration}
            onChange={(e) => setDuration(e.target.value as LeaveDuration)}
          >
            <option value="full_day">Full day</option>
            {selected?.allowHalfDay && (
              <>
                <option value="half_day_morning">Half day — morning</option>
                <option value="half_day_afternoon">Half day — afternoon</option>
              </>
            )}
            {selected?.allowQuarterDay && (
              <option value="quarter_day">Quarter day (2 hrs)</option>
            )}
          </select>
        </div>

        {/* Dates */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{isMultiDay ? "From" : "Date"}</label>
            <input
              type="date"
              name="startDate"
              className={selectCls}
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (!isMultiDay || end < e.target.value) setEnd(e.target.value);
              }}
            />
          </div>
          {isMultiDay && (
            <div>
              <label className={labelCls}>To</label>
              <input
                type="date"
                name="endDate"
                className={selectCls}
                value={end}
                min={start}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Reason */}
        <div>
          <label className={labelCls}>Reason</label>
          <Textarea name="reason" rows={3} placeholder="Why are you taking leave?" required />
        </div>
      </Card>

      {/* Live preview */}
      {calc && (
        <Card className="space-y-2 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Days to be deducted</span>
            <span className="font-display text-xl font-bold text-ink">
              {requested === Math.round(requested) ? requested : requested.toFixed(2)}
            </span>
          </div>
          {calc.sandwichDays.length > 0 && (
            <div className="flex items-start gap-2 text-sm text-info-deep">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {calc.sandwichDays.length} holiday
                {calc.sandwichDays.length > 1 ? "s" : ""} inside this span
                {" "}({calc.sandwichDays.join(", ")}) will also be counted as leave
                (sandwich rule).
              </span>
            </div>
          )}
          {calc.weekendCount > 0 && (
            <p className="text-xs text-gray-400">
              {calc.weekendCount} weekly-off day
              {calc.weekendCount > 1 ? "s" : ""} excluded.
            </p>
          )}
          {insufficient && (
            <div className="flex items-start gap-2 text-sm font-semibold text-danger-deep">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Insufficient balance — {requested} requested,{" "}
                {selected?.remaining} available.
              </span>
            </div>
          )}
        </Card>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton blocked={insufficient || !selected} />
        {selected && !selected.requiresApproval && (
          <span className="text-xs text-gray-400">
            This leave type is auto-approved.
          </span>
        )}
      </div>
    </form>
  );
}
