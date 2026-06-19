"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Badge, Banner, Button, Card, Input } from "@/components/ui";
import { savePolicy, deletePolicy } from "@/actions/attendance-policies";
import { idleState } from "@/lib/action-utils";
import type { Department, LatePolicyAction } from "@/lib/types";
import type { PolicyRow } from "@/lib/data/policies";

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";

const ACTION_LABEL: Record<LatePolicyAction, string> = {
  flag_only: "Flag only",
  warning_system: "Warning system",
  deduct: "Deduct",
};

function Num({
  name,
  label,
  defaultValue,
  step,
}: {
  name: string;
  label: string;
  defaultValue: number;
  step?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink">{label}</span>
      <Input type="number" name={name} defaultValue={defaultValue} step={step} min={0} />
    </label>
  );
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input type="checkbox" name={name} value="true" defaultChecked={defaultChecked} className="h-4 w-4 accent-brand" />
      {label}
    </label>
  );
}

export function AttendancePolicyManager({
  rows,
  departments,
}: {
  rows: PolicyRow[];
  departments: Department[];
}) {
  const [editing, setEditing] = useState<string | null>(null);

  const addOptions = useMemo(() => {
    const hasOrgDefault = rows.some((r) => r.department_id === null);
    const used = new Set(rows.map((r) => r.department_id).filter(Boolean));
    const opts: { value: string; label: string }[] = [];
    if (!hasOrgDefault) opts.push({ value: "", label: "Org default (all departments)" });
    for (const d of departments) {
      if (!used.has(d.id)) opts.push({ value: d.id, label: d.name });
    }
    return opts;
  }, [rows, departments]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => setEditing("")}
          disabled={editing === "" || addOptions.length === 0}
        >
          <Plus className="h-4 w-4" /> Add policy
        </Button>
      </div>

      {editing === "" && (
        <Card className="p-5">
          <PolicyForm addOptions={addOptions} onDone={() => setEditing(null)} />
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {rows.length === 0 && editing !== "" && (
          <Card className="p-8 text-center text-sm text-gray-400 lg:col-span-2">
            No policies yet. Add an org default to start.
          </Card>
        )}
        {rows.map((p) =>
          editing === p.id ? (
            <Card key={p.id} className="p-5 lg:col-span-2">
              <PolicyForm policy={p} onDone={() => setEditing(null)} />
            </Card>
          ) : (
            <Card key={p.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-ink">
                    {p.department_id ? p.department_name : "Org default"}
                  </span>
                  {!p.department_id && <Badge tone="brand">Default</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(p.id)}
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-ink"
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {p.department_id && (
                    <form action={deletePolicy}>
                      <input type="hidden" name="department_id" value={p.department_id} />
                      <button
                        type="submit"
                        className="rounded-lg p-2 text-gray-400 hover:bg-danger-soft hover:text-danger-deep"
                        aria-label="Revert to default"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  )}
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <Stat label="Late after" value={`${p.late_threshold_min}m`} />
                <Stat label="Grace" value={`${p.grace_period_min}m`} />
                <Stat label="Half day ≥" value={`${p.half_day_min_hours}h`} />
                <Stat label="Full day ≥" value={`${p.full_day_min_hours}h`} />
                <Stat label="Late action" value={ACTION_LABEL[p.late_policy_action]} />
                <Stat label="Lates/absent" value={`${p.lates_per_absent}`} />
                <Stat label="WFH/month" value={`${p.wfh_days_per_month}`} />
                <Stat
                  label="Visit approval"
                  value={p.visit_requires_approval ? "Required" : "Auto"}
                />
              </dl>
            </Card>
          )
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

function PolicyForm({
  policy,
  addOptions,
  onDone,
}: {
  policy?: PolicyRow;
  addOptions?: { value: string; label: string }[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(savePolicy, idleState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="space-y-4">
      {/* Scope: editable on add, fixed on edit. */}
      {policy ? (
        <>
          {policy.department_id && (
            <input type="hidden" name="department_id" value={policy.department_id} />
          )}
          <div className="text-sm font-semibold text-ink">
            {policy.department_id ? policy.department_name : "Org default"}
          </div>
        </>
      ) : (
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">Applies to</span>
          <select name="department_id" className={selectCls} defaultValue={addOptions?.[0]?.value ?? ""}>
            {addOptions?.map((o) => (
              <option key={o.value || "org"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Num name="late_threshold_min" label="Late after (min)" defaultValue={policy?.late_threshold_min ?? 15} />
        <Num name="grace_period_min" label="Grace (min)" defaultValue={policy?.grace_period_min ?? 5} />
        <Num name="lates_per_absent" label="Lates per absent" defaultValue={policy?.lates_per_absent ?? 3} />
        <Num name="half_day_min_hours" label="Half-day ≥ (h)" defaultValue={policy?.half_day_min_hours ?? 4} step="0.5" />
        <Num name="full_day_min_hours" label="Full-day ≥ (h)" defaultValue={policy?.full_day_min_hours ?? 8} step="0.5" />
        <Num name="wfh_days_per_month" label="WFH days/month" defaultValue={policy?.wfh_days_per_month ?? 4} />
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-ink">Late policy action</span>
        <select name="late_policy_action" className={selectCls} defaultValue={policy?.late_policy_action ?? "flag_only"}>
          <option value="flag_only">Flag only</option>
          <option value="warning_system">Warning system</option>
          <option value="deduct">Deduct</option>
        </select>
      </label>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Check name="wfh_requires_approval" label="WFH requires approval" defaultChecked={policy?.wfh_requires_approval} />
        <Check name="visit_requires_approval" label="Visit requires approval" defaultChecked={policy?.visit_requires_approval ?? true} />
        <Check name="allow_qr_checkin" label="Allow QR check-in" defaultChecked={policy?.allow_qr_checkin ?? true} />
        <Check name="allow_gps_checkin" label="Allow GPS check-in" defaultChecked={policy?.allow_gps_checkin ?? true} />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save policy"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
      {state.error && <Banner tone="warning">{state.error}</Banner>}
    </form>
  );
}
