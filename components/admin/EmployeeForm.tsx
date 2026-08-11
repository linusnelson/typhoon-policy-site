"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Banner, Input } from "@/components/ui";
import {
  createEmployeeDirect,
  updateEmployee,
  type ActionState,
} from "@/actions/employees";
import type { EmployeeRow } from "@/lib/data/employee-model";
import type { Department, Location, Shift } from "@/lib/types";

export interface TeamOption {
  id: string;
  name: string;
  department_id: string;
  is_active: boolean;
}

const initial: ActionState = { ok: false };

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-brand">
      {children}
    </p>
  );
}

export function EmployeeForm({
  mode,
  employee,
  departments,
  locations,
  shifts,
  teams,
}: {
  mode: "create" | "edit";
  employee?: EmployeeRow;
  departments: Department[];
  locations: Location[];
  shifts: Shift[];
  teams: TeamOption[];
}) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [state, action, pending] = useActionState(
    isEdit ? updateEmployee : createEmployeeDirect,
    initial
  );

  // Team list is scoped to the chosen department, mirroring ClockBays.
  const [departmentId, setDepartmentId] = useState(
    employee?.department_id ?? ""
  );
  const teamOptions = teams.filter(
    (t) => t.is_active && (!departmentId || t.department_id === departmentId)
  );

  return (
    <form action={action} className="space-y-6">
      {isEdit && <input type="hidden" name="id" value={employee!.id} />}

      {!isEdit && (
        <p className="text-sm text-gray-500">
          Provisions a login immediately. The employee signs in with the
          temporary password and can change it later.
        </p>
      )}

      {state.error && <Banner tone="warning">{state.error}</Banner>}
      {state.ok && (
        <Banner tone="success">
          {state.message}{" "}
          <button
            type="button"
            onClick={() =>
              router.push(
                isEdit
                  ? `/admin/employees/${employee!.id}`
                  : "/admin/employees"
              )
            }
            className="font-semibold underline"
          >
            {isEdit ? "Back to profile" : "Back to list"}
          </button>
        </Banner>
      )}

      {/* ── Personal ───────────────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionLabel>Personal info</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input
              name="name"
              required
              defaultValue={employee?.name ?? ""}
              placeholder="Asha Menon"
            />
          </Field>
          <Field
            label="Email"
            hint={
              isEdit
                ? "Changing this also moves the employee's login email."
                : undefined
            }
          >
            <Input
              name="email"
              type="email"
              required
              defaultValue={employee?.email ?? ""}
              placeholder="asha@typhoonelec.com"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {!isEdit ? (
            <Field label="Temporary password" hint="At least 8 characters.">
              <Input name="password" type="text" required minLength={8} />
            </Field>
          ) : (
            <Field label="Employee code">
              <Input
                value={employee?.employee_code ?? ""}
                disabled
                className="opacity-60"
              />
            </Field>
          )}
          <Field label="Role">
            <select
              name="role"
              className={selectCls}
              defaultValue={employee?.role ?? "employee"}
            >
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
        </div>

        {/* Login-only accounts: no payslip, no punch nags, not counted as staff. */}
        <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <input
            type="checkbox"
            name="is_service_account"
            value="true"
            defaultChecked={employee?.is_service_account ?? false}
            className="mt-0.5 h-4 w-4 accent-brand"
          />
          <span className="text-sm text-ink">
            Service account
            <span className="mt-0.5 block text-xs text-gray-400">
              A login-only account, not a member of staff. Excluded from the
              payslip run and from punch-in/punch-out reminders. Still receives
              admin notifications.
            </span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Designation">
            <Input
              name="designation"
              defaultValue={employee?.designation ?? ""}
              placeholder="Field Technician"
            />
          </Field>
          <Field label="Phone">
            <Input
              name="phone"
              defaultValue={employee?.phone ?? ""}
              placeholder="+91…"
            />
          </Field>
        </div>

        {!isEdit && (
          <Field
            label="Employee code"
            hint="Leave blank to auto-generate (EMP###)."
          >
            <Input name="employee_code" placeholder="Auto-generated if blank" />
          </Field>
        )}
      </div>

      {/* ── Assignment ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionLabel>Role & assignment</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Department">
            <select
              name="department_id"
              className={selectCls}
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">— None —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Location">
            <select
              name="location_id"
              className={selectCls}
              defaultValue={employee?.location_id ?? ""}
            >
              <option value="">— None —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Shift">
            <select
              name="shift_id"
              className={selectCls}
              defaultValue={employee?.shift_id ?? ""}
            >
              <option value="">— None —</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Team">
            {/* key forces a remount when department changes so the default
                clears if the current team no longer belongs to the dept. */}
            <select
              key={departmentId}
              name="team_id"
              className={selectCls}
              defaultValue={
                teamOptions.some((t) => t.id === employee?.team_id)
                  ? employee?.team_id ?? ""
                  : ""
              }
            >
              <option value="">— None —</option>
              {teamOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date of joining">
            <Input
              name="date_of_joining"
              type="date"
              defaultValue={employee?.date_of_joining ?? ""}
            />
          </Field>
          <Field
            label="Relieving date"
            hint="Last working day — access is cut from the next day"
          >
            <Input
              name="relieving_date"
              type="date"
              defaultValue={employee?.relieving_date ?? ""}
            />
          </Field>
        </div>
      </div>

      {/* ── Contact & emergency ────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionLabel>Contact & emergency</SectionLabel>
        <Field label="Address">
          <Input name="address" defaultValue={employee?.address ?? ""} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Emergency contact name">
            <Input
              name="emergency_contact_name"
              defaultValue={employee?.emergency_contact_name ?? ""}
            />
          </Field>
          <Field label="Emergency contact phone">
            <Input
              name="emergency_contact_phone"
              defaultValue={employee?.emergency_contact_phone ?? ""}
            />
          </Field>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending
          ? isEdit
            ? "Saving…"
            : "Creating…"
          : isEdit
            ? "Save changes"
            : "Create employee"}
      </Button>
    </form>
  );
}
