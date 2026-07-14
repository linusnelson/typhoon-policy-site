import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Holiday } from "@/lib/types";

export interface HolidayRow extends Holiday {
  location_name: string | null;
}

// Cross-request cache tag. Holidays + locations change only via the web admin
// actions (holidays.ts, locations.ts), which call revalidateTag(HOLIDAYS_TAG);
// the revalidate TTL is a safety net against any out-of-band write.
export const HOLIDAYS_TAG = "holidays";

// Org-public reference data (holiday calendar + location names). Cached across
// requests via the service-role client — unstable_cache cannot read cookies(),
// so RLS no longer scopes the query and we filter by org_id explicitly.
export const listHolidays = unstable_cache(
  async (orgId: string): Promise<HolidayRow[]> => {
    const supabase = createAdminClient();
    const [{ data: holidays }, { data: locs }] = await Promise.all([
      supabase.from("holidays").select("*").eq("org_id", orgId).order("date"),
      supabase.from("locations").select("id, name").eq("org_id", orgId),
    ]);

    const locMap = new Map(
      ((locs as { id: string; name: string }[]) ?? []).map((l) => [l.id, l.name])
    );

    return ((holidays as Holiday[]) ?? []).map((h) => ({
      ...h,
      location_name: h.location_id ? locMap.get(h.location_id) ?? null : null,
    }));
  },
  ["holidays"],
  { tags: [HOLIDAYS_TAG], revalidate: 600 }
);
