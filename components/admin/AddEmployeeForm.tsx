"use client";

import { useActionState, useState } from "react";
import { Button, Banner } from "@/components/ui";
import { EmployeeForm, type TeamOption } from "@/components/admin/EmployeeForm";
import { createInviteLink, type ActionState } from "@/actions/employees";
import type { Department, Location, Shift } from "@/lib/types";

const initial: ActionState = { ok: false };

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

export function AddEmployeeForm({
  departments,
  locations,
  shifts,
  teams,
}: {
  departments: Department[];
  locations: Location[];
  shifts: Shift[];
  teams: TeamOption[];
}) {
  const [mode, setMode] = useState<"direct" | "invite">("direct");

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {(["direct", "invite"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={[
              "flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors",
              mode === m ? "bg-white text-ink shadow-sm" : "text-gray-500 hover:text-ink",
            ].join(" ")}
          >
            {m === "direct" ? "Create account" : "Invite link"}
          </button>
        ))}
      </div>

      {mode === "direct" ? (
        <EmployeeForm
          mode="create"
          departments={departments}
          locations={locations}
          shifts={shifts}
          teams={teams}
        />
      ) : (
        <InviteForm departments={departments} locations={locations} />
      )}
    </div>
  );
}

function InviteForm({
  departments,
  locations,
}: {
  departments: Department[];
  locations: Location[];
}) {
  const [state, action, pending] = useActionState(createInviteLink, initial);
  const inviteUrl =
    state.invitePath && typeof window !== "undefined"
      ? `${window.location.origin}${state.invitePath}`
      : null;

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-gray-500">
        Generates a self-onboarding link. The employee sets their own password
        and profile; you approve them when they appear as “Pending”.
      </p>

      {state.error && <Banner tone="warning">{state.error}</Banner>}
      {state.ok && inviteUrl && (
        <Banner tone="success">
          <div className="space-y-2">
            <div>{state.message}</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-white/60 px-2 py-1 font-mono text-xs">
                {inviteUrl}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(inviteUrl)}
                className="shrink-0 font-semibold underline"
              >
                Copy
              </button>
            </div>
          </div>
        </Banner>
      )}

      <Field label="Link valid for">
        <select name="expires_days" className={selectCls} defaultValue="7">
          <option value="1">1 day</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Department">
          <select name="department_id" className={selectCls} defaultValue="">
            <option value="">— None —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Location">
          <select name="location_id" className={selectCls} defaultValue="">
            <option value="">— None —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Generating…" : "Generate invite link"}
      </Button>
    </form>
  );
}
