import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { PdfHeader } from "./header";
import { PDF } from "./theme";

// Monthly payslip, generated from the payroll CSV import (actions/payslips.ts)
// and stored in the private `payslips` bucket. Layout follows the classic
// Indian payslip: company header, employee/statutory info grid, side-by-side
// earnings/deductions tables, net pay + amount in words. No YTD columns.
// All values arrive pre-formatted (repo convention — see LoanPdfData).

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 44 },
  // Employee / statutory info grid — two label:value pairs per row.
  infoBox: { borderWidth: 1, borderColor: PDF.gray200, borderRadius: 6, padding: 10 },
  infoRow: { flexDirection: "row", marginBottom: 5 },
  infoLabel: { width: "16%", fontSize: 8.5, color: PDF.gray500 },
  infoValue: { width: "34%", fontSize: 8.5, fontFamily: "Helvetica-Bold", color: PDF.ink, paddingRight: 8 },
  // Earnings / deductions tables
  tables: { flexDirection: "row", gap: 12, marginTop: 14 },
  table: { flex: 1 },
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
  totalRow: {
    flexDirection: "row",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: PDF.gray200,
    backgroundColor: PDF.gray100,
  },
  thItem: { flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold", color: PDF.gray700, padding: 6 },
  thAmount: { width: 80, fontSize: 8, fontFamily: "Helvetica-Bold", color: PDF.gray700, padding: 6, textAlign: "right" },
  tdItem: { flex: 1, fontSize: 8.5, color: PDF.ink, padding: 6 },
  tdAmount: { width: 80, fontSize: 8.5, color: PDF.ink, padding: 6, textAlign: "right" },
  totalItem: { flex: 1, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: PDF.ink, padding: 6 },
  totalAmount: { width: 80, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: PDF.ink, padding: 6, textAlign: "right" },
  netBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: PDF.gray200,
    borderRadius: 6,
    padding: 12,
    backgroundColor: PDF.gray100,
  },
  netRow: { flexDirection: "row", alignItems: "baseline" },
  netLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: PDF.ink },
  netValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: PDF.brand, marginLeft: 8 },
  netWords: { fontSize: 8.5, color: PDF.gray500, marginTop: 5, fontFamily: "Helvetica-Oblique" },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 44,
    right: 44,
    fontSize: 7.5,
    color: PDF.gray500,
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: PDF.gray200,
    paddingTop: 8,
  },
});

export interface PayslipPdfItem {
  label: string; // "BASIC", "PF", …
  amount: string; // formatted, e.g. "77,000.00"
}

export interface PayslipPdfData {
  companyName: string;
  companyAddress: string; // may be "" when not configured yet
  monthLabel: string; // "April 2026"
  // Info grid — left column (from DB)
  employeeName: string;
  employeeCode: string;
  joiningDate: string;
  designation: string;
  department: string;
  location: string;
  effectiveWorkDays: string;
  lop: string;
  // Info grid — right column (from the employee's profile bank details;
  // "" prints as "—")
  bankName: string;
  bankAccountNo: string;
  pan: string;
  earnings: PayslipPdfItem[];
  deductions: PayslipPdfItem[];
  totalEarnings: string;
  totalDeductions: string;
  netPay: string;
  netPayWords: string; // "Rupees … Only"
}

function InfoRow({
  l1,
  v1,
  l2,
  v2,
}: {
  l1: string;
  v1: string;
  l2?: string;
  v2?: string;
}) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{l1}</Text>
      <Text style={s.infoValue}>{v1 || "—"}</Text>
      <Text style={s.infoLabel}>{l2 ?? ""}</Text>
      <Text style={s.infoValue}>{l2 ? v2 || "—" : ""}</Text>
    </View>
  );
}

function ItemTable({
  heading,
  items,
  totalLabel,
  total,
}: {
  heading: string;
  items: PayslipPdfItem[];
  totalLabel: string;
  total: string;
}) {
  return (
    <View style={s.table}>
      <View style={s.th}>
        <Text style={s.thItem}>{heading}</Text>
        <Text style={s.thAmount}>Amount</Text>
      </View>
      {items.map((it, i) => (
        <View style={s.tr} key={`${it.label}-${i}`}>
          <Text style={s.tdItem}>{it.label}</Text>
          <Text style={s.tdAmount}>{it.amount}</Text>
        </View>
      ))}
      <View style={s.totalRow}>
        <Text style={s.totalItem}>{totalLabel}</Text>
        <Text style={s.totalAmount}>{total}</Text>
      </View>
    </View>
  );
}

export function PayslipPdf(d: PayslipPdfData) {
  return (
    <Document
      title={`Payslip ${d.monthLabel} — ${d.employeeName}`}
      author={d.companyName}
    >
      <Page size="A4" style={s.page}>
        <PdfHeader
          companyName={d.companyName}
          companyAddress={d.companyAddress}
          documentTitle={`Payslip for the month of ${d.monthLabel}`}
        />

        <View style={s.infoBox}>
          <InfoRow l1="Name" v1={d.employeeName} l2="Employee No" v2={d.employeeCode} />
          <InfoRow l1="Joining Date" v1={d.joiningDate} l2="Bank Name" v2={d.bankName} />
          <InfoRow l1="Designation" v1={d.designation} l2="Bank Account No" v2={d.bankAccountNo} />
          <InfoRow l1="Department" v1={d.department} l2="PAN Number" v2={d.pan} />
          <InfoRow l1="Location" v1={d.location} l2="Effective Work Days" v2={d.effectiveWorkDays} />
          <InfoRow l1="LOP" v1={d.lop} />
        </View>

        <View style={s.tables}>
          <ItemTable
            heading="Earnings"
            items={d.earnings}
            totalLabel="Total Earnings: INR"
            total={d.totalEarnings}
          />
          <ItemTable
            heading="Deduction"
            items={d.deductions}
            totalLabel="Total Deductions: INR"
            total={d.totalDeductions}
          />
        </View>

        <View style={s.netBox}>
          <View style={s.netRow}>
            <Text style={s.netLabel}>Net Pay for the month :</Text>
            <Text style={s.netValue}>{d.netPay}</Text>
          </View>
          <Text style={s.netWords}>({d.netPayWords})</Text>
        </View>

        <Text style={s.footer} fixed>
          This is a system generated payslip and does not require signature
        </Text>
      </Page>
    </Document>
  );
}
