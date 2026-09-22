"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Banner, Button, Card, Input } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { planFileParts, updateBackupRetention } from "@/actions/backup";
import type { BackupRetention } from "@/lib/backup/retention";
import type { FilesPart } from "@/lib/backup/export-files";
import { MIN_PASSPHRASE_LENGTH, formatBytes } from "@/lib/backup/format";
import type { BucketSummary } from "@/app/(admin)/admin/backup/page";

const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

interface NightlyInfo {
  status: string;
  startedAt: string;
  path: string | null;
  bytes: number | null;
  error: string | null;
}

export interface StoredNightly {
  name: string;
  date: string;
  bytes: number;
}

export function BackupPanel({
  orgName,
  buckets,
  nightly,
  nightlyConfigured,
  retention,
  stored,
}: {
  orgName: string;
  buckets: BucketSummary[];
  nightly: NightlyInfo | null;
  nightlyConfigured: boolean;
  retention: BackupRetention;
  stored: StoredNightly[];
}) {
  return (
    <div className="space-y-6">
      <DatabaseBackupCard orgName={orgName} />
      <FilesBackupCard buckets={buckets} />
      <AutomaticBackupsCard
        nightly={nightly}
        configured={nightlyConfigured}
        retention={retention}
        stored={stored}
      />
    </div>
  );
}

// ── Database ────────────────────────────────────────────────────────────────
// A plain form POST: the browser streams the response straight to disk and
// the passphrase travels in the body, never a URL.
function DatabaseBackupCard({ orgName }: { orgName: string }) {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const tooShort = pass.length > 0 && pass.length < MIN_PASSPHRASE_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== pass;
  const ready = pass.length >= MIN_PASSPHRASE_LENGTH && confirm === pass;

  return (
    <Card className="p-6">
      <h2 className="font-display text-lg font-bold text-ink">Database backup</h2>
      <p className="mt-1 text-sm text-gray-500">
        Every table for {orgName}, plus login records, as one encrypted <code>.cbk</code> file.
        Choose a passphrase you will keep in the password manager — it cannot be recovered, and a
        backup without it is unreadable.
      </p>
      <form method="post" action="/admin/backup/export" className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="bk-pass">
              Passphrase
            </label>
            <Input
              id="bk-pass"
              name="passphrase"
              type="password"
              autoComplete="new-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              minLength={MIN_PASSPHRASE_LENGTH}
              required
            />
            {tooShort && (
              <p className="mt-1 text-xs text-danger">At least {MIN_PASSPHRASE_LENGTH} characters.</p>
            )}
          </div>
          <div>
            <label className={labelCls} htmlFor="bk-confirm">
              Confirm passphrase
            </label>
            <Input
              id="bk-confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            {mismatch && <p className="mt-1 text-xs text-danger">Passphrases do not match.</p>}
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" name="include_secrets" className="mt-1" />
          <span>
            Include integration secrets (vendor API keys for the price comparator). Off by default —
            only needed when rebuilding the whole project from scratch.
          </span>
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!ready}>
            Download backup
          </Button>
          <span className="text-xs text-gray-400">Takes a few seconds; the file is a few MB.</span>
        </div>
      </form>
    </Card>
  );
}

// ── Files (storage buckets) ─────────────────────────────────────────────────
// Parts are fetched one by one and saved via a blob URL; each part is capped
// well under browser and function limits.
function FilesBackupCard({ buckets }: { buckets: BucketSummary[] }) {
  const [selected, setSelected] = useState<string[]>(() =>
    buckets.filter((b) => b.objects > 0 && b.id !== "selfies").map((b) => b.id)
  );
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pass, setPass] = useState("");
  const [parts, setParts] = useState<FilesPart[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, "pending" | "downloading" | "done" | "failed">>({});
  const [running, setRunning] = useState(false);
  const [planning, startPlanning] = useTransition();

  const key = (p: FilesPart) => `${p.bucket}|${p.month}|${p.part}`;
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const plan = () => {
    setError(null);
    setParts(null);
    startPlanning(async () => {
      const r = await planFileParts(selected, from || undefined, to || undefined);
      if (!r.ok) setError(r.error);
      else setParts(r.data);
    });
  };

  const downloadAll = async () => {
    if (!parts || pass.length < MIN_PASSPHRASE_LENGTH) return;
    setRunning(true);
    setError(null);
    const state: typeof progress = {};
    for (const p of parts) state[key(p)] = "pending";
    setProgress({ ...state });
    for (const p of parts) {
      state[key(p)] = "downloading";
      setProgress({ ...state });
      try {
        const res = await fetch("/admin/backup/export/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bucket: p.bucket, month: p.month, part: p.part, passphrase: pass }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error ?? `HTTP ${res.status}`);
        }
        const blob = await res.blob();
        const name =
          /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ??
          `files-${p.bucket}-${p.month}-p${p.part}.cbk`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        state[key(p)] = "done";
      } catch (e) {
        state[key(p)] = "failed";
        setError(`${p.bucket} ${p.month} part ${p.part}: ${(e as Error).message}`);
        setProgress({ ...state });
        break;
      }
      setProgress({ ...state });
    }
    setRunning(false);
  };

  const totalBytes = parts?.reduce((s, p) => s + p.bytes, 0) ?? 0;

  return (
    <Card className="p-6">
      <h2 className="font-display text-lg font-bold text-ink">Files</h2>
      <p className="mt-1 text-sm text-gray-500">
        Uploaded documents — bills, payslips, leave attachments, selfies. Exported as parts (one
        bucket × one month × ≤45 MB), each an encrypted <code>.cbk</code>. Supabase Storage is
        itself durable; take this monthly or before a migration, not daily. Selfies are unticked by
        default because they are evidence, not operational data.
      </p>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {buckets.map((b) => (
          <label
            key={b.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected.includes(b.id)}
                onChange={() => toggle(b.id)}
                disabled={b.objects === 0}
              />
              <span className="font-medium text-ink">{b.id}</span>
            </span>
            <span className="text-xs text-gray-500">
              {b.objects} files · {formatBytes(b.bytes)}
            </span>
          </label>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label className={labelCls}>From month</label>
          <Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>To month</label>
          <Input type="month" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button type="button" variant="secondary" onClick={plan} disabled={planning || !selected.length}>
            {planning ? "Planning…" : "Plan parts"}
          </Button>
        </div>
      </div>

      {parts && (
        <div className="mt-5 space-y-3">
          {parts.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing to export for that selection.</p>
          ) : (
            <>
              <p className="text-sm text-gray-700">
                {parts.length} part{parts.length === 1 ? "" : "s"} · {formatBytes(totalBytes)} total
              </p>
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
                {parts.map((p) => (
                  <li key={key(p)} className="flex items-center justify-between px-3 py-2">
                    <span>
                      <span className="font-medium text-ink">{p.bucket}</span> · {p.month}
                      {p.parts > 1 ? ` · part ${p.part}/${p.parts}` : ""}
                    </span>
                    <span className="flex items-center gap-3 text-xs text-gray-500">
                      {p.objects} files · {formatBytes(p.bytes)}
                      <StatusDot state={progress[key(p)]} />
                    </span>
                  </li>
                ))}
              </ul>
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <label className={labelCls} htmlFor="files-pass">
                    Passphrase for these parts
                  </label>
                  <Input
                    id="files-pass"
                    type="password"
                    autoComplete="new-password"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    minLength={MIN_PASSPHRASE_LENGTH}
                  />
                </div>
                <Button
                  type="button"
                  onClick={downloadAll}
                  disabled={running || pass.length < MIN_PASSPHRASE_LENGTH}
                >
                  {running ? "Downloading…" : `Download ${parts.length} part${parts.length === 1 ? "" : "s"}`}
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                Your browser may ask once to allow multiple downloads from this site.
              </p>
            </>
          )}
        </div>
      )}
      {error && (
        <div className="mt-4">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}
    </Card>
  );
}

function StatusDot({ state }: { state?: "pending" | "downloading" | "done" | "failed" }) {
  if (!state) return null;
  const cls = {
    pending: "bg-gray-300",
    downloading: "bg-info animate-pulse",
    done: "bg-success",
    failed: "bg-danger",
  }[state];
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} title={state} />;
}

// ── Automatic ───────────────────────────────────────────────────────────────
function RetentionSaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Saving…" : "Save & apply"}
    </Button>
  );
}

function AutomaticBackupsCard({
  nightly,
  configured,
  retention,
  stored,
}: {
  nightly: NightlyInfo | null;
  configured: boolean;
  retention: BackupRetention;
  stored: StoredNightly[];
}) {
  const [state, action] = useActionState(updateBackupRetention, idleState);
  const storedBytes = stored.reduce((s, o) => s + o.bytes, 0);

  return (
    <Card className="p-6">
      <h2 className="font-display text-lg font-bold text-ink">Automatic backups</h2>
      <p className="mt-1 text-sm text-gray-500">
        Every night at 02:00 IST the portal writes a full database archive into the private{" "}
        <code>backups</code> bucket, encrypted with the <code>BACKUP_PASSPHRASE</code> configured
        on the server. Archives beyond the numbers below are deleted automatically after each
        nightly run and whenever you save here.
      </p>

      {!configured && (
        <div className="mt-4">
          <Banner tone="warning">
            Not configured — set <code>BACKUP_PASSPHRASE</code> (and let Vercel add{" "}
            <code>CRON_SECRET</code>) in the project environment, then redeploy. Retention below
            still applies to any archives already stored.
          </Banner>
        </div>
      )}

      <form action={action} className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label className={labelCls} htmlFor="keepDaily">
            Nightly copies to keep
          </label>
          <Input
            id="keepDaily"
            name="keepDaily"
            type="number"
            min={1}
            max={365}
            step={1}
            defaultValue={retention.keepDaily}
            required
          />
          <p className="mt-1 text-xs text-gray-400">The newest N nights. 1–365.</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="keepMonthly">
            Monthly copies to keep
          </label>
          <Input
            id="keepMonthly"
            name="keepMonthly"
            type="number"
            min={0}
            max={120}
            step={1}
            defaultValue={retention.keepMonthly}
            required
          />
          <p className="mt-1 text-xs text-gray-400">
            First archive of each month, for the last N months. 0 = off.
          </p>
        </div>
        <RetentionSaveButton />
      </form>
      {state.error && (
        <div className="mt-3">
          <Banner tone="danger">{state.error}</Banner>
        </div>
      )}
      {state.ok && state.message && (
        <div className="mt-3">
          <Banner tone="success">{state.message}</Banner>
        </div>
      )}

      <div className="mt-5 rounded-lg border border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 text-sm">
          <span className="font-medium text-ink">
            {stored.length} archive{stored.length === 1 ? "" : "s"} stored · {formatBytes(storedBytes)}
          </span>
          {nightly && (
            <span className="text-xs text-gray-500">
              Last run{" "}
              {new Date(nightly.startedAt).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              · {nightly.status}
              {nightly.error ? ` · ${nightly.error}` : ""}
            </span>
          )}
        </div>
        {stored.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">
            {configured ? "The first run has not happened yet." : "No archives yet."}
          </p>
        ) : (
          <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto text-sm">
            {stored.map((o) => (
              <li key={o.name} className="flex items-center justify-between px-4 py-2">
                <span className="text-gray-700">{o.date}</span>
                <span className="flex items-center gap-3 text-xs text-gray-500">
                  {formatBytes(o.bytes)}
                  <a
                    className="font-semibold text-brand hover:underline"
                    href={`/admin/backup/download?path=${encodeURIComponent(`nightly/${o.name}`)}`}
                  >
                    Download
                  </a>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 text-xs text-gray-400">
        A copy inside the same project is not disaster recovery. Pull the latest archive off-site
        with <code>scripts/backup-pull.sh</code> (ClockBays repo) on a schedule. Safety copies
        taken before a restore (<code>pre-restore/</code>) are never pruned automatically.
      </p>
    </Card>
  );
}
