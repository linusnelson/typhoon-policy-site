"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Banner, Button, Card, Input } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { upsertAdvancePolicy, deleteAdvancePolicy } from "@/actions/advances";
import { formatINR } from "@/lib/format";
import type { AdvancePolicy, Department } from "@/lib/types";

type PolicyRow = AdvancePolicy & { departmentName: string | null };

const labelCls =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";
const selectCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save policy"}
    </Button>
  );
}

export function AdvancePolicyManager({
  policies,
  departments,
}: {
  policies: PolicyRow[];
  departments: Department[];
}) {
  const [editing, setEditing] = useState<PolicyRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [state, action] = useActionState(upsertAdvancePolicy, idleState);

  const open = showForm || editing !== null;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-base font-bold text-ink">Policies</h2>
        {!open && (
          <Button
            variant="secondary"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add policy
          </Button>
        )}
      </div>

      {/* Existing policies */}
      {policies.length === 0 && !open && (
        <p className="py-4 text-center text-sm text-gray-400">
          No loans &amp; advances policy yet — employees can&apos;t request one
          until a policy exists.
        </p>
      )}
      <div className="space-y-2">
        {policies.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-ink">
                {p.departmentName ?? "Org default"}
              </span>
              {!p.is_active && <Badge tone="neutral">Inactive</Badge>}
              <span className="text-gray-500">
                {[
                  p.repayment_percent_of_salary !== null &&
                    `EMI ≤${p.repayment_percent_of_salary}% of net`,
                  `≤${p.max_installments} months`,
                  p.max_amount_flat !== null && `cap ${formatINR(p.max_amount_flat)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setEditing(p);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <form action={deleteAdvancePolicy}>
                <input type="hidden" name="id" value={p.id} />
                <Button variant="ghost" type="submit">
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </form>
            </div>
          </div>
        ))}
      </div>

      {/* Create/edit form */}
      {open && (
        <form
          key={editing?.id ?? "new"}
          action={action}
          className="mt-4 space-y-4 rounded-lg border border-gray-200 bg-gray-50/50 p-4"
        >
          {state.error && <Banner tone="danger">{state.error}</Banner>}
          {state.ok && state.message && (
            <Banner tone="success">{state.message}</Banner>
          )}
          {editing && <input type="hidden" name="id" value={editing.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Applies to</label>
              <select
                name="departmentId"
                className={selectCls}
                defaultValue={editing?.department_id ?? ""}
              >
                <option value="">Whole organization (default)</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>
                Max EMI as % of (salary − existing EMIs)
              </label>
              <Input
                type="number"
                name="repaymentPercentOfSalary"
                min={1}
                max={100}
                defaultValue={editing?.repayment_percent_of_salary ?? 50}
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Drives eligibility. Indian law caps total wage deductions at 50%.
              </p>
            </div>
            <div>
              <label className={labelCls}>Max repayment months</label>
              <Input
                type="number"
                name="maxInstallments"
                min={1}
                defaultValue={editing?.max_installments ?? 12}
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Employees choose any tenure up to this.
              </p>
            </div>
            <div>
              <label className={labelCls}>Max amount (₹, optional)</label>
              <Input
                type="number"
                name="maxAmountFlat"
                min={1}
                defaultValue={editing?.max_amount_flat ?? ""}
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Hard ceiling on top of the EMI-capacity limit. Blank = capacity
                × months decides.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={editing?.is_active ?? true}
                className="h-4 w-4 accent-brand"
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                name="requiresReason"
                defaultChecked={editing?.requires_reason ?? true}
                className="h-4 w-4 accent-brand"
              />
              Reason required
            </label>
          </div>

          <div className="flex items-center gap-2">
            <SaveButton />
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setShowForm(false);
              }}
            >
              Close
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
