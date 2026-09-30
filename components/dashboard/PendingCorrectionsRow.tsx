import Link from "next/link";
import { ArrowRight, PencilRuler } from "lucide-react";
import { Card } from "@/components/ui";

// Compact dashboard row: pending attendance-correction requests waiting on
// the viewer (admins: org-wide, managers: their team).
export function PendingCorrectionsRow({ count, href }: { count: number; href: string }) {
  return (
    <Card className="overflow-hidden">
      <Link
        href={href}
        className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-gray-50"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <PencilRuler className="h-4 w-4" />
          </div>
          <div>
            <div className="font-display font-bold text-ink">Pending attendance corrections</div>
            <div className="text-xs text-gray-500">
              {count === 0
                ? "Nothing waiting on you"
                : `${count} request${count > 1 ? "s" : ""} to review`}
            </div>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
      </Link>
    </Card>
  );
}
