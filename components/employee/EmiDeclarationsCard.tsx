"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { Banner, Button, Card, Input } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { addEmiDeclaration, removeEmiDeclaration } from "@/actions/advances";
import { formatINR } from "@/lib/format";
import type { EmiDeclaration } from "@/lib/types";

const labelCls =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Adding…" : "Add"}
    </Button>
  );
}

// Self-declared external loans/EMIs. The active total reduces the repayment
// capacity used by the eligibility check on the apply page.
export function EmiDeclarationsCard({
  declarations,
}: {
  declarations: EmiDeclaration[];
}) {
  const [state, action] = useActionState(addEmiDeclaration, idleState);
  const total = declarations.reduce((s, d) => s + d.monthly_emi, 0);

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-display text-base font-bold text-ink">
          My existing loans / EMIs
        </h2>
        {total > 0 && (
          <span className="text-sm font-semibold text-ink">
            {formatINR(total)}/month
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-gray-400">
        Declare EMIs you already pay (home loan, vehicle, personal loans…).
        These reduce how much you can borrow. False declarations are treated as
        misconduct under the Loans &amp; Advances Policy.
      </p>

      {state.error && <Banner tone="danger">{state.error}</Banner>}

      {declarations.length > 0 && (
        <ul className="mb-4 space-y-2">
          {declarations.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2"
            >
              <div className="min-w-0 text-sm">
                <span className="font-medium text-ink">{d.lender}</span>{" "}
                <span className="text-gray-500">
                  · {formatINR(d.monthly_emi)}/month
                  {d.remaining_months ? ` · ${d.remaining_months} months left` : ""}
                </span>
              </div>
              <form action={removeEmiDeclaration}>
                <input type="hidden" name="id" value={d.id} />
                <Button variant="ghost" type="submit" title="Remove declaration">
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form
        action={action}
        className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50/50 p-3 sm:grid-cols-[1fr_8rem_7rem_auto]"
      >
        <div>
          <label className={labelCls}>Lender / loan</label>
          <Input name="lender" placeholder="e.g. HDFC home loan" required />
        </div>
        <div>
          <label className={labelCls}>EMI (₹/month)</label>
          <Input type="number" name="monthlyEmi" min={1} required />
        </div>
        <div>
          <label className={labelCls}>Months left</label>
          <Input type="number" name="remainingMonths" min={1} placeholder="—" />
        </div>
        <div className="flex items-end">
          <AddButton />
        </div>
      </form>
    </Card>
  );
}
