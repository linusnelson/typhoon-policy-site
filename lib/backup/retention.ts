// Nightly retention rules — pure, no server imports, so both the client
// form and the node tests can use them.

// Retention for nightly/ is an org setting (organizations.settings.backups,
// web-owned namespace like settings.modules): keep the newest `keepDaily`
// archives, plus the first archive of each month for `keepMonthly` months
// (0 = no monthly copies). Pruning runs after every nightly and when the
// setting is saved, so lowering the number deletes old files right away.
export interface BackupRetention {
  keepDaily: number; // 1..365
  keepMonthly: number; // 0..120
}
export const DEFAULT_RETENTION: BackupRetention = { keepDaily: 14, keepMonthly: 12 };

export function retentionFromSettings(settings: unknown): BackupRetention {
  const raw =
    settings && typeof settings === "object"
      ? ((settings as Record<string, unknown>).backups as Record<string, unknown> | undefined)
      : undefined;
  const int = (v: unknown, def: number, min: number, max: number) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  return {
    keepDaily: int(raw?.keep_daily, DEFAULT_RETENTION.keepDaily, 1, 365),
    keepMonthly: int(raw?.keep_monthly, DEFAULT_RETENTION.keepMonthly, 0, 120),
  };
}

// Which nightly archives to keep under a retention setting. Pure, so it is
// unit-testable: `dated` is newest-first.
export function selectNightlyToRemove(
  dated: Array<{ name: string; date: string }>,
  retention: BackupRetention,
  now: Date = new Date()
): string[] {
  const newestFirst = [...dated].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const keep = new Set<string>(newestFirst.slice(0, retention.keepDaily).map((o) => o.name));

  if (retention.keepMonthly > 0) {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - retention.keepMonthly + 1, 1);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
    const firstOfMonth = new Map<string, string>();
    for (const o of [...newestFirst].reverse()) {
      const m = o.date.slice(0, 7);
      if (m >= cutoffKey && !firstOfMonth.has(m)) firstOfMonth.set(m, o.name);
    }
    for (const name of firstOfMonth.values()) keep.add(name);
  }
  return newestFirst.filter((o) => !keep.has(o.name)).map((o) => o.name);
}
