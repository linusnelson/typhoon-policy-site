import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireExpenseApproverView } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import { listPayslipComponents } from "@/lib/data/payslips";
import { Button, Card } from "@/components/ui";
import { PayslipComponentManager } from "@/components/payslips/PayslipComponentManager";

// Earning/deduction component setup for the payroll CSV template. Admins and
// accounts users (is_expense_approver) — deliberately OUTSIDE /admin, same as
// /payslips/manage, so non-admin accounts users can reach it.
//
// The route is NOT /payslips/components: a segment by that name collides with
// the project's components/ directory during Next's build-trace phase and the
// build dies on a missing .next artifact (varying file, always post-compile).
export default async function PayslipComponentsPage() {
  const viewer = await requireExpenseApproverView();
  if (!(await moduleEnabled(viewer.org_id, "payslips"))) notFound();

  const components = await listPayslipComponents(viewer.org_id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/payslips/manage">
          <Button variant="ghost" type="button">
            <ArrowLeft className="h-4 w-4" /> Back to payslips
          </Button>
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">
          Earnings &amp; deductions
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          The components the payroll CSV template is built from, in the order
          they print on the payslip. Earnings fill the left table, deductions
          the right.
        </p>
      </div>

      <Card className="space-y-2 p-4 text-xs text-gray-500">
        <p>
          <span className="font-semibold text-ink">Applies to all</span> prefills
          that component with the same amount on every employee&apos;s row —
          good for a flat figure like professional tax. Leave it off and the
          column downloads at 0.00 for accounts to fill in.
        </p>
        <p>
          <span className="font-semibold text-ink">Auto-filled</span> components
          carry a real per-employee figure pulled from the Advances and Expenses
          modules. They can be reordered but not renamed or removed — the
          payslip import matches them by name.
        </p>
        <p>
          A loan or advance <span className="font-semibold text-ink">paid out</span>{" "}
          is not on this list and never appears on a payslip — it is a separate
          transfer. Only its monthly installment comes back, as the auto-filled
          deduction. The template still shows the disbursed figure in a
          reference column so you can see it while filling the sheet.
        </p>
        <p>
          Changing this list only affects the next template download. Payslips
          already issued keep the components they were generated with.
        </p>
      </Card>

      <PayslipComponentManager initial={components} />
    </div>
  );
}
