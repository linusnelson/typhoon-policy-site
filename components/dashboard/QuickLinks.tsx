import Link from "next/link";
import {
  CalendarClock,
  Plane,
  MapPin,
  FileText,
  Network,
  UserCircle,
} from "lucide-react";
import { Card } from "@/components/ui";

// Fast tiles into the self-serve areas. Same for every role; admins/managers
// reach management pages from the sidebar.
const LINKS = [
  { href: "/attendance", icon: CalendarClock, label: "Attendance", desc: "Punch history" },
  { href: "/leave", icon: Plane, label: "Leave", desc: "Balances & requests" },
  { href: "/visits", icon: MapPin, label: "Visits", desc: "Schedule & history" },
  { href: "/documents", icon: FileText, label: "Documents", desc: "Policies to sign" },
  { href: "/org", icon: Network, label: "Org map", desc: "Who's who" },
  { href: "/profile", icon: UserCircle, label: "Profile", desc: "Your details" },
];

export function QuickLinks() {
  return (
    <div>
      <h2 className="mb-3 font-display text-lg font-bold text-ink">Quick links</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {LINKS.map((q) => (
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
