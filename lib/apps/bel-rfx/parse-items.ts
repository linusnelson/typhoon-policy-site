import type { BidItem, Line, Warning } from "./types";
import { splitMake } from "./split-make";

// Column left edges on the Bid Details table (points from the page's left
// edge). Read from the header row when present; these are the fallback.
interface Columns {
  item: number;
  material: number;
  desc: number;
  qty: number;
}
const DEFAULT_COLUMNS: Columns = { item: 4.3, material: 61, desc: 202.7, qty: 481.9 };
const COLUMN_TOLERANCE = 15;

const SKIP_RE = [
  /^Bid Invitation$/,
  /^Page \d+ \/ \d+$/,
  /^Date : /,
  /^Product no\.$/,
  /^Quantity$/,
  /^\d{10}$/, // RFx number in the running page header
  // Recipient e-mail list at the foot of the table. Anchored to the line start:
  // descriptions contain "@" too ("SWITCH TGL DP MIL-G 5A@28VDC ON-NONE-ON").
  /^[^\s@]+@[^\s@]+\.[a-z]{2,}/i,
];
const QTY_RE = /^([\d,.]+)\s+([A-Z]{1,4})$/;
const TIME_RE = /^\d{2}:\d{2}:\d{2}$/;

function nearest(x: number, cols: Columns): keyof Columns | null {
  let best: keyof Columns | null = null;
  let bestDist = COLUMN_TOLERANCE;
  for (const key of Object.keys(cols) as (keyof Columns)[]) {
    const d = Math.abs(x - cols[key]);
    if (d < bestDist) {
      best = key;
      bestDist = d;
    }
  }
  return best;
}

export function parseItems(lines: Line[]): { items: BidItem[]; warnings: Warning[] } {
  const items: BidItem[] = [];
  const warnings: Warning[] = [];
  const start = lines.findIndex((l) => l.text === "Bid Details");
  if (start < 0) {
    warnings.push({ code: "no_items", message: "No 'Bid Details' section found" });
    return { items, warnings };
  }

  let cols = { ...DEFAULT_COLUMNS };
  let current: BidItem | null = null;

  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text.trim();
    if (SKIP_RE.some((re) => re.test(text))) continue;

    // Header row: refresh the column positions, then skip it. Two SAP variants
    // exist: "Item | Material No. | Description | Qty/Unit" (7-series RFx) and
    // "Item | Item category | Supplier product number | Delivery date/ |
    // Delivery Date" (6-series), where the quantity is printed under the
    // delivery-date column. Quantity is therefore found by shape (§ item row),
    // not by column.
    const headerCells = line.cells.map((c) => c.text);
    if (headerCells.includes("Item") && (headerCells.includes("Material No.") || headerCells.includes("Item category"))) {
      const at = (labels: string[], fallback: number) =>
        line.cells.find((c) => labels.includes(c.text))?.x ?? fallback;
      cols = {
        item: at(["Item"], cols.item),
        material: at(["Material No.", "Item category"], cols.material),
        desc: at(["Description", "Supplier product number"], cols.desc),
        qty: at(["Qty/Unit"], cols.qty),
      };
      continue;
    }

    const itemCell = line.cells.find((c) => nearest(c.x, cols) === "item")?.text;
    const materialCell = line.cells.find((c) => nearest(c.x, cols) === "material")?.text;

    // Item row: an integer under Item and something under Material No. The
    // rest of the row holds the description and, somewhere to its right, the
    // quantity ("21 NO", "1,000 NO"); a delivery time ("00:00:00") may follow.
    if (itemCell && materialCell && /^\d+$/.test(itemCell)) {
      const rest = line.cells.filter((c) => c.x > cols.material + COLUMN_TOLERANCE);
      const qtyCell = rest.find((c) => QTY_RE.test(c.text));
      const descCell = rest.find((c) => c !== qtyCell && !TIME_RE.test(c.text));
      current = {
        itemNo: itemCell,
        belPn: materialCell,
        desc: descCell?.text ?? "",
        qty: "",
        unit: "",
        makes: [],
      };
      applyQty(current, qtyCell?.text);
      items.push(current);
      continue;
    }

    if (!current) continue;

    if (line.cells.length === 1) {
      const key = nearest(line.cells[0].x, cols);
      if (key === "item") {
        const { make, mpn } = splitMake(text);
        current.makes.push({ raw: text, make, mpn });
        if (!mpn) {
          warnings.push({
            code: "make_unsplit",
            message: `Could not find an MPN in "${text}"`,
            itemNo: current.itemNo,
          });
        }
      } else if (!current.qty && QTY_RE.test(text) && line.cells[0].x > cols.desc + COLUMN_TOLERANCE) {
        applyQty(current, text);
      } else if (key === "desc") {
        current.desc = current.desc ? `${current.desc} ${text}` : text;
      }
    }
  }

  if (items.length === 0) {
    warnings.push({ code: "no_items", message: "No items found under Bid Details" });
  }
  for (const it of items) {
    if (!it.qty) warnings.push({ code: "qty_missing", message: `Item ${it.itemNo}: quantity not found`, itemNo: it.itemNo });
    if (it.makes.length === 0) warnings.push({ code: "no_makes", message: `Item ${it.itemNo}: no make/MPN lines`, itemNo: it.itemNo });
  }
  return { items, warnings };
}

function applyQty(item: BidItem, cell: string | undefined) {
  if (!cell) return;
  const m = QTY_RE.exec(cell.trim());
  if (!m) return;
  // "1,000" → 1000, "5,866.000" → 5866, "1,118.500" → 1118.5
  const n = Number(m[1].replace(/,/g, ""));
  item.qty = Number.isFinite(n) ? String(n) : m[1].replace(/,/g, "");
  item.unit = m[2];
}
