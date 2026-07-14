"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Banner, Button, Card, Input } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { updateReminders } from "@/actions/reminders";
import type { RemindersConfig } from "@/lib/types";

const labelCls =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save reminders"}
    </Button>
  );
}

function ToggleHeader({
  name,
  defaultChecked,
  label,
  description,
}: {
  name: string;
  defaultChecked: boolean;
  label: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 accent-brand"
      />
      <span>
        <span className="text-sm font-semibold text-ink">{label}</span>
        <span className="block text-xs text-gray-500">{description}</span>
      </span>
    </label>
  );
}

function NumField({
  name,
  label,
  defaultValue,
  min,
  max,
}: {
  name: string;
  label: string;
  defaultValue: number;
  min: number;
  max: number;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <Input type="number" name={name} defaultValue={defaultValue} min={min} max={max} />
    </div>
  );
}

// Configures the automated employee reminders dispatched server-side by
// clock_bays (pg_cron): punch-in/punch-out nags and random WFH / client-visit
// presence checks. Saved to organizations.settings.reminders — the SQL
// dispatchers read it directly, so changes take effect on their next run
// (checks already scheduled for today still fire).
export function RemindersSection({ reminders }: { reminders: RemindersConfig }) {
  const [state, action] = useActionState(updateReminders, idleState);
  return (
    <form action={action} className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold text-ink">
          Automated reminders
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Server-side nudges sent as notifications (portal bell, mobile app, web
          push). Times follow each employee&apos;s shift in IST; punch reminders
          skip Sundays, holidays, and approved leave.
        </p>
      </div>

      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.ok && state.message && <Banner tone="success">{state.message}</Banner>}

      <Card className="space-y-4 p-5">
        <ToggleHeader
          name="punchInEnabled"
          defaultChecked={reminders.punchIn.enabled}
          label="Punch-in reminder"
          description="Nag employees who haven't punched in after their shift starts. Skipped on client-visit days."
        />
        <div className="grid grid-cols-3 gap-3 pl-7">
          <NumField
            name="punchInGraceMin"
            label="Grace (min)"
            defaultValue={reminders.punchIn.graceMin}
            min={0}
            max={240}
          />
          <NumField
            name="punchInRepeat"
            label="Max reminders"
            defaultValue={reminders.punchIn.repeat}
            min={1}
            max={10}
          />
          <NumField
            name="punchInIntervalMin"
            label="Every (min)"
            defaultValue={reminders.punchIn.intervalMin}
            min={5}
            max={120}
          />
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <ToggleHeader
          name="punchOutEnabled"
          defaultChecked={reminders.punchOut.enabled}
          label="Punch-out reminder"
          description="Nag employees who still have an open session after their shift ends. Night shifts are skipped."
        />
        <div className="grid grid-cols-3 gap-3 pl-7">
          <NumField
            name="punchOutDelayMin"
            label="Delay (min)"
            defaultValue={reminders.punchOut.delayMin}
            min={0}
            max={240}
          />
          <NumField
            name="punchOutRepeat"
            label="Max reminders"
            defaultValue={reminders.punchOut.repeat}
            min={1}
            max={10}
          />
          <NumField
            name="punchOutIntervalMin"
            label="Every (min)"
            defaultValue={reminders.punchOut.intervalMin}
            min={5}
            max={120}
          />
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <ToggleHeader
          name="wfhEnabled"
          defaultChecked={reminders.wfhChecks.enabled}
          label="WFH presence checks"
          description="Random are-you-working checks during the shift for employees punched in as WFH. Employees acknowledge from the notification; GPS is logged when location is on."
        />
        <div className="grid grid-cols-2 gap-3 pl-7 sm:grid-cols-3">
          <NumField
            name="wfhMinPerDay"
            label="Min per day"
            defaultValue={reminders.wfhChecks.minPerDay}
            min={1}
            max={6}
          />
          <NumField
            name="wfhMaxPerDay"
            label="Max per day"
            defaultValue={reminders.wfhChecks.maxPerDay}
            min={1}
            max={6}
          />
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <ToggleHeader
          name="visitEnabled"
          defaultChecked={reminders.visitChecks.enabled}
          label="Client-visit presence checks"
          description="Same random checks on visit days, starting from the first client check-in. One check set per employee per day (visit or WFH, whichever starts first)."
        />
        <div className="grid grid-cols-2 gap-3 pl-7 sm:grid-cols-3">
          <NumField
            name="visitMinPerDay"
            label="Min per day"
            defaultValue={reminders.visitChecks.minPerDay}
            min={1}
            max={6}
          />
          <NumField
            name="visitMaxPerDay"
            label="Max per day"
            defaultValue={reminders.visitChecks.maxPerDay}
            min={1}
            max={6}
          />
        </div>
      </Card>

      <SaveButton />
    </form>
  );
}
