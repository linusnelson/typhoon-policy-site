import Link from "next/link";
import { notFound } from "next/navigation";
import { FileSignature } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import { getAdvanceContext, getLoanPolicySignStatus } from "@/lib/data/advances";
import { Banner, Button, Card } from "@/components/ui";
import { ApplyAdvanceForm } from "@/components/employee/ApplyAdvanceForm";
import { EmiDeclarationsCard } from "@/components/employee/EmiDeclarationsCard";

export default async function ApplyAdvancePage() {
  const me = await requireEmployee();
  if (!(await moduleEnabled(me.org_id, "advances"))) notFound();

  // Gate: the Loans & Advances policy must be signed before applying.
  const signStatus = await getLoanPolicySignStatus(me.id, me.email);
  if (signStatus.required && !signStatus.signed) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="font-display text-2xl font-bold text-ink">
          Request loan / advance
        </h1>
        <Card className="p-8 text-center">
          <FileSignature className="mx-auto mb-3 h-8 w-8 text-brand" />
          {signStatus.published && signStatus.documentId ? (
            <>
              <p className="mb-1 font-display font-bold text-ink">
                Sign the policy first
              </p>
              <p className="mb-5 text-sm text-gray-500">
                You need to read and sign the{" "}
                <strong>{signStatus.documentTitle ?? "Employee Loans & Advances Policy"}</strong>{" "}
                before you can request a loan or advance.
              </p>
              <Link href={`/documents/${signStatus.documentId}`}>
                <Button>Read &amp; sign the policy</Button>
              </Link>
            </>
          ) : (
            <>
              <p className="mb-1 font-display font-bold text-ink">
                Policy not in force yet
              </p>
              <p className="text-sm text-gray-500">
                The Employee Loans &amp; Advances Policy hasn&apos;t been
                published yet. Loans and advances open up once it is published
                and you have signed it.
              </p>
            </>
          )}
        </Card>
      </div>
    );
  }

  const context = await getAdvanceContext(me.id);
  if (!context.policy) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="font-display text-2xl font-bold text-ink">
          Request loan / advance
        </h1>
        <Card className="p-8 text-center text-sm text-gray-500">
          No loans &amp; advances policy is configured for your department yet.
          Contact your admin.
        </Card>
      </div>
    );
  }

  // Hard blocks that no salary entry can fix (tenure, concurrency, cooldown) —
  // show them up front; salary-dependent checks happen live in the form.
  const hardBlocks = context.eligibility.blocks.filter(
    (b) => !b.includes("monthly salary")
  );

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          Request loan / advance
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Interest-free, repaid via monthly salary deductions. Admin approval
          required.
        </p>
      </div>

      {hardBlocks.length > 0 && <Banner tone="warning">{hardBlocks[0]}</Banner>}

      <EmiDeclarationsCard declarations={context.declarations} />

      <ApplyAdvanceForm
        policy={context.policy}
        recordedSalary={context.recordedSalary}
        declaredEmi={context.declaredEmi}
        internalEmi={context.internalEmi}
        tenureMonths={context.tenureMonths}
        openAdvances={context.openAdvances.length}
        monthsSinceLastClosed={context.monthsSinceLastClosed}
      />
    </div>
  );
}
