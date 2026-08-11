import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/policies";
import { istToday } from "@/lib/ist";

// Employee ids on the team(s) the signed-in manager actually leads
// (teams.manager_id = me, active). Used to scope the /team/* views to the
// manager's own team rather than their whole department. RLS
// (employees_select_same_org) permits the reads.
export async function getMyTeamMemberIds(): Promise<string[]> {
  const me = await getCurrentEmployee();
  if (!me) return [];
  const supabase = await createClient();

  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("manager_id", me.id)
    .eq("is_active", true);

  const teamIds = (teams ?? []).map((t) => t.id as string);
  if (teamIds.length === 0) return [];

  // Staff currently with the company only: excludes deactivated/pending rows,
  // login-only service accounts, and anyone past their relieving date (the
  // daily cron also flips those to inactive — this makes removal immediate).
  const { data: members } = await supabase
    .from("employees")
    .select("id")
    .in("team_id", teamIds)
    .eq("status", "active")
    .eq("is_service_account", false)
    .or(`relieving_date.is.null,relieving_date.gte.${istToday()}`);

  return (members ?? []).map((m) => m.id as string);
}
