// Logic harness: the dev-unlock URL parsing + save mutation (src/game/devUnlock.ts).
// The opt-in ?dev testing shortcut must (a) only trigger on ?dev, (b) map a realm
// id to its scene key for the jump, and (c) unlock every realm + the full satchel
// without clobbering existing progress.

import { assert, assertEqual, suite } from "./_assert";

import {
  parseDevTarget,
  applyDevUnlock,
  DEV_SCENE_KEYS,
  REALM_SCENE_KEYS,
} from "../src/game/devUnlock";
import type { SaveState } from "../src/game/saveState";
import { RELICS } from "../src/game/relics";

// A minimal save touching only what applyDevUnlock reads/writes (opening gate,
// realms, and satchel). Built locally so this harness doesn't import saveState's runtime
// (which pulls in the supabase client → realtime WebSocket init that crashes
// under Node < 22 if imported before the suite's process.exit).
function freshSave(): SaveState {
  return { typewriterAwakened: false, realms: {}, satchel: [] } as unknown as SaveState;
}

await suite("parseDevTarget: only triggers on ?dev", () => {
  assertEqual(
    parseDevTarget(""),
    { unlock: false, realmSceneKey: null },
    "no query → no unlock",
  );
  assertEqual(
    parseDevTarget("?other=1&x=2"),
    { unlock: false, realmSceneKey: null },
    "unrelated params → no unlock",
  );
  assertEqual(
    parseDevTarget("?dev"),
    { unlock: true, realmSceneKey: null },
    "?dev → unlock, no jump (hub)",
  );
});

await suite("parseDevTarget: ?dev=<target> resolves the scene-key jump", () => {
  assertEqual(
    parseDevTarget("?dev=clockwork-forge"),
    { unlock: true, realmSceneKey: "ClockworkForgeScene" },
    "valid realm → jump",
  );
  assertEqual(
    parseDevTarget("?dev=haunted-wood"),
    { unlock: true, realmSceneKey: "HauntedWoodScene" },
    "valid realm → jump",
  );
  assertEqual(
    parseDevTarget("?dev=great-battle"),
    { unlock: true, realmSceneKey: "GreatBattleScene" },
    "finale target → jump",
  );
  assertEqual(
    parseDevTarget("?dev=not-a-realm"),
    { unlock: true, realmSceneKey: null },
    "unknown realm → unlock but no jump (falls through to hub)",
  );
  assertEqual(
    parseDevTarget("?dev=great-battle&loadout=bare"),
    { unlock: true, realmSceneKey: "GreatBattleScene", loadout: "bare" },
    "bare finale route → jump with temporary empty loadout",
  );
  assertEqual(
    parseDevTarget("?dev=clockwork-forge&satchel=snow-fox-cub"),
    {
      unlock: true,
      realmSceneKey: "ClockworkForgeScene",
      satchelOverride: ["snow-fox-cub"],
    },
    "targeted satchel route → jump with a temporary exact loadout",
  );
  assertEqual(
    parseDevTarget("?dev=haunted-wood&satchel=snow-fox-cub,bells-tongue,snow-fox-cub,not-real"),
    {
      unlock: true,
      realmSceneKey: "HauntedWoodScene",
      satchelOverride: ["snow-fox-cub", "bells-tongue"],
    },
    "targeted satchel route dedupes known ids and ignores unknown ids",
  );
  assertEqual(
    parseDevTarget("?dev=sunken-bell&satchel=not-real"),
    { unlock: true, realmSceneKey: "SunkenBellScene" },
    "unknown targeted satchel ids are ignored",
  );
  assertEqual(
    parseDevTarget("?dev=great-battle&loadout=bare&satchel=snow-fox-cub"),
    { unlock: true, realmSceneKey: "GreatBattleScene", loadout: "bare" },
    "bare loadout takes precedence over a targeted satchel",
  );
  assertEqual(
    parseDevTarget("?dev=great-battle&loadout=bare&wave=sunken-bell"),
    {
      unlock: true,
      realmSceneKey: "GreatBattleScene",
      loadout: "bare",
      finaleWaveRealmId: "sunken-bell",
    },
    "bare finale route can jump directly to a single realm echo wave",
  );
  assertEqual(
    parseDevTarget("?dev=great-battle&loadout=bare&phase=2"),
    {
      unlock: true,
      realmSceneKey: "GreatBattleScene",
      loadout: "bare",
      finalePhase: "phase2",
    },
    "bare finale route can jump directly to the duel phase",
  );
  assertEqual(
    parseDevTarget("?dev=great-battle&loadout=bare&phase=final"),
    {
      unlock: true,
      realmSceneKey: "GreatBattleScene",
      loadout: "bare",
      finalePhase: "phase3",
    },
    "bare finale route can jump directly to the final phrase phase",
  );
  assertEqual(
    parseDevTarget("?dev=great-battle&loadout=bare&phase=3&wave=sunken-bell"),
    {
      unlock: true,
      realmSceneKey: "GreatBattleScene",
      loadout: "bare",
      finalePhase: "phase3",
    },
    "finale phase selector takes precedence over a Phase-1 wave selector",
  );
  assertEqual(
    parseDevTarget("?dev=great-battle&loadout=bare&wave=not-a-realm"),
    { unlock: true, realmSceneKey: "GreatBattleScene", loadout: "bare" },
    "unknown finale wave selectors are ignored",
  );
  assertEqual(
    parseDevTarget("?dev=great-battle&loadout=bare&phase=not-a-phase"),
    { unlock: true, realmSceneKey: "GreatBattleScene", loadout: "bare" },
    "unknown finale phase selectors are ignored",
  );
  assertEqual(
    parseDevTarget("?dev=sunken-bell&wave=clockwork-forge"),
    { unlock: true, realmSceneKey: "SunkenBellScene" },
    "wave selector only applies to direct finale jumps",
  );
  assertEqual(
    parseDevTarget("?dev=sunken-bell&phase=2"),
    { unlock: true, realmSceneKey: "SunkenBellScene" },
    "phase selector only applies to direct finale jumps",
  );
  assertEqual(
    parseDevTarget("?dev=great-battle&loadout=full"),
    { unlock: true, realmSceneKey: "GreatBattleScene" },
    "unknown loadout values keep the standard full-satchel behavior",
  );
  // Every mapped dev target resolves to a registered-looking scene key.
  for (const [id, key] of Object.entries(DEV_SCENE_KEYS)) {
    assertEqual(
      parseDevTarget(`?dev=${id}`).realmSceneKey,
      key,
      `${id} → ${key}`,
    );
  }
});

await suite("applyDevUnlock: clears every realm + fills the satchel", () => {
  const s = freshSave();
  applyDevUnlock(s);
  assert(s.typewriterAwakened === true, "opening gate is complete so ?dev opens the hub");
  for (const id of Object.keys(REALM_SCENE_KEYS)) {
    assert(s.realms[id]?.cleared === true, `${id} cleared`);
  }
  assert(
    s.realms["great-battle"]?.cleared !== true,
    "finale is not pre-cleared by the unlock",
  );
  assertEqual(
    new Set(s.satchel).size,
    Object.keys(RELICS).length,
    "satchel holds every relic (incl. companions)",
  );
  for (const id of Object.keys(RELICS)) {
    assert(s.satchel.includes(id), `satchel has ${id}`);
  }
});

await suite("applyDevUnlock: can intentionally leave the satchel empty", () => {
  const s = freshSave();
  s.satchel = ["bells-tongue"];
  applyDevUnlock(s, { satchel: "empty" });
  assert(s.typewriterAwakened === true, "opening gate still completes");
  for (const id of Object.keys(REALM_SCENE_KEYS)) {
    assert(s.realms[id]?.cleared === true, `${id} cleared`);
  }
  assertEqual(s.satchel, [], "temporary bare route has no relic/companion loadout");
});

await suite("applyDevUnlock: can use an exact temporary satchel", () => {
  const s = freshSave();
  s.satchel = ["bells-tongue", "quiet-chant"];
  applyDevUnlock(s, { satchel: ["snow-fox-cub", "bells-tongue", "snow-fox-cub", "not-real"] });
  assert(s.typewriterAwakened === true, "opening gate still completes");
  for (const id of Object.keys(REALM_SCENE_KEYS)) {
    assert(s.realms[id]?.cleared === true, `${id} cleared`);
  }
  assertEqual(
    s.satchel,
    ["snow-fox-cub", "bells-tongue"],
    "temporary targeted route uses only the requested known ids",
  );
});

await suite("applyDevUnlock: preserves existing progress + dedupes satchel", () => {
  const s = freshSave();
  s.realms["clockwork-forge"] = {
    cleared: false,
    choices: { fork1: "forn" },
    quietLordIntruded: true,
  };
  s.satchel = ["bells-tongue"]; // already owned
  applyDevUnlock(s);
  // existing choices + flags survive, cleared flips true
  assertEqual(s.realms["clockwork-forge"]!.choices, { fork1: "forn" }, "choices kept");
  assert(s.realms["clockwork-forge"]!.quietLordIntruded === true, "flag kept");
  assert(s.realms["clockwork-forge"]!.cleared === true, "now cleared");
  // no duplicate of the already-owned relic
  assertEqual(
    s.satchel.filter((r) => r === "bells-tongue").length,
    1,
    "no duplicate satchel entry",
  );
});
