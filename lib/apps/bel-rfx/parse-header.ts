import type { Line, Warning } from "./types";

export interface Header {
  rfxNo: string;
  plant: string;
  dueDate: string; // ISO
  endTime: string; // HH:mm:ss
  contact: string[];
  notes: string[];
  warnings: Warning[];
}

// Label → the value to its right. pdf.js merges a label and its value into one
// cell when the form leaves under ~12pt between them ("Contact Information
// BEPO / …"), so accept both an exact-match cell followed by a value cell and
// a single cell that starts with the label.
function valueAfterLabel(lines: Line[], label: string): { line: Line; x: number; value: string } | null {
  for (const line of lines) {
    for (let i = 0; i < line.cells.length; i++) {
      const cell = line.cells[i];
      if (cell.text === label && i + 1 < line.cells.length) {
        return { line, x: line.cells[i + 1].x, value: line.cells[i + 1].text };
      }
      if (cell.text.startsWith(label + " ")) {
        return { line, x: cell.x, value: cell.text.slice(label.length + 1) };
      }
    }
  }
  return null;
}

const SUBMISSION_RE = /(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s*$/;

// Section labels that end the RFx text block.
const TEXT_END_RE = /^(Attachments:|Contact Details:|Description|Bid Details)$/;
// Numbered / lettered clauses, or "LABEL:" headings — a NOTE stops before one.
const CLAUSE_RE = /^(\d+\s*[).:-]|[a-zA-Z]\s*[).]|\(?[ivx]+\)|[A-Z][A-Z &/]+:)/;

export function parseHeader(lines: Line[]): Header {
  const warnings: Warning[] = [];
  const page1 = lines.filter((l) => l.page === 1);

  const rfx = valueAfterLabel(page1, "RFx number");
  let rfxNo = rfx?.value.trim() ?? "";
  if (!/^\d+$/.test(rfxNo)) {
    // Fallback: the running page header repeats the number alone on a line.
    const alone = lines.find((l) => l.cells.length === 1 && /^\d{10}$/.test(l.text));
    rfxNo = alone?.text ?? "";
  }
  if (!rfxNo) warnings.push({ code: "no_rfx_no", message: "RFx number not found" });

  const plant = valueAfterLabel(page1, "Description:")?.value.trim() ?? "";

  let dueDate = "";
  let endTime = "";
  const submission = page1.find((l) => l.text.startsWith("Submission period:"));
  const m = submission ? SUBMISSION_RE.exec(submission.text) : null;
  if (m) {
    dueDate = `${m[3]}-${m[2]}-${m[1]}`;
    endTime = `${m[4]}:${m[5]}:${m[6]}`;
  } else {
    warnings.push({ code: "no_due_date", message: "Submission period not found" });
  }

  // Contact: the value cell plus the lines directly below it in the same
  // column. The left-hand address block interleaves with these lines, so we
  // scan a short vertical window and keep only single-cell lines that sit in
  // the value column (label merged into the cell: the value column starts
  // somewhere right of the label; otherwise it is the value cell's own x).
  const contact: string[] = [];
  const c = valueAfterLabel(page1, "Contact Information");
  if (c) {
    contact.push(c.value.trim());
    const merged = c.line.cells.some((cell) => cell.text.startsWith("Contact Information "));
    const inValueColumn = (x: number) => (merged ? x > c.x + 50 && x < c.x + 200 : Math.abs(x - c.x) < 2);
    for (let i = page1.indexOf(c.line) + 1; i < page1.length && page1[i].y - c.line.y < 45; i++) {
      const next = page1[i];
      if (next.cells.length === 1 && inValueColumn(next.cells[0].x)) contact.push(next.text.trim());
    }
  }

  return { rfxNo, plant, dueDate, endTime, contact, notes: parseNotes(lines), warnings };
}

// "NOTE ..." lines inside the "RFx text:" block, with their wrapped
// continuation lines, each note joined into one string.
export function parseNotes(lines: Line[]): string[] {
  const start = lines.findIndex((l) => l.text === "RFx text:");
  if (start < 0) return [];
  const notes: string[] = [];
  let current: string | null = null;
  for (let i = start + 1; i < lines.length; i++) {
    const text = lines[i].text.trim();
    if (TEXT_END_RE.test(text) || lines[i].page !== lines[start].page) break;
    if (/^NOTE\b/i.test(text)) {
      if (current) notes.push(current);
      current = text.replace(/^NOTE\s*[:\-–]?\s*/i, "");
    } else if (current) {
      if (CLAUSE_RE.test(text)) {
        notes.push(current);
        current = null;
      } else {
        current += " " + text;
      }
    }
  }
  if (current) notes.push(current);
  return notes;
}
