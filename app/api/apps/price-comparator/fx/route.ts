import { NextResponse } from "next/server";
import { requireAppAccess, AuthzError } from "@/lib/auth";
import { PRICE_COMPARATOR_SLUG } from "@/lib/apps/registry";
import { resolveFx } from "@/lib/apps/price-comparator/fx";
import { loadVendorSettings } from "@/lib/apps/price-comparator/settings";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };

// Exchange-rate state for one comparison run (effective + live + override).
// The client fetches it at the start of every run, so a rate an admin changed
// elsewhere is picked up, and sends the effective rate with every line.
// Only the FX fields leave the server — never the vendor keys.
export async function GET() {
  let me;
  try {
    me = await requireAppAccess(PRICE_COMPARATOR_SLUG);
  } catch (e) {
    if (e instanceof AuthzError) {
      return NextResponse.json({ error: e.message }, { status: 403, headers: NO_STORE });
    }
    throw e;
  }

  const settings = await loadVendorSettings(me.org_id);
  return NextResponse.json(await resolveFx(settings.fxOverride), { headers: NO_STORE });
}
