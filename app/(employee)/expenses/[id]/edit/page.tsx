import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import { getExpense, getExpensePolicy, listMyVisitTargets } from "@/lib/data/expenses";
import { expenseBillUrl } from "@/lib/supabase/storage";
import { defaultExpensePolicy } from "@/lib/engine/expense";
import { istToday } from "@/lib/ist";
import { Banner, Card } from "@/components/ui";
import { EditExpenseForm } from "@/components/expenses/EditExpenseForm";

// Edit one OWN claim. Only draft / pending / rejected are editable — the same
// window the RLS UPDATE policy allows, so an approved or reimbursed claim
// bounces back to its detail page instead of showing a form that cannot save.
export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const employee = await requireEmployee();
  if (!(await moduleEnabled(employee.org_id, "expenses"))) notFound();

  const { id } = await params;
  const claim = await getExpense(id);
  if (!claim || claim.employee_id !== employee.id) notFound();

  const editable = ["draft", "pending", "rejected"].includes(claim.status);
  const policy =
    (await getExpensePolicy()) ?? defaultExpensePolicy(employee.org_id);
  const attachmentUrls = claim.attachments.map((a) => expenseBillUrl(a.file_path));
  const targets = await listMyVisitTargets(
    employee.id,
    policy.submission_window_days
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/expenses/${claim.id}`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Back to the expense
      </Link>

      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          Edit expense
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Amounts, category, bill date and bills can all be changed while the
          expense is still a draft, pending, or rejected.
        </p>
      </div>

      {!editable ? (
        <Card className="p-8">
          <Banner tone="info">
            This expense has already been reviewed and can no longer be edited.
          </Banner>
        </Card>
      ) : targets.length === 0 ? (
        <Card className="p-8">
          <Banner tone="info">
            You have no scheduled visits in the last{" "}
            {policy.submission_window_days} days to attach this expense to.
            Schedule a visit in the ClockBays app first.
          </Banner>
        </Card>
      ) : (
        <EditExpenseForm
          claim={claim}
          attachments={claim.attachments}
          attachmentUrls={attachmentUrls}
          employeeId={employee.id}
          policy={policy}
          targets={targets}
          today={istToday()}
        />
      )}
    </div>
  );
}
