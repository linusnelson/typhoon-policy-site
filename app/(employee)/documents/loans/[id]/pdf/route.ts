import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { LoanPdf, type LoanPdfRow } from "@/lib/pdf/loan-pdf";
import {
  buildInstallmentSchedule,
  defaultFirstDeductionMonth,
} from "@/lib/engine/advance";
import { formatINR, formatMonth } from "@/lib/format";
import { formatIstDate, formatIstDateTime, istToday } from "@/lib/ist";

export const runtime = "nodejs";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  paid: "Paid",
  waived: "Waived",
};

// Streams the loan/advance statement PDF (details + amortization schedule).
// Available once a request is approved. Access is governed by RLS on
// advance_requests: an employee fetches their own; admins any in the org.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: req } = await supabase
    .from("advance_requests")
    .select(
      "*, employees!advance_requests_employee_id_fkey(name, employee_code)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!req) return new NextResponse("Not found", { status: 404 });

  // The statement exists only for approved-or-later requests.
  if (!["approved", "repaying", "closed"].includes(req.status as string)) {
    return new NextResponse("Not available for this request.", { status: 404 });
  }

  const [{ data: schedule }, { data: org }] = await Promise.all([
    supabase
      .from("advance_repayments")
      .select("installment_no, due_month, amount, status, paid_at")
      .eq("advance_request_id", id)
      .order("installment_no"),
    supabase.from("organizations").select("name").maybeSingle(),
  ]);

  const amount = Number(req.amount);
  const indicative = !schedule?.length;

  // Approved-but-undisbursed: show an indicative schedule from the engine
  // (final one is generated at disbursal).
  const scheduleRows = indicative
    ? buildInstallmentSchedule(
        amount,
        req.installments as number,
        defaultFirstDeductionMonth(istToday())
      ).map((r) => ({
        installment_no: r.installment_no,
        due_month: r.due_month,
        amount: r.amount,
        status: "indicative",
        paid_at: null as string | null,
      }))
    : (schedule ?? []);

  // Amortization: principal balance remaining after each EMI (waived rows
  // also reduce the balance owed — they are forgiven, not deferred).
  let balancePaise = Math.round(amount * 100);
  const rows: LoanPdfRow[] = scheduleRows.map((r) => {
    balancePaise -= Math.round(Number(r.amount) * 100);
    return {
      no: r.installment_no as number,
      dueMonth: formatMonth(r.due_month as string),
      emi: formatINR(Number(r.amount)),
      status: STATUS_LABEL[r.status as string] ?? "Indicative",
      paidOn: r.paid_at ? formatIstDate(r.paid_at) : "—",
      balanceAfter: formatINR(Math.max(0, balancePaise) / 100),
    };
  });

  const outstanding = indicative
    ? amount
    : (schedule ?? [])
        .filter((r) => r.status === "scheduled")
        .reduce((s, r) => s + Number(r.amount), 0);

  const emp = req.employees as { name: string | null; employee_code: string | null } | null;

  const buffer = await renderToBuffer(
    LoanPdf({
      companyName: (org?.name as string) ?? "Typhoon Electronic Solutions",
      employeeName: emp?.name ?? "Employee",
      employeeCode: emp?.employee_code ?? null,
      requestId: req.id as string,
      status: req.status as string,
      amount: formatINR(amount),
      reason: (req.reason as string | null) ?? null,
      installments: req.installments as number,
      requestedAt: formatIstDate(req.requested_at as string),
      approvedAt: req.reviewed_at ? formatIstDate(req.reviewed_at as string) : null,
      disbursedAt: req.disbursed_at ? formatIstDate(req.disbursed_at as string) : null,
      firstDeductionMonth: req.first_deduction_month
        ? formatMonth(req.first_deduction_month as string)
        : null,
      outstanding: formatINR(outstanding),
      indicative,
      rows,
      generatedAt: formatIstDateTime(new Date()),
    })
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="loan-statement-${(req.id as string).slice(0, 8)}.pdf"`,
    },
  });
}
