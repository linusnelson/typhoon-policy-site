import Link from "next/link";
import { requireAppAccessView } from "@/lib/auth";
import { PRICE_COMPARATOR_SLUG } from "@/lib/apps/registry";
import { PriceProbeTabs } from "@/components/apps/price-comparator/PriceProbeTabs";

// Access gate for every PriceProbe page. The API routes under
// /api/apps/price-comparator check the same grant independently.
export default async function PriceProbeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireAppAccessView(PRICE_COMPARATOR_SLUG);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs text-gray-400">
          <Link href="/applications" className="hover:text-brand">
            Applications
          </Link>{" "}
          / PriceProbe
        </div>
        <h1 className="font-display text-2xl font-bold text-ink">PriceProbe</h1>
        <p className="mt-1 text-sm text-gray-500">
          Price a BOM across DigiKey, Mouser and element14 India.
        </p>
      </div>
      <PriceProbeTabs showSettings={me.role === "admin"} />
      {children}
    </div>
  );
}
