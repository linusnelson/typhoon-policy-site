import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF } from "./theme";

// Loan / Advance statement with the amortization schedule. Generated on
// demand (never stored) once a request is approved; access is governed by
// RLS on advance_requests (own / admin) in the route handler.

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48 },
  band: {
    borderBottomWidth: 2,
    borderBottomColor: PDF.brand,
    paddingBottom: 10,
    marginBottom: 16,
  },
  company: { fontSize: 9, fontFamily: "Helvetica-Bold", color: PDF.brand, letterSpacing: 1 },
  docTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: PDF.ink, marginTop: 4 },
  meta: { fontSize: 9, color: PDF.gray500, marginTop: 4 },
  section: { fontSize: 11, fontFamily: "Helvetica-Bold", color: PDF.ink, marginTop: 16, marginBottom: 8 },
  box: { borderWidth: 1, borderColor: PDF.gray200, borderRadius: 6, padding: 12 },
  row: { flexDirection: "row", marginBottom: 6 },
  label: { width: 150, fontSize: 9, color: PDF.gray500 },
  value: { flex: 1, fontSize: 9, fontFamily: "Helvetica-Bold", color: PDF.ink },
  note: { fontSize: 8.5, color: PDF.gray500, marginTop: 8, lineHeight: 1.5 },
  // Amortization table
  th: {
    flexDirection: "row",
    backgroundColor: PDF.gray100,
    borderWidth: 1,
    borderColor: PDF.gray200,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  tr: {
    flexDirection: "row",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: PDF.gray200,
  },
  thCell: { fontSize: 8, fontFamily: "Helvetica-Bold", color: PDF.gray700, padding: 6 },
  tdCell: { fontSize: 8.5, color: PDF.ink, padding: 6 },
  cNo: { width: "8%" },
  cMonth: { width: "22%" },
  cEmi: { width: "20%", textAlign: "right" },
  cStatus: { width: "16%" },
  cPaid: { width: "16%" },
  cBal: { width: "18%", textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: PDF.gray200,
    backgroundColor: PDF.gray100,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    fontSize: 7.5,
    color: PDF.gray500,
    textAlign: "center",
  },
});

export interface LoanPdfRow {
  no: number;
  dueMonth: string; // already formatted, e.g. "Aug 2026"
  emi: string; // formatted ₹
  status: string; // Scheduled / Paid / Waived / Indicative
  paidOn: string; // formatted date or "—"
  balanceAfter: string; // formatted ₹ (principal outstanding after this EMI)
}

export interface LoanPdfData {
  companyName: string;
  employeeName: string;
  employeeCode: string | null;
  requestId: string;
  status: string;
  amount: string; // formatted ₹
  reason: string | null;
  installments: number;
  requestedAt: string; // formatted
  approvedAt: string | null;
  disbursedAt: string | null;
  firstDeductionMonth: string | null; // formatted month
  outstanding: string; // formatted ₹
  indicative: boolean; // schedule not yet generated (approved, undisbursed)
  rows: LoanPdfRow[];
  generatedAt: string; // formatted
}

export function LoanPdf(d: LoanPdfData) {
  return (
    <Document
      title={`Loan-Advance Statement — ${d.employeeName}`}
      author={d.companyName}
    >
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <Text style={s.company}>{d.companyName.toUpperCase()}</Text>
          <Text style={s.docTitle}>Loan / Advance Statement</Text>
          <Text style={s.meta}>
            Reference {d.requestId.slice(0, 8).toUpperCase()} · Status:{" "}
            {d.status.toUpperCase()} · Generated {d.generatedAt}
          </Text>
        </View>

        <Text style={s.section}>Borrower</Text>
        <View style={s.box}>
          <Row label="Employee" value={d.employeeName} />
          <Row label="Employee code" value={d.employeeCode ?? "—"} />
        </View>

        <Text style={s.section}>Loan / Advance details</Text>
        <View style={s.box}>
          <Row label="Principal amount" value={d.amount} />
          <Row label="Interest" value="Interest-free (per policy)" />
          <Row label="Repayment months" value={String(d.installments)} />
          {d.reason ? <Row label="Purpose" value={d.reason} /> : null}
          <Row label="Requested on" value={d.requestedAt} />
          <Row label="Approved on" value={d.approvedAt ?? "—"} />
          <Row label="Disbursed on" value={d.disbursedAt ?? "Pending disbursal"} />
          <Row
            label="First deduction month"
            value={d.firstDeductionMonth ?? "Set at disbursal"}
          />
          <Row label="Outstanding balance" value={d.outstanding} />
        </View>

        <Text style={s.section}>
          {d.indicative ? "Amortization schedule (indicative)" : "Amortization schedule"}
        </Text>
        <View style={s.th}>
          <Text style={[s.thCell, s.cNo]}>#</Text>
          <Text style={[s.thCell, s.cMonth]}>Due month</Text>
          <Text style={[s.thCell, s.cEmi]}>EMI</Text>
          <Text style={[s.thCell, s.cStatus]}>Status</Text>
          <Text style={[s.thCell, s.cPaid]}>Paid on</Text>
          <Text style={[s.thCell, s.cBal]}>Balance after</Text>
        </View>
        {d.rows.map((r) => (
          <View style={s.tr} key={r.no} wrap={false}>
            <Text style={[s.tdCell, s.cNo]}>{r.no}</Text>
            <Text style={[s.tdCell, s.cMonth]}>{r.dueMonth}</Text>
            <Text style={[s.tdCell, s.cEmi]}>{r.emi}</Text>
            <Text style={[s.tdCell, s.cStatus]}>{r.status}</Text>
            <Text style={[s.tdCell, s.cPaid]}>{r.paidOn}</Text>
            <Text style={[s.tdCell, s.cBal]}>{r.balanceAfter}</Text>
          </View>
        ))}
        <View style={s.totalRow}>
          <Text style={[s.thCell, s.cNo]} />
          <Text style={[s.thCell, s.cMonth]}>Total</Text>
          <Text style={[s.thCell, s.cEmi]}>{d.amount}</Text>
          <Text style={[s.thCell, s.cStatus]} />
          <Text style={[s.thCell, s.cPaid]} />
          <Text style={[s.thCell, s.cBal]} />
        </View>

        {d.indicative ? (
          <Text style={s.note}>
            This schedule is indicative: the loan/advance is approved but not
            yet disbursed. The final schedule is fixed at disbursal, starting
            from the recorded first deduction month.
          </Text>
        ) : null}
        <Text style={s.note}>
          Repayment is by deduction from monthly salary under the Employee
          Loans &amp; Advances Policy. Early settlement is permitted at any
          time. This statement is generated from the Employee Portal, the
          Company&apos;s system of record; figures reflect the state at the
          generation time above.
        </Text>

        <Text style={s.footer} fixed>
          {d.companyName} — Loan/Advance Statement · Ref{" "}
          {d.requestId.slice(0, 8).toUpperCase()} · Confidential — for the named
          employee and authorised administrators only.
        </Text>
      </Page>
    </Document>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}
