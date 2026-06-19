import { createClient } from "@/lib/supabase/server";

// Invite-token lookup for the public self-onboarding page. Backed by the
// SECURITY DEFINER `lookup_invite_token` RPC (granted to anon) so the full
// invite_links table is never exposed. Returns null for invalid/expired tokens.

export interface InviteContext {
  orgId: string;
  departmentId: string | null;
  locationId: string | null;
  expiresAt: string | null;
}

export async function lookupInvite(token: string): Promise<InviteContext | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lookup_invite_token", {
    p_token: token,
  });
  if (error) return null;

  const rows = (data as
    | { org_id: string; department_id: string | null; location_id: string | null; expires_at: string | null }[]
    | null) ?? [];
  if (rows.length === 0) return null;

  const r = rows[0];
  return {
    orgId: r.org_id,
    departmentId: r.department_id,
    locationId: r.location_id,
    expiresAt: r.expires_at,
  };
}
