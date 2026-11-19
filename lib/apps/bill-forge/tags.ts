import { Tag } from "@/lib/apps/bill-forge/api";

/** Reserved-namespace tags read better without their prefix. */
export function tagLabel(tag: Tag): string {
  return tag.system ? tag.name.replace(/^x:/, "") : tag.name;
}
