import { requireAppAccessView } from "@/lib/auth";
import { BILL_FORGE_SLUG } from "@/lib/apps/registry";
import { RunsView } from "@/components/apps/bill-forge/runs/RunsView";

export default async function BillForgeRunsPage() {
  // Layouts don't re-run on sibling navigation — each page re-checks.
  await requireAppAccessView(BILL_FORGE_SLUG);
  return <RunsView />;
}
