import { Card } from "@/components/ui";
import { Building2, Home, MapPin, CalendarRange, AlertCircle } from "lucide-react";
import { getDashboardSummary } from "@/lib/data/dashboard";

function pct(n: number, total: number): string {
  return total ? `${Math.round((n / total) * 100)}%` : "0%";
}

function SummaryCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone: "success" | "danger" | "warning" | "info" | "neutral";
}) {
  const toneCls = {
    success: "text-success-deep",
    danger: "text-danger-deep",
    warning: "text-warning-deep",
    info: "text-info-deep",
    neutral: "text-gray-600",
  }[tone];
  return (
    <Card className="p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className={`mt-2 font-display text-3xl font-bold ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
    </Card>
  );
}

const WORK_TYPES = [
  { key: "office", label: "Office", icon: Building2 },
  { key: "wfh", label: "WFH", icon: Home },
  { key: "field", label: "Field visit", icon: MapPin },
  { key: "event", label: "Event", icon: CalendarRange },
] as const;

export async function DashboardOverview() {
  const s = await getDashboardSummary();
  const t = s.totalActive;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryCard label="Present" value={s.counts.present} sub={`${pct(s.counts.present, t)} of ${t}`} tone="success" />
        <SummaryCard label="Absent" value={s.counts.absent} sub={pct(s.counts.absent, t)} tone="danger" />
        <SummaryCard label="Late" value={s.counts.late} sub={pct(s.counts.late, t)} tone="warning" />
        <SummaryCard label="On leave" value={s.counts.onLeave} sub={pct(s.counts.onLeave, t)} tone="info" />
        <SummaryCard label="LOP" value={s.counts.lop} tone="neutral" />
      </div>

      <Card className="p-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Work type today
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {WORK_TYPES.map((w) => (
            <div key={w.key} className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <w.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="font-display text-xl font-bold text-ink">
                  {s.workType[w.key]}
                </div>
                <div className="text-xs text-gray-400">{w.label}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-display text-lg font-bold text-ink">By location</h2>
          <div className="space-y-2">
            {s.locations.length === 0 && (
              <Card className="p-5 text-sm text-gray-400">No locations.</Card>
            )}
            {s.locations.map((l) => (
              <Card key={l.name} className="flex items-center justify-between p-4">
                <span className="font-medium text-ink">{l.name}</span>
                <span className="text-sm text-gray-500">
                  <span className="font-semibold text-success-deep">{l.present}</span> / {l.total} present
                </span>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 font-display text-lg font-bold text-ink">
            Today&apos;s exceptions
          </h2>
          <Card className="divide-y divide-gray-100">
            {s.exceptions.length === 0 && (
              <div className="p-5 text-sm text-gray-400">No exceptions — all clear.</div>
            )}
            {s.exceptions.map((e, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-warning-deep" />
                <span className="flex-1 text-sm text-ink">{e.employeeName}</span>
                <span className="text-xs text-gray-500">{e.reason}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
