"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Banner, Button, Input, Textarea } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import {
  approveRegularizationRequest,
  rejectRegularizationRequest,
} from "@/actions/regularization-requests";

const WORK_TYPES = [
  { value: "office", label: "Office" },
  { value: "wfh", label: "WFH" },
  { value: "client_visit", label: "Client visit" },
  { value: "event", label: "Event" },
];

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

// Approve opens an inline form prefilled with the requested times (the
// reviewer may adjust them); Reject requires a comment. Both post to server
// actions that let RLS decide whether this reviewer may act on the row.
export function ReviewRequestButtons({
  id,
  requestedIn,
  requestedOut,
  recordedIn,
  recordedOut,
  workType,
}: {
  id: string;
  requestedIn: string | null;
  requestedOut: string | null;
  recordedIn: string | null;
  recordedOut: string | null;
  workType: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [approveState, approveAction, approvePending] = useActionState(
    approveRegularizationRequest,
    idleState
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectRegularizationRequest,
    idleState
  );

  useEffect(() => {
    if (approveState.ok || rejectState.ok) {
      setMode("idle");
      router.refresh();
    }
  }, [approveState.ok, rejectState.ok, router]);

  const error = mode === "approve" ? approveState.error : mode === "reject" ? rejectState.error : null;

  if (mode === "idle") {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("reject")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:border-ink"
        >
          <X className="h-4 w-4" /> Reject
        </button>
        <button
          type="button"
          onClick={() => setMode("approve")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg shadow-sm hover:bg-brand-hover"
        >
          <Check className="h-4 w-4" /> Approve
        </button>
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg border border-gray-200 bg-gray-50 p-4">
      {error && (
        <div className="mb-3">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}
      {mode === "approve" ? (
        <form action={approveAction} className="space-y-3">
          <input type="hidden" name="id" value={id} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Punch in</label>
              <Input
                type="time"
                name="correctedIn"
                defaultValue={requestedIn ?? recordedIn ?? ""}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Punch out</label>
              <Input
                type="time"
                name="correctedOut"
                defaultValue={requestedOut ?? recordedOut ?? ""}
              />
            </div>
            <div>
              <label className={labelCls}>Work type</label>
              <select name="workType" className={selectCls} defaultValue={workType}>
                {WORK_TYPES.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Comment (optional)</label>
            <Input name="adminComment" placeholder="Shown to the employee" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setMode("idle")}>
              Cancel
            </Button>
            <Button type="submit" disabled={approvePending}>
              {approvePending ? "Applying…" : "Approve & correct"}
            </Button>
          </div>
        </form>
      ) : (
        <form action={rejectAction} className="space-y-3">
          <input type="hidden" name="id" value={id} />
          <div>
            <label className={labelCls}>Why is this declined?</label>
            <Textarea name="adminComment" rows={2} required placeholder="Shown to the employee" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setMode("idle")}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={rejectPending}>
              {rejectPending ? "Rejecting…" : "Reject"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
