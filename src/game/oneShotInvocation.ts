// Tier 4 — the OFFENSIVE one-shot relics' keyboard-native invocation.
//
// The defensive one-shots (ward-breach / unseal / forgive-economy-miss) auto-fire
// from the shared grace pool — they need no input. The three OFFENSIVE one-shots
// (toll-strike / bind-beat / jam-foe) are player-fired, and the whole game is a
// type-a-word machine, so the native way to fire one is to TYPE it: a charged
// relic surfaces a short invocation word that the player types like any enemy
// word. No modifier (Alt dead-keys on macOS — see the finale's mixed-case
// decision), no new key plumbing — the existing prefix-match controller handles
// it because the invocation word is just another WordTarget.
//
// This module owns the PURE pieces (no Phaser): the invocation vocabulary, the
// "strongest foe" target pick, and the charge-gate predicate. The Phaser widget
// that draws the charge bar + registers the word lives in oneShotInvoker.ts; the
// realm scenes supply the live-enemy list and the per-effect consequence.

import type { CombatEffectId } from "./relicEffects";

/** The offensive one-shots fired by a typed invocation word. The defensive
 *  one-shots are deliberately NOT here — they feed the grace pool, not this. */
export const OFFENSIVE_ONE_SHOTS = [
  "toll-strike",
  "bind-beat",
  "jam-foe",
] as const;

export type OffensiveOneShot = (typeof OFFENSIVE_ONE_SHOTS)[number];

/** Narrow a CombatEffectId to the offensive-one-shot subset (so a scene can
 *  filter `loadout.oneShots` down to the ones this module fires). */
export function isOffensiveOneShot(
  effect: CombatEffectId,
): effect is OffensiveOneShot {
  return (OFFENSIVE_ONE_SHOTS as readonly string[]).includes(effect);
}

/** Whether an effect hits ONE foe (toll-strike / jam-foe → pick the strongest)
 *  or ALL live foes (bind-beat → freeze the room). Drives both target selection
 *  and the "is there anything to hit" gate. */
export function isSingleTargetOneShot(effect: OffensiveOneShot): boolean {
  return effect !== "bind-beat";
}

export interface InvocationSpec {
  readonly effect: OffensiveOneShot;
  /** The word the player types to fire it. Lowercase + case-INsensitive (no Shift
   *  required) — and chosen to not be a prefix of a realm's enemy words, or the
   *  prefix-match controller would shadow it. */
  readonly word: string;
  /** The relic's name, shown on the charging widget so the build choice is legible. */
  readonly title: string;
  /** Surfaced the moment it charges ("it's ready — type this"). */
  readonly readyCue: string;
  /** Surfaced after it fires (once per realm — it's now done). */
  readonly spentCue: string;
}

/** The invocation vocabulary — one per offensive one-shot. Words are short,
 *  thematic, and (verified per realm) not a prefix of any live enemy word. */
export const INVOCATIONS: Record<OffensiveOneShot, InvocationSpec> = {
  "toll-strike": {
    effect: "toll-strike",
    word: "toll",
    title: "the bell's tongue",
    readyCue: "the bell's tongue rings — type toll to strike the strongest foe.",
    spentCue: "the bell's tongue falls silent.",
  },
  "jam-foe": {
    effect: "jam-foe",
    word: "jam",
    title: "the sabotage wrench",
    readyCue: "the wrench is ready — type jam to seize the strongest foe.",
    spentCue: "the wrench is spent.",
  },
  "bind-beat": {
    effect: "bind-beat",
    word: "bind",
    title: "the tether cord",
    readyCue: "the tether thrums — type bind to hold them all for a breath.",
    spentCue: "the tether cord goes slack.",
  },
};

/** A live enemy summarised for "strongest foe" selection. The scene computes
 *  these from its own geometry (Forge straight advance, Wood diagonal close, …)
 *  so this stays pure and realm-agnostic. */
export interface EnemyThreat {
  /** Advance progress 0..1 toward the player (1 = about to break through). The
   *  PRIMARY urgency signal — the most-advanced foe is the most dangerous. */
  readonly progress: number;
  /** Remaining letters to type. The tiebreak: among equally-advanced foes the
   *  longer (tougher to type out) word is the "stronger" one. */
  readonly wordLength: number;
}

/** Pick the index of the "strongest foe" for a single-target one-shot
 *  (toll-strike / jam-foe): the most-advanced enemy, ties broken by the longer
 *  word. Returns null when there are no candidates. Pure + tunable — the whole
 *  notion of "strongest" lives in this one comparison. */
export function pickHardestEnemy(
  enemies: readonly EnemyThreat[],
): number | null {
  let bestIdx: number | null = null;
  let bestProgress = -Infinity;
  let bestLen = -Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]!;
    if (
      e.progress > bestProgress ||
      (e.progress === bestProgress && e.wordLength > bestLen)
    ) {
      bestIdx = i;
      bestProgress = e.progress;
      bestLen = e.wordLength;
    }
  }
  return bestIdx;
}

/** The charge gate: an offensive one-shot may fire only when it's owned-and-unused
 *  this realm, the Soul tank has reached the cost, AND there's something to hit.
 *  Pure so the gate is unit-tested away from the Phaser widget. */
export function canFireOneShot(opts: {
  soul: number;
  cost: number;
  alreadyFired: boolean;
  hasTarget: boolean;
}): boolean {
  return (
    !opts.alreadyFired && opts.soul >= opts.cost && opts.hasTarget
  );
}
