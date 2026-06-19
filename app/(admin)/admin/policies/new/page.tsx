import Link from "next/link";
import { NewDocumentForm } from "./NewDocumentForm";

export default function NewDocumentPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin"
          className="text-sm font-medium text-gray-500 hover:text-ink"
        >
          ← Compliance
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">
          New document
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Create a policy document and publish its first version.
        </p>
      </div>

      <NewDocumentForm />
    </div>
  );
}
