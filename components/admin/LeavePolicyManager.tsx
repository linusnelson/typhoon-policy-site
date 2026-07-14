"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { Badge, Banner, Button, Card, Input } from "@/components/ui";
import {
  saveLeavePolicy,
  createLeaveType,
} from "@/actions/leave-policies";
import { idleState } from "@/lib/action-utils";
import type { LeaveTypePolicy } from "@/lib/data/leave-policies";

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";

function Num({
  name,
  label,
  defaultValue,
  step,
  min = 0,
}: {
  name: string;
  label: string;
  defaultValue: number;
  step?: string;
  min?: number;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink">{label}</span>
      <Input type="number" name={name} defaultValue={defaultValue} step={step} min={min} />
    </label>
  );
}

function Check({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-ink">
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 accent-brand"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-gray-500">{hint}</span>}
      </span>
    </label>
  );
}

export function LeavePolicyManager({ rows }: { rows: LeaveTypePolicy[] }) {
  // Which leave type is being edited (by type id), or "add" for the new-type form.
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("add")} disabled={editing === "add"}>
          <Plus className="h-4 w-4" /> Add leave type
        </Button>
      </div>

      {editing === "add" && (
        <Card className="p-5">
          <NewLeaveTypeForm onDone={() => setEditing(null)} />
        </Card>
      )}

      <div className="space-y-3">
        {rows.length === 0 && editing !== "add" && (
          <Card className="p-8 text-center text-sm text-gray-400">
            No leave types configured yet. Add one to start.
          </Card>
        )}
        {rows.map(({ type, policy }) =>
          editing === type.id ? (
            <Card key={type.id} className="p-5">
              <LeavePolicyForm
                typeId={type.id}
                typeCode={type.code}
                typeName={type.name}
                policy={policy}
                onDone={() => setEditing(null)}
              />
            </Card>
          ) : (
            <Card key={type.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                    {type.code}
                  </span>
                  <span className="font-display font-bold text-ink">{type.name}</span>
                </div>
                <button
                  onClick={() => setEditing(type.id)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-ink"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {policy ? "Edit" : "Configure"}
                </button>
              </div>

              {policy ? (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  {policy.is_unlimited ? (
                    <Badge tone="brand">Unlimited (exception basis)</Badge>
                  ) : (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
                      <Stat label="Accrual" value={`${policy.accrual_per_month}/mo`} />
                      <Stat label="Annual quota" value={`${policy.annual_quota}d`} />
                      <Stat label="Max carry-fwd" value={`${policy.max_carry_forward}d`} />
                      <Stat label="CF expires" value={`${policy.carry_forward_expiry_months}mo`} />
                      <Stat label="Min per request" value={`${policy.min_days_per_request}d`} />
                      <Stat label="Approval" value={policy.requires_approval ? "Required" : "Auto"} />
                    </dl>
                  )}
                  {policy.hide_from_employee && (
                    <div className="mt-2">
                      <Badge tone="warning">Hidden from employees</Badge>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-400">Not configured</p>
              )}
            </Card>
          )
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}

function NewLeaveTypeForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(createLeaveType, idleState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="space-y-4">
      <div className="text-sm font-semibold text-ink">New leave type</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr]">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">Code</span>
          <Input name="code" placeholder="e.g. CL" maxLength={8} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">Name</span>
          <Input name="name" placeholder="e.g. Casual Leave" required />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create type"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {state.error && <Banner tone="warning">{state.error}</Banner>}
    </form>
  );
}

function LeavePolicyForm({
  typeId,
  typeCode,
  typeName,
  policy,
  onDone,
}: {
  typeId: string;
  typeCode: string;
  typeName: string;
  policy: LeaveTypePolicy["policy"];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveLeavePolicy, idleState);
  const [isUnlimited, setIsUnlimited] = useState(policy?.is_unlimited ?? false);
  const [accrualType, setAccrualType] = useState(policy?.accrual_type ?? "monthly");
  const [effectiveDate, setEffectiveDate] = useState("");

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="leave_type_id" value={typeId} />
      <div className="text-sm font-semibold text-ink">
        {typeName} ({typeCode}) policy
      </div>

      {/* Controlled so accrual fields hide immediately; still submits its value
          because a checked controlled checkbox with a name is included in the form. */}
      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="is_unlimited"
          value="true"
          checked={isUnlimited}
          onChange={(e) => setIsUnlimited(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-brand"
        />
        <span>
          <span className="font-medium">Unlimited leave (exception basis)</span>
          <span className="block text-xs text-gray-500">
            No balance check — employee just needs approval
          </span>
        </span>
      </label>

      {!isUnlimited && (
        <div className="space-y-3 rounded-lg border border-gray-100 bg-gray-50/60 p-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink">Accrual type</span>
            <select
              name="accrual_type"
              className={selectCls}
              value={accrualType}
              onChange={(e) => setAccrualType(e.target.value)}
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly (one-time)</option>
              <option value="unlimited">No accrual (fixed quota)</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {accrualType === "monthly" && (
              <Num
                name="accrual_per_month"
                label="Accrual / month (days)"
                defaultValue={policy?.accrual_per_month ?? 0}
                step="0.05"
              />
            )}
            <Num name="annual_quota" label="Annual quota (days)" defaultValue={policy?.annual_quota ?? 0} />
            <Num name="max_carry_forward" label="Max carry-fwd (days)" defaultValue={policy?.max_carry_forward ?? 0} />
            <Num name="carry_forward_expiry_months" label="CF expires (months)" defaultValue={policy?.carry_forward_expiry_months ?? 3} />
            <Num name="min_days_per_request" label="Min per request (days)" defaultValue={policy?.min_days_per_request ?? 1} step="0.25" />
            <Num name="min_advance_days" label="Min advance notice (days)" defaultValue={policy?.min_advance_days ?? 0} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <Check name="requires_approval" label="Requires approval" defaultChecked={policy?.requires_approval ?? true} />
        <Check
          name="hide_from_employee"
          label="Hide from employees"
          hint="Employees cannot see or apply for this leave type"
          defaultChecked={policy?.hide_from_employee ?? false}
        />
        <Check name="sandwich_rule_enabled" label="Sandwich rule" hint="Count holidays/weekends between leave days" defaultChecked={policy?.sandwich_rule_enabled ?? true} />
        <Check name="allow_half_day" label="Allow half-day" defaultChecked={policy?.allow_half_day ?? true} />
        <Check name="allow_quarter_day" label="Allow quarter-day (2 hrs, medical)" defaultChecked={policy?.allow_quarter_day ?? false} />
      </div>

      {!isUnlimited && accrualType === "monthly" && (
        <div className="rounded-lg border border-gray-100 p-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink">Apply changes from (optional)</span>
            <Input
              type="date"
              name="effective_date"
              max={today}
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </label>
          {effectiveDate ? (
            <p className="mt-2 rounded-lg bg-brand/5 p-2.5 text-xs text-ink">
              Every active employee&rsquo;s {typeCode} balance will be recalculated
              as if the accrual had run each month since{" "}
              <span className="font-semibold">{effectiveDate}</span>, capped at the
              annual quota.
            </p>
          ) : (
            <p className="mt-1 text-xs text-gray-500">
              Leave blank to keep existing balances unchanged.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save policy"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {state.error && <Banner tone="warning">{state.error}</Banner>}
    </form>
  );
}
