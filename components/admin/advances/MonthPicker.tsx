"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const selectCls =
  "rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";

// Year/month selects driving the ?month=YYYY-MM param (keeps other params).
// `tab` optionally pins a tab param alongside (the advances page's month view
// lives at ?tab=month); pages without tabs omit it.
export function MonthPicker({ monthKey, tab }: { monthKey: string; tab?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 4 }, (_, i) => thisYear - 2 + i);

  function update(y: number, m: number) {
    const qs = new URLSearchParams(searchParams.toString());
    if (tab) qs.set("tab", tab);
    qs.set("month", `${y}-${String(m).padStart(2, "0")}`);
    router.push(`${pathname}?${qs.toString()}`, { scroll: false });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className={selectCls}
        value={month}
        onChange={(e) => update(year, Number(e.target.value))}
      >
        {MONTHS.map((label, i) => (
          <option key={label} value={i + 1}>
            {label}
          </option>
        ))}
      </select>
      <select
        className={selectCls}
        value={year}
        onChange={(e) => update(Number(e.target.value), month)}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
