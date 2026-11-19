import { requireAppAccessView } from "@/lib/auth";
import { BILL_FORGE_SLUG } from "@/lib/apps/registry";
import { UploadView } from "@/components/apps/bill-forge/upload/UploadView";

export default async function BillForgeUploadPage() {
  // Layouts don't re-run on sibling navigation — each page re-checks.
  await requireAppAccessView(BILL_FORGE_SLUG);
  return <UploadView />;
}
