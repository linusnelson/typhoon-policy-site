import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSheetDate, formatSheetTime, toRows, SHEET_HEADERS } from "./rows";
import { toCsv, toTsv } from "./csv";
import type { BidInvitation } from "./types";

test("sheet date/time formats", () => {
  assert.equal(formatSheetDate("2026-09-16"), "16/9/2026");
  assert.equal(formatSheetDate("2026-10-05"), "5/10/2026");
  assert.equal(formatSheetTime("10:00:00"), "10:00:00 am");
  assert.equal(formatSheetTime("13:30:00"), "1:30:00 pm");
  assert.equal(formatSheetTime("00:15:00"), "12:15:00 am");
  assert.equal(formatSheetTime("12:00:00"), "12:00:00 pm");
});

const inv: BidInvitation = {
  sourceFile: "x.pdf",
  rfxNo: "7000000001",
  plant: "CHN/CH1/044-1 01.01.2026 10:00",
  dueDate: "2026-01-15",
  endTime: "10:00:00",
  contact: [],
  notes: ["DELIVER BY 31.12.2026"],
  items: [
    {
      itemNo: "10",
      belPn: "400000000001",
      desc: "PART, ONE",
      qty: "1000",
      unit: "NO",
      makes: [
        { raw: "A-1", make: "A", mpn: "1" },
        { raw: "B-2", make: "B", mpn: "2" },
      ],
    },
    { itemNo: "20", belPn: "400000000002", desc: "PART TWO", qty: "5", unit: "NO", makes: [] },
  ],
  warnings: [],
};

test("one row per make, item with no makes still emits a row", () => {
  const rows = toRows(inv);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].length, SHEET_HEADERS.length);
  assert.deepEqual(rows[0].slice(0, 10), [
    "7000000001", "CHN/CH1/044-1 01.01.2026 10:00", "15/1/2026", "10:00:00 am",
    "400000000001", "PART, ONE", "A", "1", "1000", "NO",
  ]);
  assert.equal(rows[0][11], "DELIVER BY 31.12.2026");
  assert.deepEqual(rows[2].slice(6, 8), ["", ""]);
});

test("one row per item joins makes", () => {
  const rows = toRows(inv, { perMake: false });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].slice(6, 8), ["A | B", "1 | 2"]);
});

test("csv quoting, BOM and CRLF; tsv flattens tabs", () => {
  const csv = toCsv([["a", "b,c", 'd"e']]);
  assert.equal(csv, '﻿a,"b,c","d""e"\r\n');
  assert.equal(toTsv([["a\tb", "c"]]), "a b\tc");
});
