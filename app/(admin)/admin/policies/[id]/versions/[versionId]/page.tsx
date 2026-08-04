import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocument, getVersion } from "@/lib/policies";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card } from "@/components/ui";
import { PolicyMarkdown } from "@/components/PolicyMarkdown";
import { formatIstDate } from "@/lib/ist";

// Admin: read ANY version of a policy document — current, superseded or draft.
//
// The version lists showed labels and dates but had no way to open the text,
// so a superseded policy was effectively unreadable even though its content_md
// was sitting in the table. /documents/[id] only ever renders the CURRENT
// version, and the draft editor redirects away for anything published or
// archived (those are immutable — signatures bind to their content hash).
//
// Read-only by design: nothing here can edit or republish. Admin-only by
// virtue of living under /admin (the layout bounces non-admins).

const TONE = {
  published: "success",
  archived: "neutral",
  draft: "warning",
} as const;

export default async function ViewVersionPage({
  params,
}: {
  params: Promise<{ id: string; versionId: string }>;
}) {
  const { id, versionId } = await params;
  const [document, version] = await Promise.all([
    getDocument(id),
    getVersion(versionId),
  ]);
  // Guard against a versionId from a different document being pasted in.
  if (!document || !version || version.document_id !== id) notFound();

  const isCurrent = document.current_version_id === version.id;

  // Who published it — one lookup, best-effort (older rows may have no author).
  let publishedBy: string | null = null;
  if (version.published_by) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("employees")
      .select("name")
      .eq("id", version.published_by)
      .maybeSingle();
    publishedBy = (data?.name as string | null) ?? null;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/policies/${id}`}
          className="text-sm font-medium text-gray-500 hover:text-ink"
        >
          ← {document.title}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-bold text-ink">
            Version {version.version_label}
          </h1>
          <Badge tone={TONE[version.status] ?? "neutral"}>{version.status}</Badge>
          {isCurrent && <Badge tone="brand">Current</Badge>}
          {version.requires_resign && (
            <Badge tone="warning">Required re-signing</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {version.effective_date && (
            <>Effective {formatIstDate(version.effective_date)} · </>
          )}
          {version.published_at
            ? `Published ${formatIstDate(version.published_at)}`
            : `Created ${formatIstDate(version.created_at)}`}
          {publishedBy && ` by ${publishedBy}`}
        </p>
      </div>

      {!isCurrent && version.status !== "draft" && (
        <Card className="border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          This version has been superseded. It is kept for the record and cannot
          be edited — employees see the current version.
        </Card>
      )}

      {version.change_summary && (
        <Card className="border-brand/20 bg-brand-soft p-4 text-sm text-brand">
          <span className="font-semibold">What changed: </span>
          {version.change_summary}
        </Card>
      )}

      <Card className="p-6 sm:p-8">
        <PolicyMarkdown content={version.content_md} />
      </Card>
    </div>
  );
}
