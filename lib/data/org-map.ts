import { createClient } from "@/lib/supabase/server";
import { selfieUrls } from "@/lib/supabase/storage";

// Org chart for the web Org map. Backed by the SECURITY DEFINER `org_chart`
// RPC so any authenticated org member can see the full directory without
// widening table RLS. Teams are optional within a department.

export interface Person {
  id: string;
  name: string;
  designation: string | null;
  photoUrl: string | null;
  role: string;
}

export interface TeamNode {
  id: string;
  name: string;
  manager: Person | null;
  members: Person[];
}

export interface DepartmentNode {
  id: string;
  name: string;
  teams: TeamNode[];
  directMembers: Person[]; // dept employees not in any (active) team
}

export interface OrgChart {
  leadership: Person[]; // active admins
  departments: DepartmentNode[];
  orphans: Person[]; // active non-admins with no department
}

interface RawPerson {
  id: string;
  name: string;
  email: string | null;
  designation: string | null;
  photo_url: string | null;
  role: string;
  department_id: string | null;
  team_id: string | null;
}
interface RawTeam {
  id: string;
  name: string;
  department_id: string | null;
  manager_id: string | null;
}
interface RawDept {
  id: string;
  name: string;
}
interface RawChart {
  departments: RawDept[];
  teams: RawTeam[];
  employees: RawPerson[];
}

function toPerson(e: RawPerson, photos: Map<string, string>): Person {
  return {
    id: e.id,
    name: e.name,
    designation: e.designation,
    photoUrl: e.photo_url ? photos.get(e.photo_url) ?? null : null,
    role: e.role,
  };
}

export async function getOrgChart(): Promise<OrgChart> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("org_chart");
  const raw = (data as RawChart | null) ?? {
    departments: [],
    teams: [],
    employees: [],
  };

  // Service accounts are excluded by the org_chart RPC itself
  // (20260804000003) — they aren't people and shouldn't appear in leadership,
  // as a manager, or anywhere in the chart.
  const people = raw.employees;

  // Avatars are bare paths in the private `selfies` bucket — sign them all in
  // one request, then resolve per person.
  const photos = selfieUrls(people.map((e) => e.photo_url));

  const leadership = people
    .filter((e) => e.role === "admin")
    .map((e) => toPerson(e, photos));

  // Teams keyed by their owning department; managers resolved from people.
  const personById = new Map(people.map((p) => [p.id, p]));
  const teamsByDept = new Map<string, RawTeam[]>();
  const activeTeamIds = new Set(raw.teams.map((t) => t.id));
  for (const t of raw.teams) {
    if (!t.department_id) continue;
    const list = teamsByDept.get(t.department_id) ?? [];
    list.push(t);
    teamsByDept.set(t.department_id, list);
  }

  const departments: DepartmentNode[] = raw.departments.map((d) => {
    const deptTeams = teamsByDept.get(d.id) ?? [];

    const teams: TeamNode[] = deptTeams.map((t) => {
      const managerRaw = t.manager_id ? personById.get(t.manager_id) ?? null : null;
      const members = people
        .filter(
          (e) =>
            e.team_id === t.id &&
            e.role !== "admin" &&
            e.id !== t.manager_id
        )
        .map((e) => toPerson(e, photos));
      return {
        id: t.id,
        name: t.name,
        manager: managerRaw ? toPerson(managerRaw, photos) : null,
        members,
      };
    });

    // Dept employees with no active team (and not an admin → shown in leadership).
    const directMembers = people
      .filter(
        (e) =>
          e.department_id === d.id &&
          e.role !== "admin" &&
          (!e.team_id || !activeTeamIds.has(e.team_id))
      )
      .map((e) => toPerson(e, photos));

    return { id: d.id, name: d.name, teams, directMembers };
  });

  const orphans = people
    .filter((e) => e.role !== "admin" && !e.department_id)
    .map((e) => toPerson(e, photos));

  return { leadership, departments, orphans };
}
