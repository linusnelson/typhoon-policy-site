import { NextResponse, type NextRequest, after } from "next/server";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePassphrase } from "@/lib/backup/crypto";
import { createDatabaseArchive } from "@/lib/backup/export";
import { archiveFileName, currentProjectRef } from "@/lib/backup/format";
import { createRun, failRun, finishRun } from "@/lib/backup/runs";
import { loadOrg } from "@/lib/backup/service";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST (form): passphrase, confirm, include_secrets → streams the encrypted
// database archive as a download. A form POST is used rather than a GET so
// the passphrase is never in a URL or an access log.
export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e) {
    if (e instanceof AuthzError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const form = await req.formData();
  const passphrase = String(form.get("passphrase") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const includeSecrets = form.get("include_secrets") === "on";
  const includeAuth = form.get("include_auth") !== "off";

  const bad = validatePassphrase(passphrase);
  if (bad) return new NextResponse(bad, { status: 400 });
  if (passphrase !== confirm) return new NextResponse("Passphrases do not match.", { status: 400 });

  const admin = createAdminClient();
  const org = await loadOrg(admin);
  const runId = await createRun(admin, { orgId: org.id, kind: "manual", createdBy: actor.id });

  const { stream, done } = createDatabaseArchive({
    admin,
    orgId: org.id,
    orgName: org.name,
    createdBy: actor.id,
    kind: "manual",
    passphrase,
    includeSecrets,
    includeAuth,
  });

  // Bookkeeping continues after the response body has been handed over.
  after(async () => {
    try {
      const r = await done;
      await finishRun(admin, runId, {
        storagePath: null,
        sizeBytes: r.bytes,
        schemaVersion: r.manifest.schema_version,
        tables: r.manifest.tables,
      });
    } catch (e) {
      await failRun(admin, runId, e);
    }
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${archiveFileName(currentProjectRef())}"`,
    },
  });
}
