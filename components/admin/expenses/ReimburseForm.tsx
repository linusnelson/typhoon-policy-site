"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Banknote } from "lucide-react";
import { Banner, Button, Card, Input } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { markReimbursed } from "@/actions/expenses";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Banknote className="h-4 w-4" />
      {pending ? "Saving…" : "Mark reimbursed"}
    </Button>
  );
}

// Final transition: approved → reimbursed, with an optional payment reference
// (UTR / payout batch) for the audit trail.
export function ReimburseForm({ id }: { id: string }) {
  const [state, action] = useActionState(markReimbursed, idleState);

  return (
    <Card className="space-y-3 p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Reimburse
      </div>
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.ok && state.message && (
        <Banner tone="success">{state.message}</Banner>
      )}
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={id} />
        <div className="min-w-52">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">
            Payment reference (optional)
          </label>
          <Input name="paymentReference" placeholder="UTR / payout batch" />
        </div>
        <SubmitButton />
      </form>
      <p className="text-xs text-gray-400">
        Pay outside the app (bank/UPI/cash), then record it here — the employee
        is notified.
      </p>
    </Card>
  );
}
