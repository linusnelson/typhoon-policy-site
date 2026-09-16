"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { type ActionState, str, bool } from "@/lib/action-utils";
import { resolveFx } from "@/lib/apps/price-comparator/fx";
import {
  loadVendorSettings,
  saveFxOverride,
  saveVendorKeys,
  type VendorKeys,
} from "@/lib/apps/price-comparator/settings";
import type { FxState } from "@/lib/apps/price-comparator/types";

// Form field name for each credential. A blank field keeps the stored value
// (the form never shows secrets); `clear_<field>` removes it.
const SECRET_FIELDS: Array<[keyof VendorKeys, string]> = [
  ["digikeyClientId", "digikey_client_id"],
  ["digikeyClientSecret", "digikey_client_secret"],
  ["mouserApiKey", "mouser_api_key"],
  ["element14ApiKey", "element14_api_key"],
];

// Settings tab (admin only): vendor API keys.
export async function savePriceProbeKeys(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  try {
    const keys: VendorKeys = await loadVendorSettings(admin.org_id);
    for (const [key, field] of SECRET_FIELDS) {
      const value = str(formData, field);
      if (bool(formData, `clear_${field}`)) keys[key] = "";
      else if (value !== null) keys[key] = value;
    }
    await saveVendorKeys(admin.org_id, keys, admin.id);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  revalidatePath("/applications/price-comparator", "layout");
  return { ok: true, message: "API keys saved." };
}

export type FxOverrideResult =
  | { ok: true; fx: FxState }
  | { ok: false; error: string };

// Compare tab (admin only): set or clear the org-wide INR/USD override.
// Returns the new rate state so the tab can re-price results immediately.
export async function setPriceProbeFxOverride(
  override: number | null
): Promise<FxOverrideResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }
  if (override !== null && !(Number.isFinite(override) && override > 0 && override < 10_000)) {
    return { ok: false, error: "Enter a positive INR per USD rate." };
  }

  try {
    await saveFxOverride(admin.org_id, override, admin.id);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  revalidatePath("/applications/price-comparator");
  return { ok: true, fx: await resolveFx(override) };
}
