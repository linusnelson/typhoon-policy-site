import { createClient } from "@/lib/supabase/server";
import type { Holiday } from "@/lib/types";

export interface HolidayRow extends Holiday {
  location_name: string | null;
}

export async function listHolidays(): Promise<HolidayRow[]> {
  const supabase = await createClient();
  const [{ data: holidays }, { data: locs }] = await Promise.all([
    supabase.from("holidays").select("*").order("date"),
    supabase.from("locations").select("id, name"),
  ]);

  const locMap = new Map(
    ((locs as { id: string; name: string }[]) ?? []).map((l) => [l.id, l.name])
  );

  return ((holidays as Holiday[]) ?? []).map((h) => ({
    ...h,
    location_name: h.location_id ? locMap.get(h.location_id) ?? null : null,
  }));
}
