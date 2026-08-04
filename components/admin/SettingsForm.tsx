"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Banner, Button, Card, Input, Textarea } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { updateOrgSettings } from "@/actions/settings";
import type { OrgSettings } from "@/lib/data/org";
import type { ModuleKey } from "@/lib/types";

const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save settings"}
    </Button>
  );
}

const MODULE_META: Array<{
  key: ModuleKey;
  field: string;
  label: string;
  description: string;
  comingSoon?: boolean;
}> = [
  {
    key: "advances",
    field: "moduleAdvances",
    label: "Loans & advances",
    description:
      "Employees request company loans / salary advances; admin approves, disburses, and tracks EMI repayment.",
  },
  {
    key: "announcements",
    field: "moduleAnnouncements",
    label: "Announcements",
    description:
      "Company noticeboard: admin posts, everyone is notified; pins, expiry, read receipts, attachments.",
  },
  {
    key: "payslips",
    field: "modulePayslips",
    label: "Payslips",
    description:
      "Accounts users import a monthly payroll CSV to generate payslip PDFs (or upload PDFs directly); employees download their own from My Payslips.",
  },
  {
    key: "expenses",
    field: "moduleExpenses",
    label: "Expenses",
    description:
      "Employees upload bills against client visits from the app; accounts users approve and mark reimbursed here. Enables the Expenses tab in the mobile app.",
  },
];

export function SettingsForm({
  org,
  serviceAccounts,
}: {
  org: OrgSettings;
  serviceAccounts: Array<{ name: string; email: string }>;
}) {
  const [state, action] = useActionState(updateOrgSettings, idleState);
  return (
    <form action={action} className="space-y-6">
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.ok && state.message && <Banner tone="success">{state.message}</Banner>}

      <Card className="p-5">
        <h2 className="mb-4 font-display text-base font-bold text-ink">
          Organization
        </h2>
        <div className="space-y-4">
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
          <div>
            <label className={labelCls}>Company address</label>
            <Textarea
              name="companyAddress"
              rows={3}
              defaultValue={org.companyAddress}
              placeholder={"4th Floor, Door No. …, Chennai - 600 032, Tamil Nadu"}
            />
            <p className="mt-1 text-xs text-gray-400">
              Registered address printed in the header of generated payslips.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 font-display text-base font-bold text-ink">Modules</h2>
        <p className="mb-4 text-xs text-gray-400">
          Turn portal modules on or off. Disabled modules disappear from
          navigation and their pages return 404.
        </p>
        <div className="space-y-3">
          {MODULE_META.map((m) => (
            <label
              key={m.key}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                name={m.field}
                defaultChecked={org.modules[m.key]}
                disabled={m.comingSoon}
                className="mt-0.5 h-4 w-4 accent-brand"
              />
              <span>
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  {m.label}
                  {m.comingSoon && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                      Coming soon
                    </span>
                  )}
                </span>
                <span className="block text-xs text-gray-500">{m.description}</span>
              </span>
            </label>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 font-display text-base font-bold text-ink">
          Service accounts
        </h2>
        <p className="mb-3 text-xs text-gray-400">
          Login-only accounts. Excluded from payslips, punch reminders,
          attendance reports, headcount, the org chart and policy-signing
          compliance. They may still sign in (e.g. as an admin). Set with the
          &ldquo;Service account&rdquo; toggle on an employee&apos;s record.
        </p>
        {serviceAccounts.length === 0 ? (
          <p className="text-xs text-gray-400">None.</p>
        ) : (
          <ul className="space-y-1">
            {serviceAccounts.map((a) => (
              <li
                key={a.email}
                className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600"
              >
                <span className="font-medium text-ink">{a.name}</span>{" "}
                <span className="font-mono">{a.email}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SaveButton />
    </form>
  );
}
