import { notFound } from "next/navigation";
import { requireAppAccessView } from "@/lib/auth";
import { PRICE_COMPARATOR_SLUG } from "@/lib/apps/registry";
import { loadVendorSettings } from "@/lib/apps/price-comparator/settings";
import { PriceProbeSettingsForm } from "@/components/apps/price-comparator/PriceProbeSettingsForm";

// Admin only: vendor API keys are org-wide secrets. The form never receives
// the secrets themselves — only which ones are set. (The exchange-rate
// override lives on the Compare tab.)
export default async function PriceProbeSettingsPage() {
  const me = await requireAppAccessView(PRICE_COMPARATOR_SLUG);
  if (me.role !== "admin") notFound();

  const settings = await loadVendorSettings(me.org_id);

  return (
    <PriceProbeSettingsForm
      configured={{
        digikeyClientId: Boolean(settings.digikeyClientId),
        digikeyClientSecret: Boolean(settings.digikeyClientSecret),
        mouserApiKey: Boolean(settings.mouserApiKey),
        element14ApiKey: Boolean(settings.element14ApiKey),
      }}
    />
  );
}
