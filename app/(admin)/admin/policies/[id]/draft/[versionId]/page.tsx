import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDocument, getVersion } from "@/lib/policies";
import { EditDraftForm } from "./EditDraftForm";

// Admin: edit a draft version in place. Published/archived versions are
// immutable (signatures bind to their content hash) — redirect back.
export default async function EditDraftPage({
  params,
}: {
  params: Promise<{ id: string; versionId: string }>;
}) {
  const { id, versionId } = await params;
  const [document, version] = await Promise.all([
    getDocument(id),
    getVersion(versionId),
  ]);
  if (!document || !version || version.document_id !== id) notFound();
  if (version.status !== "draft") redirect(`/admin/policies/${id}`);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/policies/${id}`}
          className="text-sm font-medium text-gray-500 hover:text-ink"
        >
          ← {document.title}
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">
          Edit draft · v{version.version_label}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Save keeps it as a draft (invisible to employees). Publish makes it
          the current version and prompts everyone to sign.
        </p>
      </div>

      <EditDraftForm
        documentId={id}
        versionId={version.id}
        initial={{
          versionLabel: version.version_label,
          changeSummary: version.change_summary ?? "",
          effectiveDate: version.effective_date ?? "",
          contentMd: version.content_md,
          requiresResign: version.requires_resign,
        }}
      />
    </div>
  );
}
