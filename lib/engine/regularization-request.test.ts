import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_BACKDATE_DAYS,
  validateRegularizationRequest,
} from "./regularization-request";

const base = {
  today: "2026-09-30",
  punchDate: "2026-09-28",
  requestedIn: "09:15",
  requestedOut: "18:05",
  reason: "Forgot to punch",
};

test("well-formed request passes", () => {
  assert.equal(validateRegularizationRequest(base), null);
});

test("future date rejected, today allowed", () => {
  assert.match(validateRegularizationRequest({ ...base, punchDate: "2026-10-01" })!, /past or current/);
  assert.equal(validateRegularizationRequest({ ...base, punchDate: "2026-09-30" }), null);
});

test("backdate window is MAX_BACKDATE_DAYS inclusive", () => {
  assert.equal(MAX_BACKDATE_DAYS, 30);
  assert.equal(validateRegularizationRequest({ ...base, punchDate: "2026-08-31" }), null);
  assert.match(validateRegularizationRequest({ ...base, punchDate: "2026-08-30" })!, /at most 30 days/);
});

test("before joining date rejected", () => {
  assert.match(
    validateRegularizationRequest({ ...base, punchDate: "2026-09-20", joiningDate: "2026-09-21" })!,
    /date of joining/
  );
});

test("at least one time required; out-only is fine", () => {
  assert.match(
    validateRegularizationRequest({ ...base, requestedIn: null, requestedOut: null })!,
    /punch-in time/
  );
  assert.equal(validateRegularizationRequest({ ...base, requestedIn: null }), null);
});

test("out must follow in", () => {
  assert.match(validateRegularizationRequest({ ...base, requestedOut: "09:15" })!, /after punch-in/);
  assert.match(validateRegularizationRequest({ ...base, requestedOut: "08:00" })!, /after punch-in/);
});

test("reason required", () => {
  assert.match(validateRegularizationRequest({ ...base, reason: "  " })!, /reason/);
  assert.match(validateRegularizationRequest({ ...base, reason: null })!, /reason/);
});

test("malformed inputs rejected", () => {
  assert.match(validateRegularizationRequest({ ...base, punchDate: "28/09/2026" })!, /Pick the date/);
  assert.match(validateRegularizationRequest({ ...base, requestedIn: "9am" })!, /invalid/);
});
