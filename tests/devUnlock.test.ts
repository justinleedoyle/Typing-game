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
