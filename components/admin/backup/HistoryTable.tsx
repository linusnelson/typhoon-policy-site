import { Badge, Card } from "@/components/ui";
import type { BackupRun } from "@/lib/backup/runs";
import { formatBytes } from "@/lib/backup/format";
import { formatIstDateTime } from "@/lib/ist";

const KIND_LABEL: Record<BackupRun["kind"], string> = {
  manual: "Manual download",
  nightly: "Automatic (nightly)",
  pre_restore: "Safety copy",
  upload: "Upload",
  restore: "Restore",
  files: "Files part",
};

function statusTone(s: BackupRun["status"]): "success" | "danger" | "info" {
  return s === "ok" ? "success" : s === "failed" ? "danger" : "info";
}

export function HistoryTable({ runs }: { runs: BackupRun[] }) {
  if (!runs.length) {
    return <Card className="p-8 text-center text-sm text-gray-400">No backups or restores yet.</Card>;
  }
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
          <tr>
            <th className="px-4 py-3">When</th>
            <th className="px-4 py-3">What</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Size</th>
            <th className="px-4 py-3">Schema</th>
            <th className="px-4 py-3">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {runs.map((r) => {
            const tables = r.tables ?? {};
            const tableCount =
              r.kind === "restore"
                ? Object.keys((tables as { staged?: Record<string, number> }).staged ?? {}).length
                : r.kind === "files"
                  ? null
                  : Object.keys(tables).length;
            const downloadable =
              r.status === "ok" &&
              r.storage_path &&
              (r.storage_path.startsWith("nightly/") || r.storage_path.startsWith("pre-restore/"));
            return (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatIstDateTime(r.started_at)}</td>
                <td className="px-4 py-3 text-ink">{KIND_LABEL[r.kind] ?? r.kind}</td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                  {r.size_bytes ? formatBytes(Number(r.size_bytes)) : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">{r.schema_version ?? "—"}</td>
                <td className="px-4 py-3 text-gray-600">
                  {r.error ? (
                    <span className="text-danger">{r.error}</span>
                  ) : r.kind === "files" ? (
                    <FilesDetail tables={tables} />
                  ) : tableCount ? (
                    `${tableCount} tables`
                  ) : (
                    "—"
                  )}
                  {downloadable && (
                    <>
                      {" · "}
                      <a
                        className="font-semibold text-brand hover:underline"
                        href={`/admin/backup/download?path=${encodeURIComponent(r.storage_path!)}`}
                      >
                        Download
                      </a>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function FilesDetail({ tables }: { tables: Record<string, unknown> }) {
  const t = tables as { bucket?: string; month?: string; part?: number; objects?: number; uploaded?: number };
  if (!t.bucket) return <>—</>;
  return (
    <>
      {t.bucket} · {t.month} · part {t.part}
      {typeof t.objects === "number" ? ` · ${t.objects} files` : ""}
      {typeof t.uploaded === "number" ? ` · ${t.uploaded} restored` : ""}
    </>
  );
}
