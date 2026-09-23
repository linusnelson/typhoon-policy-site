import type { BidInvitation, Line } from "./types";
import { linesFromItems, type RawTextItem } from "./text-lines";
import { parseHeader } from "./parse-header";
import { parseItems } from "./parse-items";

export * from "./types";
export { splitMake } from "./split-make";
export { toRows, toSheetRows, SHEET_HEADERS, formatSheetDate, formatSheetTime } from "./rows";
export { toCsv, toTsv, csvCell } from "./csv";

// The slice of the pdf.js API we use, typed structurally so the browser build
// (`pdfjs-dist`) and the Node legacy build (`pdfjs-dist/legacy/build/pdf.mjs`)
// both satisfy it without importing either here.
export interface PdfjsLike {
  getDocument(src: { data: Uint8Array; useSystemFonts?: boolean; isEvalSupported?: boolean }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        getViewport(o: { scale: number }): { height: number };
        getTextContent(): Promise<{ items: unknown[] }>;
      }>;
      destroy(): Promise<void>;
    }>;
  };
}

export async function extractLines(pdfjs: PdfjsLike, bytes: Uint8Array): Promise<Line[]> {
  // isEvalSupported: false — text extraction never needs pdf.js's compiled PDF
  // functions, and it keeps the page clean under a CSP without 'unsafe-eval'.
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false }).promise;
  try {
    const lines: Line[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const height = page.getViewport({ scale: 1 }).height;
      const content = await page.getTextContent();
      const items = content.items.filter((it): it is RawTextItem => typeof it === "object" && it !== null && "str" in it);
      lines.push(...linesFromItems(items, p, height));
    }
    return lines;
  } finally {
    await doc.destroy();
  }
}

export function parseBidInvitation(lines: Line[], sourceFile = ""): BidInvitation {
  const isBid = lines.some((l) => l.page === 1 && l.text === "Bid Invitation");
  const header = parseHeader(lines);
  const { items, warnings } = parseItems(lines);
  const all = [...header.warnings, ...warnings];
  if (!isBid) {
    all.unshift({ code: "not_bid_invitation", message: "This does not look like a BEL Bid Invitation" });
  }
  return {
    sourceFile,
    rfxNo: header.rfxNo,
    plant: header.plant,
    dueDate: header.dueDate,
    endTime: header.endTime,
    contact: header.contact,
    notes: header.notes,
    items,
    warnings: all,
  };
}

export async function extractFromPdf(pdfjs: PdfjsLike, bytes: Uint8Array, sourceFile = ""): Promise<BidInvitation> {
  return parseBidInvitation(await extractLines(pdfjs, bytes), sourceFile);
}
