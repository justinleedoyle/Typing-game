// The Sunken Bell's "air" stake (canon §5.5.7 / Tier 1).
//
// Wren is holding her breath in the flooded cathedral. Staying in rhythm with
// the bell lets her breathe; falling out of sync — typing off-beat, or
// de-syncing mid-word — costs air. At empty she gasps: a non-terminal knockback
// (the Bell has no candle / game-over economy like Winter or the finale; the
// stake here is lost tempo, broken combo, and a shove back, not death).
//
// Pure + deterministic so it can be unit-tested; the scene owns the visuals and
// the knockback. All four magnitudes are "tune on live build" defaults — the
// whole stack's feel pass is deferred to one human playthrough near completion.

export const MAX_AIR = 100;

/** Air regained per clean on-beat ghost defeat — a breath. ~5 cleans refill
 *  from empty. */
const INHALE = 20;
/** Air lost per off-beat / de-sync stumble. 4 stumbles from full empties it. */
const STUMBLE_COST = 25;
/** Air restored to after a gasp knockback — a floor, not full, so the player
 *  stays pressured (one more stumble is only two away from the next gasp). */
const GASP_FLOOR = 40;

export class BreathMeter {
  private air = MAX_AIR;

  /** Current air, 0..MAX_AIR. */
  getAir(): number {
    return this.air;
  }

  /** Current air as a 0..1 fraction — for a HUD bar. */
  getFraction(): number {
    return this.air / MAX_AIR;
  }

  /** Clean on-beat completion — breathe in. Clamped at full. */
  inhale(): void {
    this.air = Math.min(MAX_AIR, this.air + INHALE);
  }

  /** Off-beat / de-sync stumble — lose air. Returns true if this drained the
   *  meter to empty, in which case the caller fires the gasp knockback and
   *  then calls gasp() to recover to the floor. */
  stumble(): boolean {
    this.air = Math.max(0, this.air - STUMBLE_COST);
    return this.air === 0;
  }

  /** Recover from a gasp knockback — air to the floor, not full. */
  gasp(): void {
    this.air = GASP_FLOOR;
  }

  /** True when out of air (a gasp is due). */
  isEmpty(): boolean {
    return this.air === 0;
  }

  reset(): void {
    this.air = MAX_AIR;
  }
}
