import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import { getExpensePolicy, listMyVisitTargets } from "@/lib/data/expenses";
import { defaultExpensePolicy } from "@/lib/engine/expense";
import { istToday } from "@/lib/ist";
import { Banner, Card } from "@/components/ui";
import { NewExpenseForm } from "@/components/expenses/NewExpenseForm";

// File expenses from the portal. Every claim must hang off one of the
// employee's own visit schedules (the INSERT policy enforces it), and visits
// are scheduled in the ClockBays app — so with nothing in the submission
// window there is nothing to file against, and the page says exactly that
// rather than showing a form that cannot save.
export default async function NewExpensePage() {
  const employee = await requireEmployee();
  if (!(await moduleEnabled(employee.org_id, "expenses"))) notFound();

  const policy =
    (await getExpensePolicy()) ?? defaultExpensePolicy(employee.org_id);
  const targets = await listMyVisitTargets(
    employee.id,
    policy.submission_window_days
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/expenses"
        className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> My expenses
      </Link>

      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          Add expenses
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Claim what you spent on a client visit — travel, food, stay and the
          rest. Saved as drafts first, so you can add to the visit before
          sending it for approval.
        </p>
      </div>

      {targets.length === 0 ? (
        <Card className="p-8">
          <Banner tone="info">
            You have no scheduled visits in the last{" "}
            {policy.submission_window_days} days. Expenses are always claimed
            against a scheduled visit — schedule one in the ClockBays app, then
            come back here.
          </Banner>
        </Card>
      ) : (
        <NewExpenseForm
          employeeId={employee.id}
          policy={policy}
          targets={targets}
          today={istToday()}
        />
      )}
    </div>
  );
}
