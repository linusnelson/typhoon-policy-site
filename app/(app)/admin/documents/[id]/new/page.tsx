import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocument, getVersion } from "@/lib/policies";
import { NewVersionForm } from "./NewVersionForm";

// Suggests the next minor version label (1.0 -> 1.1, 2 -> 2.1).
function suggestNextLabel(current: string | undefined): string {
  if (!current) return "1.0";
  const parts = current.split(".");
  const minor = parts.length > 1 ? parseInt(parts[1], 10) : 0;
  const major = parseInt(parts[0], 10);
  if (Number.isNaN(major)) return "";
  return `${major}.${(Number.isNaN(minor) ? 0 : minor) + 1}`;
}

export default async function NewVersionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const document = await getDocument(id);
  if (!document) notFound();

  const currentVersion = document.current_version_id
    ? await getVersion(document.current_version_id)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/documents/${id}`}
          className="text-sm font-medium text-gray-500 hover:text-ink"
        >
          ← {document.title}
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">
          New version
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Edit the content below, then publish to circulate the amendment.
        </p>
      </div>

      <NewVersionForm
        documentId={id}
        suggestedLabel={suggestNextLabel(currentVersion?.version_label)}
        starterContent={currentVersion?.content_md ?? ""}
      />
    </div>
  );
}
