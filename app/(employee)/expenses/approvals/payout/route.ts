import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireExpenseApprover, AuthzError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { moduleEnabled } from "@/lib/data/org";
import { pendingReimbursementPayout } from "@/lib/data/expenses";
import { ReimbursementPayoutPdf } from "@/lib/pdf/reimbursement-payout-pdf";
import { pdfCompanyName } from "@/lib/pdf/header";
import { formatIstDateTime, istToday } from "@/lib/ist";

export const runtime = "nodejs";

// Payout sheet for the "To reimburse" queue: one line per employee, whole
// queue regardless of month or age. No query params — the queue IS the scope.
// Read-only: this does not mark anything reimbursed (see the PDF's header
// comment for why).
export async function GET() {
  let me;
  try {
    me = await requireExpenseApprover();
  } catch (e) {
    if (e instanceof AuthzError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }
  if (!(await moduleEnabled(me.org_id, "expenses"))) {
    return NextResponse.json({ error: "The expenses module is disabled." }, { status: 404 });
  }

  const [payout, { data: org }] = await Promise.all([
    pendingReimbursementPayout(),
    (await createClient()).from("organizations").select("name").maybeSingle(),
  ]);

  // "Rs." not "₹" — built-in Helvetica has no rupee glyph.
  const inr = (n: number) =>
    `Rs. ${new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)}`;

  const buffer = await renderToBuffer(
    ReimbursementPayoutPdf({
      companyName: pdfCompanyName(org),
      rows: payout.employees.map((e) => ({
        name: e.employeeName,
        code: e.employeeCode,
        claimCount: e.claimCount,
        amount: inr(e.total),
      })),
      grandTotal: inr(payout.grandTotal),
      totalClaims: payout.claimCount,
      truncated: payout.truncated,
      generatedAt: formatIstDateTime(new Date()),
    })
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="reimbursement-payout-${istToday()}.pdf"`,
    },
  });
}
