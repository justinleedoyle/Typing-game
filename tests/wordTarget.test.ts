// Logic harness: the Tier 4 forgive-reset (unseal) decision in wordTarget.ts.
//
// TextWordTarget is Phaser-coupled and not unit-testable, but the SUBTLE part —
// the guard that spends exactly ONE pardon per miss even though a single miss
// calls resetCursor() twice (the target's own resetOnMiss path + the typing
// controller's difficulty-reset path) — is extracted as the pure
// applyForgiveReset(). We simulate the real call sequence and lock its behavior.

import { assert, assertEqual, suite } from "./_assert";

import {
  applyForgiveReset,
  type ForgiveResetState,
} from "../src/game/wordTarget";

/** Simulate ONE miss against the forgive-reset machine, mirroring the scene:
 *  miss() clears `pending` at its start, then resetCursor() is called
 *  `resetCalls` times (2 in Standard/Purist — resetOnMiss + the controller; 1 in
 *  Forgiving — resetOnMiss only). A real reset (cursor→0) makes any later call
 *  in the SAME miss early-return, so we stop once it fires. */
function simulateMiss(
  state: ForgiveResetState,
  resetCalls: number,
): { state: ForgiveResetState; pardoned: boolean } {
  let s: ForgiveResetState = { tokens: state.tokens, pending: false };
  let didRealReset = false;
  for (let i = 0; i < resetCalls && !didRealReset; i++) {
    const r = applyForgiveReset(s);
    s = r.next;
    if (r.didReset) didRealReset = true;
  }
  return { state: s, pardoned: !didRealReset };
}

await suite("applyForgiveReset: no tokens → always resets for real", () => {
  const r = applyForgiveReset({ tokens: 0, pending: false });
  assert(r.didReset, "0 tokens, no pardon in flight → reset");
  assertEqual(r.next, { tokens: 0, pending: false }, "state unchanged");
});

await suite("applyForgiveReset: a Standard miss spends exactly ONE token", () => {
  // Standard mode calls resetCursor twice per miss; the pending guard must make
  // that ONE pardon, not two.
  let state: ForgiveResetState = { tokens: 2, pending: false };
  const m1 = simulateMiss(state, 2);
  assert(m1.pardoned, "miss 1 pardoned");
  assertEqual(m1.state.tokens, 1, "miss 1 spent exactly one token (not two)");
  const m2 = simulateMiss(m1.state, 2);
  assert(m2.pardoned, "miss 2 pardoned");
  assertEqual(m2.state.tokens, 0, "miss 2 spent the second token");
  const m3 = simulateMiss(m2.state, 2);
  assert(!m3.pardoned, "miss 3 resets for real (pool empty)");
  assertEqual(m3.state.tokens, 0, "tokens never go negative");
});

await suite("applyForgiveReset: consecutive misses don't pardon for free", () => {
  // Two misses with NO correct keystroke between them must each cost a token —
  // the bug this guards against is `pending` leaking across misses (infinite
  // forgiveness). simulateMiss clears pending per miss, mirroring miss().
  const m1 = simulateMiss({ tokens: 2, pending: false }, 2);
  const m2 = simulateMiss(m1.state, 2);
  assertEqual(m2.state.tokens, 0, "two back-to-back misses spent two tokens");
  assert(m1.pardoned && m2.pardoned, "both pardoned while tokens lasted");
});

await suite("applyForgiveReset: Forgiving mode (one reset call) also spends one", () => {
  // Forgiving difficulty: the controller does NOT reset, so only resetOnMiss
  // calls resetCursor (one call per miss). Still one token per miss.
  const m1 = simulateMiss({ tokens: 1, pending: false }, 1);
  assert(m1.pardoned, "pardoned");
  assertEqual(m1.state.tokens, 0, "one token spent");
  const m2 = simulateMiss(m1.state, 1);
  assert(!m2.pardoned, "next miss resets for real");
});

await suite("applyForgiveReset: a no-token target is a stable no-op machine", () => {
  // The common case (no unseal relic): every miss resets, state stays {0,false}.
  let m = simulateMiss({ tokens: 0, pending: false }, 2);
  assert(!m.pardoned, "resets");
  for (let i = 0; i < 5; i++) {
    m = simulateMiss(m.state, 2);
    assert(!m.pardoned, "still resets");
    assertEqual(m.state, { tokens: 0, pending: false }, "state stays stable");
  }
});
