import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface ApproverNotification {
  title: string;
  body: string;
  type: string; // notification_type enum value
  referenceId: string;
}

// Notify the applicant's active team manager + every active org admin about a
// request that needs review — the routing leave_team_routing enforces in RLS
// (manager sees team members' requests; a manager's own request goes to
// admins only). Shared by leave, regularization requests and anything else
// that follows the same approval path. Runs under the caller's session: the
// notifications_insert_org_member policy lets any org member insert rows
// targeted at other members of the same org.
export async function notifyApprovers(
  supabase: Supabase,
  args: {
    applicantId: string;
    teamId: string | null;
    orgId: string;
  },
  payload: ApproverNotification
): Promise<void> {
  const recipients = new Set<string>();

  if (args.teamId) {
    const { data: team } = await supabase
      .from("teams")
      .select("manager_id")
      .eq("id", args.teamId)
      .eq("is_active", true)
      .maybeSingle();
    const managerId = team?.manager_id as string | null | undefined;
    if (managerId && managerId !== args.applicantId) recipients.add(managerId);
  }

  const { data: admins } = await supabase
    .from("employees")
    .select("id")
    .eq("org_id", args.orgId)
    .eq("role", "admin")
    .eq("status", "active");
  for (const a of admins ?? []) {
    if (a.id && a.id !== args.applicantId) recipients.add(a.id as string);
  }
  if (recipients.size === 0) return;

  await supabase.from("notifications").insert(
    [...recipients].map((id) => ({
      employee_id: id,
      org_id: args.orgId,
      title: payload.title,
      body: payload.body,
      type: payload.type,
      reference_id: payload.referenceId,
    }))
  );
}
