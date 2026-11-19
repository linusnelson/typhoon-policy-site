import { STAGES } from "@/lib/apps/bill-forge/api";

export function Progress({ status }: { status: string }) {
  const index = STAGES.indexOf(status as (typeof STAGES)[number]);
  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {STAGES.map((stage, i) => (
        <li
          key={stage}
          className={`rounded-full px-3 py-1 font-semibold ${
            i < index
              ? "bg-success-soft text-success-deep"
              : i === index
                ? "bg-brand text-brand-fg"
                : "border border-gray-200 bg-white text-gray-400"
          }`}
        >
          {stage}
        </li>
      ))}
    </ol>
  );
}
