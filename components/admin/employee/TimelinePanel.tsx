import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getLocationTimeline } from "@/lib/data/employee-detail";
import { TimelineExplorer } from "./TimelineExplorer";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Server shell: month navigation + data fetch. Rendering (timeline list +
// right-side OpenStreetMap panel with click-to-focus) lives in the client
// TimelineExplorer.
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

      <TimelineExplorer days={days} />
    </div>
  );
}
