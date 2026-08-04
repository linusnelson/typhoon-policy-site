import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCurrentEmployee,
  getDocument,
  getDocumentVersions,
  getMySignaturesForDocument,
} from "@/lib/policies";
import { Badge, Card } from "@/components/ui";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

export default async function VersionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const employee = (await getCurrentEmployee())!;

  // Admin-only: policy_versions RLS returns only `published` rows to
  // non-admins, and publishing archives the previous version — so an employee
  // reaching this page would see a "history" of exactly one entry. Rather than
  // show that, the page doesn't exist for them. The link is hidden on the
  // document page too; this is the server-side half.
  if (employee.role !== "admin") notFound();

  const document = await getDocument(id);
  if (!document) notFound();

  const versions = await getDocumentVersions(id);
  const signatures = await getMySignaturesForDocument(id, employee.id);

  const published = versions.filter((v) => v.status !== "draft");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/documents/${id}`}
          className="text-sm font-medium text-gray-500 hover:text-ink"
        >
          ← {document.title}
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">
          Version history
        </h1>
      </div>

      <div className="space-y-3">
        {published.length === 0 && (
          <Card className="p-8 text-center text-sm text-gray-500">
            No published versions yet.
          </Card>
        )}
        {published.map((v) => {
          const sig = signatures.get(v.id) ?? null;
          const isCurrent = v.id === document.current_version_id;
          return (
            <Card key={v.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-lg font-bold text-ink">
                      v{v.version_label}
                    </span>
                    {isCurrent && <Badge tone="brand">Current</Badge>}
                    {v.status === "archived" && (
                      <Badge tone="neutral">Archived</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    Effective {formatDate(v.effective_date)} · published{" "}
                    {formatDate(v.published_at)}
                  </p>
                  {v.change_summary && (
                    <p className="mt-2 text-sm text-gray-600">
                      {v.change_summary}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {sig ? (
                    <Badge tone="success">Signed</Badge>
                  ) : (
                    <Badge tone="warning">Not signed</Badge>
                  )}
                  {/* This page is admin-only (see the guard above), so the
                      reader lives under /admin. Without it the list names
                      versions it gives you no way to read. */}
                  <Link
                    href={`/admin/policies/${id}/versions/${v.id}`}
                    className="text-xs font-semibold text-brand hover:underline"
                  >
                    Read this version →
                  </Link>
                </div>
              </div>
              {sig && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
                  <p className="text-xs text-gray-400">
                    Signed by {sig.signer_name} on{" "}
                    {new Date(sig.signed_at).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                  <a
                    href={`/documents/${id}/signature/${sig.id}/pdf`}
                    className="text-xs font-semibold text-brand hover:underline"
                  >
                    ↓ Download signed PDF
                  </a>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
