import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyDay,
  DEFAULT_SHIFT,
  leaveUnitsOnDay,
  partWindows,
  type DayInputs,
  type DayLeave,
  type HalfWindow,
  type WeeklyOff,
} from "./day-parts";

// Shared vectors — the Dart engine runs the identical file.
interface VectorInput {
  weekday?: number;
  sessions?: [string, string | null, string][];
  visits?: [string, string | null][];
  leave?: DayLeave;
  fieldWindow?: HalfWindow;
  eventWindow?: HalfWindow;
  holiday?: boolean;
  weeklyOff?: WeeklyOff;
  markedAbsent?: boolean;
  hasBalance?: boolean;
  timing?: "past" | "today" | "future";
  now?: string;
}
interface Vector {
  id: string;
  desc: string;
  input: VectorInput;
  expect: Record<string, unknown>;
}

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

const { vectors } = JSON.parse(
  readFileSync(join(__dirname, "day-parts.vectors.json"), "utf8")
) as { vectors: Vector[] };

for (const v of vectors) {
  test(`${v.id} ${v.desc}`, () => {
    const i = v.input;
    const input: DayInputs = {
      weekday: i.weekday ?? 1,
      shift: DEFAULT_SHIFT,
      lateThresholdMin: 15,
      sessions: (i.sessions ?? []).map(([a, b, wt]) => ({ inMin: mins(a), outMin: b ? mins(b) : null, workType: wt })),
      visitIntervals: (i.visits ?? []).map(([a, b]) => ({ startMin: mins(a), endMin: b ? mins(b) : null })),
      leave: i.leave ?? null,
      fieldWindow: i.fieldWindow ?? null,
      eventWindow: i.eventWindow ?? null,
      holiday: i.holiday,
      weeklyOff: i.weeklyOff,
      markedAbsent: i.markedAbsent,
      hasBalance: i.hasBalance,
      timing: i.timing,
      nowMin: i.now ? mins(i.now) : null,
    };
    const r = classifyDay(input);
    const actual: Record<string, unknown> = {
      ...r,
      units: [r.units.present, r.units.leave, r.units.absent],
    };
    for (const [k, want] of Object.entries(v.expect)) {
      assert.deepEqual(actual[k], want, `${v.id} ${k}: got ${JSON.stringify(actual[k])}`);
    }
  });
}

test("part windows: weekday 4 × 2h15, Saturday 2 parts", () => {
  assert.deepEqual(partWindows(DEFAULT_SHIFT, null), [
    { startMin: 570, endMin: 705 },
    { startMin: 705, endMin: 840 },
    { startMin: 840, endMin: 975 },
    { startMin: 975, endMin: 1110 },
  ]);
  assert.deepEqual(partWindows(DEFAULT_SHIFT, "half"), [
    { startMin: 570, endMin: 675 },
    { startMin: 675, endMin: 780 },
    null,
    null,
  ]);
});

test("leave units by day: weekday half 0.5, quarter 0.25; Saturday PM half 0; Sunday 0", () => {
  assert.equal(leaveUnitsOnDay({ duration: "half_day_morning" }, 1, DEFAULT_SHIFT), 0.5);
  assert.equal(leaveUnitsOnDay({ duration: "quarter_day", quarterSlot: 3 }, 1, DEFAULT_SHIFT), 0.25);
  assert.equal(leaveUnitsOnDay({ duration: "half_day_afternoon" }, 6, DEFAULT_SHIFT), 0);
  assert.equal(leaveUnitsOnDay({ duration: "quarter_day", quarterSlot: 2 }, 6, DEFAULT_SHIFT), 0.25);
  assert.equal(leaveUnitsOnDay({ duration: "full_day" }, 6, DEFAULT_SHIFT), 0.5);
  assert.equal(leaveUnitsOnDay({ duration: "half_day_morning" }, 0, DEFAULT_SHIFT), 0);
});
