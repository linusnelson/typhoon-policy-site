import Link from "next/link";
import { getCurrentEmployee, getDocumentsWithStatus } from "@/lib/policies";
import { Badge, Banner, Card } from "@/components/ui";
import type { DocumentWithStatus } from "@/lib/types";

export default async function DashboardPage() {
  const employee = (await getCurrentEmployee())!; // layout guarantees presence
  const docs = await getDocumentsWithStatus(employee);

  const pending = docs.filter(
    (d) => d.currentVersion && !d.signature
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          Policy documents
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Read each document and sign to acknowledge it.
        </p>
      </div>

      {pending.length > 0 ? (
        <Banner tone="warning">
          You have {pending.length} document
          {pending.length > 1 ? "s" : ""} awaiting your signature.
        </Banner>
      ) : docs.length > 0 ? (
        <Banner tone="success">
          You&apos;re all caught up — every current policy is signed.
        </Banner>
      ) : null}

      <div className="space-y-3">
        {docs.length === 0 && (
          <Card className="p-8 text-center text-sm text-gray-500">
            No policy documents have been published yet.
          </Card>
        )}
        {docs.map((d) => (
          <DocumentRow key={d.document.id} item={d} />
        ))}
      </div>
    </div>
  );
}

function DocumentRow({ item }: { item: DocumentWithStatus }) {
  const { document, currentVersion, signature } = item;
  return (
    <Link href={`/documents/${document.id}`} className="block">
      <Card className="p-5 transition-colors hover:border-gray-300">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-bold text-ink">
              {document.title}
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {currentVersion
                ? `Version ${currentVersion.version_label}`
                : "No published version"}
              {currentVersion?.effective_date
                ? ` · effective ${new Date(
                    currentVersion.effective_date
                  ).toLocaleDateString("en-IN", { dateStyle: "medium" })}`
                : ""}
            </p>
          </div>
          <div className="shrink-0">
            {!currentVersion ? (
              <Badge tone="neutral">Draft</Badge>
            ) : signature ? (
              <Badge tone="success">Signed</Badge>
            ) : (
              <Badge tone="warning">Signature required</Badge>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
