"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DocumentsPreview,
  GroupPreview,
  InvoiceGroupInput,
  OrgRef,
  PurchaseOrder,
  Relationship,
  RuleResult,
  api,
} from "@/lib/apps/bill-forge/api";
import { formatMultiplier, issuingOrgOf, orgName } from "@/lib/apps/bill-forge/orgs";
import { Banner, Button, Input } from "@/components/ui";
import { Dialog } from "@/components/ui/Dialog";
import { useOrgs } from "@/components/apps/bill-forge/useOrgs";

let nextKey = 1;

interface Draft {
  key: number;
  number: string;
  date: string;
  po_numbers: string[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function Blocker({ result }: { result: RuleResult }) {
  return (
    <li className="flex gap-2 text-xs text-danger-deep">
      <span className="font-mono">{result.rule}</span>
      <span>
        {result.message}
        {result.hint && <span className="block text-danger-deep">{result.hint}</span>}
      </span>
    </li>
  );
}

/** Group selected purchase orders into RE-numbered sales invoices.
 *
 *  Several groups at once, because that is how the work arrives — a session's worth is
 *  two or three invoices, each covering a few consignments.
 *
 *  The issuing org is not chosen here: it was detected from the billed party when the
 *  batch ran, and every selected PO must share it (D02). The one real decision is who
 *  the invoice is sold to — a relationship from that org — so that is the one control.
 *
 *  Every preview figure comes from the server's dry run rather than being recomputed
 *  here, so what the dialog promises and what the file contains cannot disagree. */
export default function GroupDialog({
  selected,
  onCancel,
  onCreated,
}: {
  selected: PurchaseOrder[];
  onCancel: () => void;
  onCreated: (count: number) => void;
}) {
  const [groups, setGroups] = useState<Draft[]>(() => [
    {
      key: nextKey++,
      number: "",
      date: today(),
      po_numbers: selected.map((p) => p.po_number),
    },
  ]);
  const [previews, setPreviews] = useState<GroupPreview[]>([]);
  const [pair, setPair] = useState<Pick<DocumentsPreview, "seller_org" | "buyer_org"> | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { orgs } = useOrgs();
  const issuing = issuingOrgOf(selected);
  const [relationships, setRelationships] = useState<Relationship[] | null>(null);
  const [relationshipId, setRelationshipId] = useState("");
  const [relationshipError, setRelationshipError] = useState<string | null>(null);

  // The "Sell to" list depends only on the issuing org; load it once that is known.
  useEffect(() => {
    const org = issuing.org;
    if (!org) {
      setRelationships(null);
      setRelationshipId("");
      return;
    }
    let cancelled = false;
    api.relationships
      .list(org.id)
      .then((rows) => {
        if (cancelled) return;
        const active = rows.filter((r) => r.is_active);
        setRelationships(active);
        setRelationshipId(active.length === 1 ? active[0].id : "");
        setRelationshipError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setRelationships([]);
        setRelationshipError(
          err instanceof Error ? err.message : "could not load who this org sells to",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [issuing.org?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const payload = useCallback(
    (): InvoiceGroupInput[] =>
      groups.map((g) => ({
        number: g.number.trim(),
        date: g.date,
        po_numbers: g.po_numbers,
      })),
    [groups],
  );

  useEffect(() => {
    if (!relationshipId || issuing.mixed) {
      setPreviews([]);
      setPair(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const body = await api.previewDocuments(payload(), relationshipId);
        if (cancelled) return;
        setPreviews(body.groups);
        setPair({ seller_org: body.seller_org, buyer_org: body.buyer_org });
        setError(null);
      } catch (err) {
        if (cancelled) return;
        // A failed dry run leaves Generate disabled, so the reason has to be visible.
        setPreviews([]);
        setError(err instanceof Error ? err.message : "could not preview the invoices");
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [payload, relationshipId, issuing.mixed]);

  const update = (key: number, patch: Partial<Draft>) =>
    setGroups((current) =>
      current.map((g) => (g.key === key ? { ...g, ...patch } : g)),
    );

  const removePo = (key: number, po: string) =>
    setGroups((current) =>
      current.map((g) =>
        g.key === key
          ? { ...g, po_numbers: g.po_numbers.filter((n) => n !== po) }
          : g,
      ),
    );

  const assigned = new Set(groups.flatMap((g) => g.po_numbers));
  const unassigned = selected.filter((p) => !assigned.has(p.po_number));

  const relationship = relationships?.find((r) => r.id === relationshipId) ?? null;
  // Names for the "seller → buyer" line: the server's resolution when the dry run has
  // answered, else the local lookup so the line never flickers empty.
  const seller: OrgRef | null = pair?.seller_org ?? issuing.org;
  const buyerName =
    pair?.buyer_org?.display_name ??
    (relationship ? orgName(orgs, relationship.buyer_org_id) : null);

  const orgProblem = issuing.mixed
    ? "These purchase orders were billed to different organisations. One sales invoice is issued by one org — group them separately."
    : issuing.unknown
      ? "The issuing organisation of these purchase orders is not known — the batch that produced them did not match a configured org."
      : null;

  const allOk =
    !orgProblem &&
    !!relationshipId &&
    previews.length === groups.length &&
    previews.every((p) => p.ok) &&
    groups.every((g) => g.po_numbers.length > 0);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { documents } = await api.createDocuments(payload(), relationshipId);
      onCreated(documents.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not create the invoices");
      setBusy(false);
    }
  }

  return (
    <Dialog
      size="xl"
      onClose={onCancel}
      title="Group into sales invoices"
      description={
        issuing.org ? (
          <>
            Issued by <strong className="text-gray-700">{issuing.org.display_name}</strong>
            {" — "}detected from the supplier invoices
          </>
        ) : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy || !allOk}
            title={orgProblem ?? (!relationshipId ? "Choose who to sell to" : undefined)}
          >
            {busy
              ? "Generating…"
              : `Generate ${groups.length} invoice${groups.length === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!orgProblem && (
          <label className="block sm:max-w-sm">
            <span className="mb-1 block text-sm font-medium text-gray-700">Sell to</span>
            <select
              value={relationshipId}
              onChange={(e) => setRelationshipId(e.target.value)}
              disabled={relationships === null}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30 disabled:opacity-60"
            >
              <option value="">
                {relationships === null
                  ? "Loading…"
                  : relationships.length === 0
                    ? "No buyer configured"
                    : "Choose a buyer…"}
              </option>
              {(relationships ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {orgName(orgs, r.buyer_org_id)} · {formatMultiplier(r.usd_multiplier)}
                </option>
              ))}
            </select>
          </label>
        )}

        {orgProblem && <Banner tone="danger">{orgProblem}</Banner>}
        {relationshipError && <Banner tone="danger">{relationshipError}</Banner>}
        {!orgProblem && relationships && relationships.length === 0 && (
          <Banner tone="warning">
            {issuing.org?.display_name} has no active relationship to sell under. An
            admin adds one on the Orgs page.
          </Banner>
        )}

        {groups.map((group, index) => {
          const preview = previews[index];
          const failures = (preview?.results ?? []).filter(
            (r) => r.severity === "FAIL",
          );
          return (
            <div
              key={group.key}
              className="space-y-3 rounded-card border border-gray-200 bg-gray-50/60 p-4"
            >
              <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">
                    Invoice number
                  </span>
                  <Input
                    value={group.number}
                    onChange={(e) => update(group.key, { number: e.target.value })}
                    placeholder="RE2627151"
                    className="w-44 bg-white py-2 font-mono"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">
                    Invoice date
                  </span>
                  <Input
                    type="date"
                    value={group.date}
                    onChange={(e) => update(group.key, { date: e.target.value })}
                    className="w-auto bg-white py-2"
                  />
                </label>
                {groups.length > 1 && (
                  <button
                    onClick={() =>
                      setGroups((c) => c.filter((g) => g.key !== group.key))
                    }
                    className="ml-auto text-xs font-medium text-gray-500 hover:text-danger"
                  >
                    Remove group
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1">
                {group.po_numbers.map((po) => (
                  <span
                    key={po}
                    className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 font-mono text-xs text-ink"
                  >
                    {po}
                    <button
                      onClick={() => removePo(group.key, po)}
                      className="text-gray-400 hover:text-ink"
                      aria-label={`Remove ${po}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {group.po_numbers.length === 0 && (
                  <span className="text-xs text-gray-500">
                    No purchase orders in this group.
                  </span>
                )}
              </div>

              {preview && preview.ok && (
                <p className="text-xs text-gray-600">
                  {seller && buyerName && (
                    <>
                      <span className="text-gray-700">{seller.display_name}</span>
                      {" → "}
                      <span className="text-gray-700">{buyerName}</span>
                      {" · "}
                    </>
                  )}
                  {preview.purchase_orders.length} purchase order
                  {preview.purchase_orders.length === 1 ? "" : "s"} ·{" "}
                  {preview.lines} lines · subtotal{" "}
                  <strong>
                    ₹
                    {Number(preview.subtotal ?? 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                </p>
              )}

              {failures.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2">
                  {failures.map((r, i) => (
                    <Blocker key={i} result={r} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        {unassigned.length > 0 && (
          <p className="text-xs text-warning-deep">
            {unassigned.map((p) => p.po_number).join(", ")}{" "}
            {unassigned.length === 1 ? "is" : "are"} selected but in no group.{" "}
            <button
              onClick={() =>
                setGroups((c) => [
                  ...c,
                  {
                    key: nextKey++,
                    number: "",
                    date: today(),
                    po_numbers: unassigned.map((p) => p.po_number),
                  },
                ])
              }
              className="font-medium text-brand hover:underline"
            >
              Put them in a new group
            </button>
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              setGroups((c) => [
                ...c,
                { key: nextKey++, number: "", date: today(), po_numbers: [] },
              ])
            }
            className="text-sm font-medium text-brand hover:underline"
          >
            + another group
          </button>
          <p className="ml-auto text-xs text-gray-500">
            {relationship
              ? `Priced at ${formatMultiplier(relationship.usd_multiplier)} for ${buyerName ?? "this buyer"}, rounded to 2 decimals.`
              : "Choose who the invoice is sold to; the price multiplier follows that relationship."}
          </p>
        </div>

        {error && <Banner tone="danger">{error}</Banner>}
      </div>
    </Dialog>
  );
}
