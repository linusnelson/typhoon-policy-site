// Amount in words for payslips, Indian numbering (crore/lakh/thousand).
// amountInWordsINR(283602) → "Rupees Two Lakh Eighty Three Thousand Six
// Hundred Two Only" (the PDF adds the surrounding parentheses).

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

// 0–99. Returns "" for 0 (callers only append non-empty parts).
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  const o = ONES[n % 10];
  return o ? `${t} ${o}` : t;
}

// Positive integer → Indian-grouped words (crore recurses for ≥ 100 crore).
function integerWords(n: number): string {
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1_000);
  const hundred = Math.floor((n % 1_000) / 100);
  const rest = n % 100;

  if (crore) parts.push(`${integerWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

export function amountInWordsINR(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  const rupeeWords = rupees === 0 ? "Zero" : integerWords(rupees);
  const paiseWords = paise > 0 ? ` and ${twoDigits(paise)} Paise` : "";
  return `Rupees ${rupeeWords}${paiseWords} Only`;
}
