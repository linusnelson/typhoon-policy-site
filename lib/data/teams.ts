import { createClient } from "@/lib/supabase/server";
import type { Team } from "@/lib/types";

export interface TeamRow extends Team {
  department_name: string | null;
  manager_name: string | null;
}

export async function listTeams(): Promise<TeamRow[]> {
  const supabase = await createClient();
  const [{ data: teams }, { data: depts }, { data: emps }] = await Promise.all([
    supabase.from("teams").select("*").order("name"),
    supabase.from("departments").select("id, name"),
    supabase.from("employees").select("id, name"),
  ]);

  const deptMap = new Map(
    ((depts as { id: string; name: string }[]) ?? []).map((d) => [d.id, d.name])
  );
  const empMap = new Map(
    ((emps as { id: string; name: string }[]) ?? []).map((e) => [e.id, e.name])
  );

  return ((teams as Team[]) ?? []).map((t) => ({
    ...t,
    department_name: deptMap.get(t.department_id) ?? null,
    manager_name: t.manager_id ? empMap.get(t.manager_id) ?? null : null,
  }));
}
