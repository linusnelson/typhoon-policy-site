"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Banner, Button, Card, Input, Textarea } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { correctPunch, markAbsent } from "@/actions/regularization";
import type { EmployeeOption } from "@/lib/data/employees";

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function RegularizationForm({
  employees,
  today,
}: {
  employees: EmployeeOption[];
  today: string;
}) {
  const [mode, setMode] = useState<"correct" | "absent">("correct");
  const [correctState, correctAction] = useActionState(correctPunch, idleState);
  const [absentState, absentAction] = useActionState(markAbsent, idleState);
  const state = mode === "correct" ? correctState : absentState;

  return (
    <Card className="p-5">
      <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1">
        {(["correct", "absent"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={[
              "flex-1 rounded-md px-4 py-1.5 text-sm font-semibold transition-colors",
              mode === m ? "bg-white text-brand shadow-sm" : "text-gray-500 hover:text-ink",
            ].join(" ")}
          >
            {m === "correct" ? "Correct punch" : "Mark absent"}
          </button>
        ))}
      </div>

      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.ok && state.message && <Banner tone="success">{state.message}</Banner>}

      {mode === "correct" ? (
        <form action={correctAction} className="mt-4 space-y-4">
          <EmployeeAndDate employees={employees} today={today} />
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Punch in</label>
              <Input type="time" name="correctedIn" required />
            </div>
            <div>
              <label className={labelCls}>Punch out</label>
              <Input type="time" name="correctedOut" />
            </div>
            <div>
              <label className={labelCls}>Work type</label>
              <select name="workType" className={selectCls} defaultValue="office">
                <option value="office">Office</option>
                <option value="wfh">WFH</option>
                <option value="client_visit">Client visit</option>
                <option value="event">Event</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Reason</label>
            <Textarea name="reason" rows={2} required placeholder="Why is this correction needed?" />
          </div>
          <SubmitButton label="Apply correction" />
        </form>
      ) : (
        <form action={absentAction} className="mt-4 space-y-4">
          <EmployeeAndDate employees={employees} today={today} />
          <div>
            <label className={labelCls}>Reason</label>
            <Textarea name="reason" rows={2} required placeholder="Why is this day absent?" />
          </div>
          <p className="text-xs text-gray-400">
            This deletes any punches recorded for that day.
          </p>
          <SubmitButton label="Mark absent" />
        </form>
      )}
    </Card>
  );
}

function EmployeeAndDate({
  employees,
  today,
}: {
  employees: EmployeeOption[];
  today: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className={labelCls}>Employee</label>
        <select name="employeeId" className={selectCls} required defaultValue="">
          <option value="" disabled>
            Select employee…
          </option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Date</label>
        <Input type="date" name="punchDate" defaultValue={today} max={today} required />
      </div>
    </div>
  );
}
