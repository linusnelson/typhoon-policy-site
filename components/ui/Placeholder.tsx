import { Card } from "@/components/ui";

// Stub for routes that exist in the nav but whose module is not built yet.
// Keeps navigation coherent during the migration; replace per module.
export function Placeholder({
  title,
  note,
}: {
  title: string;
  note?: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {note ?? "This section is being migrated from the ClockBays app."}
        </p>
      </div>
      <Card className="flex items-center justify-center p-12 text-sm text-gray-400">
        Coming soon
      </Card>
    </div>
  );
}
