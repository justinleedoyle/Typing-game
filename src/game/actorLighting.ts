import type Phaser from "phaser";

type ActorLight = readonly [number, number, number, number];
type LitActor = {
  setTint?: (topLeft?: number, topRight?: number, bottomLeft?: number, bottomRight?: number) => unknown;
  setTintFill?: (topLeft: number, topRight?: number, bottomLeft?: number, bottomRight?: number) => unknown;
  clearTint?: () => unknown;
  tintTopLeft?: number;
  tintTopRight?: number;
  tintBottomLeft?: number;
  tintBottomRight?: number;
  tintFill?: boolean;
  scaleX?: number;
  flipX?: boolean;
  getWorldTransformMatrix?: () => { a: number };
};
export type ActorLightRegion = { x: number; y: number; width: number; height: number };

// Multiplicative corner light keeps the painted detail and original palette.
// The lower Forge corners catch furnace light; underwater and woodland actors
// share the cool ambient color of their paintings instead of a white spotlight.
const LIGHT: Record<string, ActorLight> = {
  ClockworkForgeScene: [0xd6c2ad, 0xe4ceb5, 0xffd6ac, 0xf5c598],
  WinterMountainScene: [0xd7e5ee, 0xc8dae8, 0xc9d7df, 0xbdcddc],
  SunkenBellScene: [0xbcd9db, 0xc7e2dd, 0x91b7c2, 0xa1c4c6],
  // Sunset comes from the left. The channel differences form one continuous
  // plane, so cropped painted fingers can share the body's exact gradient.
  SkyIslandScene: [0xffedce, 0xe9dfcc, 0xe8d4b8, 0xd2c6b6],
  HauntedWoodScene: [0xc2d1d4, 0xc9d7d3, 0x9fafaa, 0xa8b6ac],
  GreatBattleScene: [0xc9c7d3, 0xc1c4d1, 0xd7c0ad, 0xcbbbad],
  OpeningScene: [0xf0dfc5, 0xddcdb8, 0xd7c2a5, 0xd2bea6],
  HomecomingScene: [0xf0dfc5, 0xddcdb8, 0xd7c2a5, 0xd2bea6],
  PortalChamberScene: [0xebdbbd, 0xd9cfba, 0xd4c0a2, 0xcfc0a9],
};
const actorLights = new WeakMap<object, ActorLight>();

/** Apply only to world figures, never word labels, portraits or glowing ghosts. */
export function applySceneActorLighting(scene: Phaser.Scene, actor: LitActor): void {
  const light = LIGHT[scene.sys?.settings?.key ?? ""];
  if (!light || !actor.setTint) return;
  actorLights.set(actor, light);
  refreshSceneActorLighting(actor);
}

/** Reorient ambient light after a pose turns, without shortening a fill flash. */
export function refreshSceneActorLighting(actor: LitActor): void {
  const light = actorLights.get(actor);
  if (!light || actor.tintFill) return;
  const mirrored = ((actor.getWorldTransformMatrix?.().a ?? actor.scaleX ?? 1) < 0) !== !!actor.flipX;
  actor.setTint?.(...(mirrored ? [light[1], light[0], light[3], light[2]] as const : light));
}

/** Damage/speaker flashes restore the scene light, not a bright white cutout. */
export function restoreSceneActorLighting(actor: LitActor): void {
  actor.clearTint?.();
  refreshSceneActorLighting(actor);
}

/** A cropped overlay samples the same source-image light as the body below it.
 * Phaser splits its quad on TL–BR, rather than using bilinear interpolation. */
export function matchActorCropLighting(source: LitActor, crop: LitActor, region: ActorLightRegion): void {
  const light = [source.tintTopLeft, source.tintTopRight, source.tintBottomLeft, source.tintBottomRight];
  if (light.some(color => color === undefined)) return;
  const [tl, tr, bl, br] = light as [number, number, number, number];
  const sample = (x: number, y: number): number => {
    const colors = y >= x ? [tl, bl, br] : [tl, tr, br];
    const weights = y >= x ? [1 - y, y - x, x] : [1 - x, x - y, y];
    let result = 0;
    for (const shift of [16, 8, 0]) {
      const channel = colors.reduce((sum, color, index) => sum + ((color >> shift) & 255) * weights[index], 0);
      result |= Math.round(channel) << shift;
    }
    return result;
  };
  const { x, y, width, height } = region;
  const corners = [sample(x, y), sample(x + width, y), sample(x, y + height), sample(x + width, y + height)] as const;
  if (source.tintFill) crop.setTintFill?.(...corners);
  else crop.setTint?.(...corners);
}
