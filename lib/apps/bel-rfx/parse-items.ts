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
  /@/, // recipient e-mail list
];
const QTY_RE = /^([\d,.]+)\s+(\S+)$/;

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

    // Header row: refresh the column positions, then skip it.
    const headerCells = line.cells.map((c) => c.text);
    if (headerCells.includes("Item") && headerCells.includes("Material No.")) {
      const at = (label: string, fallback: number) =>
        line.cells.find((c) => c.text === label)?.x ?? fallback;
      cols = {
        item: at("Item", cols.item),
        material: at("Material No.", cols.material),
        desc: at("Description", cols.desc),
        qty: at("Qty/Unit", cols.qty),
      };
      continue;
    }

    const byCol = new Map<keyof Columns, string>();
    for (const c of line.cells) {
      const key = nearest(c.x, cols);
      if (key && !byCol.has(key)) byCol.set(key, c.text);
    }

    // Item row: an integer under Item and something under Material No.
    const itemCell = byCol.get("item");
    const materialCell = byCol.get("material");
    if (itemCell && materialCell && /^\d+$/.test(itemCell)) {
      current = {
        itemNo: itemCell,
        belPn: materialCell,
        desc: byCol.get("desc") ?? "",
        qty: "",
        unit: "",
        makes: [],
      };
      applyQty(current, byCol.get("qty"));
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
      } else if (key === "desc") {
        current.desc = current.desc ? `${current.desc} ${text}` : text;
      } else if (key === "qty" && !current.qty) {
        applyQty(current, text);
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
  item.qty = m[1].replace(/,/g, "");
  item.unit = m[2];
}
