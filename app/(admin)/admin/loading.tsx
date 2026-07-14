import { Card } from "@/components/ui";

// Segment-level streaming fallback for /admin/* pages. Keeps the sidebar shell
// rendered while the page's (often heavier) server queries resolve.
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="h-8 w-56 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-80 animate-pulse rounded bg-gray-100" />
      </div>
      <Card className="space-y-3 p-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-6 w-full animate-pulse rounded bg-gray-100" />
        ))}
      </Card>
    </div>
  );
}
