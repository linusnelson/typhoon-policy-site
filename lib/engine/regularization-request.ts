// Validation for employee regularization requests — pure, so it can be unit
// tested and shared between the form (client hints) and the server action.

// Employees may ask to correct a day this far back. Anything older is an admin
// correction (admins have no limit) — same window as emergency leave.
export const MAX_BACKDATE_DAYS = 30;

export interface RegularizationRequestInput {
  today: string; // YYYY-MM-DD (IST)
  punchDate: string | null;
  requestedIn: string | null; // HH:MM
  requestedOut: string | null; // HH:MM
  reason: string | null;
  joiningDate?: string | null; // YYYY-MM-DD
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function shiftDate(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

/** Returns an error message, or null when the request is well-formed. */
export function validateRegularizationRequest(
  input: RegularizationRequestInput
): string | null {
  const { today, punchDate, requestedIn, requestedOut, reason, joiningDate } = input;

  if (!punchDate || !DATE_RE.test(punchDate)) return "Pick the date to correct.";
  if (punchDate > today) return "You can only correct a past or current day.";
  if (punchDate < shiftDate(today, -MAX_BACKDATE_DAYS)) {
    return `Requests can go back at most ${MAX_BACKDATE_DAYS} days. Ask an admin for older corrections.`;
  }
  if (joiningDate && punchDate < joiningDate) {
    return "That date is before your date of joining.";
  }

  if (requestedIn && !TIME_RE.test(requestedIn)) return "Punch-in time is invalid.";
  if (requestedOut && !TIME_RE.test(requestedOut)) return "Punch-out time is invalid.";
  if (!requestedIn && !requestedOut) {
    return "Enter the punch-in time, the punch-out time, or both.";
  }
  if (requestedIn && requestedOut && timeToMinutes(requestedOut) <= timeToMinutes(requestedIn)) {
    return "Punch-out must be after punch-in.";
  }

  if (!reason || reason.trim().length === 0) return "A reason is required.";
  return null;
}
