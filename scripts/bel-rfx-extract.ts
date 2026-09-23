// CLI: npx tsx scripts/bel-rfx-extract.ts [--json] [--per-item] [--lines] file.pdf [...]
// Prints sheet CSV (default), the parsed JSON (--json), or the positioned text
// lines (--lines, for debugging layout drift) to stdout.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractLines, parseBidInvitation, toCsv, toSheetRows, type BidInvitation } from "../lib/apps/bel-rfx";

const args = process.argv.slice(2);
const json = args.includes("--json");
const perItem = args.includes("--per-item");
const dumpLines = args.includes("--lines");
const files = args.filter((a) => !a.startsWith("--"));
if (files.length === 0) {
  console.error("usage: bel-rfx-extract.ts [--json] [--per-item] [--lines] <pdf> [...]");
  process.exit(2);
}

async function main() {
const results: BidInvitation[] = [];
for (const file of files) {
  const lines = await extractLines(pdfjs, new Uint8Array(readFileSync(file)));
  if (dumpLines) {
    for (const l of lines) {
      console.log(`p${l.page} y=${l.y.toFixed(1).padStart(6)} ` + l.cells.map((c) => `[${c.x.toFixed(1)}] ${c.text}`).join("  |  "));
    }
    continue;
  }
  const inv = parseBidInvitation(lines, basename(file));
  for (const w of inv.warnings) console.error(`${inv.sourceFile}: ${w.message}`);
  results.push(inv);
}
if (!dumpLines) {
  process.stdout.write(json ? JSON.stringify(results, null, 2) + "\n" : toCsv(toSheetRows(results, { perMake: !perItem })));
}
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
