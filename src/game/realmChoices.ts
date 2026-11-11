import type { RealmProgress, SaveState } from "./saveState";

export type LaterRealm = "sunken-bell" | "clockwork-forge" | "sky-island" | "haunted-wood";
export type RealmFork = "fork1" | "fork2";
type ForkOptions = readonly [readonly [string, readonly string[]], readonly [string, readonly string[]]];
const FORKS: Record<LaterRealm, Record<RealmFork, ForkOptions>> = {
  "sunken-bell": {
    fork1: [["chant", ["quiet-chant"]], ["force", ["lock-bar"]]],
    fork2: [["free-aurland", ["king-aurland", "trident-token"]], ["claim-tongue", ["bells-tongue"]]],
  },
  "clockwork-forge": {
    fork1: [["forn", ["bellows-hammer"]], ["cabal", ["sabotage-wrench"]]],
    fork2: [["peaceful", ["master-key"]], ["fought", ["golem-heart"]]],
  },
  "sky-island": {
    fork1: [["help-etta", ["ettas-ledger"]], ["steal-flame", ["beacon-spark"]]],
    fork2: [["answer-kindly", ["wind-phrase"]], ["cut-tether", ["tether-cord", "untethered-wind"]]],
  },
  "haunted-wood": {
    fork1: [["offering", ["shrine-token"]], ["bone-flute", ["bone-flute"]]],
    fork2: [["bargain", ["ghost-kings-promise"]], ["force", ["ash-vial"]]],
  },
};

function canonical(realm: LaterRealm, fork: RealmFork, value: string | undefined): string | null {
  if (realm === "sunken-bell" && fork === "fork2" && value === "free-king") value = "free-aurland";
  if (realm === "sky-island" && fork === "fork1" && value === "beacon") value = "steal-flame";
  if (realm === "haunted-wood" && fork === "fork2" && value === "light-grove") value = "force";
  return FORKS[realm][fork].some(([choice]) => choice === value) ? value! : null;
}

/** Recorded branches outrank inventory. Old partial saves can recover a fork
 * from one side's unique reward, but both/neither sides never imply a choice. */
export function resolveRealmFork(
  realm: LaterRealm, fork: RealmFork, progress: RealmProgress | undefined, satchel: readonly string[],
): string | null {
  const explicit = canonical(realm, fork, progress?.choices[fork]);
  if (explicit) return explicit;
  if (realm === "clockwork-forge") {
    const legacy = /^(forn|cabal)-(peaceful|fought)$/.exec(progress?.choices.ending ?? "");
    if (legacy) return legacy[fork === "fork1" ? 1 : 2]!;
  }
  const present = FORKS[realm][fork].filter(([, items]) => items.some((id) => satchel.includes(id)));
  return present.length === 1 ? present[0]![0] : null;
}

/** Commit before a passage starts. Re-entering an unfinished realm can replay
 * the action, but cannot switch its branch or earn the opposite reward. */
export function rememberRealmFork(state: SaveState, realmId: LaterRealm, fork: RealmFork, requested: string): string {
  const valid = canonical(realmId, fork, requested);
  if (!valid) throw new Error(`Unknown ${realmId} ${fork} choice`);
  const progress = state.realms[realmId];
  const chosen = resolveRealmFork(realmId, fork, progress, state.satchel) ?? valid;
  const realm = progress ?? { cleared: false, choices: {} };
  // Preserve an existing recognized alias byte-for-byte for cloud compatibility.
  if (!canonical(realmId, fork, realm.choices[fork])) realm.choices[fork] = chosen;
  state.realms[realmId] = realm;
  return chosen;
}

const COMPANION: Record<LaterRealm, string> = {
  "sunken-bell": "glass-fish", "clockwork-forge": "brass-songbird",
  "sky-island": "lantern-moth", "haunted-wood": "wisp-cat",
};
export type CompanionDecision = "accepted" | "declined";
export function resolveCompanionDecision(
  realm: LaterRealm, progress: RealmProgress | undefined, satchel: readonly string[],
): CompanionDecision | null {
  const value = progress?.choices.companion;
  if (["accepted", "take", "call", "songbird"].includes(value ?? "")) return "accepted";
  if (["declined", "let-go", "leave", "none"].includes(value ?? "")) return "declined";
  return satchel.includes(COMPANION[realm]) ? "accepted" : null;
}
export function rememberCompanionDecision(
  state: SaveState, realmId: LaterRealm, requested: CompanionDecision,
): CompanionDecision {
  const progress = state.realms[realmId];
  const chosen = resolveCompanionDecision(realmId, progress, state.satchel) ?? requested;
  const realm = progress ?? { cleared: false, choices: {} };
  if (realm.choices.companion === undefined) realm.choices.companion = chosen;
  state.realms[realmId] = realm;
  return chosen;
}
