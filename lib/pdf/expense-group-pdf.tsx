import React from "react";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { PdfHeader } from "./header";
import { PDF } from "./theme";

// Travel-expense report for one visit-schedule group: a cover page (title,
// employee, expense table, totals) followed by bill-image pages packed four
// to an A4 (2×2 grid). Uploaded PDF bills are appended AFTERWARDS by the
// route handler via pdf-lib — they are listed on the cover for reference.
//
// Amounts arrive pre-formatted as "Rs. …" — the built-in Helvetica faces have
// no ₹ glyph (no Font.register anywhere in this app), so the rupee sign is
// deliberately avoided in PDFs.

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48 },
  section: { fontSize: 11, fontFamily: "Helvetica-Bold", color: PDF.ink, marginTop: 16, marginBottom: 8 },
  box: { borderWidth: 1, borderColor: PDF.gray200, borderRadius: 6, padding: 12 },
  row: { flexDirection: "row", marginBottom: 6 },
  label: { width: 150, fontSize: 9, color: PDF.gray500 },
  value: { flex: 1, fontSize: 9, fontFamily: "Helvetica-Bold", color: PDF.ink },
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
  cDate: { width: "14%" },
  cDesc: { width: "34%" },
  cType: { width: "18%" },
  cStatus: { width: "14%" },
  cAmt: { width: "20%", textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: PDF.gray200,
    backgroundColor: PDF.gray100,
  },
  note: { fontSize: 8.5, color: PDF.gray500, marginTop: 8, lineHeight: 1.5 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    fontSize: 7.5,
    color: PDF.gray500,
    textAlign: "center",
  },
  // Bill image pages: 2×2 grid.
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  cell: {
    width: "48%",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: PDF.gray200,
    borderRadius: 4,
    padding: 6,
  },
  cellCaption: { fontSize: 7.5, color: PDF.gray500, marginBottom: 4 },
  cellImage: { width: "100%", maxHeight: 280, objectFit: "contain" },
});

export interface ExpenseGroupPdfRow {
  billDate: string; // formatted
  description: string;
  category: string;
  status: string;
  amount: string; // formatted "Rs. …"
}

export interface ExpenseGroupPdfImage {
  caption: string; // "<category> · <bill date> · <file name>"
  dataUrl: string; // JPEG data URL (sharp-converted)
}

export interface ExpenseGroupPdfData {
  companyName: string;
  title: string; // "Travel Expenses — <schedule> — <Month Yyyy>"
  employeeName: string;
  employeeCode: string | null;
  visitLabel: string;
  clients: string;
  visitDate: string; // formatted
  rows: ExpenseGroupPdfRow[];
  claimedTotal: string;
  approvedTotal: string;
  images: ExpenseGroupPdfImage[];
  pdfAttachmentNames: string[]; // appended after this doc by pdf-lib
  skippedFiles: string[]; // PDFs that failed to load / unsupported files
  generatedAt: string;
}

// Chunk bill images four per page.
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function ExpenseGroupPdf(d: ExpenseGroupPdfData) {
  return (
    <Document title={d.title} author={d.companyName}>
      {/* ── Cover: header, employee, expense table ── */}
      <Page size="A4" style={s.page}>
        <PdfHeader
          companyName={d.companyName}
          documentTitle={d.title}
          meta={`Generated ${d.generatedAt}`}
        />

        <Text style={s.section}>Employee</Text>
        <View style={s.box}>
          <Row label="Name" value={d.employeeName} />
          <Row label="Employee code" value={d.employeeCode ?? "—"} />
          <Row label="Visit" value={d.visitLabel} />
          {d.clients ? <Row label="Clients" value={d.clients} /> : null}
          <Row label="Visit date" value={d.visitDate} />
        </View>

        <Text style={s.section}>Expenses</Text>
        <View style={s.th}>
          <Text style={[s.thCell, s.cDate]}>Bill date</Text>
          <Text style={[s.thCell, s.cDesc]}>Description</Text>
          <Text style={[s.thCell, s.cType]}>Expense type</Text>
          <Text style={[s.thCell, s.cStatus]}>Status</Text>
          <Text style={[s.thCell, s.cAmt]}>Amount</Text>
        </View>
        {d.rows.map((r, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <Text style={[s.tdCell, s.cDate]}>{r.billDate}</Text>
            <Text style={[s.tdCell, s.cDesc]}>{r.description}</Text>
            <Text style={[s.tdCell, s.cType]}>{r.category}</Text>
            <Text style={[s.tdCell, s.cStatus]}>{r.status}</Text>
            <Text style={[s.tdCell, s.cAmt]}>{r.amount}</Text>
          </View>
        ))}
        <View style={s.totalRow}>
          <Text style={[s.tdCell, { width: "80%", fontFamily: "Helvetica-Bold" }]}>
            Total claimed / approved
          </Text>
          <Text style={[s.tdCell, s.cAmt, { fontFamily: "Helvetica-Bold" }]}>
            {d.claimedTotal} / {d.approvedTotal}
          </Text>
        </View>

        {d.pdfAttachmentNames.length > 0 && (
          <Text style={s.note}>
            PDF bills appended after the image pages:{" "}
            {d.pdfAttachmentNames.join(", ")}.
          </Text>
        )}
        {d.skippedFiles.length > 0 && (
          <Text style={s.note}>
            Could not be embedded (open in the portal instead):{" "}
            {d.skippedFiles.join(", ")}.
          </Text>
        )}

        <Text style={s.footer} fixed>
          {d.companyName} · {d.title} · generated from the expense portal
        </Text>
      </Page>

      {/* ── Bill images, four per A4 ── */}
      {chunk(d.images, 4).map((pageImages, p) => (
        <Page key={p} size="A4" style={s.page}>
          <Text style={[s.section, { marginTop: 0 }]}>
            Bills — page {p + 1}
          </Text>
          <View style={s.grid}>
            {pageImages.map((img, i) => (
              <View key={i} style={s.cell} wrap={false}>
                <Text style={s.cellCaption}>{img.caption}</Text>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image style={s.cellImage} src={img.dataUrl} />
              </View>
            ))}
          </View>
          <Text style={s.footer} fixed>
            {d.companyName} · {d.title}
          </Text>
        </Page>
      ))}
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
