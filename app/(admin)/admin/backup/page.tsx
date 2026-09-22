import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { TabNav } from "@/components/ui/Tabs";
import { Banner } from "@/components/ui";
import { BackupPanel } from "@/components/admin/backup/BackupPanel";
import { RestorePanel } from "@/components/admin/backup/RestorePanel";
import { HistoryTable } from "@/components/admin/backup/HistoryTable";
import { findPendingRestore, latestNightly, listNightly, listRuns, loadRetention } from "@/lib/backup/runs";
import type { PreflightReport } from "@/lib/backup/restore";
import { loadOrg } from "@/lib/backup/service";
import { currentProjectRef } from "@/lib/backup/format";

// Long-running: staging a restore or rendering a big history is slow-ish.
export const maxDuration = 300;

export interface BucketSummary {
  id: string;
  objects: number;
  bytes: number;
}

// Backup · Restore · History. Everything data-changing is a Server Action in
// actions/backup.ts; the downloads are Route Handlers under this folder.
export default async function BackupPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = sp.tab === "restore" || sp.tab === "history" ? sp.tab : "backup";

  const admin = createAdminClient();
  const [org, bucketsRes, nightly, runs, retention, stored] = await Promise.all([
    loadOrg(admin),
    admin.rpc("backup_buckets"),
    latestNightly(),
    listRuns(),
    loadRetention(admin),
    listNightly(admin),
  ]);
  const buckets = ((bucketsRes.data as BucketSummary[] | null) ?? []).map((b) => ({
    id: b.id,
    objects: Number(b.objects),
    bytes: Number(b.bytes),
  }));

  const nightlyConfigured = (process.env.BACKUP_PASSPHRASE ?? "").length >= 12;
  // Only the Restore tab needs this (and it runs stale-run cleanup).
  const pending = tab === "restore" ? await findPendingRestore(admin, org.id) : null;
  const nightlyStale =
    !nightly ||
    nightly.status !== "ok" ||
    Date.now() - new Date(nightly.started_at).getTime() > 36 * 3600 * 1000;

  const tabs = [
    { key: "backup", label: "Backup" },
    { key: "restore", label: "Restore" },
    { key: "history", label: "History" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Backup</h1>
        <p className="mt-1 text-sm text-gray-500">
          One encrypted archive covers the attendance app and this portal — they share the same
          database ({currentProjectRef()}).
        </p>
      </div>

      {nightlyConfigured && nightlyStale && (
        <Banner tone="danger">
          {nightly
            ? `The last automatic backup ${nightly.status === "ok" ? "is older than 36 hours" : "failed"}${
                nightly.error ? `: ${nightly.error}` : "."
              } Check the History tab.`
            : "No automatic backup has run yet."}
        </Banner>
      )}

      <TabNav tabs={tabs} />

      {tab === "backup" && (
        <BackupPanel
          orgName={org.name}
          buckets={buckets}
          nightly={
            nightly
              ? {
                  status: nightly.status,
                  startedAt: nightly.started_at,
                  path: nightly.storage_path,
                  bytes: nightly.size_bytes,
                  error: nightly.error,
                }
              : null
          }
          nightlyConfigured={nightlyConfigured}
          retention={retention}
          stored={stored}
        />
      )}
      {tab === "restore" && (
        <RestorePanel
          orgName={org.name}
          safetyNeedsPassphrase={!nightlyConfigured}
          pending={
            pending
              ? { runId: pending.runId, startedAt: pending.startedAt, report: pending.report as PreflightReport }
              : null
          }
        />
      )}
      {tab === "history" && <HistoryTable runs={runs} />}
    </div>
  );
}
