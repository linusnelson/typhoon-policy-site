import { createClient } from "@/lib/supabase/server";

export interface OrgSettings {
  id: string;
  name: string;
  goLiveDate: string | null; // "YYYY-MM-DD"
}

export async function getOrg(orgId: string): Promise<OrgSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("id, name, go_live_date")
    .eq("id", orgId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    name: (data.name as string) ?? "",
    goLiveDate: (data.go_live_date as string | null) ?? null,
  };
}
