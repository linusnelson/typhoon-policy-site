import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { listMyAppSlugs } from "@/lib/apps/access";
import { APPS, isExternalHref, launchHref, type AppDef } from "@/lib/apps/registry";
import { Card } from "@/components/ui";

// Launcher: the applications this employee has been granted (admins: all).
export default async function ApplicationsPage() {
  const me = await requireEmployee();
  const slugs = await listMyAppSlugs(me.id, me.role);
  // Nav hides the item for employees without grants; 404 on a direct visit.
  if (slugs.length === 0) notFound();
  const apps = APPS.filter((a) => slugs.includes(a.slug));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Applications</h1>
        <p className="mt-1 text-sm text-gray-500">Internal tools you have access to.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => (
          <AppCard key={app.slug} app={app} />
        ))}
      </div>
    </div>
  );
}

// Apps hosted elsewhere (absolute href) open in a new tab via a plain anchor;
// local apps keep client-side navigation through <Link>.
function AppCard({ app }: { app: AppDef }) {
  const href = launchHref(app);
  const external = isExternalHref(href);
  const Icon = external ? ExternalLink : ArrowRight;
  const card = (
    <Card className="h-full p-5 transition-colors group-hover:border-brand">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-bold text-ink">{app.name}</h2>
        <Icon className="h-4 w-4 text-gray-400 group-hover:text-brand" />
      </div>
      <p className="mt-1 text-sm text-gray-500">{app.description}</p>
    </Card>
  );
  return external ? (
    <a href={href} target="_blank" rel="noopener" className="group">
      {card}
    </a>
  ) : (
    <Link href={href} className="group">
      {card}
    </Link>
  );
}
