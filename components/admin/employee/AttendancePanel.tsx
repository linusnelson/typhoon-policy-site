import Link from "next/link";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { getMonthAttendance, type DayStatus } from "@/lib/data/employee-attendance";
import { Badge } from "@/components/ui";
import { RegularizeButton } from "./RegularizeButton";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const STATUS: Record<DayStatus, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" | "brand" }> = {
  present: { label: "Present", tone: "success" },
  wfh: { label: "WFH", tone: "success" },
  client_visit: { label: "Client visit", tone: "brand" },
  event: { label: "Event", tone: "brand" },
  late: { label: "Late", tone: "warning" },
  half_day: { label: "Half day", tone: "warning" },
  incomplete: { label: "No punch-out", tone: "warning" },
  on_leave: { label: "On leave", tone: "info" },
  absent: { label: "Absent", tone: "danger" },
  holiday: { label: "Holiday", tone: "neutral" },
  weekly_off: { label: "Weekly off", tone: "neutral" },
};

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dayDisplay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const wd = new Date(`${key}T00:00:00Z`).getUTCDay();
  const W = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${W[wd]} ${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-gray-200 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold text-ink">{value}</div>
    </div>
  );
}

function MapLink({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  return (
    <a
      href={`https://www.google.com/maps?q=${lat},${lng}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 text-info-deep hover:underline"
      title={`${lat.toFixed(5)}, ${lng.toFixed(5)}`}
    >
      <MapPin className="h-3 w-3" />
      {label}
    </a>
  );
}

export async function AttendancePanel({
  employeeId,
  ym,
}: {
  employeeId: string;
  ym: string;
}) {
  const [year, month] = ym.split("-").map(Number);
  const { days, stats } = await getMonthAttendance(employeeId, year, month);

  // Derived stats not returned directly by getMonthAttendance.
  const worked = days.filter((d) => d.hours > 0);
  const totalHours = worked.reduce((s, d) => s + d.hours, 0);
  const ot = worked.reduce((s, d) => s + (d.hours > 8 ? d.hours - 8 : 0), 0);
  const noPunchOut = days.filter((d) => d.status === "incomplete").length;
  const inMins = days
    .filter((d) => d.punchIn)
    .map((d) => {
      const [h, m] = d.punchIn!.split(":").map(Number);
      return h * 60 + m;
    });
  const avgIn =
    inMins.length === 0
      ? null
      : Math.round(inMins.reduce((a, b) => a + b, 0) / inMins.length);
  const punctuality =
    stats.present === 0
      ? null
      : Math.round(((stats.present - stats.late) / stats.present) * 100);
  const fmtMin = (m: number | null) =>
    m === null
      ? "—"
      : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  const base = `/admin/employees/${employeeId}?tab=attendance`;

  return (
    <div className="space-y-5">
      {/* Month nav */}
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Present" value={String(stats.present)} />
        <Stat label="Absent" value={String(stats.absent)} />
        <Stat label="Late" value={String(stats.late)} />
        <Stat label="On leave" value={String(stats.leave)} />
        <Stat label="Total hrs" value={totalHours.toFixed(1)} />
        <Stat label="OT hrs" value={ot.toFixed(1)} />
        <Stat label="Avg in" value={fmtMin(avgIn)} />
        <Stat label="No punch-out" value={String(noPunchOut)} />
      </div>
      {punctuality !== null && (
        <div className="text-sm text-gray-500">
          Punctuality this month:{" "}
          <span className="font-semibold text-ink">{punctuality}%</span>
        </div>
      )}

      {/* Day table */}
      <div className="overflow-x-auto rounded-card border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Work type</th>
              <th className="px-4 py-3">In → Out</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">GPS</th>
              <th className="px-4 py-3 text-right">Correct</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {days.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  No attendance recorded this month.
                </td>
              </tr>
            )}
            {days.map((d) => {
              const s = STATUS[d.status];
              return (
                <tr key={d.date} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                    {dayDisplay(d.date)}
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-600">
                    {d.workType?.replace("_", " ") ??
                      (d.leaveType ? `Leave · ${d.leaveType}` : "—")}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {d.punchIn ? `${d.punchIn} → ${d.punchOut ?? "—"}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {d.hours > 0 ? `${d.hours.toFixed(1)}h` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-xs">
                      {d.inLat != null && d.inLng != null && (
                        <MapLink lat={d.inLat} lng={d.inLng} label="In" />
                      )}
                      {d.outLat != null && d.outLng != null && (
                        <MapLink lat={d.outLat} lng={d.outLng} label="Out" />
                      )}
                      {d.inLat == null && d.outLat == null && (
                        <span className="text-gray-300">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <RegularizeButton
                        employeeId={employeeId}
                        date={d.date}
                        dateDisplay={dayDisplay(d.date)}
                        currentIn={d.punchIn}
                        currentOut={d.punchOut}
                        workType={d.workType}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
