import { requireAppAccessView } from "@/lib/auth";
import { BILL_FORGE_SLUG } from "@/lib/apps/registry";
import { DocumentsView } from "@/components/apps/bill-forge/documents/DocumentsView";

export default async function BillForgeDocumentsPage() {
  // Layouts don't re-run on sibling navigation — each page re-checks.
  await requireAppAccessView(BILL_FORGE_SLUG);
  return <DocumentsView />;
}
