// Shared display formatters.

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

// Paise-precision variant for installment rows (e.g. ₹3,333.33).
const INR_EXACT = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatINR(amount: number): string {
  return Number.isInteger(amount) ? INR.format(amount) : INR_EXACT.format(amount);
}

// "2026-08-01" → "Aug 2026" (repayment due months).
export function formatMonth(monthKey: string): string {
  return new Date(`${monthKey}T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    month: "short",
    year: "numeric",
  });
}
