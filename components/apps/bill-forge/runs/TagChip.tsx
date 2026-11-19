import { Tag } from "@/lib/apps/bill-forge/api";
import { tagLabel } from "@/lib/apps/bill-forge/tags";

export function TagChip({ tag }: { tag: Tag }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        tag.system ? "bg-gray-100 text-gray-500" : "bg-brand-soft text-brand"
      }`}
      title={tag.system ? "Applied automatically from what the batch contained" : undefined}
    >
      {tagLabel(tag)}
    </span>
  );
}
