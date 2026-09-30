"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Info } from "lucide-react";
import { Banner, Button, Card, Input, Textarea } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { requestRegularization } from "@/actions/regularization-requests";
import {
  MAX_BACKDATE_DAYS,
  validateRegularizationRequest,
} from "@/lib/engine/regularization-request";
import type { DayPunchContext } from "@/lib/data/regularization-requests";

const WORK_TYPES = [
  { value: "office", label: "Office" },
  { value: "wfh", label: "WFH" },
  { value: "client_visit", label: "Client visit" },
  { value: "event", label: "Event" },
];

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

function shiftDate(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function SubmitButton({ blocked }: { blocked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || blocked}>
      {pending ? "Submitting…" : "Submit request"}
    </Button>
  );
}

// `recorded` is what the server currently holds for the initially selected
// date. Changing the date reloads the page (server component re-renders the
// context) so the "currently recorded" line stays honest.
export function RequestRegularizationForm({
  date,
  today,
  recorded,
  joiningDate,
}: {
  date: string;
  today: string;
  recorded: DayPunchContext;
  joiningDate: string | null;
}) {
  const [state, action] = useActionState(requestRegularization, idleState);
  const [requestedIn, setIn] = useState(recorded.punchIn ?? "");
  const [requestedOut, setOut] = useState(recorded.punchOut ?? "");
  const [reason, setReason] = useState("");

  const hint = validateRegularizationRequest({
    today,
    punchDate: date,
    requestedIn: requestedIn || null,
    requestedOut: requestedOut || null,
    reason: reason || "x", // reason is checked by `required`, not here
    joiningDate,
  });
  const minDate = shiftDate(today, -MAX_BACKDATE_DAYS);
  const blocked = recorded.onFullDayLeave || (hint !== null && !hint.includes("reason"));

  return (
    <Card className="p-5">
      {state.error && <Banner tone="danger">{state.error}</Banner>}

      <form action={action} className="space-y-4">
        <div>
          <label className={labelCls}>Date</label>
          <Input
            type="date"
            name="punchDate"
            defaultValue={date}
            min={minDate}
            max={today}
            required
            onChange={(e) => {
              if (e.target.value) {
                window.location.href = `/attendance/regularization/new?date=${e.target.value}`;
              }
            }}
          />
          <p className="mt-1 text-xs text-gray-400">
            Up to {MAX_BACKDATE_DAYS} days back. Older corrections go through HR.
          </p>
        </div>

        <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0 text-gray-400" />
            <span>
              Currently recorded:{" "}
              <span className="font-mono">
                {recorded.punchIn ?? "—"} – {recorded.punchOut ?? "…"}
              </span>
              {recorded.workType ? ` · ${recorded.workType.replace(/_/g, " ")}` : ""}
              {recorded.holidayName ? ` · ${recorded.holidayName} (holiday)` : ""}
            </span>
          </div>
          {recorded.onFullDayLeave && (
            <p className="mt-2 text-danger-deep">
              This day is on {recorded.leaveCode ?? ""} leave. Cancel the leave first if you
              actually worked.
            </p>
          )}
          {date === today && !recorded.punchOut && recorded.punchIn && (
            <p className="mt-2 text-warning-deep">
              Today&apos;s punch-out can still be recorded from the app — only request a
              correction if that is not possible.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Punch in</label>
            <Input
              type="time"
              name="requestedIn"
              value={requestedIn}
              onChange={(e) => setIn(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Punch out</label>
            <Input
              type="time"
              name="requestedOut"
              value={requestedOut}
              onChange={(e) => setOut(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Work type</label>
            <select
              name="workType"
              className={selectCls}
              defaultValue={recorded.workType ?? "office"}
            >
              {WORK_TYPES.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Fill only the time that is missing or wrong — leave the other as recorded.
        </p>

        <div>
          <label className={labelCls}>Reason</label>
          <Textarea
            name="reason"
            rows={3}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Forgot to punch out after the client call"
          />
        </div>

        {hint && !hint.includes("reason") && <Banner tone="warning">{hint}</Banner>}

        <div className="flex justify-end">
          <SubmitButton blocked={blocked} />
        </div>
      </form>
    </Card>
  );
}
