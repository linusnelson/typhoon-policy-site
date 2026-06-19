import { Card } from "@/components/ui";
import { listLocationCodes } from "@/lib/data/qr";
import { QrCard } from "@/components/admin/QrCard";

export default async function QrPage() {
  const locations = await listLocationCodes();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">QR Codes</h1>
        <p className="mt-1 text-sm text-gray-500">
          Generate a rotating QR per location for Android scan-to-punch, plus a
          6-digit code for iOS PWA users. Codes expire after 24 hours.
        </p>
      </div>

      {locations.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-400">
          No active locations. Add a location first.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((loc) => (
            <QrCard key={loc.locationId} loc={loc} />
          ))}
        </div>
      )}
    </div>
  );
}
