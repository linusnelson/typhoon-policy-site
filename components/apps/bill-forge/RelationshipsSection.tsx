"use client";

import { useCallback, useEffect, useState } from "react";
import { Org, Relationship, api } from "@/lib/apps/bill-forge/api";
import { formatMultiplier, orgName } from "@/lib/apps/bill-forge/orgs";
import { RelationshipDialog } from "@/components/apps/bill-forge/RelationshipDialog";
import { Badge, Banner } from "@/components/ui";
import { DataTable, EmptyRow, TBody, THead, Td, Th, Tr } from "@/components/ui/DataTable";

/** Who one org sells to, with the per-pair strings and pricing. One table per seller;
 *  the admin page renders it under each org. */
export function RelationshipsSection({ seller, orgs }: { seller: Org; orgs: Org[] }) {
  const [rows, setRows] = useState<Relationship[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Relationship | null | "new">(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.relationships.list(seller.id));
      setError(null);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "could not load relationships");
    }
  }, [seller.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(r: Relationship) {
    try {
      const saved = await api.relationships.update(r.id, { is_active: !r.is_active });
      setRows((current) => (current ?? []).map((x) => (x.id === saved.id ? saved : x)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not update the relationship");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Sells to
        </h3>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="text-xs font-semibold text-brand hover:underline"
        >
          + relationship
        </button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <DataTable>
        <THead>
          <tr>
            <Th>Buyer</Th>
            <Th>Customer name in {seller.display_name}</Th>
            <Th>Vendor name in buyer</Th>
            <Th className="text-right">Multiplier</Th>
            <Th className="text-right">Terms</Th>
            <Th className="text-center">Carry tax</Th>
            <Th className="text-right">HSN overrides</Th>
            <Th>Active</Th>
            <Th />
          </tr>
        </THead>
        <TBody>
          {(rows ?? []).map((r) => (
            <Tr key={r.id}>
              <Td className="font-semibold">{orgName(orgs, r.buyer_org_id)}</Td>
              <Td className="text-gray-700">{r.customer_name_in_seller_org}</Td>
              <Td className="text-gray-700">{r.vendor_name_in_buyer_org}</Td>
              <Td className="text-right font-mono">{formatMultiplier(r.usd_multiplier)}</Td>
              <Td className="text-right font-mono">{r.payment_terms_days} d</Td>
              <Td className="text-center">{r.carry_tax ? "yes" : "no"}</Td>
              <Td
                className="text-right font-mono"
                title={Object.entries(r.item_tax_by_hsn)
                  .map(([hsn, t]) => `${hsn}: ${t.name} ${t.rate}%`)
                  .join("\n")}
              >
                {Object.keys(r.item_tax_by_hsn).length || "—"}
              </Td>
              <Td>
                <button type="button" onClick={() => toggleActive(r)} title="Click to toggle">
                  <Badge tone={r.is_active ? "success" : "neutral"}>
                    {r.is_active ? "active" : "inactive"}
                  </Badge>
                </button>
              </Td>
              <Td className="text-right">
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className="text-xs font-semibold text-brand hover:underline"
                >
                  Edit
                </button>
              </Td>
            </Tr>
          ))}
          {rows && rows.length === 0 && (
            <EmptyRow colSpan={9}>
              {seller.display_name} sells to no one yet. Add a relationship before
              grouping its purchase orders into an invoice.
            </EmptyRow>
          )}
          {rows === null && <EmptyRow colSpan={9}>Loading…</EmptyRow>}
        </TBody>
      </DataTable>

      {editing !== null && (
        <RelationshipDialog
          seller={seller}
          orgs={orgs}
          relationship={editing === "new" ? null : editing}
          taken={(rows ?? []).map((r) => r.buyer_org_id)}
          onCancel={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            setRows((current) => {
              const list = current ?? [];
              return list.some((x) => x.id === saved.id)
                ? list.map((x) => (x.id === saved.id ? saved : x))
                : [...list, saved];
            });
          }}
        />
      )}
    </div>
  );
}
