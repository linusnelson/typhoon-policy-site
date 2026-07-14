"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Banner, Button, Input } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { setCompensation } from "@/actions/advances";

const labelCls =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save salary"}
    </Button>
  );
}

// New effective date = a raise (history kept); same date = correction.
export function SetCompensationForm({ employeeId }: { employeeId: string }) {
  const [state, action] = useActionState(setCompensation, idleState);

  return (
    <form
      action={action}
      className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50/50 p-4 sm:grid-cols-[auto_auto_auto]"
    >
      {(state.error || (state.ok && state.message)) && (
        <div className="sm:col-span-3">
          <Banner tone={state.error ? "danger" : "success"}>
            {state.error ?? state.message}
          </Banner>
        </div>
      )}
      <input type="hidden" name="employeeId" value={employeeId} />
      <div>
        <label className={labelCls}>Monthly salary (₹)</label>
        <Input type="number" name="monthlySalary" min={0} required className="w-44" />
      </div>
      <div>
        <label className={labelCls}>Effective from</label>
        <Input type="date" name="effectiveFrom" className="w-44" />
      </div>
      <div className="flex items-end">
        <SaveButton />
      </div>
    </form>
  );
}
