import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { runNightlyBackup } from "@/lib/backup/service";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Nightly database archive → backups/nightly/<date>.cbk, then retention.
// Triggered by Vercel Cron (vercel.json, 20:30 UTC = 02:00 IST). Vercel sends
// `Authorization: Bearer <CRON_SECRET>`; anything else is rejected. Locally:
//   curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/backup
//
// Why a Next route and not pg_cron + an edge function: it reuses the exact
// export code the admin download uses, so there is one archive format and
// one implementation to keep correct.
function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const header = req.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const passphrase = process.env.BACKUP_PASSPHRASE ?? "";
  if (passphrase.length < 12) {
    return NextResponse.json(
      { error: "BACKUP_PASSPHRASE is not set (or shorter than 12 characters) — nightly backup skipped." },
      { status: 500 }
    );
  }

  try {
    const admin = createAdminClient();
    const r = await runNightlyBackup(admin, passphrase);
    return NextResponse.json({
      ok: true,
      runId: r.runId,
      path: r.path,
      bytes: r.bytes,
      tables: Object.keys(r.tables).length,
      pruned: r.pruned,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
