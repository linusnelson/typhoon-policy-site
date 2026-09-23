// Data model for a BEL "Bid Invitation" (SAP SRM form BBP_BID_INVITATION).
// Pure types — no pdf.js, no DOM, no Node — so the parser runs in the browser
// (the standalone app and the policy-site page) and in Node (CLI + tests).

export interface Cell {
  x: number; // left edge in PDF points, from the page's left edge
  text: string;
}

export interface Line {
  page: number; // 1-based
  y: number; // distance from the top of the page, in points
  cells: Cell[]; // left to right
  text: string; // cells joined with a single space
}

export interface MakeLine {
  raw: string; // the line as printed, e.g. "GLENAIR INC-M83513/05-07"
  make: string;
  mpn: string; // "" when the line had no recognisable MPN (row is flagged)
}

export interface BidItem {
  itemNo: string; // "10", "20", ...
  belPn: string; // Material No., 12 digits, kept as a string
  desc: string;
  qty: string; // digits only, thousands separators removed
  unit: string; // "NO", "EA", ...
  makes: MakeLine[];
}

export type WarningCode =
  | "not_bid_invitation"
  | "no_items"
  | "no_rfx_no"
  | "no_due_date"
  | "qty_missing"
  | "no_makes"
  | "make_unsplit";

export interface Warning {
  code: WarningCode;
  message: string;
  itemNo?: string;
}

export interface BidInvitation {
  sourceFile: string;
  rfxNo: string;
  plant: string; // the "Description:" header value, verbatim
  dueDate: string; // ISO YYYY-MM-DD ("" when not found)
  endTime: string; // HH:mm:ss 24h ("" when not found)
  contact: string[];
  notes: string[]; // "NOTE ..." lines from the RFx text block
  items: BidItem[];
  warnings: Warning[];
}
