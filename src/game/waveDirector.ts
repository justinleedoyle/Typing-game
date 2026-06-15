// The speed-axis wave director.
//
// Before this, the only adaptivity was `pickAdaptiveWords` biasing toward a
// player's struggle letters — and once every letter is accurate that bias
// returns nothing, so a fast, accurate typist (the design bar) got uniform
// words, fixed enemy counts, and fixed advance speeds forever. Clearing a wave
// in 3s yielded the identical next wave as clearing it in 30s.
//
// The director closes that gap. It reads the live rolling WPM off SessionStats,
// maps it to a bounded intensity TIER, and exposes three helpers scenes call at
// spawn time to escalate the three combat levers:
//
//   • advanceMs(base)  — enemies close in FASTER as the player speeds up.
//   • enemyCount(base)  — MORE enemies on screen at once at high speed.
//   • wordLengthBias()  — fast typists draw LONGER words (a target min length
//                         that pickAdaptiveWords prefers).
//
// Fill the signal globally (SessionStats.record is the chokepoint, so every
// scene's typing feeds the same WPM read); wire the escalation opt-in per scene.
// Every lever is bounded by the tier cap so the floor RAMPS to meet the player,
// it never spikes unfairly.

import type { SessionStats } from "./sessionStats";

// ─── Tuning (starting values — tune on the live build) ──────────────────────

/** WPM at which each successive tier unlocks. tier = the count of thresholds
 *  the live WPM has passed, so 0 = warming up / casual, up to MAX_TIER for a
 *  fast accurate run. Five tiers (0–4). */
const WPM_TIER_THRESHOLDS = [25, 40, 55, 70] as const;
const MAX_TIER = WPM_TIER_THRESHOLDS.length; // 4

/** At MAX_TIER, an enemy's advance is shortened to (1 − this) of its base
 *  duration — i.e. it closes that much faster. Linear across the tiers. 0.4 ⇒
 *  top-tier enemies close in 60% of the base time (~1.7× faster). */
const ADVANCE_MAX_SHRINK = 0.4;

/** Most extra concurrent enemies the director ever asks for, at MAX_TIER. The
 *  ramp adds one per two tiers (tier 2 ⇒ +1, tier 4 ⇒ +2). Scenes still clamp
 *  this to their own available spawn slots. */
const ENEMY_MAX_EXTRA = 2;

/** Target minimum word length per tier (0 = no length pressure). Kept modest:
 *  the realm banks top out around 5–7 chars, and pickAdaptiveWords treats this
 *  as a soft preference (not a filter), so a high target just means "prefer the
 *  longest available" and degrades gracefully on small banks. */
const WORD_MIN_LENGTH_BY_TIER = [0, 0, 5, 5, 6] as const;

export class WaveDirector {
  constructor(private readonly stats: SessionStats) {}

  /** Current intensity tier 0..MAX_TIER from the live rolling WPM. */
  tier(): number {
    const wpm = this.stats.getWPM();
    let t = 0;
    for (const threshold of WPM_TIER_THRESHOLDS) {
      if (wpm >= threshold) t++;
    }
    return t;
  }

  /** Scale an enemy's advance duration DOWN as the player speeds up. Bounded:
   *  even MAX_TIER only shaves it to (1 − ADVANCE_MAX_SHRINK) of `baseMs`. */
  advanceMs(baseMs: number): number {
    const shrink = (this.tier() / MAX_TIER) * ADVANCE_MAX_SHRINK;
    return Math.round(baseMs * (1 - shrink));
  }

  /** Escalate a wave's enemy count UP at high speed, by up to ENEMY_MAX_EXTRA.
   *  The caller is responsible for clamping the result to its spawn-slot count. */
  enemyCount(base: number): number {
    const extra = Math.min(ENEMY_MAX_EXTRA, Math.floor(this.tier() / 2));
    return base + extra;
  }

  /** Target minimum word length for this tier — fed to pickAdaptiveWords so a
   *  fast typist draws longer words. 0 means no length pressure. */
  wordLengthBias(): number {
    return WORD_MIN_LENGTH_BY_TIER[this.tier()] ?? 0;
  }
}
