"use client";

import { adminCancelLeave } from "@/actions/leave";

// Admin cancel with a confirm guard — destructive and restores the balance.
export function CancelLeaveButton({ id }: { id: string }) {
  return (
    <form
      action={adminCancelLeave}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Cancel this leave? If it was approved, the balance will be restored and the employee notified."
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-danger-deep hover:border-danger hover:bg-danger-soft"
      >
        Cancel
      </button>
    </form>
  );
}
