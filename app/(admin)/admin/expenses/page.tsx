import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import {
  getExpensePolicy,
  listEmployeesWithApproverFlag,
} from "@/lib/data/expenses";
import { ExpensePolicyForm } from "@/components/admin/expenses/ExpensePolicyForm";
import { ApproverManager } from "@/components/admin/expenses/ApproverManager";
import { Button } from "@/components/ui";

// Admin config for the Expenses module: org-wide rates/limits + the accounts
// approver flags. The approval queue itself lives at /expenses/approvals
// (outside /admin) so non-admin accounts users can reach it.
export default async function AdminExpensesPage() {
  const admin = await requireAdmin();
  if (!(await moduleEnabled(admin.org_id, "expenses"))) notFound();

  const [policy, employees] = await Promise.all([
    getExpensePolicy(),
    listEmployeesWithApproverFlag(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Expenses</h1>
          <p className="mt-1 text-sm text-gray-500">
            Rates, limits, and accounts approvers for visit expense claims.
          </p>
        </div>
        <Link href="/expenses/approvals">
          <Button variant="secondary">
            Approval queue <ArrowUpRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <ExpensePolicyForm policy={policy} />
      <ApproverManager employees={employees} />
    </div>
  );
}
