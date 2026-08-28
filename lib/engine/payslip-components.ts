import {
  PAYSLIP_MAX_COMPONENTS_PER_SIDE,
  PAYSLIP_REIMBURSEMENT_LABEL,
  PAYSLIP_TEMPLATE_INSTALLMENT_COLUMN,
  isReservedColumn,
  normalizeLabel,
} from "./payslip-import";

// The org's payslip earning/deduction components — the column list the import
// template is generated from, stored in the web-owned
// `organizations.settings.payslip_components` namespace (same shared-JSONB
// caveat as settings.modules: never write the whole map, see
// actions/payslip-components.ts).
//
// The CSV *parser* still accepts any "E:"/"D:" column, exactly as before —
// this list only decides what the downloadable template carries, in what
// order, and which cells arrive prefilled.
//
// Pure module — no server imports (same constraint as payslip-import.ts): the
// editor is a client component and imports the types and validators from here.
// The DB read lives in lib/data/payslips.ts.

export interface PayslipComponent {
  label: string; // normalized: "BASIC", "PROF TAX"
  side: "E" | "D";
  // Prefilled into every employee's row when appliesToAll is set. Ignored for
  // machine-fed components, which carry a real per-employee figure instead.
  defaultAmount: number;
  appliesToAll: boolean;
}

// Components the template fills from other modules. They cannot be removed or
// renamed: the label is the contract — the parser matches
// PAYSLIP_REIMBURSEMENT_LABEL literally to split reimbursement out of gross,
// and the template route switches on the installment label to inject the
// month's Advances figure. Their defaultAmount/appliesToAll are meaningless
// and forced off.
//
// Loan/advance DISBURSAL is deliberately not here: it never appears on the
// payslip, so it is a reserved reference column, not a component.
export const PAYSLIP_PINNED_COMPONENTS: readonly PayslipComponent[] = [
  {
    label: PAYSLIP_REIMBURSEMENT_LABEL,
    side: "E",
    defaultAmount: 0,
    appliesToAll: false,
  },
  {
    label: normalizeLabel(PAYSLIP_TEMPLATE_INSTALLMENT_COLUMN.slice(2)),
    side: "D",
    defaultAmount: 0,
    appliesToAll: false,
  },
];

const PINNED_LABELS = new Set(PAYSLIP_PINNED_COMPONENTS.map((c) => c.label));

export function isPinnedComponent(label: string): boolean {
  return PINNED_LABELS.has(normalizeLabel(label));
}

// Seed list for an org that has never opened the editor — the hardcoded set
// this feature replaced, so an untouched org's template is byte-identical to
// what it downloaded before.
export const DEFAULT_PAYSLIP_COMPONENTS: readonly PayslipComponent[] = [
  { label: "BASIC", side: "E", defaultAmount: 0, appliesToAll: false },
  { label: "INCENTIVES", side: "E", defaultAmount: 0, appliesToAll: false },
  { label: PAYSLIP_REIMBURSEMENT_LABEL, side: "E", defaultAmount: 0, appliesToAll: false },
  { label: "BONUS", side: "E", defaultAmount: 0, appliesToAll: false },
  { label: "PROF TAX", side: "D", defaultAmount: 0, appliesToAll: false },
  { label: "LOAN/ADVANCE INSTALLMENT", side: "D", defaultAmount: 0, appliesToAll: false },
  { label: "INSURANCE", side: "D", defaultAmount: 0, appliesToAll: false },
];

// A label lands in a CSV header cell, and the template now ships a formula
// column — a label starting with one of these would be evaluated by Excel.
const FORMULA_LEAD = /^[=+\-@]/;

export function validateComponentLabel(raw: string): string | null {
  const label = normalizeLabel(raw);
  if (!label) return "Give the component a name.";
  if (isReservedColumn(label)) {
    return `"${label}" is a reserved column the template fills itself — it can't be an earning or a deduction.`;
  }
  if (label.length > 40) return `"${label}" is too long (max 40 characters).`;
  if (FORMULA_LEAD.test(label)) {
    return `"${label}" cannot start with = + - or @ — spreadsheets read that as a formula.`;
  }
  if (/[",\n\r:]/.test(label)) {
    return `"${label}" cannot contain quotes, commas, colons or line breaks.`;
  }
  return null;
}

// Parse the stored namespace. Field-by-field with fallback, same shape as
// modulesFromSettings — a half-written or hand-edited value degrades to the
// defaults rather than breaking payroll.
export function componentsFromSettings(settings: unknown): PayslipComponent[] {
  const raw =
    settings && typeof settings === "object"
      ? (settings as Record<string, unknown>).payslip_components
      : undefined;
  const list = Array.isArray(raw) ? raw : undefined;
  if (!list) return withPinned([...DEFAULT_PAYSLIP_COMPONENTS]);

  const parsed: PayslipComponent[] = [];
  const seen = { E: new Set<string>(), D: new Set<string>() };
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const label = typeof e.label === "string" ? normalizeLabel(e.label) : "";
    const side = e.side === "D" ? "D" : "E";
    if (!label || validateComponentLabel(label) !== null) continue;
    if (seen[side].has(label)) continue;
    seen[side].add(label);
    parsed.push({
      label,
      side,
      defaultAmount:
        typeof e.defaultAmount === "number" && Number.isFinite(e.defaultAmount)
          ? Math.max(0, e.defaultAmount)
          : 0,
      appliesToAll: e.appliesToAll === true,
    });
  }
  return withPinned(parsed);
}

// Re-insert any missing pinned component (and neutralise a stored one that
// somehow carries a default) so the template never loses its Advances /
// Expenses columns, whatever is in the JSONB.
function withPinned(list: PayslipComponent[]): PayslipComponent[] {
  const out = list.map((c) =>
    isPinnedComponent(c.label)
      ? { ...c, defaultAmount: 0, appliesToAll: false }
      : c
  );
  for (const pinned of PAYSLIP_PINNED_COMPONENTS) {
    const found = out.find(
      (c) => c.label === pinned.label && c.side === pinned.side
    );
    if (!found) out.push({ ...pinned });
  }
  return out;
}

// Validate a whole list before it is written. Returns the errors; empty = ok.
export function validateComponents(list: PayslipComponent[]): string[] {
  const errors: string[] = [];
  const seen = { E: new Set<string>(), D: new Set<string>() };

  for (const c of list) {
    const labelError = validateComponentLabel(c.label);
    if (labelError) {
      errors.push(labelError);
      continue;
    }
    if (seen[c.side].has(c.label)) {
      errors.push(
        `Duplicate ${c.side === "E" ? "earning" : "deduction"} "${c.label}".`
      );
      continue;
    }
    seen[c.side].add(c.label);
    if (!Number.isFinite(c.defaultAmount) || c.defaultAmount < 0) {
      errors.push(`"${c.label}" has an invalid default amount.`);
    }
  }

  for (const side of ["E", "D"] as const) {
    if (seen[side].size > PAYSLIP_MAX_COMPONENTS_PER_SIDE) {
      errors.push(
        `Too many ${side === "E" ? "earnings" : "deductions"} — maximum ${PAYSLIP_MAX_COMPONENTS_PER_SIDE} (an A4 payslip can't print more).`
      );
    }
  }
  if (seen.E.size === 0) errors.push("At least one earning is required.");

  for (const pinned of PAYSLIP_PINNED_COMPONENTS) {
    if (!seen[pinned.side].has(pinned.label)) {
      errors.push(`"${pinned.label}" is filled from another module and can't be removed.`);
    }
  }
  return errors;
}
