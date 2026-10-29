import { readFileSync } from "node:fs";
import ts from "typescript";
import { emptySave, SaveStore, SaveConflictError, type SaveBackend, type SaveConflict, type SaveState } from "../src/game/saveState";
import { applyDevUnlock, parseDevTarget } from "../src/game/devUnlock";
import { SceneRunGuard } from "../src/game/sceneRunGuard";
import { titleCheckpoint } from "../src/game/titleResume";
import { resetSave } from "../src/game/resetSave";
import { assert, assertEqual, suite } from "./_assert";

// Execute the actual Title save/transition methods without a renderer or account.
// The durable backend is a spy: every preview variant must leave it unopened.
const url = new URL("../src/scenes/TitleScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["loadStore", "beginTransition", "createTemporaryDevStore"];
const code = ts.transpileModule(`class Title { ${names.map(name => owner.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")} }`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(search: string, conflict?: SaveConflict) {
  const durable = emptySave("Earned journey");
  durable.typewriterAwakened = true;
  durable.wrenGender = "girl";
  durable.realms["winter-mountain"] = { cleared: true, choices: { fork1: "huntress" } };
  durable.satchel = ["hunters-horn"];
  durable.checkpoint = { scene: "SkyIslandScene", step: "fork2", data: {} };
  const original = JSON.stringify(durable);
  const counts = { registry: 0, load: 0, save: 0 };
  const backend: SaveBackend = {
    async load() { counts.load++; if (conflict) throw new SaveConflictError(); return structuredClone(durable); },
    async save(value) { counts.save++; Object.assign(durable, structuredClone(value)); },
    getConflict: () => conflict ?? null,
    async resolveConflict() { return durable; },
  };
  const Title = new Function("location", "parseDevTarget", "applyDevUnlock", "emptySave", "SaveStore", "SyncedBackend", "setAudioLevel", "titleCheckpoint", "Phaser",
    `${code}; return Title;`)(
    { search }, parseDevTarget, applyDevUnlock, emptySave, SaveStore,
    class { constructor() { throw new Error("unexpected default account backend"); } }, () => {}, titleCheckpoint,
    { Cameras: { Scene2D: { Events: { FADE_OUT_COMPLETE: "fade" } } } },
  );
  const scene = new Title();
  const run = new SceneRunGuard(); run.begin();
  const timers: Array<() => void> = [], entered: Array<{ key: string; data: any }> = [], choices: SaveConflict[] = [], prompts: string[] = [];
  Object.assign(scene, {
    run, registry: { get() { counts.registry++; return backend; } },
    playTitleDepartureWake() {}, redrawPromptPlate() {},
    prompt: { setText(text: string) { prompts.push(text); } },
    showSaveChoice(value: SaveConflict) { choices.push(value); },
    time: { delayedCall(_delay: number, next: () => void) { timers.push(next); } },
    cameras: { main: { fadeOut() {}, once(_event: string, next: () => void) { timers.push(next); } } },
    scene: { start(key: string, data: any) { entered.push({ key, data }); } },
  });
  return { scene, run, counts, durable, original, entered, choices, prompts,
    settle() { while (timers.length) timers.shift()!(); } };
}

await suite("Title review shortcuts: every dev URL isolates progression, actions and resets from the real save", async () => {
  for (const search of ["?dev", "?dev=not-a-realm", "?dev=clockwork-forge", "?dev=great-battle&loadout=bare",
    "?dev=haunted-wood&satchel=snow-fox-cub", "?dev=great-battle&phase=3"]) {
    const f = fixture(search), dev = parseDevTarget(search);
    const prefetched = await f.scene.loadStore();
    await f.scene.beginTransition(); f.settle();
    assertEqual(f.counts, { registry: 0, load: 0, save: 0 }, "even early Title prefetch cannot open real device/cloud storage for a review");
    assertEqual(f.entered[0]?.key, dev.realmSceneKey ?? "PortalChamberScene", "the requested diagnostic scene remains reachable");
    assertEqual(f.entered[0]?.data.store, prefetched, "the transition keeps the exact temporary store loaded before input");
    assert(prefetched.get().runId !== f.durable.runId, "review starts a distinct journey");
    assert(Object.values(prefetched.get().realms).every(realm => realm.cleared), "review unlocks stay available in memory");
    if (dev.loadout === "bare") assertEqual(prefetched.get().satchel, [], "bare review keeps its empty loadout");
    else if (dev.satchelOverride) assertEqual(prefetched.get().satchel, [...dev.satchelOverride], "exact review loadout is preserved");
    prefetched.update(state => { state.realms["great-battle"] = { cleared: true, choices: {} }; state.satchel = []; });
    await prefetched.flush();
    resetSave(prefetched); await prefetched.flush();
    assertEqual(JSON.stringify(f.durable), f.original, "review rewards and a full reset cannot alter earned progress");
    assertEqual(f.counts.save, 0, "no preview write can reach or upload through the player's backend");
  }
});

await suite("Title ordinary play: non-dev URLs load and resume the real checkpoint with normal durable writes", async () => {
  for (const search of ["", "?case=review", "?loadout=bare", "?satchel=snow-fox-cub"]) {
    const f = fixture(search);
    const store = await f.scene.loadStore(); await f.scene.beginTransition(); f.settle();
    assertEqual([f.counts.registry, f.counts.load, f.entered[0]?.key], [1, 1, "SkyIslandScene"], "unrelated parameters cannot unlock or skip the real checkpoint");
    assertEqual(store.get().runId, f.durable.runId, "ordinary play preserves the real journey identity");
    store.update(state => { state.profileName = "Continued journey"; }); await store.flush();
    assertEqual([f.counts.save, f.durable.profileName], [1, "Continued journey"], "ordinary gameplay still persists normally");
  }
});

await suite("Title conflicts: device recovery remains explicit and shutdown invalidates a pending transition", async () => {
  const conflict: SaveConflict = { kind: "device", local: emptySave("This window"), cloud: emptySave("Saved device") };
  const f = fixture("", conflict);
  await f.scene.loadStore().catch(() => {}); await f.scene.beginTransition(); f.settle();
  assertEqual(f.choices, [conflict], "actual rejected load reaches the device choice instead of opening a fresh game");
  assertEqual([f.entered.length, f.counts.save], [0, 0], "no default choice or overwrite is made");
  const stale = fixture(""); await stale.scene.loadStore(); await stale.scene.beginTransition(); stale.run.end(); stale.settle();
  assertEqual(stale.entered, [], "a late transition cannot open a journey after Title shuts down");
});
