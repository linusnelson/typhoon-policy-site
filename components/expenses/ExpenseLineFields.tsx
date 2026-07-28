"use client";

import { Input, Textarea } from "@/components/ui";
import { BillPicker } from "@/components/expenses/BillPicker";
import { billRequired, capReimbursable, deriveAmount } from "@/lib/engine/expense";
import type { PreparedBill } from "@/lib/expenses/bill-upload";
import { formatINR } from "@/lib/format";
import {
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
  type ExpensePolicy,
  type ExpenseVehicleType,
} from "@/lib/types";

// One expense's fields, shared by the multi-line filing form and the single
// claim editor. Purely controlled — the parent owns the state and does the
// saving.

export interface ExpenseLineState {
  key: string; // React key; on the filing form this doubles as the claim id
  category: ExpenseCategory;
  vehicleType: ExpenseVehicleType;
  amount: string;
  distanceKm: string;
  billDate: string; // "YYYY-MM-DD"
  description: string;
  bills: PreparedBill[];
  coveredIds: string[]; // colleagues on the trip this bill also paid for
}

export function newLineState(key: string, billDate: string): ExpenseLineState {
  return {
    key,
    category: "travel",
    vehicleType: "two_wheeler",
    amount: "",
    distanceKm: "",
    billDate,
    description: "",
    bills: [],
    coveredIds: [],
  };
}

const labelCls =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

const CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];

// What this line is worth right now, or null while it is still incomplete.
export function linePreview(
  line: ExpenseLineState,
  policy: ExpensePolicy,
  foodUsedOnDate: number
): { amount: number; reimbursable: number; ratePerKm: number | null } | null {
  try {
    const derived = deriveAmount(
      {
        category: line.category,
        vehicleType: line.vehicleType,
        distanceKm: Number(line.distanceKm) || null,
        amount: Number(line.amount) || null,
        billDate: line.billDate,
        billCount: line.bills.length,
      },
      policy
    );
    return {
      ...derived,
      reimbursable: capReimbursable(
        line.category,
        derived.amount,
        foodUsedOnDate,
        policy.food_daily_limit,
        1 + line.coveredIds.length
      ),
    };
  } catch {
    return null;
  }
}

export function ExpenseLineFields({
  line,
  policy,
  today,
  foodUsedOnDate,
  companions = [],
  clashes = [],
  existingBillCount = 0,
  onChange,
  disabled = false,
}: {
  line: ExpenseLineState;
  policy: ExpensePolicy;
  today: string;
  // Food already committed on this bill date by OTHER claims (drafts included)
  // plus earlier lines in this batch. null while it is still being fetched.
  foodUsedOnDate: number | null;
  // The visit's other participants — the only people this bill may cover.
  companions?: Array<{ id: string; name: string }>;
  // Covered colleagues who also filed food of their own that day.
  clashes?: Array<{ id: string; name: string }>;
  existingBillCount?: number;
  onChange: (patch: Partial<ExpenseLineState>) => void;
  disabled?: boolean;
}) {
  const isVehicle = line.category === "own_vehicle";
  const preview = linePreview(line, policy, foodUsedOnDate ?? 0);
  const capped = preview !== null && preview.reimbursable < preview.amount;
  const minDate = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - policy.submission_window_days);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Category</label>
          <select
            value={line.category}
            disabled={disabled}
            onChange={(e) =>
              onChange({ category: e.target.value as ExpenseCategory })
            }
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Bill date</label>
          <Input
            type="date"
            value={line.billDate}
            min={minDate}
            max={today}
            disabled={disabled}
            onChange={(e) => onChange({ billDate: e.target.value })}
          />
          <p className="mt-1 text-xs text-gray-400">
            Bills older than {policy.submission_window_days} days can no longer
            be claimed.
          </p>
        </div>

        {isVehicle ? (
          <>
            <div>
              <label className={labelCls}>Vehicle</label>
              <select
                value={line.vehicleType}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ vehicleType: e.target.value as ExpenseVehicleType })
                }
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30"
              >
                <option value="two_wheeler">
                  Two-wheeler ({formatINR(policy.two_wheeler_rate_per_km)}/km)
                </option>
                <option value="four_wheeler">
                  Four-wheeler ({formatINR(policy.four_wheeler_rate_per_km)}/km)
                </option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Distance (km)</label>
              <Input
                type="number"
                min={0}
                step="0.1"
                inputMode="decimal"
                value={line.distanceKm}
                disabled={disabled}
                onChange={(e) => onChange({ distanceKm: e.target.value })}
                placeholder="e.g. 24.5"
              />
            </div>
          </>
        ) : (
          <div>
            <label className={labelCls}>Amount (₹)</label>
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={line.amount}
              disabled={disabled}
              onChange={(e) => onChange({ amount: e.target.value })}
              placeholder="Bill total"
            />
          </div>
        )}
      </div>

      <div>
        <label className={labelCls}>Description (optional)</label>
        <Textarea
          rows={2}
          value={line.description}
          disabled={disabled}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="What was this for?"
        />
      </div>

      <div>
        <label className={labelCls}>
          Bills{billRequired(line.category) ? "" : " (optional)"}
        </label>
        <BillPicker
          bills={line.bills}
          existingCount={existingBillCount}
          disabled={disabled}
          onChange={(bills) => onChange({ bills })}
        />
        {!billRequired(line.category) && (
          <p className="mt-1 text-xs text-gray-400">
            Own-vehicle claims are km-based — no bill needed.
          </p>
        )}
      </div>

      {companions.length > 0 && (
        <div>
          <label className={labelCls}>Did you pay for anyone else?</label>
          <div className="flex flex-wrap gap-2">
            {companions.map((c) => {
              const on = line.coveredIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      coveredIds: on
                        ? line.coveredIds.filter((id) => id !== c.id)
                        : [...line.coveredIds, c.id],
                    })
                  }
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    on
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-gray-300 bg-white text-gray-600 hover:border-ink"
                  }`}
                >
                  {on ? "✓ " : ""}
                  {c.name}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-gray-400">
            {line.category === "food" && policy.food_daily_limit !== null
              ? `Everyone you cover adds their own ${formatINR(policy.food_daily_limit)} daily limit to this bill — and uses it up for the day.`
              : "Only colleagues on this visit can be covered."}
          </p>
          {clashes.length > 0 && (
            <p className="mt-2 text-xs font-medium text-warning-deep">
              {clashes.map((c) => c.name).join(", ")} already claimed food on
              this date — check you are not both claiming the same meal.
            </p>
          )}
        </div>
      )}

      {preview && (
        <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">
              {isVehicle
                ? `${line.distanceKm || 0} km × ${formatINR(preview.ratePerKm ?? 0)}/km`
                : "Claimed"}
            </span>
            <span className="font-semibold text-ink">
              {formatINR(preview.amount)}
            </span>
          </div>
          {capped && (
            <div className="mt-1 flex items-center justify-between text-warning-deep">
              <span>
                Capped at the daily food limit
                {policy.food_daily_limit !== null &&
                  ` (${formatINR(policy.food_daily_limit * (1 + line.coveredIds.length))} for ${1 + line.coveredIds.length} ${
                    line.coveredIds.length ? "people" : "person"
                  }, ${formatINR(foodUsedOnDate ?? 0)} already claimed)`}
              </span>
              <span className="font-semibold">
                {formatINR(preview.reimbursable)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
