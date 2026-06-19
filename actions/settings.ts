"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ActionState, str } from "@/lib/action-utils";

// Update org-level settings: display name + go-live date (the date before which
// attendance reporting won't flag absences). Mirrors the organizations columns.
export async function updateOrgSettings(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const name = str(formData, "name");
  const goLiveDate = str(formData, "goLiveDate"); // may be null to clear
  if (!name) return { ok: false, error: "Organization name is required." };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("organizations")
    .update({ name, go_live_date: goLiveDate })
    .eq("id", admin.org_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings");
  return { ok: true, message: "Settings saved." };
}
