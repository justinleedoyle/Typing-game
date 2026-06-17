// Pure Winter Mountain mechanics — the candle economy + the circler enemy's
// weave path. Kept Phaser-free so they're unit-testable (the real-time scene
// can't be automated — hidden-tab rAF freeze).

// ─── Candle economy ──────────────────────────────────────────────────────────
//
// Candles are a PERSISTENT pool across all of Act 2 (they already carried
// between waves). The Tier 1 change: losing all of them no longer hands back a
// full tank, and clean play earns them back — so candles are a real economy,
// not a per-attempt refill.

/** Candles the wave-reset (all candles lost) relights — a floor, NOT full. You
 *  retry the wave on the brink, not with a fresh tank. */
export const CANDLE_RESET_FLOOR = 1;

/** One candle snuffed by a wolf reaching Wren. Clamped at 0. */
export function candleAfterHit(candles: number): number {
  return Math.max(0, candles - 1);
}

/** Clean-wave bonus: clearing a wave without losing a candle relights one,
 *  capped at `max`. Skill refills the economy, not time. */
export function candleAfterCleanWave(candles: number, max: number): number {
  return Math.min(max, candles + 1);
}

// ─── Circler enemy ───────────────────────────────────────────────────────────
//
// Most wolves advance in a straight line (the audit's complaint). The circler
// weaves vertically as it closes — a flanking wolf whose floating word is
// harder to track and type.

export const CIRCLER_AMPLITUDE = 70;
export const CIRCLER_CYCLES = 2.5;

/** Vertical position of a circler wolf at scroll `progress` in [0,1], weaving
 *  `cycles` sine periods of `amplitude` px around its rest line. */
export function circlerY(
  restY: number,
  progress: number,
  amplitude: number = CIRCLER_AMPLITUDE,
  cycles: number = CIRCLER_CYCLES,
): number {
  return restY + Math.sin(progress * cycles * Math.PI * 2) * amplitude;
}
