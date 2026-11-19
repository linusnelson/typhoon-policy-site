import { requireAppAccessView } from "@/lib/auth";
import { BILL_FORGE_SLUG } from "@/lib/apps/registry";
import { JobView } from "@/components/apps/bill-forge/job/JobView";

export default async function BillForgeJobPage() {
  // Layouts don't re-run on sibling navigation — each page re-checks.
  await requireAppAccessView(BILL_FORGE_SLUG);
  return <JobView />;
}
