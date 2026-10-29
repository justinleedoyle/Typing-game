import type Phaser from "phaser";

type ActorLight = readonly [number, number, number, number];
type LitActor = {
  setTint?: (topLeft?: number, topRight?: number, bottomLeft?: number, bottomRight?: number) => unknown;
  clearTint?: () => unknown;
};

// Multiplicative corner light keeps the painted detail and original palette.
// The lower Forge corners catch furnace light; underwater and woodland actors
// share the cool ambient color of their paintings instead of a white spotlight.
const LIGHT: Record<string, ActorLight> = {
  ClockworkForgeScene: [0xd6c2ad, 0xe4ceb5, 0xffd6ac, 0xf5c598],
  WinterMountainScene: [0xd7e5ee, 0xc8dae8, 0xc9d7df, 0xbdcddc],
  SunkenBellScene: [0xbcd9db, 0xc7e2dd, 0x91b7c2, 0xa1c4c6],
  SkyIslandScene: [0xfff0d5, 0xffe4c2, 0xead7bd, 0xe1ceb6],
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
  actor.setTint(...light);
}

/** Damage/speaker flashes restore the scene light, not a bright white cutout. */
export function restoreSceneActorLighting(actor: LitActor): void {
  actor.clearTint?.();
  const light = actorLights.get(actor);
  if (light) actor.setTint?.(...light);
}
