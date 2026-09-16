import { requireAppAccessView } from "@/lib/auth";
import { PRICE_COMPARATOR_SLUG } from "@/lib/apps/registry";
import { resolveFx } from "@/lib/apps/price-comparator/fx";
import { loadVendorSettings, vendorInfos } from "@/lib/apps/price-comparator/settings";
import { ComparePanel } from "@/components/apps/price-comparator/ComparePanel";

export default async function PriceProbeComparePage() {
  // Layouts don't re-run on sibling navigation — each page re-checks.
  const me = await requireAppAccessView(PRICE_COMPARATOR_SLUG);
  const settings = await loadVendorSettings(me.org_id);
  const fx = await resolveFx(settings.fxOverride);

  // Only key presence (vendorInfos) and FX reach the browser — never the keys.
  return (
    <ComparePanel vendors={vendorInfos(settings)} isAdmin={me.role === "admin"} initialFx={fx} />
  );
}
