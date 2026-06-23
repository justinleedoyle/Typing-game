// Logic harness: the pure offensive-one-shot invocation layer
// (src/game/oneShotInvocation.ts) — the vocabulary, the "strongest foe" pick,
// and the charge gate that the Phaser widget (oneShotInvoker.ts) and the realm
// scenes consume. We lock:
//   • the offensive set against the descriptor (every offensive one-shot in
//     relicEffects has an invocation; no stray invocations);
//   • the invocation words are collision-SAFE by construction (distinct first
//     letters, lowercase) so the prefix-match controller can claim them;
//   • pickHardestEnemy = most-advanced, longer-word tiebreak, null when empty;
//   • canFireOneShot = the four-way gate.

import { assert, assertEqual, suite } from "./_assert";

import {
  OFFENSIVE_ONE_SHOTS,
  INVOCATIONS,
  isOffensiveOneShot,
  isSingleTargetOneShot,
  pickHardestEnemy,
  canFireOneShot,
  type OffensiveOneShot,
} from "../src/game/oneShotInvocation";
import { RELIC_EFFECTS } from "../src/game/relicEffects";

await suite("offensive set matches the descriptor's offensive one-shots", () => {
  // Independently derive the offensive one-shots from the REAL descriptor: a
  // oncePerRealm effect that is NOT defensive is offensive (the resolver routes
  // exactly these into loadout.oneShots).
  const fromDescriptor = new Set<string>();
  for (const e of Object.values(RELIC_EFFECTS)) {
    const c = e.combat;
    if (c && c.kind === "oncePerRealm" && !c.defensive) {
      fromDescriptor.add(c.effect);
    }
  }
  assertEqual(
    [...fromDescriptor].sort(),
    [...OFFENSIVE_ONE_SHOTS].sort(),
    "the descriptor's non-defensive oncePerRealm effects == OFFENSIVE_ONE_SHOTS",
  );
});

await suite("every offensive one-shot has a well-formed invocation", () => {
  for (const effect of OFFENSIVE_ONE_SHOTS) {
    const inv = INVOCATIONS[effect];
    assert(inv !== undefined, `${effect} has an invocation`);
    assertEqual(inv.effect, effect, `${effect} invocation.effect self-consistent`);
    assert(inv.word.length >= 3, `${effect} word is typeable`);
    assertEqual(
      inv.word,
      inv.word.toLowerCase(),
      `${effect} word is lowercase (no Shift required)`,
    );
    assert(inv.title.length > 0, `${effect} has a title`);
    assert(inv.readyCue.length > 0, `${effect} has a ready cue`);
    assert(inv.spentCue.length > 0, `${effect} has a spent cue`);
  }
  // No stray invocations beyond the offensive set.
  assertEqual(
    Object.keys(INVOCATIONS).sort(),
    [...OFFENSIVE_ONE_SHOTS].sort(),
    "INVOCATIONS keys == OFFENSIVE_ONE_SHOTS",
  );
});

await suite("invocation words have distinct first letters (claimable)", () => {
  // When two invocations are co-live (Wood can hold all three) the prefix-match
  // controller disambiguates by first letter, so they must differ — otherwise a
  // single keystroke can't begin to narrow between them.
  const firsts = OFFENSIVE_ONE_SHOTS.map((e) => INVOCATIONS[e].word[0]);
  assertEqual(
    new Set(firsts).size,
    firsts.length,
    "every invocation word starts with a different letter",
  );
});

await suite("isOffensiveOneShot narrows correctly", () => {
  assert(isOffensiveOneShot("toll-strike"), "toll-strike is offensive");
  assert(isOffensiveOneShot("bind-beat"), "bind-beat is offensive");
  assert(isOffensiveOneShot("jam-foe"), "jam-foe is offensive");
  assert(!isOffensiveOneShot("quiet-advance"), "passive is not offensive");
  assert(!isOffensiveOneShot("ward-breach"), "defensive one-shot is not offensive");
  assert(!isOffensiveOneShot("auto-ease"), "per-wave proc is not offensive");
});

await suite("isSingleTargetOneShot: bind-beat is the only AoE", () => {
  assert(isSingleTargetOneShot("toll-strike"), "toll-strike hits one");
  assert(isSingleTargetOneShot("jam-foe"), "jam-foe hits one");
  assert(!isSingleTargetOneShot("bind-beat"), "bind-beat hits all");
});

await suite("pickHardestEnemy: most-advanced wins", () => {
  assertEqual(pickHardestEnemy([]), null, "empty → null");
  assertEqual(
    pickHardestEnemy([{ progress: 0.3, wordLength: 4 }]),
    0,
    "single candidate → its index",
  );
  assertEqual(
    pickHardestEnemy([
      { progress: 0.2, wordLength: 9 },
      { progress: 0.7, wordLength: 3 },
      { progress: 0.5, wordLength: 6 },
    ]),
    1,
    "the most-advanced foe is chosen even with a shorter word",
  );
});

await suite("pickHardestEnemy: longer word breaks an advance tie", () => {
  assertEqual(
    pickHardestEnemy([
      { progress: 0.4, wordLength: 5 },
      { progress: 0.4, wordLength: 8 },
      { progress: 0.4, wordLength: 2 },
    ]),
    1,
    "equal progress → the longest (toughest) word wins",
  );
  // All freshly spawned (progress 0) → still resolves to the longest word, never
  // null, so a one-shot fired the instant a wave appears has a target.
  assertEqual(
    pickHardestEnemy([
      { progress: 0, wordLength: 3 },
      { progress: 0, wordLength: 7 },
    ]),
    1,
    "all-at-zero → longest word",
  );
});

await suite("canFireOneShot: the four-way gate", () => {
  const ok = { soul: 60, cost: 60, alreadyFired: false, hasTarget: true };
  assert(canFireOneShot(ok), "charged + unused + target → fire");
  assert(
    canFireOneShot({ ...ok, soul: 100 }),
    "over-charged still fires",
  );
  assert(
    !canFireOneShot({ ...ok, soul: 59 }),
    "below cost → no fire",
  );
  assert(
    !canFireOneShot({ ...ok, alreadyFired: true }),
    "already fired this realm → no fire",
  );
  assert(
    !canFireOneShot({ ...ok, hasTarget: false }),
    "nothing to hit → no fire",
  );
});

// Echo a final line so the harness output reads cleanly alongside the others.
const _offensive: OffensiveOneShot[] = [...OFFENSIVE_ONE_SHOTS];
assert(_offensive.length === 3, "three offensive one-shots");
