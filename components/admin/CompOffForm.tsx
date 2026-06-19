"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Banner, Button, Card, Input, Textarea } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { grantCompOff } from "@/actions/comp-off";
import type { EmployeeOption } from "@/lib/data/employees";

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Granting…" : "Grant comp-off"}
    </Button>
  );
}

export function CompOffForm({ employees }: { employees: EmployeeOption[] }) {
  const [state, action] = useActionState(grantCompOff, idleState);
  return (
    <Card className="p-5">
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.ok && state.message && <Banner tone="success">{state.message}</Banner>}
      <form action={action} className="mt-1 space-y-4">
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
            <label className={labelCls}>Days granted</label>
            <Input
              type="number"
              name="daysGranted"
              defaultValue="1"
              min="0.5"
              step="0.5"
              required
            />
          </div>
          <div>
            <label className={labelCls}>Worked on</label>
            <Input type="date" name="workedOnDate" />
          </div>
          <div>
            <label className={labelCls}>Expires on</label>
            <Input type="date" name="expiresAt" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Reason</label>
          <Textarea name="reason" rows={2} placeholder="Why is this comp-off granted?" />
        </div>
        <SubmitButton />
      </form>
    </Card>
  );
}
