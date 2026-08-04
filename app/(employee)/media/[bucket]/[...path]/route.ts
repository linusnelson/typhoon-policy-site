import { NextResponse } from "next/server";
import { requireEmployee, AuthzError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Authorised proxy for private Storage buckets — selfies, expense bills and
// announcement attachments.
//
// Replaces handing the browser Supabase signed URLs. A signed URL is a BEARER
// TOKEN: it works for anyone holding it, with no login, until it expires. The
// selfie helpers were the worst of it — every employee list and the org map
// bulk-minted hour-long links to staff photos on an ordinary page load,
// whether or not an image was ever rendered.
//
// Here the URL is worthless to anyone else: each request is re-authorised from
// the caller's own session, and the bytes are streamed back.
//
// SECURITY MODEL — the object path is in the URL, and that is fine. The
// download runs on the CALLER'S client, so the same Storage RLS that gated
// signing now gates fetching, per request:
//   * selfies       — can_read_selfie(): subject, same-department manager, or
//                     same-org admin; `profile/…` avatars are org-readable
//   * expense-bills — can_read_expense_file(): subject, admin, approver
//   * announcements — can_read_announcement_file(): same-org
// Guessing a path buys nothing that RLS wouldn't already allow. Payslips are
// deliberately NOT proxied here: they keep their own id-addressed route so the
// storage path is never exposed at all.
const ALLOWED = new Set(["selfies", "expense-bills", "announcements"]);

// Selfies are re-fetched constantly (avatars in lists). A short PRIVATE cache
// keeps that off the network without ever allowing a shared/proxy cache to
// hold one. Documents are never cached.
const CACHE: Record<string, string> = {
  selfies: "private, max-age=300, must-revalidate",
  "expense-bills": "private, no-store",
  announcements: "private, no-store",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bucket: string; path: string[] }> }
) {
  try {
    await requireEmployee();
  } catch (e) {
    if (e instanceof AuthzError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    throw e;
  }

  const { bucket, path } = await params;
  if (!ALLOWED.has(bucket)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Next has already decoded each segment; rejoin into the storage key.
  const key = path.join("/");
  if (!key || key.includes("..")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: blob, error } = await supabase.storage.from(bucket).download(key);
  // RLS denial and a genuinely missing object both surface as an error here,
  // and both answer 404 — never confirm that a file the caller may not read
  // exists.
  if (error || !blob) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(await blob.arrayBuffer()), {
    headers: {
      "Content-Type": blob.type || "application/octet-stream",
      "Content-Disposition": "inline",
      "Cache-Control": CACHE[bucket] ?? "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
