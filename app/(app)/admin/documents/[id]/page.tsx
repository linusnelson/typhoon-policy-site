import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocument } from "@/lib/policies";
import { getComplianceForDocument } from "@/lib/admin";
import { Badge, Button, Card } from "@/components/ui";

export default async function AdminDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const document = await getDocument(id);
  if (!document) notFound();

  const report = await getComplianceForDocument(document);
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
          <a href={`/admin/documents/${id}/export`}>
            <Button variant="secondary">Export CSV</Button>
          </a>
          <Link href={`/admin/documents/${id}/new`}>
            <Button>New version</Button>
          </Link>
        </div>
      </div>

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
                      className="text-sm font-semibold text-amber-press hover:underline"
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
