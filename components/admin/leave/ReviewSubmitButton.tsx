"use client";

import { useFormStatus } from "react-dom";
import { Check, Loader2, X } from "lucide-react";

// Approve / Reject submit button for the leave register. Disabled while the
// server action runs so an impatient second click can't re-submit — the
// server also ignores repeat reviews, this just stops the extra requests.
export function ReviewSubmitButton({ kind }: { kind: "approve" | "reject" }) {
  const { pending } = useFormStatus();
  const approve = kind === "approve";
  const Icon = pending ? Loader2 : approve ? Check : X;
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        approve
          ? "inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg shadow-sm hover:bg-brand-hover disabled:opacity-60"
          : "inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:border-ink disabled:opacity-60"
      }
    >
      <Icon className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
      {approve ? (pending ? "Approving…" : "Approve") : pending ? "Rejecting…" : "Reject"}
    </button>
  );
}
