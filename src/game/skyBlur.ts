// Pure Sky-Island blur / triage math.
//
// Kept Phaser-free so the realm's signature mechanic is unit-testable — the
// real-time scene can't be automated (a backgrounded tab freezes Phaser's rAF
// loop). The scene's update() and ScrollingPhrase call these; the visuals live
// there.
//
// The Sky signature is the lantern-beams "eating" the letters you haven't typed
// yet: a banner scrolling through a beam has its untyped suffix masked, so you
// must READ AHEAD and type before the light reaches the words (it was cosmetic
// alpha you could wait out before — see the audit).

/** Blur intensity in [0,1] for a banner whose center sits at screen-x `x`,
 *  given the lantern beam center xs and each beam's radius. 0 = clear (in a gap
 *  between beams), 1 = dead center of the nearest beam. Closest beam wins. */
export function blurAmountAt(
  x: number,
  beamXs: readonly number[],
  radius: number,
): number {
  if (radius <= 0) return 0;
  let minDist = Infinity;
  for (const bx of beamXs) {
    const d = Math.abs(x - bx);
    if (d < minDist) minDist = d;
  }
  if (minDist >= radius) return 0;
  return 1 - minDist / radius;
}

/** The blur level at/above which the untyped suffix is "eaten" (masked). Below
 *  it the banner just dims; at/above it the player can no longer read ahead. */
export const SUFFIX_EAT_THRESHOLD = 0.4;

/** Whether the untyped suffix should be masked at this blur level. */
export function shouldEatSuffix(
  blurAmount: number,
  threshold: number = SUFFIX_EAT_THRESHOLD,
): boolean {
  return blurAmount >= threshold;
}

/** Banner alpha for a blur level — dimmed but still locatable (you need to see
 *  WHERE a banner is to triage it, even when its text is eaten). Never below
 *  0.6 so a masked banner doesn't vanish. */
export function blurAlphaFor(blurAmount: number): number {
  const clamped = Math.max(0, Math.min(1, blurAmount));
  return 1 - clamped * 0.4;
}

/** Where a scrolling banner's danger tint begins, as a fraction of its scroll. */
export const BANNER_DANGER_RAMP_START = 0.6;

/** Danger ramp in [0,1] for a scrolling banner from its scroll progress [0,1]:
 *  stays 0 until `rampStart`, then ramps to 1 as it nears the exit edge. Drives
 *  the cream → ember triage urgency cue. */
export function bannerDangerAt(
  progress: number,
  rampStart: number = BANNER_DANGER_RAMP_START,
): number {
  if (progress <= rampStart) return 0;
  if (rampStart >= 1) return 0;
  return Math.min(1, (progress - rampStart) / (1 - rampStart));
}
