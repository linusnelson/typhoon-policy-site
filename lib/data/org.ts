import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_MODULES,
  DEFAULT_REMINDERS,
  type OrgModules,
  type RemindersConfig,
} from "@/lib/types";

// Cross-request cache tag for org settings. The only writers of the fields
// getOrg reads (name, go_live_date, settings.modules/company_address/reminders)
// are the web actions settings.ts + reminders.ts — both call
// revalidateTag(ORG_SETTINGS_TAG) after a merge-write, so cached entries are
// invalidated immediately. The revalidate TTL below is only a safety net.
export const ORG_SETTINGS_TAG = "org-settings";

export interface OrgSettings {
  id: string;
  name: string;
  goLiveDate: string | null; // "YYYY-MM-DD"
  modules: OrgModules; // settings.modules (web-owned namespace)
  companyAddress: string; // settings.company_address (web-owned) — payslip header
  reminders: RemindersConfig; // settings.reminders (web-owned) — SQL dispatcher config
}

// Parse the web-owned settings.modules namespace out of the shared JSONB.
// The same column carries Flutter-owned keys (last_accrual_month,
// last_absent_processed) — web code must never write the whole map (see
// actions/settings.ts). Missing keys fall back to DEFAULT_MODULES.
export function modulesFromSettings(settings: unknown): OrgModules {
  const raw =
    settings && typeof settings === "object"
      ? ((settings as Record<string, unknown>).modules as
          | Record<string, unknown>
          | undefined)
      : undefined;
  return {
    advances:
      typeof raw?.advances === "boolean" ? raw.advances : DEFAULT_MODULES.advances,
    announcements:
      typeof raw?.announcements === "boolean"
        ? raw.announcements
        : DEFAULT_MODULES.announcements,
    payslips:
      typeof raw?.payslips === "boolean" ? raw.payslips : DEFAULT_MODULES.payslips,
    expenses:
      typeof raw?.expenses === "boolean" ? raw.expenses : DEFAULT_MODULES.expenses,
  };
}

// Parse the web-owned settings.reminders namespace (same shared-JSONB caveat
// as modules). Field-by-field fallback to DEFAULT_REMINDERS — the SQL
// dispatchers in clock_bays apply the same defaults for absent keys.
export function remindersFromSettings(settings: unknown): RemindersConfig {
  const raw =
    settings && typeof settings === "object"
      ? ((settings as Record<string, unknown>).reminders as
          | Record<string, unknown>
          | undefined)
      : undefined;
  const section = (key: string): Record<string, unknown> =>
    raw && typeof raw[key] === "object" && raw[key] !== null
      ? (raw[key] as Record<string, unknown>)
      : {};
  const flag = (v: unknown, fallback: boolean): boolean =>
    typeof v === "boolean" ? v : fallback;
  const int = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  const d = DEFAULT_REMINDERS;
  const pin = section("punchIn");
  const pout = section("punchOut");
  const wfh = section("wfhChecks");
  const visit = section("visitChecks");
  return {
    punchIn: {
      enabled: flag(pin.enabled, d.punchIn.enabled),
      graceMin: int(pin.graceMin, d.punchIn.graceMin),
      repeat: int(pin.repeat, d.punchIn.repeat),
      intervalMin: int(pin.intervalMin, d.punchIn.intervalMin),
    },
    punchOut: {
      enabled: flag(pout.enabled, d.punchOut.enabled),
      delayMin: int(pout.delayMin, d.punchOut.delayMin),
      repeat: int(pout.repeat, d.punchOut.repeat),
      intervalMin: int(pout.intervalMin, d.punchOut.intervalMin),
    },
    wfhChecks: {
      enabled: flag(wfh.enabled, d.wfhChecks.enabled),
      minPerDay: int(wfh.minPerDay, d.wfhChecks.minPerDay),
      maxPerDay: int(wfh.maxPerDay, d.wfhChecks.maxPerDay),
    },
    visitChecks: {
      enabled: flag(visit.enabled, d.visitChecks.enabled),
      minPerDay: int(visit.minPerDay, d.visitChecks.minPerDay),
      maxPerDay: int(visit.maxPerDay, d.visitChecks.maxPerDay),
    },
  };
}

// Cross-request cached fetch. Runs with the service-role client because
// unstable_cache callbacks cannot read cookies() — the row is org-public
// (name + feature flags + payslip address + reminder config, no per-user data)
// and is fetched by explicit id, so bypassing RLS here leaks nothing.
const fetchOrg = unstable_cache(
  async (orgId: string): Promise<OrgSettings | null> => {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("organizations")
      .select("id, name, go_live_date, settings")
      .eq("id", orgId)
      .maybeSingle();
    if (!data) return null;
    const settings =
      data.settings && typeof data.settings === "object"
        ? (data.settings as Record<string, unknown>)
        : {};
    return {
      id: data.id as string,
      name: (data.name as string) ?? "",
      goLiveDate: (data.go_live_date as string | null) ?? null,
      modules: modulesFromSettings(data.settings),
      companyAddress:
        typeof settings.company_address === "string" ? settings.company_address : "",
      reminders: remindersFromSettings(data.settings),
    };
  },
  ["org-settings"],
  { tags: [ORG_SETTINGS_TAG], revalidate: 300 }
);

// cache(): the layout and page of the same request both call this — dedupe the
// (now cached) fetch to a single lookup per request.
export const getOrg = cache((orgId: string) => fetchOrg(orgId));

// Convenience for layouts/pages that only gate on module flags.
export async function getOrgModules(orgId: string): Promise<OrgModules> {
  const org = await getOrg(orgId);
  return org?.modules ?? DEFAULT_MODULES;
}

// Server-side module gate. Nav hiding is cosmetic — module pages call this and
// notFound() when false; module actions throw when false.
export async function moduleEnabled(
  orgId: string,
  key: keyof OrgModules
): Promise<boolean> {
  const modules = await getOrgModules(orgId);
  return modules[key];
}
