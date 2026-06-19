import { MapPin } from "lucide-react";

// Lightweight Google Maps coordinate link — matches ClockBays' approach
// (no embedded map library).
export function MapLink({
  lat,
  lng,
  label = "Map",
}: {
  lat: number;
  lng: number;
  label?: string;
}) {
  return (
    <a
      href={`https://www.google.com/maps?q=${lat},${lng}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 text-xs text-info-deep hover:underline"
      title={`${lat.toFixed(5)}, ${lng.toFixed(5)}`}
    >
      <MapPin className="h-3 w-3" />
      {label}
    </a>
  );
}
