// Dev-only progression unlock for testing + the feel-tuning playthrough. Strictly
// opt-in via a URL param, so normal play is never affected:
//
//   ?dev                  → unlock every realm + fill the satchel (all relics +
//                           companions), persisted to the player's cloud save, then
//                           the hub opens with every portal available.
//   ?dev=clockwork-forge  → the same unlock, then jump STRAIGHT into that realm's
//                           combat (so any realm's enemies/bosses + relic effects +
//                           companion art are reachable in one hop).
//   ?dev=great-battle     → the same unlock, then jump STRAIGHT into the finale
//                           without marking the finale already cleared.
//
// The unlock writes to the real save (tied to the player's login), so once you've
// loaded ?dev once, everything stays unlocked in normal play too. The jump is a
// per-load navigation shortcut (not persisted).

import { RELICS } from "./relics";
import type { SaveState } from "./saveState";

/** Fixed-order realm ids (PortalChamberScene REALM_SEQUENCE) → their scene keys. */
export const REALM_SCENE_KEYS: Record<string, string> = {
  "winter-mountain": "WinterMountainScene",
  "sunken-bell": "SunkenBellScene",
  "clockwork-forge": "ClockworkForgeScene",
  "sky-island": "SkyIslandScene",
  "haunted-wood": "HauntedWoodScene",
};

/** Direct scene shortcuts for screenshot/feel-tuning entry points. */
export const DEV_SCENE_KEYS: Record<string, string> = {
  ...REALM_SCENE_KEYS,
  "great-battle": "GreatBattleScene",
};

export interface DevTarget {
  /** True when `?dev` is present — unlock everything. */
  readonly unlock: boolean;
  /** Set when `?dev=<target>` names a dev entry point — jump straight into it. */
  readonly realmSceneKey: string | null;
}

/** Parse the dev intent from a URL query string (location.search). Pure. */
export function parseDevTarget(search: string): DevTarget {
  const params = new URLSearchParams(search);
  if (!params.has("dev")) return { unlock: false, realmSceneKey: null };
  const realm = params.get("dev") ?? "";
  return { unlock: true, realmSceneKey: DEV_SCENE_KEYS[realm] ?? null };
}

/** Mutate a save into the fully-unlocked dev state: every realm cleared + every
 *  relic (incl. companions) in the satchel. In-place to match SaveStore.update;
 *  preserves any existing RealmProgress fields (choices, intrusion flags). */
export function applyDevUnlock(s: SaveState): void {
  // The full `?dev` shortcut is meant to land in the hub, not replay the
  // opening cinematic on a fresh profile. This is the same gate the opening
  // sets after the typewriter/doorway beat completes.
  s.typewriterAwakened = true;
  for (const id of Object.keys(REALM_SCENE_KEYS)) {
    const existing = s.realms[id];
    s.realms[id] = existing
      ? { ...existing, cleared: true }
      : { cleared: true, choices: {} };
  }
  const owned = new Set(s.satchel);
  for (const id of Object.keys(RELICS)) owned.add(id);
  s.satchel = [...owned];
}
