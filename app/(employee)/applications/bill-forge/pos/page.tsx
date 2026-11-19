import { requireAppAccessView } from "@/lib/auth";
import { BILL_FORGE_SLUG } from "@/lib/apps/registry";
import { PurchaseOrdersView } from "@/components/apps/bill-forge/pos/PurchaseOrdersView";

export default async function BillForgePurchaseOrdersPage() {
  // Layouts don't re-run on sibling navigation — each page re-checks.
  await requireAppAccessView(BILL_FORGE_SLUG);
  return <PurchaseOrdersView />;
}
