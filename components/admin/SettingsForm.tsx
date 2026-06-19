"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Banner, Button, Card, Input } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { updateOrgSettings } from "@/actions/settings";
import type { OrgSettings } from "@/lib/data/org";

const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save settings"}
    </Button>
  );
}

export function SettingsForm({ org }: { org: OrgSettings }) {
  const [state, action] = useActionState(updateOrgSettings, idleState);
  return (
    <Card className="p-5">
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.ok && state.message && <Banner tone="success">{state.message}</Banner>}
      <form action={action} className="mt-1 space-y-4">
        <div>
          <label className={labelCls}>Organization name</label>
          <Input name="name" defaultValue={org.name} required />
        </div>
        <div>
          <label className={labelCls}>Go-live date</label>
          <Input type="date" name="goLiveDate" defaultValue={org.goLiveDate ?? ""} />
          <p className="mt-1 text-xs text-gray-400">
            Attendance reports won&apos;t count absences before this date (or an
            employee&apos;s joining date, whichever is later). Leave blank to
            disable.
          </p>
        </div>
        <SaveButton />
      </form>
    </Card>
  );
}
