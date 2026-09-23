import Link from "next/link";
import { requireAppAccessView } from "@/lib/auth";
import { BEL_RFX_SLUG } from "@/lib/apps/registry";

// Access gate for the BEL RFx Extractor. Parsing happens in the browser, so
// there are no route handlers to guard separately.
export default async function BelRfxLayout({ children }: { children: React.ReactNode }) {
  await requireAppAccessView(BEL_RFX_SLUG);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs text-gray-400">
          <Link href="/applications" className="hover:text-brand">
            Applications
          </Link>{" "}
          / BEL RFx Extractor
        </div>
        <h1 className="font-display text-2xl font-bold text-ink">BEL RFx Extractor</h1>
        <p className="mt-1 text-sm text-gray-500">
          Drop BEL Bid Invitation PDFs. Rows come out in the tracking-sheet column order. Files are
          read in your browser and never uploaded.
        </p>
      </div>
      {children}
    </div>
  );
}
