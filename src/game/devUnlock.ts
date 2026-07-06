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
//   ?dev=great-battle&loadout=bare
//                         → unlock the finale route with an EMPTY satchel for
//                           screenshot/feel-tuning passes where relic/ally auto-
//                           clears would otherwise remove later waves too fast.
//                           TitleScene keeps this variant in-memory only so it
//                           never wipes the player's real saved satchel.
//   ?dev=clockwork-forge&satchel=snow-fox-cub
//                         → unlock the route with an exact temporary satchel for
//                           screenshot passes where one carried companion/relic
//                           should be visible without the full debug inventory.
//                           Comma-separate ids for a small mixed loadout.
//   ?dev=great-battle&loadout=bare&wave=sunken-bell
//                         → jump straight to a single finale Phase-1 realm echo
//                           for screenshot tuning, without typing through prior
//                           waves. Valid wave ids are the five realm ids below.
//   ?dev=great-battle&loadout=bare&phase=2
//   ?dev=great-battle&loadout=bare&phase=3
//                         → jump straight to the finale duel or final phrase for
//                           late-finale screenshot/feel-tuning passes.
//
// The unlock writes to the real save (tied to the player's login), so once you've
// loaded ?dev once, everything stays unlocked in normal play too. The bare-loadout
// variant is the exception: it is temporary and per-load. The jump is a per-load
// navigation shortcut (not persisted).

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

export type DevFinalePhase = "phase2" | "phase3";

export interface DevTarget {
  /** True when `?dev` is present — unlock everything. */
  readonly unlock: boolean;
  /** Set when `?dev=<target>` names a dev entry point — jump straight into it. */
  readonly realmSceneKey: string | null;
  /** Optional temporary loadout override for screenshot/feel-tuning routes. */
  readonly loadout?: "bare";
  /** Optional exact temporary satchel ids for screenshot/feel-tuning routes. */
  readonly satchelOverride?: readonly string[];
  /** Optional direct finale Phase-1 wave selector for screenshot/feel tuning. */
  readonly finaleWaveRealmId?: string;
  /** Optional direct late-finale phase selector for screenshot/feel tuning. */
  readonly finalePhase?: DevFinalePhase;
}

function parseFinalePhase(value: string): DevFinalePhase | null {
  if (value === "2" || value === "phase2" || value === "duel") return "phase2";
  if (value === "3" || value === "phase3" || value === "final") return "phase3";
  return null;
}

function parseSatchelOverride(value: string | null): string[] | null {
  if (!value) return null;
  const ids: string[] = [];
  for (const raw of value.split(",")) {
    const id = raw.trim();
    if (!Object.hasOwn(RELICS, id) || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids.length > 0 ? ids : null;
}

/** Parse the dev intent from a URL query string (location.search). Pure. */
export function parseDevTarget(search: string): DevTarget {
  const params = new URLSearchParams(search);
  if (!params.has("dev")) return { unlock: false, realmSceneKey: null };
  const realm = params.get("dev") ?? "";
  const wave = params.get("wave") ?? "";
  const bareLoadout = params.get("loadout") === "bare";
  const satchelOverride = bareLoadout
    ? null
    : parseSatchelOverride(params.get("satchel"));
  const finalePhase =
    realm === "great-battle" ? parseFinalePhase(params.get("phase") ?? "") : null;
  const finaleWaveRealmId =
    realm === "great-battle" && !finalePhase && Object.hasOwn(REALM_SCENE_KEYS, wave)
      ? wave
      : null;
  return {
    unlock: true,
    realmSceneKey: DEV_SCENE_KEYS[realm] ?? null,
    ...(bareLoadout ? { loadout: "bare" as const } : {}),
    ...(satchelOverride ? { satchelOverride } : {}),
    ...(finaleWaveRealmId ? { finaleWaveRealmId } : {}),
    ...(finalePhase ? { finalePhase } : {}),
  };
}

/** Mutate a save into the fully-unlocked dev state: every realm cleared + every
 *  relic (incl. companions) in the satchel. In-place to match SaveStore.update;
 *  preserves any existing RealmProgress fields (choices, intrusion flags). */
export function applyDevUnlock(
  s: SaveState,
  opts: { satchel?: "full" | "empty" | readonly string[] } = {},
): void {
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
  if (opts.satchel === "empty") {
    s.satchel = [];
    return;
  }
  if (Array.isArray(opts.satchel)) {
    s.satchel = [...new Set(opts.satchel.filter((id) => Object.hasOwn(RELICS, id)))];
    return;
  }
  const owned = new Set(s.satchel);
  for (const id of Object.keys(RELICS)) owned.add(id);
  s.satchel = [...owned];
}
