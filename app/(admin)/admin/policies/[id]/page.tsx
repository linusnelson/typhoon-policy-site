import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocument, getDocumentVersions } from "@/lib/policies";
import { getComplianceForDocument } from "@/lib/admin";
import { publishDraftVersion } from "@/actions/publishVersion";
import { formatIstDate } from "@/lib/ist";
import { Badge, Button, Card } from "@/components/ui";

const VERSION_TONE = {
  draft: "warning",
  published: "success",
  archived: "neutral",
} as const;

export default async function AdminDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const document = await getDocument(id);
  if (!document) notFound();

  const [report, versions] = await Promise.all([
    getComplianceForDocument(document),
    getDocumentVersions(id),
  ]);
  const total = report.signers.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin"
            className="text-sm font-medium text-gray-500 hover:text-ink"
          >
            ← Compliance
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold text-ink">
            {document.title}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {report.currentVersion
              ? `Current: v${report.currentVersion.version_label}`
              : "No published version"}{" "}
            · {report.signedCount}/{total} signed · {report.pendingCount} pending
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/admin/policies/${id}/export`}>
            <Button variant="secondary">Export CSV</Button>
          </a>
          <Link href={`/admin/policies/${id}/new`}>
            <Button>New version</Button>
          </Link>
        </div>
      </div>

      {/* Versions — drafts (e.g. seeded policies) are published from here */}
      <Card className="p-5">
        <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-gray-400">
          Versions
        </h2>
        {versions.length === 0 ? (
          <p className="text-sm text-gray-400">No versions yet.</p>
        ) : (
          <div className="space-y-2">
            {versions.map((v) => (
              <div
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-ink">
                    v{v.version_label}
                  </span>
                  <Badge tone={VERSION_TONE[v.status] ?? "neutral"}>
                    {v.status}
                  </Badge>
                  {v.id === document.current_version_id && (
                    <Badge tone="brand">Current</Badge>
                  )}
                  <span className="text-xs text-gray-400">
                    {v.effective_date && (
                      <>Effective {formatIstDate(v.effective_date)} · </>
                    )}
                    {v.published_at
                      ? `Published ${formatIstDate(v.published_at)}`
                      : `Created ${formatIstDate(v.created_at)}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Read any version — superseded ones are otherwise
                      unreadable, their text only living in the table. */}
                  <Link href={`/admin/policies/${id}/versions/${v.id}`}>
                    <Button variant="ghost" type="button">
                      View
                    </Button>
                  </Link>
                  {v.status === "draft" && (
                    <>
                      <Link href={`/admin/policies/${id}/draft/${v.id}`}>
                        <Button variant="secondary" type="button">
                          Edit
                        </Button>
                      </Link>
                      <form action={publishDraftVersion}>
                        <input type="hidden" name="versionId" value={v.id} />
                        <Button type="submit">Publish</Button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-gray-400">
          Publishing makes the version visible to employees and prompts everyone
          to sign it. The previously current version is archived.
        </p>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Employee</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Signed at</th>
              <th className="px-4 py-3 text-right font-semibold">Document</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {report.signers.map((s) => (
              <tr key={s.employee.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-ink">{s.employee.name}</div>
                  <div className="text-xs text-gray-400">
                    {s.employee.email}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {s.signedAt ? (
                    <Badge tone="success">Signed</Badge>
                  ) : (
                    <Badge tone="warning">Pending</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {s.signedAt
                    ? new Date(s.signedAt).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {s.signatureId ? (
                    <a
                      href={`/documents/${id}/signature/${s.signatureId}/pdf`}
                      className="text-sm font-semibold text-brand hover:underline"
                    >
                      PDF
                    </a>
                  ) : (
                    <span className="text-sm text-gray-300">—</span>
                  )}
                </td>
              </tr>
            ))}
            {total === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  No active employees found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
