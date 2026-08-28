import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Building2,
  UsersRound,
  CalendarClock,
  PencilRuler,
  Clock,
  CalendarDays,
  CheckSquare,
  Gift,
  MapPin,
  CalendarRange,
  Network,
  Pin,
  QrCode,
  SlidersHorizontal,
  FileText,
  BarChart3,
  Settings,
  Plane,
  Bell,
  UserCircle,
  Wallet,
  Receipt,
  ReceiptIndianRupee,
  Megaphone,
} from "lucide-react";
import { DEFAULT_MODULES, type EmployeeRole, type ModuleKey, type OrgModules } from "@/lib/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  // Roles allowed to see this item. Omitted = all roles (self-serve).
  roles?: EmployeeRole[];
  // Org module flag gating this item. Omitted = always on.
  module?: ModuleKey;
  // Visible only to expense approvers (employees.is_expense_approver) and
  // admins — a capability flag, orthogonal to `roles`.
  approverOnly?: boolean;
  // Personal self-serve pages (own attendance, leave, etc.). Hidden for admins
  // and service accounts, who have no personal attendance/leave of their own.
  selfServeOnly?: boolean;
}

export interface NavGroup {
  heading: string;
  items: NavItem[];
}

// ── Unified portal sidebar ───────────────────────────────────────────────────
// One config for every role. The "My space" group is self-serve (all roles);
// the management groups are gated to admin/manager. RLS scopes the data, so a
// manager automatically sees only their department. Items with `roles` are
// filtered per role and empty groups are dropped (see navForRole).
const NAV: NavGroup[] = [
  {
    heading: "My space",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      {
        label: "My Attendance",
        href: "/attendance",
        icon: CalendarClock,
        selfServeOnly: true,
      },
      { label: "My Leave", href: "/leave", icon: Plane, selfServeOnly: true },
      { label: "My Visits", href: "/visits", icon: MapPin, selfServeOnly: true },
      {
        label: "My Events",
        href: "/events",
        icon: CalendarRange,
        selfServeOnly: true,
      },
      {
        label: "Loans & Advances",
        href: "/advances",
        icon: Wallet,
        module: "advances",
        selfServeOnly: true,
      },
      {
        label: "My Expenses",
        href: "/expenses",
        icon: ReceiptIndianRupee,
        module: "expenses",
        selfServeOnly: true,
      },
      {
        label: "Announcements",
        href: "/announcements",
        icon: Megaphone,
        module: "announcements",
      },
      { label: "Documents", href: "/documents", icon: FileText },
      { label: "Org map", href: "/org", icon: Network },
      { label: "Profile", href: "/profile", icon: UserCircle },
    ],
  },
  {
    // Manager-only: a manager leads a specific team (teams.manager_id) and works
    // outside /admin entirely. These routes are team-scoped, not department-scoped.
    heading: "My team",
    items: [
      { label: "Team Leave", href: "/team/leave", icon: CheckSquare, roles: ["manager"] },
      { label: "Team Visits", href: "/team/visits", icon: MapPin, roles: ["manager"] },
      {
        label: "Team Events",
        href: "/team/events",
        icon: CalendarRange,
        roles: ["manager"],
      },
      {
        label: "Team Report",
        href: "/team/reports",
        icon: BarChart3,
        roles: ["manager"],
      },
    ],
  },
  {
    heading: "People",
    items: [
      { label: "Employees", href: "/admin/employees", icon: Users, roles: ["admin"] },
      {
        label: "Departments",
        href: "/admin/departments",
        icon: Building2,
        roles: ["admin"],
      },
      { label: "Teams", href: "/admin/teams", icon: UsersRound, roles: ["admin"] },
    ],
  },
  {
    heading: "Attendance",
    items: [
      {
        label: "Attendance",
        href: "/admin/attendance",
        icon: CalendarClock,
        roles: ["admin"],
      },
      {
        label: "Regularization",
        href: "/admin/regularization",
        icon: PencilRuler,
        roles: ["admin"],
      },
      { label: "Shifts", href: "/admin/shifts", icon: Clock, roles: ["admin"] },
      {
        label: "Holidays",
        href: "/admin/holidays",
        icon: CalendarDays,
        roles: ["admin"],
      },
      {
        label: "Attendance rules",
        href: "/admin/attendance-rules",
        icon: SlidersHorizontal,
        roles: ["admin"],
      },
    ],
  },
  {
    heading: "Leave",
    items: [
      {
        label: "Requests",
        href: "/admin/leave",
        icon: CheckSquare,
        roles: ["admin"],
      },
      {
        label: "Comp-Off",
        href: "/admin/leave/comp-off",
        icon: Gift,
        roles: ["admin"],
      },
      {
        label: "Leave policies",
        href: "/admin/leave/policies",
        icon: SlidersHorizontal,
        roles: ["admin"],
      },
    ],
  },
  {
    heading: "Field",
    items: [
      { label: "Visits", href: "/admin/visits", icon: MapPin, roles: ["admin"] },
      {
        label: "Events",
        href: "/admin/events",
        icon: CalendarRange,
        roles: ["admin"],
      },
    ],
  },
  {
    heading: "Finance",
    items: [
      {
        label: "Loans & Advances",
        href: "/admin/advances",
        icon: Wallet,
        roles: ["admin"],
        module: "advances",
      },
      {
        // Payroll management for accounts users — outside /admin so non-admin
        // approvers can reach it (the admin layout bounces them).
        label: "Payslips",
        href: "/payslips/manage",
        icon: Receipt,
        module: "payslips",
        approverOnly: true,
      },
      {
        // Approval queue for accounts users — outside /admin so non-admin
        // approvers can reach it (the admin layout bounces them).
        label: "Expense Approvals",
        href: "/expenses/approvals",
        icon: ReceiptIndianRupee,
        module: "expenses",
        approverOnly: true,
      },
      {
        label: "Expense Settings",
        href: "/admin/expenses",
        icon: SlidersHorizontal,
        roles: ["admin"],
        module: "expenses",
      },
    ],
  },
  {
    heading: "Config",
    items: [
      { label: "Locations", href: "/admin/locations", icon: Pin, roles: ["admin"] },
      { label: "QR Codes", href: "/admin/qr", icon: QrCode, roles: ["admin"] },
      { label: "Policies", href: "/admin/policies", icon: FileText, roles: ["admin"] },
      {
        label: "Announcements",
        href: "/admin/announcements",
        icon: Megaphone,
        roles: ["admin"],
        module: "announcements",
      },
      { label: "Reports", href: "/admin/reports", icon: BarChart3, roles: ["admin"] },
      { label: "Settings", href: "/admin/settings", icon: Settings, roles: ["admin"] },
    ],
  },
];

export const NOTIFICATIONS_HREF = "/notifications";
export { Bell };

// Returns the sidebar groups visible to the given role, dropping any group left
// empty after filtering. Employees see only "My space"; admins/managers also see
// the management groups (further filtered by admin-only items). Items carrying a
// `module` key are additionally gated on the org's module flags (Settings →
// Modules) — note nav hiding is cosmetic; module pages also 404 server-side.
// `hideSelfServe` drops the personal "My …" items — true for admins and service
// accounts (employees.is_service_account), who have no personal
// attendance/leave. Kept
// as an explicit flag (not derived from role) so title lookups can pass false.
export function navForRole(
  role: EmployeeRole,
  modules: OrgModules = DEFAULT_MODULES,
  isExpenseApprover = false,
  hideSelfServe = false
): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter(
      (i) =>
        (!i.roles || i.roles.includes(role)) &&
        (!i.module || modules[i.module]) &&
        (!i.approverOnly || isExpenseApprover || role === "admin") &&
        (!i.selfServeOnly || !hideSelfServe)
    ),
  })).filter((group) => group.items.length > 0);
}
