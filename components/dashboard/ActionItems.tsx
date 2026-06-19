import Link from "next/link";
import { Banner } from "@/components/ui";

// Self-serve action prompt shown to every role. Only renders when there's
// something for the signed-in user to do (currently: documents awaiting signature).
export function ActionItems({ pendingDocs }: { pendingDocs: number }) {
  if (pendingDocs <= 0) return null;

  return (
    <Banner tone="warning">
      You have {pendingDocs} document{pendingDocs > 1 ? "s" : ""} awaiting your
      signature.{" "}
      <Link href="/documents" className="font-semibold underline">
        Review now
      </Link>
    </Banner>
  );
}
