import { createClient } from "@/lib/supabase/server";

// Per-location active QR + 6-digit code. Mirrors clock_bays QrRepository.

export interface LocationCode {
  locationId: string;
  locationName: string;
  code: string | null; // QR payload (uuid)
  locationCode: string | null; // 6-digit PWA fallback
  expiresAt: string | null;
}

export async function listLocationCodes(): Promise<LocationCode[]> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [{ data: locations }, { data: codes }] = await Promise.all([
    supabase.from("locations").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("qr_codes")
      .select("location_id, code, location_code, expires_at")
      .gt("expires_at", nowIso)
      .order("generated_at", { ascending: false }),
  ]);

  // First (newest) active code per location.
  const latest = new Map<string, { code: string; location_code: string; expires_at: string }>();
  for (const c of (codes as
    | { location_id: string; code: string; location_code: string; expires_at: string }[]
    | null) ?? []) {
    if (!latest.has(c.location_id)) latest.set(c.location_id, c);
  }

  return ((locations as { id: string; name: string }[] | null) ?? []).map((l) => {
    const c = latest.get(l.id);
    return {
      locationId: l.id,
      locationName: l.name,
      code: c?.code ?? null,
      locationCode: c?.location_code ?? null,
      expiresAt: c?.expires_at ?? null,
    };
  });
}
