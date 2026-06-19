import { formatIstDate } from "@/lib/ist";
import type { TrendPoint } from "@/lib/data/report-analytics";

// Per-day present/absent stacked mini-bars (no chart dependency). Each day is a
// column; green = present, red = absent, scaled to the busiest day.
export function TrendBars({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-400">No data.</p>;
  }
  const max = Math.max(...points.map((p) => p.present + p.absent), 1);

  return (
    <div>
      <div className="flex items-end gap-1" style={{ height: 120 }}>
        {points.map((p) => {
          const presentH = Math.round((p.present / max) * 110);
          const absentH = Math.round((p.absent / max) * 110);
          return (
            <div
              key={p.date}
              className="group relative flex flex-1 flex-col justify-end"
              title={`${formatIstDate(p.date)} · ${p.present} present, ${p.absent} absent`}
            >
              <div
                className="w-full rounded-t-sm bg-danger-deep/80"
                style={{ height: absentH }}
              />
              <div
                className="w-full bg-success-deep"
                style={{ height: presentH }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-success-deep" />
          Present
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-danger-deep/80" />
          Absent
        </span>
      </div>
    </div>
  );
}
