import { requireAdmin } from "@/lib/auth";
import { getOrg } from "@/lib/data/org";
import { Card } from "@/components/ui";
import { SettingsForm } from "@/components/admin/SettingsForm";

export default async function SettingsPage() {
  const admin = await requireAdmin();
  const org = await getOrg(admin.org_id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Organization-level configuration.
        </p>
      </div>

      {org ? (
        <SettingsForm org={org} />
      ) : (
        <Card className="p-8 text-center text-sm text-gray-400">
          Organization not found.
        </Card>
      )}
    </div>
  );
}
