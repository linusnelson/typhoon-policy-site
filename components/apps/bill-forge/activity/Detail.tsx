import { jobHref } from "@/lib/apps/bill-forge/routes";
import Link from "next/link";
import { UUID } from "@/lib/apps/bill-forge/uuid";

export function Detail({ detail }: { detail: string | null }) {
  if (!detail) return <span className="text-gray-400">—</span>;
  const match = detail.match(UUID);
  if (!match) return <span>{detail}</span>;
  const [before, after] = detail.split(match[0]);
  return (
    <span>
      {before}
      <Link href={jobHref(match[0])} className="font-mono text-brand hover:underline">
        {match[0].slice(0, 8)}
      </Link>
      {after}
    </span>
  );
}
