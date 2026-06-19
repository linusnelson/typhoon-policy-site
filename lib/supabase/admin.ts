import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client — bypasses RLS. SERVER-ONLY.
//
// The `server-only` import makes the build fail if this module is ever pulled
// into a client component. Use exclusively inside Server Actions / Route
// Handlers, and only for operations the signed-in user's RLS session cannot do
// (e.g. provisioning an auth user when an admin creates an employee directly).
//
// Requires SUPABASE_SERVICE_ROLE_KEY in the environment (Vercel project env).
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — direct admin provisioning is unavailable."
    );
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
