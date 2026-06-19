"use client";

import { useActionState, useState } from "react";
import { KeyRound, RefreshCw } from "lucide-react";
import { Banner, Button, Card, Input } from "@/components/ui";
import {
  resendInvite,
  resetEmployeePassword,
  type ActionState,
} from "@/actions/employees";
import type { DerivedStatus } from "@/lib/data/employee-model";

const initial: ActionState = { ok: false };

function randomPassword(): string {
  // Readable temp password: two short blocks + digits. Admin shares it once.
  const chunk = () => Math.random().toString(36).slice(2, 6);
  return `Ty-${chunk()}-${chunk()}`;
}

export function AccountActions({
  employeeId,
  status,
}: {
  employeeId: string;
  status: DerivedStatus;
}) {
  const [pwState, pwAction, pwPending] = useActionState(
    resetEmployeePassword,
    initial
  );
  const [inviteState, inviteAction, invitePending] = useActionState(
    resendInvite,
    initial
  );
  const [pw, setPw] = useState("");

  const inviteUrl =
    inviteState.invitePath && typeof window !== "undefined"
      ? `${window.location.origin}${inviteState.invitePath}`
      : null;

  return (
    <Card className="p-6">
      <h2 className="font-display text-lg font-bold text-ink">Account</h2>
      <p className="mt-1 text-sm text-gray-500">
        Login and onboarding controls. Share credentials securely.
      </p>

      {/* Reset password */}
      <form action={pwAction} className="mt-5 space-y-3">
        <input type="hidden" name="id" value={employeeId} />
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <KeyRound className="h-4 w-4 text-brand" /> Reset password
        </div>
        {pwState.error && <Banner tone="warning">{pwState.error}</Banner>}
        {pwState.ok && <Banner tone="success">{pwState.message}</Banner>}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            name="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            minLength={8}
            required
            placeholder="Temporary password (min 8 chars)"
            className="max-w-xs"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPw(randomPassword())}
          >
            Generate
          </Button>
          <Button type="submit" disabled={pwPending}>
            {pwPending ? "Resetting…" : "Set password"}
          </Button>
        </div>
      </form>

      {/* Resend invite (only useful before the employee has onboarded) */}
      {status === "pending" && (
        <form action={inviteAction} className="mt-6 space-y-3 border-t border-gray-100 pt-5">
          <input type="hidden" name="id" value={employeeId} />
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <RefreshCw className="h-4 w-4 text-brand" /> Resend invite link
          </div>
          {inviteState.error && <Banner tone="warning">{inviteState.error}</Banner>}
          {inviteState.ok && inviteUrl && (
            <Banner tone="success">
              <div className="space-y-2">
                <div>{inviteState.message}</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-white/60 px-2 py-1 font-mono text-xs">
                    {inviteUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(inviteUrl)}
                    className="shrink-0 font-semibold underline"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </Banner>
          )}
          <Button type="submit" variant="secondary" disabled={invitePending}>
            {invitePending ? "Generating…" : "Generate new invite link"}
          </Button>
        </form>
      )}
    </Card>
  );
}
