// Pure math for the shared "advancing word-bearing enemy" (MovingWordEnemy).
//
// Winter (Wolf), Bell (Ghost), Forge (Golem) and Wood (HauntedGhost) all ran
// these two formulas inline, identically. Extracting them here makes the
// Tier-2 refactor *provably* feel-identical: the migration is a no-op on the
// numbers, locked by movingWordEnemy.test.ts. Kept Phaser-free so it's
// unit-testable (the real-time scene can't be automated — hidden-tab rAF
// freeze; same convention as wordTarget.ts / winterMechanics.ts).

/**
 * Duration of the advance-toward-Wren tween.
 *
 * `advanceMs` is the base deadline; it's scaled by how far the enemy still has
 * to travel (so a knocked-back enemy that re-advances from a closer point gets
 * a proportionally shorter close), floored at 0.3 so a near-Wren enemy never
 * snaps in instantly, and multiplied by the Tier-4 quiet-advance relic factor
 * (`advanceMult`, 1 without the relic).
 *
 * `totalRange` 0 (rest already at Wren — degenerate) falls back to 1 so we
 * divide by a sane denominator, matching the `|| 1` guard every realm used.
 */
export function advanceDurationMs(
  advanceMs: number,
  remaining: number,
  totalRange: number,
  advanceMult: number,
): number {
  return advanceMs * Math.max(0.3, remaining / (totalRange || 1)) * advanceMult;
}

/**
 * Danger level [0,1] for the floating word's cream→ember ramp, as a function of
 * the advance tween's progress [0,1]. Stays 0 until `rampStart` (so the word is
 * readable through the early approach), then climbs linearly to 1 at progress 1.
 * rampStart is 0.4 in Winter/Bell/Forge and 0.5 in Wood.
 */
export function dangerRamp(progress: number, rampStart: number): number {
  return Math.max(0, (progress - rampStart) / (1 - rampStart));
}

/** One spawned child for a splitting enemy (Bell's ebb/drift). `dx` is the
 *  lateral offset from the parent's position where the child comes to rest. */
export interface SplitChildSpec {
  word: string;
  dx: number;
}

/** Resolved spawn descriptor for a split child. `side` is the screen edge the
 *  child's entrance sweeps in from, derived from which side of Wren it rests on
 *  (mirrors Bell's `sx < WREN_X ? "left" : "right"`). */
export interface SplitChildPlacement {
  word: string;
  restX: number;
  restY: number;
  side: "left" | "right";
}

/**
 * Place a splitting enemy's children. Each child rests at `parentX + dx`, at the
 * parent's rest-Y, and enters from whichever side of `wrenX` it lands on. Pure so
 * the geometry (which Bell hard-coded inline) is testable independent of Phaser.
 */
export function splitChildPositions(
  parentX: number,
  parentRestY: number,
  children: readonly SplitChildSpec[],
  wrenX: number,
): SplitChildPlacement[] {
  return children.map((c) => {
    const restX = parentX + c.dx;
    return {
      word: c.word,
      restX,
      restY: parentRestY,
      side: restX < wrenX ? "left" : "right",
    };
  });
}
