import { test } from "node:test";
import assert from "node:assert/strict";
import { splitMake } from "./split-make";

const cases: Array<[string, string, string]> = [
  ["AERO-ELECTRIC CONNECTOR, INC.-MS27472T10B35PN", "AERO-ELECTRIC CONNECTOR, INC.", "MS27472T10B35PN"],
  ["ITT CANNON / ELECTRON TUBE DIVISION-MS27472T10B35PN", "ITT CANNON / ELECTRON TUBE DIVISION", "MS27472T10B35PN"],
  ["MATRIX SCIENCE CORPN.-J MS27472T10B35P", "MATRIX SCIENCE CORPN.-J", "MS27472T10B35P"], // "J" = maker designator
  ["ITT CANNON-J MS27472T10B35P-1", "ITT CANNON-J", "MS27472T10B35P-1"],
  ["ACME-JX 1234", "ACME", "JX 1234"], // two letters: not a designator, left alone
  ["AIRBORN INTERCONNECT, INC.-M83513/05-07", "AIRBORN INTERCONNECT, INC.", "M83513/05-07"],
  ["AMPHENOL CANADA CORPORATION-HM05-07", "AMPHENOL CANADA CORPORATION", "HM05-07"],
  ["GLENAIR INC-M83513/05-07", "GLENAIR INC", "M83513/05-07"],
  ["MICROCHIP TECHNOLOGY INC-JAN1N5811", "MICROCHIP TECHNOLOGY INC", "JAN1N5811"],
  ["OTTO-B3-22141", "OTTO", "B3-22141"],
  ["DELTRON EMCON LIMITED-557-0500", "DELTRON EMCON LIMITED", "557-0500"],
  ["3M-1234-ABC", "3M", "1234-ABC"], // known make with a digit (makes.json)
  ["SOME MAKE-ABC-DEF", "SOME MAKE-ABC", "DEF"], // no digit anywhere: last hyphen
  ["NO HYPHEN AT ALL", "NO HYPHEN AT ALL", ""],
];

for (const [raw, make, mpn] of cases) {
  test(`splitMake(${raw})`, () => {
    assert.deepEqual(splitMake(raw), { make, mpn });
  });
}
