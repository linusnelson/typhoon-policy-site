import Link from "next/link";
import { notFound } from "next/navigation";
import { Settings2, Download } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import { listAdvances, listRepaymentsForMonth } from "@/lib/data/advances";
import { bulkMarkMonthPaid, markRepaymentPaid } from "@/actions/advances";
import { Badge, Button, Card } from "@/components/ui";
import { TabNav } from "@/components/ui/Tabs";
import {
  AdvanceStatusBadge,
  RepaymentStatusBadge,
} from "@/components/employee/AdvanceStatusBadge";
import { MonthPicker } from "@/components/admin/advances/MonthPicker";
import { formatINR, formatMonth } from "@/lib/format";
import { formatIstDate } from "@/lib/ist";
import { istToday } from "@/lib/ist";
import { monthStart } from "@/lib/engine/advance";
import type { AdvanceStatus } from "@/lib/types";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "repaying", label: "Repaying" },
  { key: "month", label: "Monthly deductions" },
  { key: "history", label: "History" },
];

const TAB_STATUSES: Record<string, AdvanceStatus[]> = {
  pending: ["pending", "approved"],
  repaying: ["repaying"],
  history: ["closed", "rejected", "cancelled"],
};

export default async function AdminAdvancesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string }>;
}) {
  const admin = await requireAdmin();
  if (!(await moduleEnabled(admin.org_id, "advances"))) notFound();

  const params = await searchParams;
  const tab = params.tab ?? "pending";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            Loans &amp; Advances
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Employee loans and salary advances — approval, disbursal, and
            repayment.
          </p>
        </div>
        <Link href="/admin/advances/policy">
          <Button variant="secondary">
            <Settings2 className="h-4 w-4" /> Policy
          </Button>
        </Link>
      </div>

      <TabNav tabs={TABS} />

      {tab === "month" ? (
        <MonthView monthParam={params.month} />
      ) : (
        <AdvanceList statuses={TAB_STATUSES[tab] ?? TAB_STATUSES.pending} />
      )}
    </div>
  );
}

async function AdvanceList({ statuses }: { statuses: AdvanceStatus[] }) {
  const rows = await listAdvances(statuses);

  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-gray-400">
        No loans or advances here.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Link key={r.id} href={`/admin/advances/${r.id}`} className="block">
          <Card className="p-4 transition-shadow hover:shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display font-bold text-ink">
                    {r.employeeName ?? "Unknown"}
                  </span>
                  {r.employeeCode && (
                    <span className="font-mono text-xs text-gray-400">
                      {r.employeeCode}
                    </span>
                  )}
                  <AdvanceStatusBadge status={r.status} />
                </div>
                <p className="text-xs text-gray-400">
                  Requested {formatIstDate(r.requested_at)} ·{" "}
                  {r.installments} installment{r.installments === 1 ? "" : "s"}
                  {r.reason && <> · &ldquo;{r.reason}&rdquo;</>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-4 text-right">
                {r.outstanding !== null && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Outstanding
                    </div>
                    <div className="font-display font-bold text-ink">
                      {formatINR(r.outstanding)}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Amount
                  </div>
                  <div className="font-display font-bold text-ink">
                    {formatINR(r.amount)}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

// Payroll view: every installment due in the selected month + Zoho CSV export.
async function MonthView({ monthParam }: { monthParam?: string }) {
  const monthKey = monthParam
    ? monthStart(monthParam.length === 7 ? `${monthParam}-01` : monthParam)
    : monthStart(istToday());
  const rows = await listRepaymentsForMonth(monthKey);
  const scheduled = rows.filter((r) => r.status === "scheduled");
  const totalDue = scheduled.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker monthKey={monthKey} tab="month" />
        <div className="flex items-center gap-2">
          <a
            href={`/admin/reports/export?type=advances&month=${monthKey.slice(0, 7)}`}
          >
            <Button variant="secondary">
              <Download className="h-4 w-4" /> Export CSV (Zoho)
            </Button>
          </a>
          {scheduled.length > 0 && (
            <form action={bulkMarkMonthPaid}>
              <input type="hidden" name="month" value={monthKey} />
              <Button type="submit">
                Mark {scheduled.length} deduction{scheduled.length === 1 ? "" : "s"} paid
              </Button>
            </form>
          )}
        </div>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink">
            {formatMonth(monthKey)} — {rows.length} deduction
            {rows.length === 1 ? "" : "s"}
          </span>
          <Badge tone="brand">Due: {formatINR(totalDue)}</Badge>
        </div>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            No installments due this month.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-4">Employee</th>
                  <th className="py-2 pr-4">Installment</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="py-2 pr-4">
                      <span className="font-medium text-ink">{r.employeeName}</span>{" "}
                      <span className="font-mono text-xs text-gray-400">
                        {r.employeeCode}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-600">
                      {r.installmentNo}
                      {r.totalInstallments ? ` / ${r.totalInstallments}` : ""}
                    </td>
                    <td className="py-2 pr-4 font-medium text-ink">
                      {formatINR(r.amount)}
                    </td>
                    <td className="py-2 pr-4">
                      <RepaymentStatusBadge
                        status={r.status as "scheduled" | "paid" | "waived"}
                      />
                    </td>
                    <td className="py-2 text-right">
                      {r.status === "scheduled" && (
                        <form action={markRepaymentPaid}>
                          <input type="hidden" name="id" value={r.id} />
                          <Button variant="ghost" type="submit">
                            Mark paid
                          </Button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
