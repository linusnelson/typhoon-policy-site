import Link from "next/link";
import { requireAppAccessView } from "@/lib/auth";
import { BILL_FORGE_SLUG } from "@/lib/apps/registry";
import { AppTabs } from "@/components/apps/bill-forge/AppTabs";

// Access gate for every BillForge page. The pages are client views over the
// BillForge API (its own host), which checks the same grant from the bearer token.
export default async function BillForgeLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAppAccessView(BILL_FORGE_SLUG);

  return (
    // IDs, hashes, part numbers and amounts line up: mono text gets tabular numerals.
    <div className="space-y-5 [&_.font-mono]:tabular-nums">
      <div>
        <div className="text-xs text-gray-400">
          <Link href="/applications" className="hover:text-brand">
            Applications
          </Link>{" "}
          / BillForge
        </div>
        <h1 className="font-display text-2xl font-bold text-ink">BillForge</h1>
        <p className="mt-1 text-sm text-gray-500">
          Supplier invoice PDFs and Bills of Entry into Zoho Books import files — purchase
          orders, bills, sales invoices and their mirror bills.
        </p>
      </div>
      <AppTabs showAdmin={me.role === "admin"} />
      {children}
    </div>
  );
}
