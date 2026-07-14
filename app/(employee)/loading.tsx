import { Card } from "@/components/ui";

// Segment-level streaming fallback. Shown in the content area (nav/shell stay
// put) while a route group page's server data resolves — so client-side
// navigation paints instantly instead of blocking on the page's queries.
// Neutral enough to sit under any employee/team page.
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="h-7 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-72 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-5">
            <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
            <div className="mt-3 h-8 w-16 animate-pulse rounded bg-gray-100" />
          </Card>
        ))}
      </div>
      <Card className="space-y-3 p-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-5 w-full animate-pulse rounded bg-gray-100" />
        ))}
      </Card>
    </div>
  );
}
