// Pure rhythm math + the keystroke-gate decision for the Sunken Bell.
//
// Kept deliberately Phaser-free so it can be unit-tested deterministically
// with a mocked clock — the real-time scene can't be automated (a backgrounded
// tab freezes Phaser's rAF loop). `BeatClock` delegates its window math here;
// `SunkenBellScene` calls decideBeatGate() once per keystroke.

/** The character that marks a beat boundary inside a metered word. The hyphens
 *  in `tide-and-toll` literally denote the syllable-beats the player must land
 *  on — crossing one mid-word is gated by the beat window (the "de-sync"). */
export const BEAT_BOUNDARY = "-";

/**
 * Current accept-window width in ms. Tempo-scaled by default: the window is a
 * fixed FRACTION of the beat, so a faster tempo tightens the gate. At the slow
 * 2000ms toll with the default 0.175 fraction this is 350ms (unchanged from the
 * old constant); when the Bell-Warden's Phase 2 halves tempo to 1000ms it
 * tightens to 175ms — the "tempo-scaled timing window" (canon §5.5.7).
 *
 * Pass a `fixedWindowMs` to pin an absolute width instead (not tempo-scaled).
 */
export function windowMsFor(
  tempoMs: number,
  fixedWindowMs: number | undefined,
  windowFraction: number,
): number {
  return fixedWindowMs ?? tempoMs * windowFraction;
}

/** True if `sinceLastBeatMs` falls in the on-beat window. Asymmetric — the
 *  window opens AT the toll and runs forward, matching how players commit just
 *  after the beat hits, not before it. */
export function isOnBeat(sinceLastBeatMs: number, windowMs: number): boolean {
  return sinceLastBeatMs >= 0 && sinceLastBeatMs <= windowMs;
}

/** True if `sinceLastBeatMs` falls in the off-beat ("antiphon") window — the
 *  answer the choir sings BETWEEN the tolls. Symmetric around the half-beat
 *  (tempoMs/2), same total width as the on-beat gate. Disjoint from the on-beat
 *  window for any sane fraction (<0.5), so a keystroke is never both. */
export function isOffBeat(
  sinceLastBeatMs: number,
  tempoMs: number,
  windowMs: number,
): boolean {
  const mid = tempoMs / 2;
  return Math.abs(sinceLastBeatMs - mid) <= windowMs / 2;
}

export type BeatGateDecision =
  // Let the keystroke through to the typing controller.
  | "accept"
  // Off-beat attempt to START a claim — penalize, but no progress is lost
  // (there's nothing claimed yet). Also covers an on-beat mash during an
  // antiphon (off-beat) encounter.
  | "reject-newclaim"
  // Off-beat attempt to cross a metered word's beat boundary — the player fell
  // out of sync. Penalize AND wipe the claimed word's progress (retype it,
  // landing each beat).
  | "desync";

export interface BeatGateParams {
  /** Is a target currently claimed (i.e. are we mid-word)? */
  hasClaim: boolean;
  /** Is "now" inside the encounter's accept window? The caller resolves on- vs
   *  off-beat (antiphon) and passes the already-decided boolean. */
  inWindow: boolean;
  /** Next expected (lowercase) char of the claimed word, or null when nothing
   *  is claimed. */
  nextChar: string | null;
  /** Does this encounter beat-gate boundary chars mid-word (de-sync)? Off for
   *  free-flowing passages — canon §5.5.7: "letters within a word flow
   *  freely." On only where the design meters the rhythm (the Warden's
   *  Phase 2 hyphenated words). */
  metered: boolean;
}

/**
 * Decide what to do with a single keystroke under the Bell's rhythm rules.
 * Pure + total so the whole decision table can be asserted in a harness.
 */
export function decideBeatGate(p: BeatGateParams): BeatGateDecision {
  // Starting a NEW claim must land in-window. This is the first-keystroke gate
  // that already shipped; it's now also used with the off-beat window for
  // antiphon enemies (caller flips `inWindow` to the off-beat reading).
  if (!p.hasClaim) {
    return p.inWindow ? "accept" : "reject-newclaim";
  }
  // Mid-word: letters flow freely UNLESS this encounter is metered and we're
  // sitting on a beat boundary (a hyphen). Then the boundary must be struck
  // in-window or the player de-syncs.
  if (p.metered && p.nextChar === BEAT_BOUNDARY) {
    return p.inWindow ? "accept" : "desync";
  }
  return "accept";
}
