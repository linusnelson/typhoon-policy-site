import { NextResponse } from "next/server";
import { requireEmployee, AuthzError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { moduleEnabled } from "@/lib/data/org";
import type { Payslip } from "@/lib/types";

export const runtime = "nodejs";

// Authorised payslip download.
//
// Replaces handing the browser a Supabase signed URL. A signed URL is a BEARER
// TOKEN: valid for its whole lifetime (was 1 hour) for anyone holding it, with
// no login — so the link leaking via chat, browser history, a forwarded mail
// or a proxy log exposed the PDF, and payslips carry salary, bank account
// number and PAN. Pre-signing every row on page render made it worse: one
// visit to /payslips/manage minted an hour-long token for every employee's
// payslip whether or not anyone clicked.
//
// Here the URL is worthless to anyone else: every request is re-authorised
// from the caller's own session, and the bytes are streamed server-side. The
// storage path never reaches the client.
//
// Two independent checks, both on the user's client (never service-role):
//   1. the payslips row must be SELECTable — RLS allows admin, expense
//      approver, or the subject employee (20260711000000);
//   2. the storage object must be readable — the same rule again via
//      can_read_payslip(). RLS is the boundary; this handler only routes.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let me;
  try {
    me = await requireEmployee();
  } catch (e) {
    if (e instanceof AuthzError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    throw e;
  }
  if (!(await moduleEnabled(me.org_id, "payslips"))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { id } = await params;
  const supabase = await createClient();

  // RLS decides. A payslip the caller may not see simply isn't returned, and
  // 404 (not 403) keeps this from confirming that someone else's payslip
  // exists for a given id.
  const { data: slip } = await supabase
    .from("payslips")
    .select("id, employee_id, period_month, file_path")
    .eq("id", id)
    .maybeSingle();
  if (!slip) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { file_path, period_month } = slip as Pick<
    Payslip,
    "file_path" | "period_month"
  >;

  const { data: blob, error } = await supabase.storage
    .from("payslips")
    .download(file_path);
  if (error || !blob) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(await blob.arrayBuffer()), {
    headers: {
      "Content-Type": "application/pdf",
      // inline so it opens in the browser's viewer, named by pay period.
      "Content-Disposition": `inline; filename="payslip-${period_month.slice(0, 7)}.pdf"`,
      // Never let a shared cache or proxy hold a copy of someone's payslip.
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      // Don't leak the payslip URL to third parties if the viewer navigates on.
      "Referrer-Policy": "no-referrer",
    },
  });
}
