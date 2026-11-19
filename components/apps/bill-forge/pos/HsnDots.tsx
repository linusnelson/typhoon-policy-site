import { PurchaseOrder } from "@/lib/apps/bill-forge/api";

/** Resolved / flagged-for-CA / blank, as three dots with the counts on hover.
 *
 *  The HSN picture is what decides whether a PO can be invoiced, so it belongs in the
 *  list rather than one click away. */
export function HsnDots({ po }: { po: PurchaseOrder }) {
  const blank = po.hsn_blank_count;
  const flagged = po.hsn_flagged_count;
  const title = [
    blank ? `${blank} part${blank === 1 ? "" : "s"} with a blank HSN` : null,
    flagged ? `${flagged} flagged for the CA` : null,
    !blank && !flagged ? "every HSN resolved and confirmed" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span title={title} className="whitespace-nowrap font-mono text-xs">
      <span className={blank ? "text-danger-deep" : "text-gray-300"}>●</span>
      <span className={flagged ? "text-warning" : "text-gray-300"}>●</span>
      <span className={!blank && !flagged ? "text-success-deep" : "text-gray-300"}>●</span>
    </span>
  );
}
