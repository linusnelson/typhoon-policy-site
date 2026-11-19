"use client";

import { jobHref } from "@/lib/apps/bill-forge/routes";
import Link from "next/link";
import { PO_STAGE_LABEL, PurchaseOrder, VENDOR_LABEL } from "@/lib/apps/bill-forge/api";
import { Badge } from "@/components/ui";
import { Td, Tr } from "@/components/ui/DataTable";
import { stageTone } from "@/lib/apps/bill-forge/tones";
import { poMoney } from "@/lib/apps/bill-forge/money";
import { OrgChip } from "@/components/apps/bill-forge/OrgChip";
import { HsnDots } from "@/components/apps/bill-forge/pos/HsnDots";
import { BlockerList } from "@/components/apps/bill-forge/pos/BlockerList";

export function RegisterRow({
  po,
  showOrg,
  checked,
  onCheck,
  expanded,
  onExpand,
}: {
  po: PurchaseOrder;
  showOrg: boolean;
  checked: boolean;
  onCheck: () => void;
  expanded: boolean;
  onExpand: () => void;
}) {
  return (
    <>
      <Tr className={checked ? "bg-brand-soft/60" : undefined}>
        <Td>
          <input type="checkbox" checked={checked} onChange={onCheck} className="accent-brand" />
        </Td>
        <Td>
          <button onClick={onExpand} className="font-mono font-semibold text-ink hover:text-brand">
            {po.po_number}
          </button>
          {po.latest_run_failed && (
            <span
              className="ml-2 text-xs text-danger-deep"
              title="The most recent run for this purchase order did not complete. The files shown are from the last one that did."
            >
              ⚠ last run failed
            </span>
          )}
        </Td>
        {showOrg && (
          <Td>
            <OrgChip org={po.org} />
          </Td>
        )}
        <Td className="text-gray-600">{VENDOR_LABEL[po.vendor] ?? po.vendor}</Td>
        <Td className="font-mono text-xs text-gray-600">{po.invoice_date}</Td>
        <Td className="text-right font-mono text-gray-600">{po.line_count}</Td>
        <Td className="text-right font-mono">{poMoney(po)}</Td>
        <Td className="text-center">
          <HsnDots po={po} />
        </Td>
        <Td className="text-center">
          {po.boe_no ? (
            <span title={`BOE ${po.boe_no}`} className="text-success-deep">
              ✓
            </span>
          ) : (
            <span title="Awaiting the Bill of Entry" className="text-gray-300">
              –
            </span>
          )}
        </Td>
        <Td>
          <Badge tone={stageTone(po.stage)}>{PO_STAGE_LABEL[po.stage] ?? po.stage}</Badge>
        </Td>
      </Tr>
      {expanded && (
        <tr className="bg-gray-50">
          <td />
          <td colSpan={showOrg ? 9 : 8} className="px-3 py-3">
            <div className="space-y-3">
              {po.blockers.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Cannot be invoiced yet
                  </p>
                  <div className="mt-1">
                    <BlockerList blockers={po.blockers} />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-success-deep">
                  Ready to be grouped into a sales invoice.
                </p>
              )}

              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600 sm:grid-cols-4">
                <div>
                  <dt className="text-gray-400">BOE</dt>
                  <dd className="font-mono">{po.boe_no ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-400">FBIL rate</dt>
                  <dd className="font-mono">{po.fbil_rate ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-400">PO imported</dt>
                  <dd>{po.zoho_po_imported_at?.slice(0, 10) ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-400">Bill imported</dt>
                  <dd>{po.zoho_bill_imported_at?.slice(0, 10) ?? "—"}</dd>
                </div>
              </dl>

              {po.note && <p className="text-xs text-gray-700">{po.note}</p>}

              <div className="flex gap-3 text-xs">
                {po.current_job_id && (
                  <Link
                    href={jobHref(po.current_job_id)}
                    className="font-medium text-brand hover:underline"
                  >
                    Open the batch that produced its files
                  </Link>
                )}
                {po.latest_run_failed && po.latest_job_id && (
                  <Link
                    href={jobHref(po.latest_job_id)}
                    className="text-danger-deep underline hover:text-danger"
                  >
                    Open the run that failed
                  </Link>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
