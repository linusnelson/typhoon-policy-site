// Minimal RFC 4180 CSV parser for the payslip import (the site otherwise only
// *writes* CSV — see lib/data/report-types.ts). Handles quoted fields, ""
// escapes, and CRLF/LF line endings. Isomorphic: used by the client-side
// preview and re-run authoritatively in the server action.

export function parseCsv(text: string): string[][] {
  // Strip the UTF-8 BOM. Our own template route writes one (so Excel opens the
  // file correctly), and Excel's "CSV UTF-8" save adds one — without this the
  // first header reads "﻿employee_code" and the import rejects the file.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  // Final field/row when the file doesn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop rows that are entirely empty (blank lines, trailing newline noise).
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

// Quote a value for CSV output (same escaping as lib/data/report-types.ts).
export function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
