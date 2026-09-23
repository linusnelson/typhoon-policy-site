// CSV/TSV writers for the sheet rows. Cell escaping is the site's own
// (lib/csv.ts) so there is one implementation.
import { csvCell } from "@/lib/csv";

export { csvCell };

// UTF-8 BOM + CRLF: what Excel needs to open the file with the right encoding
// and one row per line on Windows.
export function toCsv(rows: string[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// Tab-separated, for pasting straight into Google Sheets / Excel.
export function toTsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => c.replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");
}
