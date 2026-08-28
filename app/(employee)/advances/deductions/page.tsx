import { notFound } from "next/navigation";
import { requireExpenseApproverView } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import { MonthDeductions } from "@/components/admin/advances/MonthDeductions";

// The monthly loan/advance deduction run, on its own, for accounts users
// (is_expense_approver; admins pass too) — deliberately OUTSIDE /admin, same
// as /payslips/manage and /expenses/approvals, because the admin layout
// bounces non-admins.
//
// Only this view is exposed here. Approving, rejecting, disbursing, waiving
// and the advance policy stay on /admin/advances behind requireAdmin: recording
// a deduction payroll already ran is bookkeeping, while deciding who gets a
// loan is not. The DB draws the same line (clock_bays 20260828000000).
export default async function AdvanceDeductionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const viewer = await requireExpenseApproverView();
  if (!(await moduleEnabled(viewer.org_id, "advances"))) notFound();

  const params = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          Loan Deductions
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Salary-advance and loan installments due each month. Tick what payroll
          actually deducted and mark it paid.
        </p>
      </div>

      <MonthDeductions monthParam={params.month} />
    </div>
  );
}
