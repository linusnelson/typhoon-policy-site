import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { Banner, Button } from "@/components/ui";
import { listMyRegularizationRequests } from "@/lib/data/regularization-requests";
import { RegularizationRequestList } from "@/components/employee/RegularizationRequestList";

export default async function MyRegularizationPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const me = await requireEmployee();
  const { submitted } = await searchParams;
  const rows = await listMyRegularizationRequests(me.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/attendance"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" /> Back to attendance
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold text-ink">
            Correction requests
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Ask your manager or HR to fix a missed or wrong punch. Nothing changes until
            it is approved.
          </p>
        </div>
        <Link href="/attendance/regularization/new" className="shrink-0">
          <Button>
            <Plus className="h-4 w-4" /> New request
          </Button>
        </Link>
      </div>

      {submitted && (
        <Banner tone="success">
          Request submitted. Your manager and HR have been notified.
        </Banner>
      )}

      <RegularizationRequestList rows={rows} canCancel />
    </div>
  );
}
