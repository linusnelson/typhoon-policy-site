"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Banner, Button, Card, Input, Textarea } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { createEvent } from "@/actions/admin-events";
import type { EmployeeOption } from "@/lib/data/employees";
import type { EventTypeOption } from "@/lib/data/admin-events";

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

const WINDOWS = [
  { key: "morning_half", label: "Morning" },
  { key: "afternoon_half", label: "Afternoon" },
  { key: "full_day", label: "Full day" },
  { key: "custom", label: "Custom" },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create event"}
    </Button>
  );
}

export function EventCreateForm({
  eventTypes,
  departments,
  employees,
  today,
}: {
  eventTypes: EventTypeOption[];
  departments: { id: string; name: string }[];
  employees: EmployeeOption[];
  today: string;
}) {
  const [state, action] = useActionState(createEvent, idleState);
  const [timeWindow, setTimeWindow] = useState("full_day");

  return (
    <form action={action} className="space-y-5">
      {state.error && <Banner tone="danger">{state.error}</Banner>}

      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Event name</label>
            <Input name="name" required placeholder="Quarterly town hall" />
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <select name="eventTypeId" className={selectCls} defaultValue="">
              <option value="">— None —</option>
              {eventTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <Input type="date" name="eventDate" defaultValue={today} required />
          </div>
          <div>
            <label className={labelCls}>Location</label>
            <Input name="locationText" placeholder="Conference Room B" />
          </div>
        </div>

        <div>
          <label className={labelCls}>Time window</label>
          <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => setTimeWindow(w.key)}
                className={[
                  "rounded-md px-4 py-1.5 text-sm font-semibold transition-colors",
                  timeWindow === w.key ? "bg-white text-brand shadow-sm" : "text-gray-500 hover:text-ink",
                ].join(" ")}
              >
                {w.label}
              </button>
            ))}
          </div>
          <input type="hidden" name="timeWindow" value={timeWindow} />
        </div>

        {timeWindow === "custom" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Start</label>
              <Input type="time" name="startTime" defaultValue="09:00" />
            </div>
            <div>
              <label className={labelCls}>End</label>
              <Input type="time" name="endTime" defaultValue="18:00" />
            </div>
          </div>
        )}

        <div>
          <label className={labelCls}>Description</label>
          <Textarea name="description" rows={2} placeholder="What is this event about?" />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="isMandatory" value="true" defaultChecked className="h-4 w-4 rounded border-gray-300 text-brand" />
          Mandatory (everyone invited must attend)
        </label>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <label className={labelCls}>Invite departments</label>
          {departments.length === 0 ? (
            <p className="text-sm text-gray-400">No departments.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    name="departmentIds"
                    value={d.id}
                    className="h-4 w-4 rounded border-gray-300 text-brand"
                  />
                  {d.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className={labelCls}>Invite individuals</label>
          <select name="employeeIds" multiple className={`${selectCls} h-40`}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">
            Hold Ctrl/Cmd to select multiple. Combined with department invites.
          </p>
        </div>
      </Card>

      <SubmitButton />
    </form>
  );
}
