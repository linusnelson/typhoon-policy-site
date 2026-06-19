"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Banner, Button, Input } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { registerViaInvite } from "@/actions/invite";

const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Creating account…" : "Create account"}
    </Button>
  );
}

export function InviteRegisterForm({
  token,
  orgId,
}: {
  token: string;
  orgId: string;
}) {
  const [state, action] = useActionState(registerViaInvite, idleState);
  return (
    <form action={action} className="space-y-4">
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="orgId" value={orgId} />

      <div>
        <label className={labelCls}>Full name</label>
        <Input name="name" required placeholder="Your full name" />
      </div>
      <div>
        <label className={labelCls}>Email</label>
        <Input type="email" name="email" required placeholder="you@company.com" />
      </div>
      <div>
        <label className={labelCls}>Password</label>
        <Input type="password" name="password" required placeholder="At least 8 characters" />
      </div>
      <div>
        <label className={labelCls}>Phone</label>
        <Input type="tel" name="phone" placeholder="Contact number" />
      </div>
      <div>
        <label className={labelCls}>Employee code (optional)</label>
        <Input name="employeeCode" placeholder="Leave blank to auto-assign" />
      </div>

      <SubmitButton />
      <p className="text-center text-xs text-gray-400">
        Your account needs admin approval before you can sign in.
      </p>
    </form>
  );
}
