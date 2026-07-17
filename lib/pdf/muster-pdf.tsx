import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { PdfHeader } from "./header";
import { PDF } from "./theme";
import {
  collapseQuarters,
  fmtDays,
  MUSTER_STYLES,
  MUSTER_LEGEND_ORDER,
  type MusterDateMeta,
  type MusterRow,
  type QuarterStatus,
} from "@/lib/data/report-types";

// A4-landscape monthly muster (attendance register). One month per document;
// employees paginate across pages with the day-header row repeated on each.
// Day cells render their 2-hour quarter slots as proportional coloured blocks,
// mirroring the on-screen grid.

const WD = ["S", "M", "T", "W", "T", "F", "S"];
const ROWS_PER_PAGE = 22; // fits an A4 landscape page with header + legend

const NAME_W = 118;
const SUM_W = 22; // each of P / L / A

const s = StyleSheet.create({
  page: { paddingTop: 26, paddingBottom: 30, paddingHorizontal: 24 },
  meta: { fontSize: 7.5, color: PDF.gray500, textAlign: "right" },
  legend: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8, gap: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", marginRight: 8 },
  swatch: {
    width: 11,
    height: 11,
    borderRadius: 2,
    marginRight: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchTxt: { fontSize: 6, fontFamily: "Helvetica-Bold" },
  legendTxt: { fontSize: 7, color: PDF.gray500 },
  // grid
  headRow: { flexDirection: "row", alignItems: "stretch" },
  row: { flexDirection: "row", alignItems: "stretch", minHeight: 16 },
  nameCell: {
    width: NAME_W,
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderColor: PDF.gray200,
  },
  nameTxt: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: PDF.ink },
  deptTxt: { fontSize: 6, color: PDF.gray500 },
  dayHead: {
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 0.5,
    borderLeftWidth: 0.5,
    borderColor: PDF.gray200,
    paddingVertical: 2,
  },
  dayHeadWk: { fontSize: 5.5, color: PDF.gray500 },
  dayHeadNum: { fontSize: 7, fontFamily: "Helvetica-Bold", color: PDF.gray700 },
  dayCellWrap: {
    borderBottomWidth: 0.5,
    borderLeftWidth: 0.5,
    borderColor: PDF.gray200,
    padding: 1.5,
    justifyContent: "center",
  },
  quarterRow: { flexDirection: "row", height: 11, borderRadius: 1.5, overflow: "hidden" },
  quarter: { alignItems: "center", justifyContent: "center" },
  quarterTxt: { fontSize: 6, fontFamily: "Helvetica-Bold" },
  sumHead: {
    width: SUM_W,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 0.5,
    borderLeftWidth: 0.5,
    borderColor: PDF.gray200,
    paddingVertical: 2,
  },
  sumHeadTxt: { fontSize: 7, fontFamily: "Helvetica-Bold", color: PDF.gray700 },
  sumCell: {
    width: SUM_W,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 0.5,
    borderLeftWidth: 0.5,
    borderColor: PDF.gray200,
  },
  sumTxt: { fontSize: 7, fontFamily: "Helvetica-Bold" },
  footer: {
    position: "absolute",
    bottom: 14,
    left: 24,
    right: 24,
    fontSize: 6.5,
    color: PDF.gray500,
    textAlign: "center",
  },
});

export interface MusterPdfData {
  companyName: string;
  monthLabel: string;
  scopeLabel: string; // e.g. "All departments · All locations" or "My team"
  generatedAt: string;
  dates: MusterDateMeta[];
  rows: MusterRow[];
}

function DayHead({ d, w }: { d: MusterDateMeta; w: number }) {
  const bg = d.isWeekend || d.isHoliday ? PDF.gray100 : undefined;
  return (
    <View style={[s.dayHead, { width: w, backgroundColor: bg }]}>
      <Text style={s.dayHeadWk}>{WD[d.weekday]}</Text>
      <Text style={[s.dayHeadNum, d.isHoliday ? { color: PDF.brand } : {}]}>{d.day}</Text>
    </View>
  );
}

function DayCell({
  quarters,
  w,
}: {
  quarters: QuarterStatus[];
  w: number;
}) {
  const runs = collapseQuarters(quarters);
  return (
    <View style={[s.dayCellWrap, { width: w }]}>
      <View style={s.quarterRow}>
        {runs.map((run, i) => {
          const st = MUSTER_STYLES[run.status];
          return (
            <View
              key={i}
              style={[s.quarter, { flexGrow: run.span, flexBasis: 0, backgroundColor: st.bg }]}
            >
              {st.letter && run.span >= 2 ? (
                <Text style={[s.quarterTxt, { color: st.fg }]}>{st.letter}</Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function MusterPdf(d: MusterPdfData) {
  // A4 landscape usable width ≈ 842 - 48 = 794pt. Reserve name + 3 summary cols.
  const gridWidth = 794 - NAME_W - SUM_W * 3;
  const dayW = Math.max(10, gridWidth / Math.max(1, d.dates.length));

  const pages: MusterRow[][] = [];
  for (let i = 0; i < d.rows.length; i += ROWS_PER_PAGE) {
    pages.push(d.rows.slice(i, i + ROWS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);

  return (
    <Document title={`Attendance Muster — ${d.monthLabel}`} author={d.companyName}>
      {pages.map((pageRows, pi) => (
        <Page key={pi} size="A4" orientation="landscape" style={s.page}>
          {/* Emblem alone — the company name is already in the fixed footer. */}
          <PdfHeader
            compact
            documentTitle={`Attendance Muster — ${d.monthLabel}`}
            right={
              <>
                <Text style={s.meta}>{d.scopeLabel}</Text>
                <Text style={s.meta}>
                  Page {pi + 1} of {pages.length} · Generated {d.generatedAt}
                </Text>
              </>
            }
          />

          {pi === 0 && (
            <View style={s.legend}>
              {MUSTER_LEGEND_ORDER.map((key) => {
                const st = MUSTER_STYLES[key];
                return (
                  <View key={key} style={s.legendItem}>
                    <View style={[s.swatch, { backgroundColor: st.bg }]}>
                      <Text style={[s.swatchTxt, { color: st.fg }]}>{st.letter}</Text>
                    </View>
                    <Text style={s.legendTxt}>{st.label}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* header row */}
          <View style={s.headRow}>
            <View style={[s.nameCell, { borderBottomWidth: 0.5 }]}>
              <Text style={s.nameTxt}>Employee</Text>
            </View>
            {d.dates.map((dm) => (
              <DayHead key={dm.key} d={dm} w={dayW} />
            ))}
            {["P", "L", "A"].map((h) => (
              <View key={h} style={s.sumHead}>
                <Text style={s.sumHeadTxt}>{h}</Text>
              </View>
            ))}
          </View>

          {/* data rows */}
          {pageRows.map((r) => (
            <View style={s.row} key={r.employeeCode + r.employeeName} wrap={false}>
              <View style={s.nameCell}>
                <Text style={s.nameTxt}>{r.employeeName}</Text>
                <Text style={s.deptTxt}>{r.department}</Text>
              </View>
              {d.dates.map((dm) => (
                <DayCell key={dm.key} quarters={r.cells[dm.key].quarters} w={dayW} />
              ))}
              <View style={s.sumCell}>
                <Text style={[s.sumTxt, { color: "#2E7D32" }]}>{fmtDays(r.present)}</Text>
              </View>
              <View style={s.sumCell}>
                <Text style={[s.sumTxt, { color: "#234A97" }]}>
                  {r.leave > 0 ? fmtDays(r.leave) : "—"}
                </Text>
              </View>
              <View style={s.sumCell}>
                <Text style={[s.sumTxt, { color: "#C62828" }]}>
                  {r.absent > 0 ? fmtDays(r.absent) : "—"}
                </Text>
              </View>
            </View>
          ))}

          <Text style={s.footer} fixed>
            {d.companyName} — Attendance Muster · {d.monthLabel} · Split cell = AM / PM ·
            P/L/A = present / leave / absent days · Confidential.
          </Text>
        </Page>
      ))}
    </Document>
  );
}
