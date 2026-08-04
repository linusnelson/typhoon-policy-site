import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { PdfHeader } from "./header";
import { PDF } from "./theme";

// Reimbursement payout sheet: every approved-but-unpaid expense claim rolled up
// to one line per employee, for whoever actually moves the money. Deliberately
// not month-scoped — an old unpaid claim must keep appearing until it's paid.
//
// Read-only by design: generating this does NOT mark anything reimbursed.
// Claims are closed when the payslip carrying them is imported, so the payslip
// and the claim records can never disagree about what was paid.
//
// Amounts arrive pre-formatted as "Rs. …" (no ₹ glyph in built-in Helvetica —
// see the payslip PDF for the same constraint).

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48 },
  note: { fontSize: 9, color: PDF.gray500, marginBottom: 10 },
  warn: {
    fontSize: 8.5,
    color: PDF.brandPress,
    fontFamily: "Helvetica-Bold",
    marginBottom: 10,
  },
  th: {
    flexDirection: "row",
    backgroundColor: PDF.gray100,
    borderWidth: 1,
    borderColor: PDF.gray200,
  },
  tr: {
    flexDirection: "row",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: PDF.gray200,
  },
  thCell: { fontSize: 8, fontFamily: "Helvetica-Bold", color: PDF.gray700, padding: 6 },
  tdCell: { fontSize: 9, color: PDF.ink, padding: 6 },
  cNo: { width: "8%" },
  cName: { width: "42%" },
  cCode: { width: "18%" },
  cCount: { width: "12%", textAlign: "right" },
  cAmount: { width: "20%", textAlign: "right" },
  grand: {
    flexDirection: "row",
    marginTop: 14,
    borderWidth: 1,
    borderColor: PDF.brand,
    backgroundColor: PDF.gray100,
  },
  signRow: { flexDirection: "row", gap: 28, marginTop: 44 },
  signBox: { flex: 1 },
  signLine: { borderTopWidth: 1, borderTopColor: PDF.gray300, paddingTop: 5 },
  signLabel: { fontSize: 8, color: PDF.gray500 },
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

export interface PayoutPdfRow {
  name: string;
  code: string | null;
  claimCount: number;
  amount: string; // "Rs. 4,250.00"
}

export interface ReimbursementPayoutPdfData {
  companyName: string;
  rows: PayoutPdfRow[];
  grandTotal: string;
  totalClaims: number;
  truncated: boolean;
  generatedAt: string;
}

export function ReimbursementPayoutPdf(d: ReimbursementPayoutPdfData) {
  return (
    <Document title="Reimbursement Payout Sheet" author={d.companyName}>
      <Page size="A4" style={s.page}>
        <PdfHeader
          companyName={d.companyName}
          documentTitle="Reimbursement Payout Sheet"
          meta={`Approved expense claims awaiting reimbursement · Generated ${d.generatedAt}`}
        />

        {d.truncated && (
          <Text style={s.warn}>
            WARNING: the claim limit was reached — this sheet is incomplete and
            the total below understates what is owed. Reimburse these, then
            generate the sheet again.
          </Text>
        )}

        {d.rows.length === 0 ? (
          <Text style={s.note}>
            Nothing is awaiting reimbursement. Every approved claim has been
            paid.
          </Text>
        ) : (
          <>
            <Text style={s.note}>
              {d.totalClaims} approved claim{d.totalClaims === 1 ? "" : "s"}{" "}
              across {d.rows.length} employee{d.rows.length === 1 ? "" : "s"}.
            </Text>

            {/* fixed = repeats atop every page; a payout sheet that runs to
                page 2 must still say which column is the amount. */}
            <View style={s.th} wrap={false} fixed>
              <Text style={[s.thCell, s.cNo]}>#</Text>
              <Text style={[s.thCell, s.cName]}>Employee</Text>
              <Text style={[s.thCell, s.cCode]}>Code</Text>
              <Text style={[s.thCell, s.cCount]}>Claims</Text>
              <Text style={[s.thCell, s.cAmount]}>Amount</Text>
            </View>
            {d.rows.map((r, i) => (
              <View key={i} style={s.tr} wrap={false}>
                <Text style={[s.tdCell, s.cNo]}>{i + 1}</Text>
                <Text style={[s.tdCell, s.cName]}>{r.name}</Text>
                <Text style={[s.tdCell, s.cCode]}>{r.code ?? "—"}</Text>
                <Text style={[s.tdCell, s.cCount]}>{r.claimCount}</Text>
                <Text style={[s.tdCell, s.cAmount]}>{r.amount}</Text>
              </View>
            ))}

            <View style={s.grand} wrap={false}>
              <Text
                style={[
                  s.tdCell,
                  { width: "80%", fontFamily: "Helvetica-Bold" },
                ]}
              >
                TOTAL TO REIMBURSE
              </Text>
              <Text
                style={[s.tdCell, s.cAmount, { fontFamily: "Helvetica-Bold" }]}
              >
                {d.grandTotal}
              </Text>
            </View>

            <View style={s.signRow} wrap={false}>
              <View style={s.signBox}>
                <View style={s.signLine}>
                  <Text style={s.signLabel}>Prepared by</Text>
                </View>
              </View>
              <View style={s.signBox}>
                <View style={s.signLine}>
                  <Text style={s.signLabel}>Approved by</Text>
                </View>
              </View>
              <View style={s.signBox}>
                <View style={s.signLine}>
                  <Text style={s.signLabel}>Paid on / reference</Text>
                </View>
              </View>
            </View>
          </>
        )}

        <Text style={s.footer} fixed>
          {d.companyName} · Reimbursement Payout Sheet · Generated{" "}
          {d.generatedAt}
        </Text>
      </Page>
    </Document>
  );
}
