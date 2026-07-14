"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Banner, Button, Card, Input } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { upsertExpensePolicy } from "@/actions/expenses";
import type { ExpensePolicy } from "@/lib/types";

const labelCls =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save policy"}
    </Button>
  );
}

// Org-wide expense policy: per-km own-vehicle rates, the personal-food daily
// cap, and the submission window enforced by the app.
export function ExpensePolicyForm({ policy }: { policy: ExpensePolicy | null }) {
  const [state, action] = useActionState(upsertExpensePolicy, idleState);

  return (
    <Card className="p-5">
      <h2 className="mb-1 font-display text-base font-bold text-ink">
        Expense policy
      </h2>
      <p className="mb-4 text-xs text-gray-400">
        Applies org-wide. Vehicle rates price own-vehicle claims (km × rate);
        the food limit caps personal meals per day (Client Hospitality is never
        capped).
      </p>
      <form action={action} className="space-y-4">
        {state.error && <Banner tone="danger">{state.error}</Banner>}
        {state.ok && state.message && (
          <Banner tone="success">{state.message}</Banner>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Two-wheeler rate (₹/km)</label>
            <Input
              type="number"
              name="twoWheelerRatePerKm"
              min="0"
              step="0.5"
              defaultValue={policy?.two_wheeler_rate_per_km ?? 0}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Four-wheeler rate (₹/km)</label>
            <Input
              type="number"
              name="fourWheelerRatePerKm"
              min="0"
              step="0.5"
              defaultValue={policy?.four_wheeler_rate_per_km ?? 0}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Daily food limit (₹)</label>
            <Input
              type="number"
              name="foodDailyLimit"
              min="0"
              step="50"
              defaultValue={policy?.food_daily_limit ?? ""}
              placeholder="No cap"
            />
            <p className="mt-1 text-xs text-gray-400">
              Leave blank for no cap. Personal food above this is approved only
              up to the limit.
            </p>
          </div>
          <div>
            <label className={labelCls}>Submission window (days)</label>
            <Input
              type="number"
              name="submissionWindowDays"
              min="1"
              step="1"
              defaultValue={policy?.submission_window_days ?? 30}
              required
            />
            <p className="mt-1 text-xs text-gray-400">
              Bills older than this many days cannot be submitted in the app.
            </p>
          </div>
        </div>
        <SaveButton />
      </form>
    </Card>
  );
}
