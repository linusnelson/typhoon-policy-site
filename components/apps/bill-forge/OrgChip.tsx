import { OrgRef } from "@/lib/apps/bill-forge/api";

/** The issuing org as a small chip. Renders nothing when `show` is false — list pages
 *  pass `showOrgChips(orgs)` so a single-org installation stays uncluttered — or when
 *  the row has no org yet. */
export function OrgChip({
  org,
  show = true,
  className = "",
}: {
  org: OrgRef | null | undefined;
  show?: boolean;
  className?: string;
}) {
  if (!show || !org) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand ${className}`}
      title={`Issuing organisation: ${org.display_name}`}
    >
      {org.display_name}
    </span>
  );
}
