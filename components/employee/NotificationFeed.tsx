import {
  Bell,
  CheckCircle2,
  XCircle,
  Ban,
  CalendarClock,
  CalendarRange,
  Gift,
  AlertTriangle,
  ShieldAlert,
  Megaphone,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button, Card } from "@/components/ui";
import { formatIstDateTime } from "@/lib/ist";
import { listNotifications } from "@/lib/data/notifications";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/actions/notifications";

const ICONS: Record<string, { icon: LucideIcon; cls: string }> = {
  leave_approved: { icon: CheckCircle2, cls: "text-success-deep" },
  visit_approved: { icon: CheckCircle2, cls: "text-success-deep" },
  leave_rejected: { icon: XCircle, cls: "text-danger-deep" },
  visit_rejected: { icon: XCircle, cls: "text-danger-deep" },
  leave_cancelled: { icon: Ban, cls: "text-gray-400" },
  leave_applied: { icon: CalendarClock, cls: "text-info-deep" },
  headcount_warning: { icon: AlertTriangle, cls: "text-warning-deep" },
  comp_off_granted: { icon: Gift, cls: "text-success-deep" },
  comp_off_expiring: { icon: AlertTriangle, cls: "text-warning-deep" },
  wfh_limit_warning: { icon: AlertTriangle, cls: "text-warning-deep" },
  event_gap_reminder: { icon: AlertTriangle, cls: "text-warning-deep" },
  visit_gap_reminder: { icon: AlertTriangle, cls: "text-warning-deep" },
  new_device: { icon: ShieldAlert, cls: "text-warning-deep" },
  event_assigned: { icon: CalendarRange, cls: "text-info-deep" },
  event_removed: { icon: CalendarRange, cls: "text-gray-400" },
  announcement: { icon: Megaphone, cls: "text-brand" },
  regularization_done: { icon: Wrench, cls: "text-info-deep" },
};

function iconFor(type: string) {
  return ICONS[type] ?? { icon: Bell, cls: "text-gray-400" };
}

export async function NotificationFeed({ employeeId }: { employeeId: string }) {
  const items = await listNotifications(employeeId);
  const hasUnread = items.some((n) => !n.isRead);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Leave approvals, events, reminders and alerts.
          </p>
        </div>
        {hasUnread && (
          <form action={markAllNotificationsRead}>
            <Button variant="secondary" type="submit">
              Mark all read
            </Button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-gray-400">
          You&apos;re all caught up — no notifications.
        </Card>
      ) : (
        <Card className="divide-y divide-gray-100">
          {items.map((n) => {
            const { icon: Icon, cls } = iconFor(n.type);
            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 p-4 ${
                  n.isRead ? "" : "bg-brand-soft/40"
                }`}
              >
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${cls}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{n.title}</span>
                    {!n.isRead && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">{n.body}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {formatIstDateTime(n.createdAt)}
                  </p>
                </div>
                {!n.isRead && (
                  <form action={markNotificationRead} className="shrink-0">
                    <input type="hidden" name="id" value={n.id} />
                    <button
                      type="submit"
                      className="rounded-lg px-2.5 py-1 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-ink"
                    >
                      Mark read
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
