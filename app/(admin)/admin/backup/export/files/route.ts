import { NextResponse, type NextRequest, after } from "next/server";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePassphrase } from "@/lib/backup/crypto";
import { createFilesPartArchive } from "@/lib/backup/export-files";
import { BACKUPS_BUCKET, currentProjectRef, filesPartFileName } from "@/lib/backup/format";
import { createRun, failRun, finishRun } from "@/lib/backup/runs";
import { loadOrg } from "@/lib/backup/service";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST JSON {bucket, month, part, passphrase} → one encrypted files part.
export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e) {
    if (e instanceof AuthzError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = (await req.json().catch(() => null)) as
    | { bucket?: string; month?: string; part?: number; passphrase?: string }
    | null;
  const bucket = body?.bucket ?? "";
  const month = body?.month ?? "";
  const part = Number(body?.part ?? 0);
  const passphrase = body?.passphrase ?? "";

  if (!/^[a-z0-9-]+$/.test(bucket) || bucket === BACKUPS_BUCKET) {
    return NextResponse.json({ error: "Invalid bucket." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(month) || !Number.isInteger(part) || part < 1) {
    return NextResponse.json({ error: "Invalid part." }, { status: 400 });
  }
  const bad = validatePassphrase(passphrase);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  const admin = createAdminClient();
  const org = await loadOrg(admin);
  const runId = await createRun(admin, { orgId: org.id, kind: "files", createdBy: actor.id });

  const { stream, done } = createFilesPartArchive({ admin, orgId: org.id, passphrase, bucket, month, part });

  after(async () => {
    try {
      const r = await done;
      await finishRun(admin, runId, {
        sizeBytes: r.bytes,
        tables: { bucket, month, part, objects: r.manifest.objects.length },
      });
    } catch (e) {
      await failRun(admin, runId, e);
    }
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filesPartFileName(currentProjectRef(), bucket, month, part)}"`,
    },
  });
}
