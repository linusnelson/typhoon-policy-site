"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Banner, Button, Input } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { updateMyPhone } from "@/actions/profile";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

export function PhoneForm({ phone }: { phone: string | null }) {
  const [state, action] = useActionState(updateMyPhone, idleState);
  return (
    <form action={action} className="space-y-3">
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.ok && state.message && <Banner tone="success">{state.message}</Banner>}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">
            Phone
          </label>
          <Input
            name="phone"
            type="tel"
            defaultValue={phone ?? ""}
            placeholder="Your contact number"
          />
        </div>
        <SaveButton />
      </div>
    </form>
  );
}
