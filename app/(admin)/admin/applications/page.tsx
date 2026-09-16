import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { APPS } from "@/lib/apps/registry";
import { countAppGrants } from "@/lib/apps/access";
import { Badge, Card } from "@/components/ui";

// One row per internal tool — stays compact as the catalogue grows. People
// are managed per app on /admin/applications/[slug].
export default async function AppAccessPage() {
  const admin = await requireAdmin();
  const counts = await countAppGrants(admin.org_id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">App Access</h1>
        <p className="mt-1 text-sm text-gray-500">
          Internal tools under Applications. Admins always have access; open an app to choose
          who else can use it.
        </p>
      </div>

      <Card className="divide-y divide-gray-100">
        {APPS.map((app) => {
          const n = counts[app.slug] ?? 0;
          return (
            <Link
              key={app.slug}
              href={`/admin/applications/${app.slug}`}
              className="group flex items-center gap-4 p-4 hover:bg-gray-50"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink">{app.name}</div>
                <div className="mt-0.5 truncate text-xs text-gray-500">{app.description}</div>
              </div>
              <Badge tone={n > 0 ? "brand" : "neutral"}>
                {n === 0 ? "Admins only" : `${n} ${n === 1 ? "person" : "people"}`}
              </Badge>
              <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-brand" />
            </Link>
          );
        })}
      </Card>
    </div>
  );
}
