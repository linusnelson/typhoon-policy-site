import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getApp } from "@/lib/apps/registry";
import { listAppGrantRows } from "@/lib/apps/access";
import { listEmployeeOptions } from "@/lib/data/employees";
import { AppAccessEditor } from "@/components/admin/AppAccessEditor";

export default async function AppAccessDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const app = getApp(slug);
  if (!app) notFound();

  const admin = await requireAdmin();
  const [grants, employees] = await Promise.all([
    listAppGrantRows(admin.org_id, slug),
    listEmployeeOptions({ activeOnly: true }),
  ]);
  const granted = new Set(grants.map((g) => g.employee_id));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="text-xs text-gray-400">
          <Link href="/admin/applications" className="hover:text-brand">
            App Access
          </Link>{" "}
          / {app.name}
        </div>
        <h1 className="font-display text-2xl font-bold text-ink">{app.name}</h1>
        <p className="mt-1 text-sm text-gray-500">{app.description}</p>
      </div>
      <AppAccessEditor
        slug={slug}
        grants={grants}
        // Search pool: active non-admins not yet granted. Never rendered as a
        // list — only matches for what the admin types.
        candidates={employees.filter((e) => e.role !== "admin" && !granted.has(e.id))}
      />
    </div>
  );
}
