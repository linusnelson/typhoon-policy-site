import { requireAppAccessView } from "@/lib/auth";
import { BILL_FORGE_SLUG } from "@/lib/apps/registry";
import { ActivityView } from "@/components/apps/bill-forge/activity/ActivityView";

export default async function BillForgeActivityPage() {
  // Layouts don't re-run on sibling navigation — each page re-checks.
  await requireAppAccessView(BILL_FORGE_SLUG);
  return <ActivityView />;
}
