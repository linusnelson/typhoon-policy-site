import { Blocker } from "@/lib/apps/bill-forge/api";

export function BlockerList({ blockers }: { blockers: Blocker[] }) {
  if (blockers.length === 0) return null;
  return (
    <ul className="space-y-1 text-xs text-gray-600">
      {blockers.map((b, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-gray-400">
            {b.rule ? <span className="font-mono">{b.rule}</span> : "•"}
          </span>
          <span>{b.message}</span>
        </li>
      ))}
    </ul>
  );
}
