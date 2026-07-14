"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Banknote } from "lucide-react";
import { Banner, Button, Card, Input } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { disburseAdvance } from "@/actions/advances";
import { defaultFirstDeductionMonth } from "@/lib/engine/advance";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Banknote className="h-4 w-4" />
      {pending ? "Disbursing…" : "Mark disbursed"}
    </Button>
  );
}

// Disburse an approved advance: records the payout and generates the
// installment schedule starting at the chosen month.
export function DisburseForm({ id }: { id: string }) {
  const [state, action] = useActionState(disburseAdvance, idleState);
  const defaultMonth = defaultFirstDeductionMonth(
    new Date().toISOString().slice(0, 10)
  ).slice(0, 7); // "YYYY-MM" for <input type="month">

  return (
    <Card className="space-y-3 p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Disburse
      </div>
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.ok && state.message && (
        <Banner tone="success">{state.message}</Banner>
      )}
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={id} />
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">
            First deduction month
          </label>
          <Input
            type="month"
            name="firstDeductionMonth"
            defaultValue={defaultMonth}
            className="w-44"
          />
        </div>
        <SubmitButton />
      </form>
      <p className="text-xs text-gray-400">
        Pay the amount outside the app (bank/cash), then mark disbursed — the
        repayment schedule is generated from this month.
      </p>
    </Card>
  );
}
