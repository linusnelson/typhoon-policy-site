import Link from "next/link";
import { ChevronLeft, ChevronRight, LogIn, LogOut, MapPin, Flag } from "lucide-react";
import { getLocationTimeline, type TimelineKind } from "@/lib/data/employee-detail";
import { formatIstDate } from "@/lib/ist";
import { MapLink } from "./MapLink";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const KIND_ICON: Record<TimelineKind, typeof LogIn> = {
  punch_in: LogIn,
  punch_out: LogOut,
  visit_in: MapPin,
  visit_out: Flag,
};

const KIND_COLOR: Record<TimelineKind, string> = {
  punch_in: "text-success-deep",
  punch_out: "text-danger-deep",
  visit_in: "text-brand",
  visit_out: "text-brand",
};

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function TimelinePanel({
  employeeId,
  ym,
}: {
  employeeId: string;
  ym: string;
}) {
  const [year, month] = ym.split("-").map(Number);
  const days = await getLocationTimeline(employeeId, ym);
  const base = `/admin/employees/${employeeId}?tab=timeline`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link
          href={`${base}&ym=${shiftMonth(ym, -1)}`}
          scroll={false}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-ink hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" /> Prev
        </Link>
        <div className="font-display text-lg font-bold text-ink">
          {MONTHS[month - 1]} {year}
        </div>
        <Link
          href={`${base}&ym=${shiftMonth(ym, 1)}`}
          scroll={false}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-ink hover:text-ink"
        >
          Next <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {days.length === 0 ? (
        <p className="text-sm text-gray-400">
          No location activity recorded this month.
        </p>
      ) : (
        <div className="space-y-6">
          {days.map((d) => (
            <div key={d.date}>
              <div className="text-sm font-semibold text-ink">
                {formatIstDate(d.date)}
              </div>
              <ol className="mt-2 space-y-2 border-l border-gray-200 pl-4">
                {d.events.map((e, i) => {
                  const Icon = KIND_ICON[e.kind];
                  return (
                    <li key={i} className="relative flex items-center gap-3">
                      <span className="absolute -left-[1.42rem] flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 bg-white">
                        <Icon className={`h-3 w-3 ${KIND_COLOR[e.kind]}`} />
                      </span>
                      <span className="w-12 shrink-0 font-mono text-xs text-gray-500">
                        {e.time}
                      </span>
                      <span className="flex-1 text-sm capitalize text-gray-700">
                        {e.label}
                      </span>
                      {e.lat != null && e.lng != null && (
                        <MapLink lat={e.lat} lng={e.lng} />
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
