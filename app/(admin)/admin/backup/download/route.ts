import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NIGHTLY_PREFIX, PRE_RESTORE_PREFIX } from "@/lib/backup/runs";
import { openObjectStream } from "@/lib/backup/restore";

export const runtime = "nodejs";
export const maxDuration = 300;

// GET ?path=nightly/2026-09-20.cbk → streams a bucket archive to the admin.
// Only nightly/ and pre-restore/ objects are downloadable (uploads/ are the
// admin's own files on their way in). The archive is already encrypted with
// BACKUP_PASSPHRASE, so the download itself needs no extra secret — the
// per-request admin check is the gate, not a signed URL that outlives it.
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthzError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const path = req.nextUrl.searchParams.get("path") ?? "";
  const allowed =
    /^[A-Za-z0-9._\/-]+\.cbk$/.test(path) &&
    !path.includes("..") &&
    (path.startsWith(NIGHTLY_PREFIX) || path.startsWith(PRE_RESTORE_PREFIX));
  if (!allowed) return NextResponse.json({ error: "Not a downloadable backup." }, { status: 400 });

  const admin = createAdminClient();
  let stream: ReadableStream<Uint8Array>;
  try {
    stream = await openObjectStream(admin, path);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
  const name = path.split("/").pop() ?? "backup.cbk";
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
