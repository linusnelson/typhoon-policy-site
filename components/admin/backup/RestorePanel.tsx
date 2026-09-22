"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Banner, Button, Card, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  applyRestore,
  checkRestore,
  discardRestore,
  prepareRestoreUpload,
  restoreFiles,
  type ApplyResult,
} from "@/actions/backup";
import type { PreflightReport } from "@/lib/backup/restore";
import { BACKUPS_BUCKET, MIN_PASSPHRASE_LENGTH, formatBytes } from "@/lib/backup/format";

const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

// Restore is deliberately three explicit steps: upload → check → type the org
// name. The file goes browser → Storage (signed upload URL), never through a
// Server Action body.
async function uploadToBucket(path: string, token: string, file: File, onProgress?: (pct: number) => void) {
  onProgress?.(0);
  const supabase = createClient();
  const { error } = await supabase.storage.from(BACKUPS_BUCKET).uploadToSignedUrl(path, token, file, {
    contentType: "application/octet-stream",
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  onProgress?.(100);
}

export interface PendingRestoreProps {
  runId: string;
  startedAt: string;
  report: PreflightReport;
}

export function RestorePanel({
  orgName,
  safetyNeedsPassphrase,
  pending,
}: {
  orgName: string;
  // True when the server has no BACKUP_PASSPHRASE: the safety copy taken
  // before a restore must then be encrypted with a passphrase typed here.
  safetyNeedsPassphrase: boolean;
  // A restore already checked in an earlier render (tab switch / reload):
  // the card opens at the confirm step instead of asking for the file again.
  pending: PendingRestoreProps | null;
}) {
  return (
    <div className="space-y-6">
      <DatabaseRestoreCard orgName={orgName} safetyNeedsPassphrase={safetyNeedsPassphrase} pending={pending} />
      <FilesRestoreCard />
    </div>
  );
}

type Phase = "idle" | "uploading" | "checking" | "checked" | "applying" | "done";

function DatabaseRestoreCard({
  orgName,
  safetyNeedsPassphrase,
  pending,
}: {
  orgName: string;
  safetyNeedsPassphrase: boolean;
  pending: PendingRestoreProps | null;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [pass, setPass] = useState("");
  const [safetyPass, setSafetyPass] = useState("");
  const [phase, setPhase] = useState<Phase>(pending ? "checked" : "idle");
  const [runId, setRunId] = useState<string | null>(pending?.runId ?? null);
  const [report, setReport] = useState<PreflightReport | null>(pending?.report ?? null);
  const [resumed, setResumed] = useState<boolean>(!!pending);
  const [confirm, setConfirm] = useState("");
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = async () => {
    if (runId && phase !== "done") await discardRestore(runId);
    setFile(null);
    setPass("");
    setSafetyPass("");
    setPhase("idle");
    setRunId(null);
    setReport(null);
    setResumed(false);
    setConfirm("");
    setResult(null);
    setError(null);
    router.refresh();
  };

  const check = async () => {
    if (!file || pass.length < MIN_PASSPHRASE_LENGTH) return;
    setError(null);
    setResumed(false);
    setPhase("uploading");
    try {
      const slot = await prepareRestoreUpload("db");
      if (!slot.ok) throw new Error(slot.error);
      setRunId(slot.data.runId);
      await uploadToBucket(slot.data.path, slot.data.token, file);
      setPhase("checking");
      const r = await checkRestore(slot.data.runId, pass);
      if (!r.ok) throw new Error(r.error);
      setReport(r.data);
      setPhase("checked");
    } catch (e) {
      setError((e as Error).message);
      setPhase("idle");
    }
  };

  const apply = async () => {
    if (!runId) return;
    setError(null);
    setPhase("applying");
    const r = await applyRestore(runId, safetyNeedsPassphrase ? safetyPass || pass : "", confirm);
    if (!r.ok) {
      setError(r.error);
      setPhase("checked");
      return;
    }
    setResult(r.data);
    setPhase("done");
    router.refresh();
  };

  const busy = phase === "uploading" || phase === "checking" || phase === "applying";

  return (
    <Card className="p-6">
      <h2 className="font-display text-lg font-bold text-ink">Restore database</h2>
      <p className="mt-1 text-sm text-gray-500">
        Replaces <strong>all</strong> current data with the contents of a <code>.cbk</code> backup. A
        safety copy of today&apos;s data is written to the backups bucket first. Do this outside
        working hours — nobody should be punching in while it runs.
      </p>

      {phase === "done" && result ? (
        <div className="mt-5 space-y-4">
          <Banner tone="success">
            Restore complete. {Object.keys(result.tables).length} tables loaded
            {result.auth.skipped ? "; login records were not in this backup" : `; ${result.auth.users} login records restored`}.
          </Banner>
          <p className="text-sm text-gray-700">
            Safety copy of the previous data: <code>{result.safetyCopy.path}</code> (
            {formatBytes(result.safetyCopy.bytes)}), encrypted with{" "}
            {safetyNeedsPassphrase ? "the safety-copy passphrase you typed" : "the server's backup passphrase"}.
          </p>
          {result.projectChanged && (
            <Banner tone="warning">
              The backup came from a different Supabase project. Everyone (including you) must sign
              out and sign in again.
            </Banner>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-600">Per-table counts</summary>
            <CountsTable tables={result.tables} />
          </details>
          <Button type="button" variant="secondary" onClick={reset}>
            Start another restore
          </Button>
        </div>
      ) : (
        <>
          {resumed && pending && (
            <div className="mt-4">
              <Banner tone="info">
                Resumed the backup you checked at{" "}
                {new Date(pending.startedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
                . It is staged and ready — confirm below, or cancel to pick another file.
              </Banner>
            </div>
          )}
          {!resumed && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="rs-file">
                Backup file (.cbk)
              </label>
              <input
                id="rs-file"
                type="file"
                accept=".cbk"
                disabled={phase !== "idle"}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-semibold"
              />
              {file && <p className="mt-1 text-xs text-gray-400">{file.name} · {formatBytes(file.size)}</p>}
            </div>
            <div>
              <label className={labelCls} htmlFor="rs-pass">
                Passphrase used when the backup was made
              </label>
              <Input
                id="rs-pass"
                type="password"
                autoComplete="off"
                value={pass}
                disabled={phase !== "idle"}
                onChange={(e) => setPass(e.target.value)}
              />
            </div>
          </div>
          )}

          {phase === "idle" && (
            <div className="mt-4">
              <Button type="button" onClick={check} disabled={!file || pass.length < MIN_PASSPHRASE_LENGTH}>
                Check &amp; prepare
              </Button>
            </div>
          )}
          {busy && (
            <p className="mt-4 text-sm text-gray-600">
              {phase === "uploading" && "Uploading the file…"}
              {phase === "checking" && "Decrypting and checking the backup against the live schema… (can take a minute)"}
              {phase === "applying" && "Taking a safety copy, then loading the data… do not close this tab."}
            </p>
          )}

          {report && (phase === "checked" || phase === "applying") && (
            <div className="mt-5 space-y-4">
              <ReportView report={report} />
              {report.blockers.length === 0 && (
                <div className="rounded-lg border border-danger/40 bg-danger-soft p-4">
                  <p className="text-sm font-semibold text-danger-deep">
                    This will delete the current data for {orgName} and load the backup instead.
                  </p>
                  {safetyNeedsPassphrase && (
                    <div className="mt-3">
                      <label className={labelCls} htmlFor="rs-safety-pass">
                        Passphrase to encrypt the safety copy (no server passphrase is configured)
                      </label>
                      <Input
                        id="rs-safety-pass"
                        type="password"
                        autoComplete="new-password"
                        value={safetyPass}
                        placeholder={resumed ? "" : "Defaults to the backup passphrase above"}
                        onChange={(e) => setSafetyPass(e.target.value)}
                        disabled={phase === "applying"}
                      />
                    </div>
                  )}
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div>
                      <label className={labelCls} htmlFor="rs-confirm">
                        Type the organisation name to confirm
                      </label>
                      <Input
                        id="rs-confirm"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder={orgName}
                        disabled={phase === "applying"}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={apply}
                      disabled={
                        phase === "applying" ||
                        confirm.trim() !== orgName.trim() ||
                        (safetyNeedsPassphrase && (safetyPass || pass).length < MIN_PASSPHRASE_LENGTH)
                      }
                    >
                      {phase === "applying" ? "Restoring…" : "Restore now"}
                    </Button>
                  </div>
                </div>
              )}
              <Button type="button" variant="ghost" onClick={reset} disabled={phase === "applying"}>
                Cancel and discard the uploaded file
              </Button>
            </div>
          )}
        </>
      )}

      {error && (
        <div className="mt-4">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}
    </Card>
  );
}

function ReportView({ report }: { report: PreflightReport }) {
  const m = report.manifest;
  const totalRows = Object.values(report.staged).reduce((s, n) => s + n, 0);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-lg border border-gray-200 p-4 text-sm sm:grid-cols-2">
        <Field label="Taken">
          {new Date(m.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
        </Field>
        <Field label="Kind">{m.kind}</Field>
        <Field label="From project">
          {m.project_ref}
          {m.project_ref !== report.projectRefLive && (
            <>
              {" "}
              <Badge tone="warning">differs from {report.projectRefLive}</Badge>
            </>
          )}
        </Field>
        <Field label="Organisation">{m.org_name}</Field>
        <Field label="Schema">
          {m.schema_version}
          {m.schema_version === report.schemaVersionLive ? (
            <>
              {" "}
              <Badge tone="success">matches</Badge>
            </>
          ) : (
            <>
              {" "}
              <Badge tone={m.schema_version > report.schemaVersionLive ? "danger" : "warning"}>
                live is {report.schemaVersionLive}
              </Badge>
            </>
          )}
        </Field>
        <Field label="Contents">
          {Object.keys(report.staged).length} tables · {totalRows.toLocaleString("en-IN")} rows ·{" "}
          {report.hasAuth ? "login records included" : "no login records"} · integrity{" "}
          {report.checksums === "ok" ? <Badge tone="success">verified</Badge> : report.checksums === "absent" ? <Badge>not recorded</Badge> : <Badge tone="danger">FAILED</Badge>}
        </Field>
      </div>

      {report.blockers.map((b) => (
        <Banner key={b} tone="danger">
          {b}
        </Banner>
      ))}
      {report.warnings.map((w) => (
        <Banner key={w} tone="warning">
          {w}
        </Banner>
      ))}

      <details className="text-sm">
        <summary className="cursor-pointer text-gray-600">Rows per table in this backup</summary>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(report.staged)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([t, n]) => (
              <li key={t} className="flex justify-between rounded border border-gray-100 px-2 py-1">
                <span className="text-gray-700">{t}</span>
                <span className="tabular-nums text-gray-500">{n.toLocaleString("en-IN")}</span>
              </li>
            ))}
        </ul>
      </details>
    </div>
  );
}

function CountsTable({ tables }: { tables: ApplyResult["tables"] }) {
  return (
    <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(tables)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([t, c]) => (
          <li key={t} className="flex justify-between rounded border border-gray-100 px-2 py-1">
            <span className="text-gray-700">{t}</span>
            <span className="tabular-nums text-gray-500">
              {c.inserted}
              {typeof c.deleted === "number" ? ` (was ${c.deleted})` : ""}
            </span>
          </li>
        ))}
    </ul>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-ink">{children}</div>
    </div>
  );
}

// ── Files part ──────────────────────────────────────────────────────────────
function FilesRestoreCard() {
  const [file, setFile] = useState<File | null>(null);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const run = async () => {
    if (!file || pass.length < MIN_PASSPHRASE_LENGTH) return;
    setMsg(null);
    try {
      setBusy("Uploading…");
      const slot = await prepareRestoreUpload("files");
      if (!slot.ok) throw new Error(slot.error);
      await uploadToBucket(slot.data.path, slot.data.token, file);
      setBusy("Restoring files…");
      const r = await restoreFiles(slot.data.runId, pass);
      if (!r.ok) throw new Error(r.error);
      setMsg({
        tone: r.data.failed.length ? "danger" : "success",
        text: `${r.data.bucket} ${r.data.month} part ${r.data.part}: ${r.data.uploaded} files restored${
          r.data.failed.length ? `, ${r.data.failed.length} failed (${r.data.failed[0]})` : ""
        }.`,
      });
      setFile(null);
    } catch (e) {
      setMsg({ tone: "danger", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="font-display text-lg font-bold text-ink">Restore files</h2>
      <p className="mt-1 text-sm text-gray-500">
        Upload one files part at a time. Each object is written back into its bucket (existing
        objects with the same path are overwritten). Restore the database first so the rows that
        point at these files exist.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="rf-file">
            Files part (.cbk)
          </label>
          <input
            id="rf-file"
            type="file"
            accept=".cbk"
            disabled={!!busy}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-semibold"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="rf-pass">
            Passphrase
          </label>
          <Input
            id="rf-pass"
            type="password"
            autoComplete="off"
            value={pass}
            disabled={!!busy}
            onChange={(e) => setPass(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button type="button" onClick={run} disabled={!!busy || !file || pass.length < MIN_PASSPHRASE_LENGTH}>
          {busy ?? "Restore this part"}
        </Button>
      </div>
      {msg && (
        <div className="mt-4">
          <Banner tone={msg.tone}>{msg.text}</Banner>
        </div>
      )}
    </Card>
  );
}
