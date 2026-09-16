import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { VendorInfo, VendorSettings } from "./types";
import { vendors } from "./vendors";

// price_comparator_settings is service-role only (no RLS policies, no grants
// for authenticated) — vendor secrets never travel through a browser session.
// Callers MUST have checked application access first.

const EMPTY: VendorSettings = {
  digikeyClientId: "",
  digikeyClientSecret: "",
  mouserApiKey: "",
  element14ApiKey: "",
  fxOverride: null,
};

export async function loadVendorSettings(orgId: string): Promise<VendorSettings> {
  const { data, error } = await createAdminClient()
    .from("price_comparator_settings")
    .select(
      "digikey_client_id, digikey_client_secret, mouser_api_key, element14_api_key, fx_override"
    )
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(`Could not load PriceProbe settings: ${error.message}`);
  if (!data) return { ...EMPTY };
  return {
    digikeyClientId: data.digikey_client_id ?? "",
    digikeyClientSecret: data.digikey_client_secret ?? "",
    mouserApiKey: data.mouser_api_key ?? "",
    element14ApiKey: data.element14_api_key ?? "",
    fxOverride: data.fx_override === null ? null : Number(data.fx_override),
  };
}

export type VendorKeys = Omit<VendorSettings, "fxOverride">;

// The two writers touch disjoint columns: an upsert only sets the columns it
// sends (merge-duplicates), so saving keys never resets the FX override and
// vice versa.
async function upsertSettings(
  orgId: string,
  columns: Record<string, unknown>,
  updatedBy: string
): Promise<void> {
  const { error } = await createAdminClient()
    .from("price_comparator_settings")
    .upsert({
      org_id: orgId,
      ...columns,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}

export async function saveVendorKeys(
  orgId: string,
  keys: VendorKeys,
  updatedBy: string
): Promise<void> {
  await upsertSettings(
    orgId,
    {
      digikey_client_id: keys.digikeyClientId,
      digikey_client_secret: keys.digikeyClientSecret,
      mouser_api_key: keys.mouserApiKey,
      element14_api_key: keys.element14ApiKey,
    },
    updatedBy
  );
}

export async function saveFxOverride(
  orgId: string,
  fxOverride: number | null,
  updatedBy: string
): Promise<void> {
  await upsertSettings(orgId, { fx_override: fxOverride }, updatedBy);
}

// Browser-safe view: vendor names + whether credentials are configured.
export function vendorInfos(settings: VendorSettings): VendorInfo[] {
  return vendors.map((v) => ({
    name: v.name,
    currency: v.currency,
    hasCredentials: v.hasCredentials(settings),
  }));
}
