import { requireAppAccessView } from "@/lib/auth";
import { BEL_RFX_SLUG } from "@/lib/apps/registry";
import { Extractor } from "@/components/apps/bel-rfx/Extractor";

export default async function BelRfxPage() {
  // Layouts don't re-run on sibling navigation — each page re-checks.
  await requireAppAccessView(BEL_RFX_SLUG);
  return <Extractor />;
}
