import Link from "next/link";
import {
  CalendarClock,
  Plane,
  MapPin,
  FileText,
  Network,
  UserCircle,
  Wallet,
  Receipt,
  Megaphone,
} from "lucide-react";
import { Card } from "@/components/ui";
import type { OrgModules } from "@/lib/types";

// Fast tiles into the self-serve areas. Admins/managers reach management pages
// from the sidebar. Module-flagged tiles (Advances) appear only when the org
// has the module enabled; `selfServe` tiles are personal pages hidden for
// admins and service accounts (matches the sidebar's selfServeOnly items).
const LINKS = [
  { href: "/attendance", icon: CalendarClock, label: "Attendance", desc: "Punch history", selfServe: true },
  { href: "/leave", icon: Plane, label: "Leave", desc: "Balances & requests", selfServe: true },
  { href: "/advances", icon: Wallet, label: "Loans & Advances", desc: "Company loans & advances", module: "advances" as const, selfServe: true },
  { href: "/documents?tab=payslips", icon: Receipt, label: "Payslips", desc: "Monthly payslips", module: "payslips" as const, selfServe: true },
  { href: "/announcements", icon: Megaphone, label: "Announcements", desc: "Company noticeboard", module: "announcements" as const },
  { href: "/visits", icon: MapPin, label: "Visits", desc: "Schedule & history", selfServe: true },
  { href: "/documents", icon: FileText, label: "Documents", desc: "Policies to sign" },
  { href: "/org", icon: Network, label: "Org map", desc: "Who's who" },
  { href: "/profile", icon: UserCircle, label: "Profile", desc: "Your details" },
];

export function QuickLinks({
  modules,
  hideSelfServe = false,
}: {
  modules?: OrgModules;
  hideSelfServe?: boolean;
}) {
  const links = LINKS.filter(
    (q) => (!q.module || modules?.[q.module]) && !(q.selfServe && hideSelfServe)
  );
  return (
    <div>
      <h2 className="mb-3 font-display text-lg font-bold text-ink">Quick links</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {links.map((q) => (
          <Link key={q.href} href={q.href}>
            <Card className="h-full p-4 transition-colors hover:border-gray-300">
              <q.icon className="h-5 w-5 text-brand" />
              <div className="mt-3 font-display font-bold text-ink">{q.label}</div>
              <div className="text-xs text-gray-500">{q.desc}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
