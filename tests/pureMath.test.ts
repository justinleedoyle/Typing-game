// Logic harness: the Phaser-free mechanic math. These modules are pure by
// design precisely so they can be asserted deterministically here (the
// real-time scenes can't be automated — a backgrounded tab freezes Phaser's
// rAF loop). We import and exercise the REAL functions.

import { assert, assertEqual, assertClose, suite } from "./_assert";

import {
  BEAT_BOUNDARY,
  windowMsFor,
  isOnBeat,
  isOffBeat,
  decideBeatGate,
} from "../src/game/beatGate";

import {
  SUFFIX_EAT_THRESHOLD,
  BANNER_DANGER_RAMP_START,
  blurAmountAt,
  shouldEatSuffix,
  blurAlphaFor,
  bannerDangerAt,
} from "../src/game/skyBlur";

import {
  CANDLE_RESET_FLOOR,
  CIRCLER_AMPLITUDE,
  CIRCLER_CYCLES,
  candleAfterHit,
  candleAfterCleanWave,
  circlerY,
} from "../src/game/winterMechanics";

// ─── beatGate ─────────────────────────────────────────────────────────────────

await suite("beatGate.windowMsFor: tempo-scaled vs fixed", () => {
  // Default fraction 0.175 at the slow 2000ms toll → 350ms (the old constant).
  assertClose(windowMsFor(2000, undefined, 0.175), 350, 1e-9, "2000ms * 0.175 = 350ms");
  // Phase-2 halves tempo to 1000ms → tightens to 175ms.
  assertClose(windowMsFor(1000, undefined, 0.175), 175, 1e-9, "1000ms * 0.175 = 175ms");
  // A fixed window pins the width regardless of tempo.
  assertEqual(windowMsFor(2000, 300, 0.175), 300, "fixedWindowMs overrides tempo scaling");
  assertEqual(windowMsFor(500, 300, 0.5), 300, "fixedWindowMs wins even with a different fraction");
});

await suite("beatGate.isOnBeat: asymmetric window opening at the toll", () => {
  assert(isOnBeat(0, 350), "exactly on the toll is on-beat");
  assert(isOnBeat(350, 350), "the far edge of the window is on-beat (inclusive)");
  assert(!isOnBeat(351, 350), "just past the window is off");
  assert(!isOnBeat(-1, 350), "before the toll is never on-beat (window opens AT the beat)");
});

await suite("beatGate.isOffBeat: antiphon window centered on the half-beat", () => {
  const tempo = 2000;
  const win = 350;
  const mid = tempo / 2; // 1000
  assert(isOffBeat(mid, tempo, win), "dead center of the half-beat is off-beat");
  assert(isOffBeat(mid - win / 2, tempo, win), "lower edge of antiphon window");
  assert(isOffBeat(mid + win / 2, tempo, win), "upper edge of antiphon window");
  assert(!isOffBeat(mid + win, tempo, win), "outside the antiphon window");
  // Disjoint from the on-beat window for a sane fraction (<0.5): a keystroke
  // landing on the toll is never also off-beat.
  assert(!isOffBeat(0, tempo, win), "on-the-toll keystroke is NOT off-beat (windows disjoint)");
});

await suite("beatGate.decideBeatGate: the full decision table", () => {
  // No claim yet → must land in-window to start one.
  assertEqual(
    decideBeatGate({ hasClaim: false, inWindow: true, nextChar: null, metered: false }),
    "accept",
    "in-window first keystroke accepts (starts a claim)",
  );
  assertEqual(
    decideBeatGate({ hasClaim: false, inWindow: false, nextChar: null, metered: false }),
    "reject-newclaim",
    "off-window first keystroke is rejected (nothing lost yet)",
  );
  // Mid-word, unmetered → letters flow freely regardless of window.
  assertEqual(
    decideBeatGate({ hasClaim: true, inWindow: false, nextChar: "a", metered: false }),
    "accept",
    "unmetered mid-word letters flow freely (canon: letters within a word flow)",
  );
  // Mid-word, metered, sitting ON a beat boundary, out of window → de-sync.
  assertEqual(
    decideBeatGate({ hasClaim: true, inWindow: false, nextChar: BEAT_BOUNDARY, metered: true }),
    "desync",
    "metered boundary crossed off-beat → de-sync (wipes claimed progress)",
  );
  // Same boundary, but in-window → accept (you landed the beat).
  assertEqual(
    decideBeatGate({ hasClaim: true, inWindow: true, nextChar: BEAT_BOUNDARY, metered: true }),
    "accept",
    "metered boundary struck in-window accepts",
  );
  // Metered but the next char is an ordinary letter (not a boundary) → free.
  assertEqual(
    decideBeatGate({ hasClaim: true, inWindow: false, nextChar: "x", metered: true }),
    "accept",
    "metered non-boundary letter still flows freely",
  );
});

// ─── skyBlur ──────────────────────────────────────────────────────────────────

await suite("skyBlur.blurAmountAt: closest-beam intensity falloff", () => {
  // Dead center of a beam = 1.0.
  assertClose(blurAmountAt(100, [100], 50), 1, 1e-9, "dead center → 1");
  // At the radius edge = 0 (and beyond stays 0).
  assertClose(blurAmountAt(150, [100], 50), 0, 1e-9, "edge of beam → 0");
  assertClose(blurAmountAt(400, [100], 50), 0, 1e-9, "far from any beam → 0 (in a gap)");
  // Halfway in = 0.5 (linear falloff).
  assertClose(blurAmountAt(125, [100], 50), 0.5, 1e-9, "halfway into the radius → 0.5");
  // Closest beam wins when several are present.
  assertClose(blurAmountAt(105, [100, 300], 50), 1 - 5 / 50, 1e-9, "nearest beam (x=100) wins");
  // Degenerate radius → no blur (guards the divide).
  assertEqual(blurAmountAt(100, [100], 0), 0, "radius<=0 → 0 (no divide-by-zero)");
  assertEqual(blurAmountAt(100, [], 50), 0, "no beams → 0");
});

await suite("skyBlur.shouldEatSuffix: masks the untyped read-ahead past threshold", () => {
  assert(!shouldEatSuffix(SUFFIX_EAT_THRESHOLD - 0.01), "below threshold → readable");
  assert(shouldEatSuffix(SUFFIX_EAT_THRESHOLD), "at threshold → eaten (inclusive)");
  assert(shouldEatSuffix(0.9), "deep in a beam → eaten");
  assert(shouldEatSuffix(0.5, 0.5), "custom threshold honored");
  assert(!shouldEatSuffix(0.49, 0.5), "custom threshold: just below stays readable");
});

await suite("skyBlur.blurAlphaFor: dimmed but never invisible (stays locatable)", () => {
  assertClose(blurAlphaFor(0), 1, 1e-9, "no blur → full alpha");
  assertClose(blurAlphaFor(1), 0.6, 1e-9, "max blur → 0.6 floor (never vanishes)");
  assertClose(blurAlphaFor(0.5), 0.8, 1e-9, "half blur → 0.8");
  // Clamps out-of-range inputs.
  assertClose(blurAlphaFor(2), 0.6, 1e-9, "blur>1 clamps to 0.6");
  assertClose(blurAlphaFor(-1), 1, 1e-9, "blur<0 clamps to full alpha");
});

await suite("skyBlur.bannerDangerAt: ramp begins only near the exit edge", () => {
  assertEqual(bannerDangerAt(0), 0, "start of scroll → no danger");
  assertEqual(bannerDangerAt(BANNER_DANGER_RAMP_START), 0, "at ramp start → still 0");
  assertEqual(bannerDangerAt(0.5), 0, "before ramp start → 0");
  assertClose(bannerDangerAt(1), 1, 1e-9, "at the exit edge → full danger");
  // Midway through the ramp (default start 0.6): progress 0.8 → 0.5.
  assertClose(bannerDangerAt(0.8), (0.8 - 0.6) / (1 - 0.6), 1e-9, "linear ramp to the edge");
  // Degenerate ramp start.
  assertEqual(bannerDangerAt(1, 1), 0, "rampStart>=1 → 0 (no ramp window)");
});

// ─── winterMechanics ──────────────────────────────────────────────────────────

await suite("winterMechanics.candleAfterHit: one snuffed, clamped at 0", () => {
  assertEqual(candleAfterHit(3), 2, "3 candles → 2 after a hit");
  assertEqual(candleAfterHit(1), 0, "1 candle → 0");
  assertEqual(candleAfterHit(0), 0, "0 candles stays 0 (clamped, no negative)");
});

await suite("winterMechanics.candleAfterCleanWave: skill refills, capped at max", () => {
  assertEqual(candleAfterCleanWave(2, 5), 3, "clean wave relights one");
  assertEqual(candleAfterCleanWave(5, 5), 5, "already at max → stays capped");
  assertEqual(candleAfterCleanWave(6, 5), 5, "above max → clamped down to max");
  // The reset floor is a brink, not a full tank — guards the economy intent.
  assert(CANDLE_RESET_FLOOR < 5, "reset floor must be a brink (less than a typical max)");
  assertEqual(CANDLE_RESET_FLOOR, 1, "documented reset floor is 1");
});

await suite("winterMechanics.circlerY: sine weave around the rest line", () => {
  const rest = 200;
  // progress 0 → on the rest line (sin 0).
  assertClose(circlerY(rest, 0), rest, 1e-9, "progress 0 → rest line");
  // A full period returns to the rest line: progress where cycles*2π*p = 2π.
  const oneFullPeriod = 1 / CIRCLER_CYCLES; // sin(2π) = 0
  assertClose(circlerY(rest, oneFullPeriod), rest, 1e-9, "one full sine period → back on rest line");
  // Quarter period of the first cycle → +amplitude peak.
  const quarter = 1 / (CIRCLER_CYCLES * 4); // sin(π/2) = 1
  assertClose(circlerY(rest, quarter), rest + CIRCLER_AMPLITUDE, 1e-9, "quarter period → +amplitude peak");
  // Stays within ±amplitude across the whole scroll.
  for (let p = 0; p <= 1; p += 0.05) {
    const y = circlerY(rest, p);
    assert(
      y >= rest - CIRCLER_AMPLITUDE - 1e-9 && y <= rest + CIRCLER_AMPLITUDE + 1e-9,
      `circlerY(${p}) = ${y} escaped ±amplitude band`,
    );
  }
  // Custom amplitude/cycles honored.
  assertClose(circlerY(0, 0.25, 10, 1), 10, 1e-9, "custom amp/cycles: quarter of 1 cycle → +amp");
});
