// snow-fox-cub's in-realm payoff (companion-trip) — the shared bit.
//
// In the finale the fox "darts in and trips a minion mid-charge." In-realm it
// does the same once a wave: knock the MOST-ADVANCED live foe back a step (a
// stumble, not a kill) with a frost dart cue. Shared by the three MovingWordEnemy
// realms it can reach forward (Bell / Forge / Wood); the Sky's scrolling banners
// have no knock-back, so the fox sits that realm out (see appliesIn in
// relicEffects.ts). The per-wave SCHEDULING + the perWaveProc gate stay in each
// scene's beginCombatWave (next to auto-ease / forgive-wave-miss); this owns only
// the "pick the leader and trip it" so the feel lives in one place.

import Phaser from "phaser";
import type { MovingWordEnemy } from "./movingWordEnemy";
import { PALETTE_HEX } from "./palette";
import { playWordCompleteBurst } from "./vfx";

/** Knock-back retreat + pause for a trip — a quick stumble (shorter than a
 *  reach-Wren knock-back), so the foe loses a step but comes again. Tune-later. */
const TRIP_RETREAT_MS = 450;
const TRIP_PAUSE_MS = 900;

/** Trip the most-advanced live, worded, non-frozen foe (a frost dart + a step
 *  back). Returns the tripped foe, or null if nothing was advancing (the help
 *  wasn't needed). Pure-ish: only touches the enemies it's handed + the scene's
 *  VFX, so a realm calls it with whatever array it tracks (golems / ghosts). */
export function tripMostAdvancedFoe(
  scene: Phaser.Scene,
  enemies: readonly MovingWordEnemy[],
): MovingWordEnemy | null {
  let best: MovingWordEnemy | null = null;
  for (const e of enemies) {
    if (e.isDefeated() || e.isFrozen() || !e.target) continue;
    if (best === null || e.advanceProgress() > best.advanceProgress()) best = e;
  }
  if (best === null) return null;
  playWordCompleteBurst(scene, best.container.x, best.restY - 80, {
    color: PALETTE_HEX.frost,
    count: 10,
    radius: 40,
  });
  best.knockBack(TRIP_RETREAT_MS, TRIP_PAUSE_MS);
  return best;
}
