import type { BidInvitation } from "./types";

// Column order of the tracking sheet "BEL RFX 2026-2027.csv". Price, delivery
// and remarks columns are left blank for hand entry at quoting time.
export const SHEET_HEADERS = [
  "RFX No",
  "Plant",
  "Due Date",
  "End Time",
  "BEL PN",
  "Desc",
  "Make",
  "MPN",
  "Qty",
  "Unit",
  "Delivery",
  "Notes",
  "Unit Price",
  "Delivery",
  "Remarks",
] as const;

export interface RowOptions {
  // true (default): one row per item × make. false: one row per item, makes
  // and MPNs joined with " | ".
  perMake?: boolean;
}

// "2026-09-16" → "16/9/2026" (sheet style: no zero padding).
export function formatSheetDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])}/${Number(m[2])}/${m[1]}`;
}

// "10:00:00" → "10:00:00 am", "13:30:00" → "1:30:00 pm".
export function formatSheetTime(hms: string): string {
  const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(hms);
  if (!m) return hms;
  const h = Number(m[1]);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]}:${m[3]} ${suffix}`;
}

export function toRows(inv: BidInvitation, opts: RowOptions = {}): string[][] {
  const perMake = opts.perMake ?? true;
  const head = [inv.rfxNo, inv.plant, formatSheetDate(inv.dueDate), formatSheetTime(inv.endTime)];
  const notes = inv.notes.join(" | ");
  const rows: string[][] = [];
  for (const item of inv.items) {
    const tail = (make: string, mpn: string) => [
      ...head,
      item.belPn,
      item.desc,
      make,
      mpn,
      item.qty,
      item.unit,
      "",
      notes,
      "",
      "",
      "",
    ];
    if (perMake && item.makes.length > 0) {
      for (const m of item.makes) rows.push(tail(m.make, m.mpn));
    } else {
      rows.push(
        tail(item.makes.map((m) => m.make).join(" | "), item.makes.map((m) => m.mpn).join(" | "))
      );
    }
  }
  return rows;
}

export function toSheetRows(invitations: BidInvitation[], opts: RowOptions = {}): string[][] {
  return [[...SHEET_HEADERS], ...invitations.flatMap((inv) => toRows(inv, opts))];
}
