import { createClient } from "@/lib/supabase/server";
import type { Department, Location, Shift } from "@/lib/types";

// Org-scoped reference data for form selects and filters. RLS scopes to the
// caller's org, so no explicit org filter is required.

export async function listDepartments(): Promise<Department[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("departments")
    .select("id, org_id, name, is_active")
    .order("name");
  return (data as Department[]) ?? [];
}

export async function listLocations(): Promise<Location[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("locations")
    .select(
      "id, org_id, name, address, lat, lng, geofence_radius_m, geofence_mode, selfie_required, allow_qr_checkin, allow_gps_checkin, is_active"
    )
    .order("name");
  return (data as Location[]) ?? [];
}

export async function listShifts(): Promise<Shift[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shifts")
    .select(
      "id, org_id, name, start_time, end_time, break_minutes, is_night_shift, saturday_half_day, saturday_end_time, is_default"
    )
    .order("name");
  return (data as Shift[]) ?? [];
}
