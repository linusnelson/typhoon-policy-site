"use client";

/** The job page answers several different questions — what came out, what went wrong,
 *  what it cost — and stacking them all vertically buried the ones you only want
 *  occasionally. Tabs keep each answer one click away instead of one scroll away. */
export function Tabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: { id: string; label: string; badge?: number }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-gray-200">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onSelect(tab.id)}
          className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            active === tab.id
              ? "border-brand text-brand"
              : "border-transparent text-gray-500 hover:text-ink"
          }`}
        >
          {tab.label}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
