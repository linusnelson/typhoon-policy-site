import QRCode from "qrcode";
import { RefreshCw } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { formatIstDateTime } from "@/lib/ist";
import type { LocationCode } from "@/lib/data/qr";
import { generateQrCode } from "@/actions/qr";

export async function QrCard({ loc }: { loc: LocationCode }) {
  const expired = !loc.expiresAt || new Date(loc.expiresAt).getTime() < Date.now();
  const active = !!loc.code && !expired;

  const svg = active
    ? await QRCode.toString(loc.code!, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
    : null;

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="font-display font-bold text-ink">{loc.locationName}</span>
        <Badge tone={active ? "success" : "neutral"}>
          {active ? "Active" : "Not generated"}
        </Badge>
      </div>

      {active ? (
        <>
          <div
            className="mx-auto mt-4 h-44 w-44 [&_svg]:h-full [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svg! }}
          />
          <div className="mt-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Location code (PWA)
            </div>
            <div className="font-mono text-2xl font-bold tracking-[0.3em] text-ink">
              {loc.locationCode}
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-gray-400">
            Expires {loc.expiresAt ? formatIstDateTime(loc.expiresAt) : "—"}
          </p>
        </>
      ) : (
        <p className="mt-4 flex-1 text-sm text-gray-400">
          No active code. Generate one for employees to scan or enter.
        </p>
      )}

      <form action={generateQrCode} className="mt-4">
        <input type="hidden" name="locationId" value={loc.locationId} />
        <Button type="submit" variant={active ? "secondary" : "primary"} className="w-full">
          <RefreshCw className="h-4 w-4" />
          {active ? "Regenerate" : "Generate"}
        </Button>
      </form>
    </Card>
  );
}
