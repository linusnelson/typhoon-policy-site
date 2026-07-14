"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Lock } from "lucide-react";
import { Banner, Button, Input } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { updateMyBankDetails } from "@/actions/profile";

const labelCls =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save bank details"}
    </Button>
  );
}

export interface BankDetailsValue {
  bankName: string;
  bankAccountNo: string;
  pan: string;
}

// One-time entry: after saving, the record locks and only an admin can unlock
// it for re-editing (RLS-enforced). `editable` = no record yet, or an admin
// has unlocked it.
export function BankDetailsForm({
  details,
  editable,
}: {
  details: BankDetailsValue | null;
  editable: boolean;
}) {
  const [state, action] = useActionState(updateMyBankDetails, idleState);

  if (!editable && details) {
    return (
      <div className="space-y-3">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className={labelCls}>Bank name</dt>
            <dd className="text-sm font-medium text-ink">{details.bankName}</dd>
          </div>
          <div>
            <dt className={labelCls}>Account number</dt>
            <dd className="text-sm font-medium text-ink">{details.bankAccountNo}</dd>
          </div>
          <div>
            <dt className={labelCls}>PAN</dt>
            <dd className="text-sm font-medium text-ink">{details.pan}</dd>
          </div>
        </dl>
        <p className="flex items-center gap-1.5 text-xs text-gray-400">
          <Lock className="h-3.5 w-3.5" />
          Locked — these print on your payslips. Contact HR/admin to correct them.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.ok && state.message && <Banner tone="success">{state.message}</Banner>}
      <Banner tone="warning">
        Check carefully — these print on your payslips and lock after saving.
        Changing them later needs HR/admin.
      </Banner>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls}>Bank name</label>
          <Input
            name="bankName"
            defaultValue={details?.bankName ?? ""}
            placeholder="HDFC Bank"
            required
          />
        </div>
        <div>
          <label className={labelCls}>Account number</label>
          <Input
            name="bankAccountNo"
            inputMode="numeric"
            defaultValue={details?.bankAccountNo ?? ""}
            placeholder="9–18 digits"
            required
          />
        </div>
        <div>
          <label className={labelCls}>PAN</label>
          <Input
            name="pan"
            defaultValue={details?.pan ?? ""}
            placeholder="ABCDE1234F"
            className="uppercase"
            required
          />
        </div>
      </div>
      <SaveButton />
    </form>
  );
}
