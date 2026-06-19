import Link from "next/link";
import { getAllDocuments, getComplianceForDocument } from "@/lib/admin";
import { Badge, Button, Card } from "@/components/ui";

export default async function AdminDashboardPage() {
  const documents = await getAllDocuments();
  const reports = await Promise.all(
    documents.map((d) => getComplianceForDocument(d))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            Policies
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Signature status for the current version of each document.
          </p>
        </div>
        <Link href="/admin/policies/new">
          <Button>New document</Button>
        </Link>
      </div>

      <div className="space-y-3">
        {reports.length === 0 && (
          <Card className="p-8 text-center text-sm text-gray-500">
            No documents yet. Use “New document” to create one.
          </Card>
        )}
        {reports.map((r) => {
          const total = r.signers.length;
          const pct = total ? Math.round((r.signedCount / total) * 100) : 0;
          return (
            <Link key={r.document.id} href={`/admin/policies/${r.document.id}`}>
              <Card className="p-5 transition-colors hover:border-gray-300">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-lg font-bold text-ink">
                      {r.document.title}
                    </h2>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {r.currentVersion
                        ? `v${r.currentVersion.version_label}`
                        : "No published version"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {r.pendingCount > 0 ? (
                      <Badge tone="warning">{r.pendingCount} pending</Badge>
                    ) : total > 0 ? (
                      <Badge tone="success">All signed</Badge>
                    ) : null}
                    <span className="text-sm font-semibold text-gray-700">
                      {r.signedCount}/{total} · {pct}%
                    </span>
                  </div>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
