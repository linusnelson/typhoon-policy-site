"use client";

import { useEffect, useState } from "react";
import { Org, Principal } from "@/lib/apps/bill-forge/api";
import { fetchMeOnce } from "@/lib/apps/bill-forge/me";
import { OVERRIDE_FIELDS, yamlDefaults } from "@/lib/apps/bill-forge/orgs";
import { useOrgs } from "@/components/apps/bill-forge/useOrgs";
import { OrgDialog } from "@/components/apps/bill-forge/OrgDialog";
import { RelationshipsSection } from "@/components/apps/bill-forge/RelationshipsSection";
import { Badge, Banner, Button, Card } from "@/components/ui";
import { SkeletonRows } from "@/components/ui/Skeleton";

function AdminsOnly() {
  return (
    <Card className="mx-auto max-w-md space-y-3 p-6">
      <h2 className="font-display text-lg font-bold text-ink">Admins only</h2>
      <Banner tone="warning">
        Organisations and their relationships decide which Zoho org every CSV is
        written for. Only an admin can change them.
      </Banner>
    </Card>
  );
}

function OrgCard({
  org,
  orgs,
  expanded,
  onToggle,
  onEdit,
}: {
  org: Org;
  orgs: Org[];
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const overrides = OVERRIDE_FIELDS.filter(({ key }) => org[key] !== null);
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="text-left font-display text-base font-bold text-ink hover:text-brand"
          aria-expanded={expanded}
        >
          {org.display_name}
        </button>
        <span className="font-mono text-xs text-gray-500">{org.slug}</span>
        <span className="font-mono text-xs text-gray-600" title="GSTIN">
          {org.gstin || "no GSTIN"}
        </span>
        <span title="State">
          <Badge tone="neutral">{org.state_code}</Badge>
        </span>
        <Badge tone={org.is_active ? "success" : "neutral"}>
          {org.is_active ? "active" : "inactive"}
        </Badge>
        {overrides.length > 0 && (
          <span
            className="text-xs text-gray-500"
            title={overrides.map((f) => `${f.label}: ${org[f.key]}`).join("\n")}
          >
            {overrides.length} Zoho name{overrides.length === 1 ? "" : "s"} overridden
          </span>
        )}
        <Button variant="secondary" onClick={onEdit} className="ml-auto px-3 py-1.5 text-xs">
          Edit
        </Button>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-gray-100 bg-gray-50/60 px-5 py-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-gray-400">Legal name</dt>
              <dd>{org.legal_name || "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-400">PAN</dt>
              <dd className="font-mono">{org.pan || "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-400">IEC</dt>
              <dd className="font-mono">{org.iec || "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-400">GST treatment</dt>
              <dd className="font-mono">{org.gst_treatment}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Branch / warehouse</dt>
              <dd>
                {org.default_branch} / {org.default_warehouse}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400">Sales number pattern</dt>
              <dd className="font-mono">{org.sales_number_pattern}</dd>
            </div>
            {OVERRIDE_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <dt className="text-gray-400">{label}</dt>
                <dd>
                  {org.effective?.[key] ?? "—"}
                  {org[key] === null && (
                    <span className="ml-1 text-gray-400">(default)</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>

          <RelationshipsSection seller={org} orgs={orgs} />
        </div>
      )}
    </Card>
  );
}

/** The admin area: every Zoho org, and under each the orgs it sells to.
 *
 *  Gate: the API already returns 403 on admin writes, but the page should not let a
 *  non-admin get as far as a form, so it asks /api/me first and shows "Admins only". */
export function OrgsAdmin() {
  const [me, setMe] = useState<Principal | null | undefined>(undefined);
  const { orgs, loading, error, reload } = useOrgs();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Org | null | "new">(null);

  useEffect(() => {
    fetchMeOnce()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  if (me === undefined) return <SkeletonRows rows={4} />;
  if (!me?.is_admin) return <AdminsOnly />;

  const defaults = yamlDefaults(orgs);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Organisations</h2>
          <p className="mt-1 text-sm text-gray-500">
            The Zoho Books orgs a supplier can bill. A batch is matched to one of them
            by the GSTIN, IEC or PAN on the invoice; the sales invoice and its mirror
            bill follow a relationship from that org to the one it sells to.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>New org</Button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div className="space-y-3">
        {orgs.map((org) => (
          <OrgCard
            key={org.id}
            org={org}
            orgs={orgs}
            expanded={expanded === org.id}
            onToggle={() => setExpanded(expanded === org.id ? null : org.id)}
            onEdit={() => setEditing(org)}
          />
        ))}
        {!loading && orgs.length === 0 && !error && (
          <Card className="px-4 py-10 text-center text-sm text-gray-400">
            No organisations yet. Create the one the supplier bills first; then add the
            org it sells to and the relationship between them.
          </Card>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Edits apply to new batches and new invoices only. Files already generated keep
        the org strings they were written with.
      </p>

      {editing !== null && (
        <OrgDialog
          org={editing === "new" ? null : editing}
          defaults={defaults}
          onCancel={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            setExpanded(saved.id);
            reload();
          }}
        />
      )}
    </div>
  );
}
