import { Badge } from "@/components/ui";
import type { ExpenseStatus } from "@/lib/types";

const STATUS_TONE: Record<
  ExpenseStatus,
  { tone: "neutral" | "success" | "warning" | "danger" | "info" | "brand"; label: string }
> = {
  draft: { tone: "neutral", label: "Draft" },
  pending: { tone: "warning", label: "Pending" },
  approved: { tone: "info", label: "Approved" },
  rejected: { tone: "danger", label: "Rejected" },
  reimbursed: { tone: "success", label: "Reimbursed" },
  cancelled: { tone: "neutral", label: "Cancelled" },
};

export function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  const s = STATUS_TONE[status] ?? { tone: "neutral" as const, label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
