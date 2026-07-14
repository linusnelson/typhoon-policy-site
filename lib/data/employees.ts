import { createClient } from "@/lib/supabase/server";
import type { EmployeeRow } from "@/lib/data/employee-model";
import { signSelfieUrls } from "@/lib/supabase/storage";

// Re-export the client-safe model so server callers have one import site.
export {
  derivedStatus,
  type EmployeeRow,
  type DerivedStatus,
} from "@/lib/data/employee-model";

type RawRow = Omit<
  EmployeeRow,
  "department_name" | "location_name" | "shift_name" | "team_name"
> & {
  departments: { name: string } | null;
  shifts: { name: string } | null;
  teams: { name: string } | null;
};

// teams uses the team_id FK hint — employees↔teams has two relationships
// (employees.team_id and teams.manager_id), so the embed must disambiguate.
const SELECT = "*, departments(name), shifts(name), teams!team_id(name)";

async function locationMap(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("locations").select("id, name");
  return new Map(
    ((data as { id: string; name: string }[]) ?? []).map((l) => [l.id, l.name])
  );
}

function flatten(r: RawRow, locs: Map<string, string>): EmployeeRow {
  const { departments, shifts, teams, ...rest } = r;
  return {
    ...rest,
    department_name: departments?.name ?? null,
    location_name: r.location_id ? locs.get(r.location_id) ?? null : null,
    shift_name: shifts?.name ?? null,
    team_name: teams?.name ?? null,
  };
}

export async function listEmployees(): Promise<EmployeeRow[]> {
  const supabase = await createClient();
  const [{ data }, locs] = await Promise.all([
    supabase.from("employees").select(SELECT).order("employee_code"),
    locationMap(),
  ]);
  const rows = ((data as RawRow[]) ?? []).map((r) => flatten(r, locs));

  // photo_url is a bare path in the private `selfies` bucket; replace it with a
  // signed display URL (or null) so the avatar renders instead of 404ing.
  const photos = await signSelfieUrls(rows.map((r) => r.photo_url));
  for (const r of rows) {
    r.photo_url = r.photo_url ? photos.get(r.photo_url) ?? null : null;
  }
  return rows;
}

export interface EmployeeOption {
  id: string;
  name: string;
  role: string;
}

// Lightweight id/name/role list for manager pickers and name resolution.
export async function listEmployeeOptions(): Promise<EmployeeOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id, name, role")
    .order("name");
  return (data as EmployeeOption[]) ?? [];
}

export async function getEmployee(id: string): Promise<EmployeeRow | null> {
  const supabase = await createClient();
  const [{ data }, locs] = await Promise.all([
    supabase.from("employees").select(SELECT).eq("id", id).maybeSingle(),
    locationMap(),
  ]);
  return data ? flatten(data as RawRow, locs) : null;
}
