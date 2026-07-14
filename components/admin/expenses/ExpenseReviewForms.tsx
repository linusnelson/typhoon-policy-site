"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { approveExpense, rejectExpense } from "@/actions/expenses";

// Approve / reject a pending expense with an optional shared note. Approval
// recomputes the food cap server-side, so the reimbursable amount shown before
// approval is a preview.
export function ExpenseReviewForms({ id }: { id: string }) {
  const [note, setNote] = useState("");

  return (
    <Card className="space-y-3 p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Review
      </div>
      <Input
        name="noteShared"
        placeholder="Optional note to the employee"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <form action={rejectExpense}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="note" value={note} />
          <Button variant="secondary" type="submit">
            <X className="h-4 w-4" /> Reject
          </Button>
        </form>
        <form action={approveExpense}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="note" value={note} />
          <Button type="submit">
            <Check className="h-4 w-4" /> Approve
          </Button>
        </form>
      </div>
    </Card>
  );
}
