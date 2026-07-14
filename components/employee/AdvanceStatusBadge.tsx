import { Badge } from "@/components/ui";
import type { AdvanceStatus, AdvanceRepaymentStatus } from "@/lib/types";

const STATUS_TONE: Record<
  AdvanceStatus,
  { tone: "neutral" | "success" | "warning" | "danger" | "info" | "brand"; label: string }
> = {
  pending: { tone: "warning", label: "Pending" },
  approved: { tone: "info", label: "Approved" },
  rejected: { tone: "danger", label: "Rejected" },
  repaying: { tone: "brand", label: "Repaying" },
  closed: { tone: "success", label: "Closed" },
  cancelled: { tone: "neutral", label: "Cancelled" },
};

export function AdvanceStatusBadge({ status }: { status: AdvanceStatus }) {
  const s = STATUS_TONE[status] ?? { tone: "neutral" as const, label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const REPAYMENT_TONE: Record<
  AdvanceRepaymentStatus,
  { tone: "neutral" | "success" | "warning"; label: string }
> = {
  scheduled: { tone: "warning", label: "Scheduled" },
  paid: { tone: "success", label: "Paid" },
  waived: { tone: "neutral", label: "Waived" },
};

export function RepaymentStatusBadge({ status }: { status: AdvanceRepaymentStatus }) {
  const s = REPAYMENT_TONE[status] ?? { tone: "neutral" as const, label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
