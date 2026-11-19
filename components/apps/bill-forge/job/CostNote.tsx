import { Usage } from "@/lib/apps/bill-forge/api";

export function CostNote({ usage }: { usage: Usage }) {
  if (usage.calls === 0 && usage.replayed === 0) return null;
  const cost = usage.cost_inr && Number(usage.cost_inr) > 0
    ? `₹${Number(usage.cost_inr).toFixed(2)}`
    : null;
  return (
    <p className="text-xs text-gray-500">
      {cost && <span className="mr-2">{cost}</span>}
      {usage.calls} model call{usage.calls === 1 ? "" : "s"}
      {usage.replayed > 0 && (
        <span> · {usage.replayed} replayed from a previous batch, at no cost</span>
      )}
    </p>
  );
}
