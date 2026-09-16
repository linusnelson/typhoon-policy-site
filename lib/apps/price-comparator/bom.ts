import { parseCsv } from "@/lib/csv";
import type { BomLine } from "./types";

// BOM input parsing — runs in the browser (no server round-trip needed).

export interface ParsedBom {
  headers: string[];
  rows: string[][];
  guess: { mpnCol: number; qtyCol: number; mfrCol: number | null };
}

const MPN_PATTERNS = [
  /^mpn$/i,
  /manufacturer\s*part/i,
  /mfr.?\s*part/i,
  /^part\s*(number|no|#)/i,
  /^p\/?n$/i,
];
const QTY_PATTERNS = [/^qty$/i, /^quantity$/i, /^qty\b/i, /^amount$/i, /^count$/i];
const MFR_PATTERNS = [/^manufacturer$/i, /^mfr$/i, /^mfg$/i, /^brand$/i, /^make$/i];

function findCol(headers: string[], patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const i = headers.findIndex((h) => pattern.test(h.trim()));
    if (i !== -1) return i;
  }
  return null;
}

export function parseBomCsv(text: string): ParsedBom {
  const records = parseCsv(text).map((r) => r.map((c) => c.trim()));
  if (records.length === 0) throw new Error("CSV is empty");

  const headers = records[0];
  const mpnCol = findCol(headers, MPN_PATTERNS);
  const qtyCol = findCol(headers, QTY_PATTERNS);
  return {
    headers,
    rows: records.slice(1),
    guess: {
      // Fallbacks: first column = MPN, second = qty
      mpnCol: mpnCol ?? 0,
      qtyCol: qtyCol ?? (headers.length > 1 ? 1 : 0),
      mfrCol: findCol(headers, MFR_PATTERNS),
    },
  };
}

function parseQty(raw: string | undefined): number {
  return Math.max(1, Math.round(Number((raw ?? "1").replace(/[^\d.]/g, "")) || 1));
}

export function bomLinesFromMapping(
  rows: string[][],
  mpnCol: number,
  qtyCol: number,
  mfrCol: number | null
): BomLine[] {
  return rows
    .map((row) => ({
      mpn: (row[mpnCol] ?? "").trim(),
      qty: parseQty(row[qtyCol]),
      manufacturer: mfrCol !== null ? (row[mfrCol] ?? "").trim() || undefined : undefined,
    }))
    .filter((l) => l.mpn);
}

// Pasted input, one part per line: "MPN [, qty]" (comma, semicolon or tab).
export function bomLinesFromText(text: string): BomLine[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [mpn, qty] = s.split(/[,;\t]/).map((p) => p.trim());
      return { mpn, qty: Math.max(1, Math.round(Number(qty) || 1)) };
    })
    .filter((l) => l.mpn);
}
