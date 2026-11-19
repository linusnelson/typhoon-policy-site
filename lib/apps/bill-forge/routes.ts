import { BILL_FORGE_SLUG, appHref } from "@/lib/apps/registry";

/** Where BillForge's pages live in the portal. Every link and router.push in
 *  components/apps/bill-forge goes through here, so the app can be re-homed in one place. */
const BASE = appHref(BILL_FORGE_SLUG);

export const BILL_FORGE = {
  upload: BASE,
  pos: `${BASE}/pos`,
  documents: `${BASE}/documents`,
  runs: `${BASE}/history`,
  activity: `${BASE}/activity`,
  orgs: `${BASE}/orgs`,
} as const;

export function jobHref(jobId: string): string {
  return `${BASE}/jobs/${jobId}`;
}

/** True on a job page, which belongs to the Runs tab it is reached from. */
export function isJobPath(pathname: string): boolean {
  return pathname.startsWith(`${BASE}/jobs/`);
}
