import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { getApplyLeaveContext } from "@/lib/data/employee-leave";
import { istToday } from "@/lib/ist";
import { Card } from "@/components/ui";
import { ApplyLeaveForm } from "@/components/employee/ApplyLeaveForm";

export default async function ApplyLeavePage() {
  const me = await requireEmployee();
  const { types, holidays } = await getApplyLeaveContext(me.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/leave"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to leave
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">
          Apply for leave
        </h1>
      </div>

      {types.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-400">
          No leave types are available to you. Contact HR.
        </Card>
      ) : (
        <ApplyLeaveForm types={types} holidays={holidays} today={istToday()} />
      )}
    </div>
  );
}
