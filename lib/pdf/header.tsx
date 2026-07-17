import React from "react";
import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { PDF } from "./theme";
import { EMBLEM_DATA_URL } from "./emblem";

// The masthead every PDF in this app opens with: emblem on the left, then the
// company identity and document title stacked to its right, over a brand-purple
// rule. Templates must not hand-roll their own band — a document that prints
// without the emblem is not a document this company issued.
//
// `compact` is for A4-landscape (the muster), where vertical space is scarce.
// The emblem is inlined from emblem.ts rather than read from public/ — see the
// note there on why the filesystem isn't reliable at runtime.

export const COMPANY_NAME_FALLBACK = "Typhoon Electronic Solutions";

// Every PDF call site resolves the org row the same way and needs the same
// fallback when the org has no name set. One definition, six callers.
export function pdfCompanyName(
  org: { name?: string | null } | null | undefined
): string {
  return org?.name || COMPANY_NAME_FALLBACK;
}

const s = StyleSheet.create({
  band: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 2,
    borderBottomColor: PDF.brand,
    paddingBottom: 10,
    marginBottom: 16,
  },
  bandCompact: {
    borderBottomWidth: 1.5,
    paddingBottom: 6,
    marginBottom: 8,
    gap: 8,
  },
  emblem: { width: 44, height: 44 },
  emblemCompact: { width: 26, height: 26 },
  company: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: PDF.brand,
    letterSpacing: 1,
  },
  address: { fontSize: 8, color: PDF.gray500, marginTop: 3, lineHeight: 1.4 },
  title: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: PDF.ink,
    marginTop: 4,
  },
  titleCompact: { fontSize: 14, marginTop: 2 },
  meta: { fontSize: 9, color: PDF.gray500, marginTop: 4 },
});

export interface PdfHeaderProps {
  /** Omit to print the emblem alone (the muster, where the name is redundant). */
  companyName?: string;
  /** Payslip only — "" when not configured. */
  companyAddress?: string;
  documentTitle: string;
  /** Sub-title line: version, reference, generated-at. */
  meta?: string;
  /** Right-aligned block (muster's scope + page counter). */
  right?: React.ReactNode;
  /** Tighter rule and type for A4 landscape. */
  compact?: boolean;
}

export function PdfHeader({
  companyName,
  companyAddress,
  documentTitle,
  meta,
  right,
  compact,
}: PdfHeaderProps) {
  return (
    <View style={compact ? [s.band, s.bandCompact] : s.band}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image
        src={EMBLEM_DATA_URL}
        style={compact ? s.emblemCompact : s.emblem}
      />
      <View style={{ flex: 1 }}>
        {companyName ? (
          <Text style={s.company}>{companyName.toUpperCase()}</Text>
        ) : null}
        {companyAddress ? <Text style={s.address}>{companyAddress}</Text> : null}
        <Text style={compact ? [s.title, s.titleCompact] : s.title}>
          {documentTitle}
        </Text>
        {meta ? <Text style={s.meta}>{meta}</Text> : null}
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}
