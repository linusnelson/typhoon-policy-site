import { PurchaseOrder } from "@/lib/apps/bill-forge/api";

export function poMoney(po: PurchaseOrder): string {
  const value = Number(po.goods_total);
  const symbol = po.currency === "USD" ? "$" : `${po.currency} `;
  return Number.isFinite(value)
    ? `${symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `${symbol}${po.goods_total}`;
}

export function inrMoney(value: string | undefined): string {
  const n = Number(value ?? 0);
  return `₹${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
