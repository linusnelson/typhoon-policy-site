import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Settings2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getCurrentEmployee } from "@/lib/policies";
import { moduleEnabled } from "@/lib/data/org";
import { listAdvances } from "@/lib/data/advances";
import { Badge, Button, Card } from "@/components/ui";
import { TabNav } from "@/components/ui/Tabs";
import { AdvanceStatusBadge } from "@/components/employee/AdvanceStatusBadge";
import { MonthDeductions } from "@/components/admin/advances/MonthDeductions";
import { formatINR } from "@/lib/format";
import { formatIstDate } from "@/lib/ist";
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
  // A non-admin accounts user typing this URL gets bounced by requireAdmin
  // below. Send them to the one view they DO have rights to instead of an
  // error page — it is the same monthly-deduction screen, minus the tabs.
  const viewer = await getCurrentEmployee();
  if (viewer && viewer.role !== "admin" && viewer.is_expense_approver) {
    const params = await searchParams;
    redirect(
      params.month
        ? `/advances/deductions?month=${params.month}`
        : "/advances/deductions"
    );
  }

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
        <MonthDeductions monthParam={params.month} tab="month" />
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
