"use client";

import { useMemo, useState } from "react";
import {
  Camera,
  ExternalLink,
  Flag,
  Hourglass,
  LogIn,
  LogOut,
  MapPin,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { formatIstDate } from "@/lib/ist";
import type { TimelineDay, TimelineKind } from "@/lib/data/employee-detail";

const KIND_ICON: Record<TimelineKind, typeof LogIn> = {
  punch_in: LogIn,
  punch_out: LogOut,
  visit_in: MapPin,
  visit_out: Flag,
  check_ack: ShieldCheck,
  check_missed: ShieldAlert,
  check_pending: Hourglass,
};

const KIND_COLOR: Record<TimelineKind, string> = {
  punch_in: "text-success-deep",
  punch_out: "text-danger-deep",
  visit_in: "text-brand",
  visit_out: "text-brand",
  check_ack: "text-success-deep",
  check_missed: "text-warning-deep",
  check_pending: "text-gray-400",
};

interface Selected {
  date: string;
  label: string;
  time: string;
  lat: number | null;
  lng: number | null;
  selfie?: string | null;
}

// OpenStreetMap embed centered on the point with a marker (no map library —
// mirrors the "OSM tiles are free" convention from ClockBays).
function osmEmbedUrl(lat: number, lng: number): string {
  const d = 0.004; // ~400m box
  const bbox = [lng - d, lat - d, lng + d, lat + d].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

// Timeline events on the left; a sticky OpenStreetMap panel on the right shows
// the selected event's location. Defaults to the newest event with GPS.
export function TimelineExplorer({ days }: { days: TimelineDay[] }) {
  const firstWithGps = useMemo<Selected | null>(() => {
    for (const d of days) {
      for (const e of d.events) {
        if (e.lat != null && e.lng != null) {
          return {
            date: d.date,
            label: e.label,
            time: e.time,
            lat: e.lat,
            lng: e.lng,
            selfie: e.selfieUrl ?? null,
          };
        }
      }
    }
    return null;
  }, [days]);

  const [selected, setSelected] = useState<Selected | null>(firstWithGps);

  if (days.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        No location activity recorded this month.
      </p>
    );
  }

  const isSelected = (date: string, e: { time: string; lat: number | null; lng: number | null }) =>
    selected !== null &&
    selected.date === date &&
    selected.time === e.time &&
    selected.lat === e.lat &&
    selected.lng === e.lng;

  // Day summary: office punch in/out plus the field window (first client
  // check-in → last check-out). Events are already time-sorted.
  const daySummary = (events: TimelineDay["events"]): string | null => {
    const firstIn = events.find((e) => e.kind === "punch_in")?.time;
    const lastOut = [...events].reverse().find((e) => e.kind === "punch_out")?.time;
    const fieldIn = events.find((e) => e.kind === "visit_in")?.time;
    const fieldOut = [...events].reverse().find((e) => e.kind === "visit_out")?.time;
    const parts: string[] = [];
    if (firstIn || lastOut) parts.push(`In ${firstIn ?? "—"} · Out ${lastOut ?? "—"}`);
    if (fieldIn || fieldOut) parts.push(`Field ${fieldIn ?? "—"}–${fieldOut ?? "—"}`);
    return parts.length ? parts.join("  ·  ") : null;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
      {/* Timeline list */}
      <div className="space-y-6">
        {days.map((d) => (
          <div key={d.date}>
            <div className="text-sm font-semibold text-ink">
              {formatIstDate(d.date)}
            </div>
            {daySummary(d.events) && (
              <div className="mt-0.5 font-mono text-[11px] text-gray-500">
                {daySummary(d.events)}
              </div>
            )}
            <ol className="mt-2 space-y-1 border-l border-gray-200 pl-4">
              {d.events.map((e, i) => {
                const Icon = KIND_ICON[e.kind];
                const hasGps = e.lat != null && e.lng != null;
                const hasSelfie = !!e.selfieUrl;
                const selectable = hasGps || hasSelfie;
                const active = selectable && isSelected(d.date, e);
                const row = (
                  <>
                    <span className="absolute -left-[1.42rem] flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 bg-white">
                      <Icon className={`h-3 w-3 ${KIND_COLOR[e.kind]}`} />
                    </span>
                    <span className="w-14 shrink-0 font-mono text-xs text-gray-500">
                      {e.time}
                    </span>
                    <span className="flex-1 truncate text-left text-sm capitalize text-gray-700">
                      {e.label}
                    </span>
                    {hasSelfie && (
                      <Camera
                        className={`h-3.5 w-3.5 shrink-0 ${
                          active ? "text-brand" : "text-gray-300"
                        }`}
                      />
                    )}
                    {hasGps && (
                      <MapPin
                        className={`h-3.5 w-3.5 shrink-0 ${
                          active ? "text-brand" : "text-gray-300"
                        }`}
                      />
                    )}
                  </>
                );
                return (
                  <li key={i} className="relative">
                    {selectable ? (
                      <button
                        type="button"
                        onClick={() =>
                          setSelected({
                            date: d.date,
                            label: e.label,
                            time: e.time,
                            lat: e.lat,
                            lng: e.lng,
                            selfie: e.selfieUrl ?? null,
                          })
                        }
                        className={`relative flex w-full items-center gap-3 rounded-lg px-2 py-1.5 transition-colors ${
                          active ? "bg-brand-soft" : "hover:bg-gray-50"
                        }`}
                      >
                        {row}
                      </button>
                    ) : (
                      <div className="relative flex w-full items-center gap-3 px-2 py-1.5 opacity-80">
                        {row}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>

      {/* Sticky map panel */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="overflow-hidden rounded-card border border-gray-200 bg-white shadow-sm">
          {selected ? (
            <>
              {selected.selfie && (
                // Check-in selfie (private `selfies` bucket, pre-signed URL).
                // Opens full-size in a new tab, mirroring ClockBays' tap-to-zoom.
                <a href={selected.selfie} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={selected.selfie}
                    src={selected.selfie}
                    alt="Visit check-in selfie"
                    className="h-56 w-full border-b border-gray-200 object-cover"
                  />
                </a>
              )}
              {selected.lat != null && selected.lng != null ? (
                <iframe
                  key={`${selected.lat},${selected.lng}`}
                  title="Location map"
                  src={osmEmbedUrl(selected.lat, selected.lng)}
                  className="h-72 w-full border-0"
                  loading="lazy"
                />
              ) : !selected.selfie ? (
                <div className="flex h-72 items-center justify-center p-6 text-center text-sm text-gray-400">
                  No GPS coordinates recorded for this entry.
                </div>
              ) : null}
              <div className="space-y-1 p-3">
                <div className="text-sm font-semibold capitalize text-ink">
                  {selected.label}
                </div>
                <div className="text-xs text-gray-500">
                  {formatIstDate(selected.date)} · {selected.time}
                </div>
                {selected.lat != null && selected.lng != null && (
                  <div className="flex items-center gap-3 pt-1">
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${selected.lat}&mlon=${selected.lng}#map=17/${selected.lat}/${selected.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-info-deep hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> OpenStreetMap
                    </a>
                    <a
                      href={`https://www.google.com/maps?q=${selected.lat},${selected.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-info-deep hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Google Maps
                    </a>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-72 items-center justify-center p-6 text-center text-sm text-gray-400">
              No GPS coordinates recorded this month.
            </div>
          )}
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          Tap a timeline entry with a pin to view it on the map.
        </p>
      </div>
    </div>
  );
}
