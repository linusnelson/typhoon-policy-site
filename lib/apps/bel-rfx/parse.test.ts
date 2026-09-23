// Golden tests: every JSON in __fixtures__ is the expected parse of the PDF of
// the same name beside it. Regenerate on purpose only:
//   npx tsx scripts/bel-rfx-extract.ts --json lib/apps/bel-rfx/__fixtures__/X.PDF | jq '.[0]' > lib/apps/bel-rfx/__fixtures__/X.json
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractFromPdf, parseBidInvitation } from "./index";

const fixtures = join(__dirname, "__fixtures__");

for (const name of readdirSync(fixtures).filter((f) => f.endsWith(".json"))) {
  test(`golden ${name}`, async () => {
    const expected = JSON.parse(readFileSync(join(fixtures, name), "utf8"));
    const pdf = join(fixtures, expected.sourceFile);
    const actual = await extractFromPdf(pdfjs, new Uint8Array(readFileSync(pdf)), expected.sourceFile);
    assert.deepEqual(actual, expected);
  });
}

test("non-BEL document is flagged, not crashed", () => {
  const inv = parseBidInvitation([{ page: 1, y: 10, cells: [{ x: 0, text: "Hello" }], text: "Hello" }], "x.pdf");
  assert.equal(inv.items.length, 0);
  assert.ok(inv.warnings.some((w) => w.code === "not_bid_invitation"));
  assert.ok(inv.warnings.some((w) => w.code === "no_items"));
});
