"use client";

import { cancelRegularizationRequest } from "@/actions/regularization-requests";

export function CancelRegularizationButton({ id }: { id: string }) {
  return (
    <form
      action={cancelRegularizationRequest}
      onSubmit={(e) => {
        if (!confirm("Withdraw this correction request?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-danger-deep transition-colors hover:bg-danger-soft"
      >
        Withdraw
      </button>
    </form>
  );
}
