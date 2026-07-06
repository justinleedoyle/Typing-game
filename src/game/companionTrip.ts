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
import {
  dismissCompanionCameo,
  playClaimLine,
  stageCompanionCameo,
  type AmbientKind,
} from "./livingScene";
import type { MovingWordEnemy } from "./movingWordEnemy";
import { PALETTE_HEX } from "./palette";
import { playWordCompleteBurst } from "./vfx";

/** Knock-back retreat + pause for a trip — a quick stumble (shorter than a
 *  reach-Wren knock-back), so the foe loses a step but comes again. Tune-later. */
const TRIP_RETREAT_MS = 450;
const TRIP_PAUSE_MS = 900;

export interface CompanionTripVisualOptions {
  textureKey: string;
  startX?: number;
  startY?: number;
  height?: number;
  depth?: number;
  color?: number;
  kind?: AmbientKind;
  entranceMs?: number;
  dismissDelayMs?: number;
  dismissMs?: number;
}

/** Trip the most-advanced live, worded, non-frozen foe (a frost dart + a step
 *  back). Returns the tripped foe, or null if nothing was advancing (the help
 *  wasn't needed). Pure-ish: only touches the enemies it's handed + the scene's
 *  VFX, so a realm calls it with whatever array it tracks (golems / ghosts). */
export function tripMostAdvancedFoe(
  scene: Phaser.Scene,
  enemies: readonly MovingWordEnemy[],
  visual?: CompanionTripVisualOptions,
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
  if (visual) playTripCameo(scene, best, visual);
  best.knockBack(TRIP_RETREAT_MS, TRIP_PAUSE_MS);
  return best;
}

function playTripCameo(
  scene: Phaser.Scene,
  enemy: MovingWordEnemy,
  opts: CompanionTripVisualOptions,
): void {
  if (!scene.textures.exists(opts.textureKey)) return;

  const color = opts.color ?? PALETTE_HEX.frost;
  const kind = opts.kind ?? "snow";
  const depth = opts.depth ?? 58;
  const targetX = enemy.container.x;
  const targetY = enemy.restY + 8;
  const startX = opts.startX ?? (targetX < scene.scale.width / 2 ? -80 : scene.scale.width + 80);
  const startY = opts.startY ?? targetY + 18;
  const fromLeft = startX < targetX;

  playClaimLine(scene, startX, startY - 42, targetX, targetY - 76, {
    color,
    depth: depth - 1,
    durationMs: 260,
  });

  const fox = stageCompanionCameo(scene, {
    textureKey: opts.textureKey,
    x: targetX + (fromLeft ? -34 : 34),
    y: targetY + 2,
    startX,
    startY,
    height: opts.height ?? 72,
    depth,
    entranceMs: opts.entranceMs ?? 340,
    restAlpha: 0.96,
    flipX: !fromLeft,
    shadowWidth: 72,
    shadowHeight: 14,
    shadowAlpha: 0.2,
    breathDy: -2,
    breathMs: 1200,
    wake: {
      kind,
      color,
      intervalMs: 90,
      spreadX: 18,
      spreadY: 10,
      offsetY: -34,
      alpha: 0.28,
      size: 3,
      depth: depth + 1,
      driftX: fromLeft ? -24 : 24,
      driftY: -24,
      durationMs: 520,
    },
    arrivalImpact: {
      kind,
      color,
      offsetY: -36,
      depth: depth + 1,
      ringRadius: 34,
      count: 7,
      durationMs: 300,
    },
  });

  scene.time.delayedCall(opts.dismissDelayMs ?? 620, () => {
    dismissCompanionCameo(scene, fox, {
      x: targetX + (fromLeft ? 120 : -120),
      y: targetY,
      durationMs: opts.dismissMs ?? 360,
    });
  });
}
