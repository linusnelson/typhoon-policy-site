import type { Cell, Line } from "./types";

// The shape of pdf.js TextContent items we rely on. Structural, so the caller
// can hand us items from the browser build or the Node legacy build.
export interface RawTextItem {
  str: string;
  transform: number[]; // [a, b, c, d, x, y] — y measured from the page bottom
  width: number;
}

// Two items on the same baseline when their y differs by at most this.
const LINE_TOLERANCE = 2;
// Two neighbouring items belong to one cell when the horizontal gap between
// them is smaller than this (about two spaces at the form's 8pt font). Column
// gaps on the form are 40pt or more, so this separates cells cleanly.
const CELL_GAP = 12;

// Turn one page's positioned text items into top-to-bottom lines of
// left-to-right cells. Whitespace-only items are pdf.js's own column spacers
// and are dropped; the gap they leave decides cell boundaries.
export function linesFromItems(items: RawTextItem[], page: number, pageHeight: number): Line[] {
  const placed = items
    .filter((it) => it.str.trim().length > 0)
    .map((it) => ({
      x: it.transform[4],
      y: pageHeight - it.transform[5],
      w: it.width,
      text: it.str,
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const lines: Line[] = [];
  let bucket: typeof placed = [];
  const flush = () => {
    if (bucket.length === 0) return;
    bucket.sort((a, b) => a.x - b.x);
    const cells: Cell[] = [];
    let cur: { x: number; end: number; text: string } | null = null;
    for (const it of bucket) {
      if (cur && it.x - cur.end < CELL_GAP) {
        cur.text = joinText(cur.text, it.text);
        cur.end = it.x + it.w;
      } else {
        if (cur) cells.push({ x: cur.x, text: cur.text.trim() });
        cur = { x: it.x, end: it.x + it.w, text: it.text };
      }
    }
    if (cur) cells.push({ x: cur.x, text: cur.text.trim() });
    lines.push({
      page,
      y: bucket[0].y,
      cells,
      text: cells.map((c) => c.text).join(" "),
    });
    bucket = [];
  };

  for (const it of placed) {
    if (bucket.length > 0 && Math.abs(it.y - bucket[0].y) > LINE_TOLERANCE) flush();
    bucket.push(it);
  }
  flush();
  return lines;
}

function joinText(a: string, b: string): string {
  if (a.endsWith(" ") || b.startsWith(" ")) return a + b;
  return a + " " + b;
}
