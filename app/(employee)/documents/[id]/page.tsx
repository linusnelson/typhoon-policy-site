import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCurrentEmployee,
  getDocument,
  getMySignaturesForDocument,
  getVersion,
} from "@/lib/policies";
import { Badge, Card } from "@/components/ui";
import { PolicyMarkdown } from "@/components/PolicyMarkdown";
import { SignaturePanel } from "@/components/SignaturePanel";
import { isServiceAccount } from "@/lib/config";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const employee = (await getCurrentEmployee())!;

  const document = await getDocument(id);
  if (!document) notFound();

  const currentVersion = document.current_version_id
    ? await getVersion(document.current_version_id)
    : null;

  const signatures = await getMySignaturesForDocument(id, employee.id);
  const signature = currentVersion
    ? signatures.get(currentVersion.id) ?? null
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            href="/"
            className="text-sm font-medium text-gray-500 hover:text-ink"
          >
            ← All documents
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold text-ink">
            {document.title}
          </h1>
          {currentVersion && (
            <div className="mt-2 flex items-center gap-2">
              <Badge tone="brand">v{currentVersion.version_label}</Badge>
              {currentVersion.effective_date && (
                <span className="text-sm text-gray-500">
                  Effective{" "}
                  {new Date(currentVersion.effective_date).toLocaleDateString(
                    "en-IN",
                    { dateStyle: "medium" }
                  )}
                </span>
              )}
            </div>
          )}
        </div>
        <Link
          href={`/documents/${id}/versions`}
          className="shrink-0 text-sm font-medium text-brand hover:underline"
        >
          Version history
        </Link>
      </div>

      {!currentVersion ? (
        <Card className="p-8 text-center text-sm text-gray-500">
          This document has no published version yet.
        </Card>
      ) : (
        <>
          {currentVersion.change_summary && (
            <Card className="border-brand/20 bg-brand-soft p-4 text-sm text-brand">
              <span className="font-semibold">What changed: </span>
              {currentVersion.change_summary}
            </Card>
          )}

          <Card className="p-6 sm:p-8">
            <PolicyMarkdown content={currentVersion.content_md} />
          </Card>

          {isServiceAccount(employee.email) ? (
            <Card className="p-5 text-sm text-gray-600">
              This is a service account — signing is not required.
            </Card>
          ) : (
            <SignaturePanel
              documentId={id}
              version={currentVersion}
              signature={signature}
              defaultName={employee.name}
            />
          )}
        </>
      )}
    </div>
  );
}
