"use client";

import { cancelMyLeave } from "@/actions/employee-leave";

// Plain server-action form with a confirm guard. Progressive-enhancement
// friendly: works without JS, confirms when JS is available.
export function CancelLeaveButton({ id }: { id: string }) {
  return (
    <form
      action={cancelMyLeave}
      onSubmit={(e) => {
        if (!confirm("Cancel this leave request? This cannot be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-danger-deep transition-colors hover:bg-danger-soft"
      >
        Cancel
      </button>
    </form>
  );
}
