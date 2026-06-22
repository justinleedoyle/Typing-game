// Rolling typing telemetry + the spell economy the Heart/Soul HUD reads.
//
// Heart is the rolling accuracy over the last HEART_WINDOW keystrokes — every
// press counts, hits raise it, misses pull it down. It starts at 100 (clean
// slate) and the window means a long stretch of clean typing brings it back
// up after a rough patch.
//
// Soul is the player's SPELL FUEL — a stored 0–100 balance, not a speedometer.
// Every clean keystroke pours Soul in, scaled by the current clean-streak
// COMBO, so speed is rewarded twice: a fast typist lands more chars per second
// AND climbs into the high-combo tiers sooner, on both counts filling faster.
// A miss breaks the combo (you lose momentum, not your banked Soul). Casting a
// modifier-spell SPENDS Soul — that spend is what makes it a resource instead
// of the read-only readout it used to be.
//
// Separately, a lightweight rolling SPEED read (getCPM/getWPM) tracks how fast
// the player is actually advancing words over the last SPEED_WINDOW_MS of
// correct keystrokes. It is independent of the Soul tank — Soul is a bankable
// balance, speed is an instantaneous rate that decays when typing pauses. The
// WaveDirector reads this to escalate the combat levers for a fast typist.

const HEART_WINDOW = 50;

/** Window over which the rolling speed read (CPM/WPM) is measured. */
const SPEED_WINDOW_MS = 10_000;
/** Standard "word" length for WPM = CPM / 5. */
const CHARS_PER_WORD = 5;

/** Soul is a 0–100 fuel tank. */
const SOUL_MAX = 100;
/** Base Soul poured in per clean keystroke, before the combo multiplier. */
const SOUL_PER_CHAR = 3;
/** Soul cost of one modifier-spell cast. SOUL_MAX / SPELL_COST = the number of
 *  casts you can bank at a full meter (100 / 50 = 2). Exported so scenes gate
 *  and spend against one shared number. Starting value — tune on the live build. */
export const SPELL_COST = 50;

/** Clean-streak combo → Soul-fill multiplier. Longer clean runs pour faster,
 *  which is the lever that makes raw speed matter. */
function comboMultiplier(combo: number): number {
  if (combo >= 40) return 3;
  if (combo >= 20) return 2;
  if (combo >= 8) return 1.5;
  return 1;
}

export class SessionStats {
  private hits: boolean[] = [];
  private soul = 0;
  private combo = 0;
  private bestCombo = 0;
  // Timestamps (performance.now) of recent CORRECT keystrokes, pruned to the
  // speed window. Drives getCPM/getWPM, separate from the Soul tank.
  private correctTimes: number[] = [];

  record(hit: boolean): void {
    this.hits.push(hit);
    const cap = HEART_WINDOW * 4;
    if (this.hits.length > cap) {
      this.hits.splice(0, this.hits.length - cap);
    }
    if (hit) {
      const now = performance.now();
      this.correctTimes.push(now);
      // Drop samples that have aged out of the window so the buffer stays
      // small (one splice rather than repeated shifts).
      const cutoff = now - SPEED_WINDOW_MS;
      let drop = 0;
      while (drop < this.correctTimes.length && this.correctTimes[drop] < cutoff) {
        drop++;
      }
      if (drop > 0) this.correctTimes.splice(0, drop);

      this.combo += 1;
      if (this.combo > this.bestCombo) this.bestCombo = this.combo;
      this.soul = Math.min(
        SOUL_MAX,
        this.soul + SOUL_PER_CHAR * comboMultiplier(this.combo),
      );
    } else {
      // A miss costs momentum (the combo), not the banked Soul. The difficulty
      // tier already makes a miss cost word progress; draining Soul too would
      // double-punish.
      this.combo = 0;
    }
  }

  reset(): void {
    this.hits = [];
    this.soul = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.correctTimes = [];
  }

  getHeart(): number {
    if (this.hits.length === 0) return 100;
    const recent = this.hits.slice(-HEART_WINDOW);
    const hits = recent.reduce((n, h) => n + (h ? 1 : 0), 0);
    return Math.round((hits / recent.length) * 100);
  }

  /** Current Soul fuel, 0–100. The HUD renders this directly. */
  getSoul(): number {
    return Math.round(this.soul);
  }

  /** Current clean-streak length — consecutive correct keystrokes. */
  getCombo(): number {
    return this.combo;
  }

  /** Longest clean streak this session (for end-of-run flourishes / score). */
  getBestCombo(): number {
    return this.bestCombo;
  }

  /** Rolling correct-characters-per-minute over the last SPEED_WINDOW_MS.
   *  Returns 0 until there are at least two samples in the window, and decays
   *  to 0 when typing pauses (old samples fall outside the window). This is the
   *  raw speed signal the WaveDirector maps to an intensity tier. */
  getCPM(): number {
    const now = performance.now();
    const cutoff = now - SPEED_WINDOW_MS;
    let i = 0;
    while (i < this.correctTimes.length && this.correctTimes[i] < cutoff) i++;
    const recent = this.correctTimes.length - i;
    if (recent < 2) return 0;
    // Rate over the actual span of the in-window samples; floor the span at 1s
    // so a fast micro-burst can't divide out to an absurd CPM.
    const span = Math.max(now - this.correctTimes[i], 1_000);
    return (recent / span) * 60_000;
  }

  /** Rolling words-per-minute (CPM / 5, the conventional word length). The
   *  human-readable speed read the WaveDirector tiers off. */
  getWPM(): number {
    return Math.round(this.getCPM() / CHARS_PER_WORD);
  }

  /** True if the player can afford a spell of the given Soul cost. Scenes arm
   *  their spell modifier from this at claim-time. */
  canCast(cost: number = SPELL_COST): boolean {
    return this.soul >= cost;
  }

  /** Spend Soul for a cast. Returns true if it was affordable (and deducted),
   *  false otherwise (no deduction). Call this when the cast actually fires —
   *  the guard makes a stale claim-time arm safe. */
  spendSoul(cost: number = SPELL_COST): boolean {
    if (this.soul < cost) return false;
    this.soul -= cost;
    return true;
  }

  /** Pre-pour Soul as a fraction of the full tank — the Tier 4 `soul-banked`
   *  relic (king-aurland) gives a wave a spell head-start. Clamped to the max;
   *  a fraction ≤ 0 is a no-op. Keeps SOUL_MAX encapsulated here. */
  bankSoulFraction(fraction: number): void {
    if (fraction <= 0) return;
    this.soul = Math.min(SOUL_MAX, this.soul + fraction * SOUL_MAX);
  }
}
