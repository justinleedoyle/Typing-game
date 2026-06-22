// Logic harness: the pure math behind the shared MovingWordEnemy.
//
// The class itself is Phaser-coupled (like TextWordTarget / ScrollingPhrase) and
// not unit-testable, but the two formulas every advancing-enemy realm ran inline
// — the advance duration and the danger ramp — are extracted as pure functions.
// Locking them here is what makes the Tier-2 migration provably feel-identical:
// these are the exact numbers Winter/Bell/Forge/Wood produced before the refactor.

import { assert, assertClose, assertEqual, suite } from "./_assert";

import {
  advanceDurationMs,
  dangerRamp,
  splitChildPositions,
} from "../src/game/movingWordMath";

const EPS = 1e-9;

await suite("advanceDurationMs: full range = base × mult", () => {
  // Enemy at its rest point (remaining === totalRange) → factor 1 → full deadline.
  assertClose(advanceDurationMs(15000, 620, 620, 1), 15000, EPS, "full range");
  assertClose(advanceDurationMs(15000, 620, 620, 1.2), 18000, EPS, "quiet-advance ×1.2");
});

await suite("advanceDurationMs: scales with remaining distance", () => {
  // A knocked-back enemy re-advancing from half-distance gets a half-length close.
  assertClose(advanceDurationMs(15000, 310, 620, 1), 7500, EPS, "half range → half time");
  assertClose(advanceDurationMs(13000, 6500, 13000, 1), 6500, EPS, "half of 13000");
});

await suite("advanceDurationMs: floors at 0.3 of the base", () => {
  // Near Wren (tiny remaining) the close can't snap in instantly — floored at 0.3.
  assertClose(advanceDurationMs(15000, 0, 620, 1), 4500, EPS, "remaining 0 → 0.3×");
  assertClose(advanceDurationMs(15000, 60, 620, 1), 4500, EPS, "60/620≈0.097 < 0.3 → 0.3×");
  assertClose(advanceDurationMs(15000, 60, 620, 1.2), 5400, EPS, "floor then ×mult");
});

await suite("advanceDurationMs: totalRange 0 falls back to /1", () => {
  // Degenerate rest-at-Wren: the `|| 1` guard every realm used avoids /0.
  assertClose(advanceDurationMs(15000, 5, 0, 1), 75000, EPS, "remaining/1 = 5 → 75000");
});

await suite("dangerRamp: 0 until rampStart, 1 at full advance", () => {
  assertClose(dangerRamp(0.4, 0.4), 0, EPS, "at rampStart → 0");
  assertClose(dangerRamp(0.2, 0.4), 0, EPS, "before rampStart clamps to 0");
  assertClose(dangerRamp(0, 0.4), 0, EPS, "progress 0 → 0");
  assertClose(dangerRamp(1, 0.4), 1, EPS, "progress 1 → 1");
});

await suite("dangerRamp: linear between rampStart and 1", () => {
  // Winter/Bell/Forge rampStart 0.4: halfway through the ramp window is danger 0.5.
  assertClose(dangerRamp(0.7, 0.4), 0.5, EPS, "0.4 ramp midpoint");
  // Wood rampStart 0.5: its ramp window is the back half.
  assertClose(dangerRamp(0.75, 0.5), 0.5, EPS, "0.5 ramp midpoint");
  assertClose(dangerRamp(1, 0.5), 1, EPS, "0.5 ramp end");
});

await suite("splitChildPositions: ebb/drift place left/right of Wren", () => {
  // Bell's splitter resting on Wren's line: ebb (−60) lands left, drift (+60) right.
  const placed = splitChildPositions(
    960,
    740,
    [
      { word: "ebb", dx: -60 },
      { word: "drift", dx: 60 },
    ],
    960,
  );
  assertEqual(
    placed,
    [
      { word: "ebb", restX: 900, restY: 740, side: "left" },
      { word: "drift", restX: 1020, restY: 740, side: "right" },
    ],
    "two children placed at ±60, sided by Wren",
  );
});

await suite("splitChildPositions: side follows which half of Wren a child rests on", () => {
  // A splitter resting well left of Wren: both children still left of Wren → both enter left.
  const placed = splitChildPositions(720, 700, [
    { word: "ebb", dx: -60 },
    { word: "drift", dx: 60 },
  ], 960);
  assert(placed.every((p) => p.side === "left"), "both children left of Wren");
  assertEqual(placed[0]?.restX, 660, "ebb rest x");
  assertEqual(placed[1]?.restX, 780, "drift rest x");
});
