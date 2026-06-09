import React from "react";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { markdownToPdf } from "./mdast-to-pdf";

const INK = "#0A0A0A";
const GRAY500 = "#72726C";
const GRAY200 = "#E7E7E3";
const AMBER = "#F8A71B";

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48 },
  band: {
    borderBottomWidth: 2,
    borderBottomColor: AMBER,
    paddingBottom: 10,
    marginBottom: 16,
  },
  company: { fontSize: 9, fontFamily: "Helvetica-Bold", color: AMBER, letterSpacing: 1 },
  docTitle: { fontSize: 20, fontFamily: "Helvetica-Bold", color: INK, marginTop: 4 },
  meta: { fontSize: 9, color: GRAY500, marginTop: 4 },
  ackTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 10 },
  ackIntro: { fontSize: 10, color: "#363632", lineHeight: 1.5, marginBottom: 14 },
  ackBox: { borderWidth: 1, borderColor: GRAY200, borderRadius: 6, padding: 14 },
  row: { flexDirection: "row", marginBottom: 7 },
  label: { width: 130, fontSize: 9, color: GRAY500 },
  value: { flex: 1, fontSize: 9, fontFamily: "Helvetica-Bold", color: INK },
  mono: { flex: 1, fontSize: 8, fontFamily: "Courier", color: INK },
  sigBlock: { marginTop: 18 },
  sigLabel: { fontSize: 9, color: GRAY500, marginBottom: 4 },
  sigImageBox: {
    borderWidth: 1,
    borderColor: GRAY200,
    borderRadius: 6,
    padding: 8,
    width: 240,
    height: 110,
    justifyContent: "center",
  },
  sigImage: { objectFit: "contain", maxHeight: 90 },
  sigName: { fontSize: 9, color: INK, marginTop: 5, fontFamily: "Helvetica-Bold" },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    fontSize: 7.5,
    color: GRAY500,
    textAlign: "center",
  },
});

export interface SignedPdfData {
  companyName: string;
  documentTitle: string;
  versionLabel: string;
  effectiveDate: string | null;
  contentMd: string;
  signerName: string;
  employeeCode: string | null;
  signedAt: string;
  contentHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  signatureImage: string | null;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { dateStyle: "long" });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={mono ? s.mono : s.value}>{value}</Text>
    </View>
  );
}

export function PolicyPdf(d: SignedPdfData) {
  return (
    <Document
      title={`${d.documentTitle} v${d.versionLabel} — signed by ${d.signerName}`}
      author={d.companyName}
    >
      {/* Policy body */}
      <Page size="A4" style={s.page} wrap>
        <View style={s.band}>
          <Text style={s.company}>{d.companyName.toUpperCase()}</Text>
          <Text style={s.docTitle}>{d.documentTitle}</Text>
          <Text style={s.meta}>
            Version {d.versionLabel}
            {d.effectiveDate ? `  ·  Effective ${fmtDate(d.effectiveDate)}` : ""}
          </Text>
        </View>
        {markdownToPdf(d.contentMd)}
        <Text
          style={s.footer}
          render={({ pageNumber, totalPages }) =>
            `${d.documentTitle} v${d.versionLabel}  ·  Page ${pageNumber} of ${totalPages}  ·  Acknowledged by ${d.signerName}`
          }
          fixed
        />
      </Page>

      {/* Acknowledgement page */}
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <Text style={s.company}>{d.companyName.toUpperCase()}</Text>
          <Text style={s.docTitle}>Acknowledgement of Receipt</Text>
        </View>
        <Text style={s.ackTitle}>{d.documentTitle} — Version {d.versionLabel}</Text>
        <Text style={s.ackIntro}>
          The individual identified below has electronically confirmed that they
          have read and understood this policy document and agree to comply with
          it. This record is generated from the Company&apos;s policy system and
          is bound to the exact text of the version identified by the content
          hash below.
        </Text>
        <View style={s.ackBox}>
          <Row label="Signed by" value={d.signerName} />
          {d.employeeCode && <Row label="Employee ID" value={d.employeeCode} />}
          <Row label="Document" value={`${d.documentTitle} (v${d.versionLabel})`} />
          <Row label="Date & time (IST)" value={fmtDateTime(d.signedAt)} />
          <Row label="Content hash (SHA-256)" value={d.contentHash} mono />
          <Row label="IP address" value={d.ipAddress ?? "—"} />
          <Row label="Device" value={(d.userAgent ?? "—").slice(0, 120)} />
        </View>
        {d.signatureImage && (
          <View style={s.sigBlock}>
            <Text style={s.sigLabel}>Signature</Text>
            <View style={s.sigImageBox}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={d.signatureImage} style={s.sigImage} />
            </View>
            <Text style={s.sigName}>{d.signerName}</Text>
          </View>
        )}
        <Text style={s.footer} fixed>
          This is a system-generated acknowledgement record. No physical
          signature is required.
        </Text>
      </Page>
    </Document>
  );
}
