import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF } from "./theme";

// Monthly consolidated expense report (tables only) for admin + accounts:
// per-employee sections with per-schedule subtotals and a grand total.
// Amounts arrive pre-formatted as "Rs. …" (no ₹ glyph in built-in Helvetica).

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48 },
  band: {
    borderBottomWidth: 2,
    borderBottomColor: PDF.brand,
    paddingBottom: 10,
    marginBottom: 16,
  },
  company: { fontSize: 9, fontFamily: "Helvetica-Bold", color: PDF.brand, letterSpacing: 1 },
  docTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", color: PDF.ink, marginTop: 4 },
  meta: { fontSize: 9, color: PDF.gray500, marginTop: 4 },
  employee: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: PDF.ink,
    marginTop: 14,
    marginBottom: 4,
  },
  schedule: { fontSize: 9, color: PDF.gray700, marginTop: 6, marginBottom: 4 },
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
  thCell: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: PDF.gray700, padding: 5 },
  tdCell: { fontSize: 8, color: PDF.ink, padding: 5 },
  cDate: { width: "12%" },
  cDesc: { width: "30%" },
  cType: { width: "16%" },
  cStatus: { width: "12%" },
  cClaimed: { width: "15%", textAlign: "right" },
  cApproved: { width: "15%", textAlign: "right" },
  subtotal: {
    flexDirection: "row",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: PDF.gray200,
    backgroundColor: PDF.gray100,
  },
  grand: {
    flexDirection: "row",
    marginTop: 14,
    borderWidth: 1,
    borderColor: PDF.brand,
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

export interface MonthPdfClaimRow {
  billDate: string;
  description: string;
  category: string;
  status: string;
  claimed: string;
  approved: string; // "" for pending/rejected
}

export interface MonthPdfSchedule {
  heading: string; // "<label> · <clients> · <date>"
  rows: MonthPdfClaimRow[];
  subtotalClaimed: string;
  subtotalApproved: string;
}

export interface MonthPdfEmployee {
  name: string;
  code: string | null;
  schedules: MonthPdfSchedule[];
}

export interface ExpensesMonthPdfData {
  companyName: string;
  monthLabel: string; // "July 2026"
  employees: MonthPdfEmployee[];
  grandClaimed: string;
  grandApproved: string;
  generatedAt: string;
}

export function ExpensesMonthPdf(d: ExpensesMonthPdfData) {
  return (
    <Document title={`Expense Report — ${d.monthLabel}`} author={d.companyName}>
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <Text style={s.company}>{d.companyName.toUpperCase()}</Text>
          <Text style={s.docTitle}>
            Consolidated Expense Report — {d.monthLabel}
          </Text>
          <Text style={s.meta}>
            All submitted visit expenses (pending, approved, rejected,
            reimbursed) · Generated {d.generatedAt}
          </Text>
        </View>

        {d.employees.length === 0 && (
          <Text style={s.meta}>No expenses were submitted this month.</Text>
        )}

        {d.employees.map((e, ei) => (
          <View key={ei}>
            <Text style={s.employee}>
              {e.name}
              {e.code ? `  (${e.code})` : ""}
            </Text>
            {e.schedules.map((sc, si) => (
              <View key={si}>
                <Text style={s.schedule}>{sc.heading}</Text>
                <View style={s.th} wrap={false}>
                  <Text style={[s.thCell, s.cDate]}>Bill date</Text>
                  <Text style={[s.thCell, s.cDesc]}>Description</Text>
                  <Text style={[s.thCell, s.cType]}>Type</Text>
                  <Text style={[s.thCell, s.cStatus]}>Status</Text>
                  <Text style={[s.thCell, s.cClaimed]}>Claimed</Text>
                  <Text style={[s.thCell, s.cApproved]}>Approved</Text>
                </View>
                {sc.rows.map((r, ri) => (
                  <View key={ri} style={s.tr} wrap={false}>
                    <Text style={[s.tdCell, s.cDate]}>{r.billDate}</Text>
                    <Text style={[s.tdCell, s.cDesc]}>{r.description}</Text>
                    <Text style={[s.tdCell, s.cType]}>{r.category}</Text>
                    <Text style={[s.tdCell, s.cStatus]}>{r.status}</Text>
                    <Text style={[s.tdCell, s.cClaimed]}>{r.claimed}</Text>
                    <Text style={[s.tdCell, s.cApproved]}>{r.approved}</Text>
                  </View>
                ))}
                <View style={s.subtotal} wrap={false}>
                  <Text style={[s.tdCell, { width: "70%", fontFamily: "Helvetica-Bold" }]}>
                    Subtotal
                  </Text>
                  <Text style={[s.tdCell, s.cClaimed, { fontFamily: "Helvetica-Bold" }]}>
                    {sc.subtotalClaimed}
                  </Text>
                  <Text style={[s.tdCell, s.cApproved, { fontFamily: "Helvetica-Bold" }]}>
                    {sc.subtotalApproved}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ))}

        {d.employees.length > 0 && (
          <View style={s.grand} wrap={false}>
            <Text style={[s.tdCell, { width: "70%", fontFamily: "Helvetica-Bold" }]}>
              GRAND TOTAL (claimed / approved)
            </Text>
            <Text style={[s.tdCell, s.cClaimed, { fontFamily: "Helvetica-Bold" }]}>
              {d.grandClaimed}
            </Text>
            <Text style={[s.tdCell, s.cApproved, { fontFamily: "Helvetica-Bold" }]}>
              {d.grandApproved}
            </Text>
          </View>
        )}

        <Text style={s.footer} fixed>
          {d.companyName} · Consolidated Expense Report — {d.monthLabel}
        </Text>
      </Page>
    </Document>
  );
}
