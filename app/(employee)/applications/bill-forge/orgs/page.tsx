import { notFound } from "next/navigation";
import { requireAppAccessView } from "@/lib/auth";
import { BILL_FORGE_SLUG } from "@/lib/apps/registry";
import { OrgsAdmin } from "@/components/apps/bill-forge/OrgsAdmin";

export default async function BillForgeOrgsPage() {
  // Layouts don't re-run on sibling navigation — each page re-checks.
  const me = await requireAppAccessView(BILL_FORGE_SLUG);
  if (me.role !== "admin") notFound();
  return <OrgsAdmin />;
}
