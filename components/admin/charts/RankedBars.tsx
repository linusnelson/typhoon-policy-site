// Lightweight horizontal bar list (no chart dependency). Bar widths are relative
// to the max value. Used for department comparison and top late/absent rankings.

export interface RankedBarRow {
  label: string;
  sublabel?: string;
  value: number;
  // Optional display string for the value (e.g. "92%"); defaults to the number.
  display?: string;
}

const TONE: Record<string, string> = {
  brand: "bg-brand",
  success: "bg-success-deep",
  danger: "bg-danger-deep",
  warning: "bg-warning-deep",
  info: "bg-info-deep",
};

export function RankedBars({
  rows,
  tone = "brand",
  empty = "No data.",
}: {
  rows: RankedBarRow[];
  tone?: keyof typeof TONE;
  empty?: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-400">{empty}</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate font-medium text-ink">
              {r.label}
              {r.sublabel && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {r.sublabel}
                </span>
              )}
            </span>
            <span className="shrink-0 font-semibold text-gray-700">
              {r.display ?? r.value}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full ${TONE[tone]}`}
              style={{ width: `${Math.round((r.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
