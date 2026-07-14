import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import { listAdvancePolicies } from "@/lib/data/advances";
import { listDepartments } from "@/lib/data/refs";
import { AdvancePolicyManager } from "@/components/admin/advances/AdvancePolicyManager";

export default async function AdvancePolicyPage() {
  const admin = await requireAdmin();
  if (!(await moduleEnabled(admin.org_id, "advances"))) notFound();

  const [policies, departments] = await Promise.all([
    listAdvancePolicies(),
    listDepartments(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/admin/advances"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> All loans &amp; advances
      </Link>

      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          Loans &amp; advances policy
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Who can borrow, how much, and over how many months. Eligibility uses
          the salary and existing EMIs the employee declares when applying:
          max EMI = (salary − declared EMIs) × the configured percentage.
          Recorded salaries live on each employee&apos;s Compensation tab.
        </p>
      </div>

      <AdvancePolicyManager
        policies={policies}
        departments={departments.filter((d) => d.is_active)}
      />
    </div>
  );
}
