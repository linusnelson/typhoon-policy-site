import { listLocations } from "@/lib/data/refs";
import { LocationManager } from "@/components/admin/LocationManager";

export default async function LocationsPage() {
  const rows = await listLocations();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Locations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Branch locations with geofence radius/mode, selfie requirement, and
          check-in methods.
        </p>
      </div>
      <LocationManager rows={rows} />
    </div>
  );
}
