import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";
import { WOOD_STEPS, woodIndex, woodStep } from "../src/game/woodCheckpoint";
import { SessionStats } from "../src/game/sessionStats";
import { SaveStore, emptySave, type SaveState } from "../src/game/saveState";
import { rememberRealmFork, resolveRealmFork, rememberCompanionDecision, resolveCompanionDecision } from "../src/game/realmChoices";

// Run the production save/dispatch/story methods. Only rendering and time are inert.
const url = new URL("../src/scenes/HauntedWoodScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const constants = source.statements.filter(ts.isVariableStatement).map(node => node.getText(source)).join("\n");
const methods = owner.members.filter(ts.isMethodDeclaration).map(node => node.getText(source)).join("\n");
const code = ts.transpileModule(`${constants}\nclass Wood { ${methods} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const noop = () => {};
const globals = { WOOD_STEPS, woodIndex, woodStep, rememberRealmFork, resolveRealmFork, rememberCompanionDecision, resolveCompanionDecision,
  reducedMotion: () => true, reducedFlashes: () => true, PALETTE_HEX: { moss: 0 },
  playChime: noop, playWrenAction: noop, playWrenFocus: noop, playBodyImpact: noop,
  playRealmReturnDeparture: noop, playQuietLordIntrusion: noop,
};
const Wood = new Function(...Object.keys(globals), `${code};return Wood;`)(...Object.values(globals));
function fixture(saved = emptySave()) {
  saved.typewriterAwakened = true;
  const store = new SaveStore({ load: async () => saved, save: async () => {} }, saved);
  const scene = new Wood();
  const stats = new SessionStats();
  const targets: any[] = [], gates: Array<() => void> = [], timers: Array<() => void> = [];
  const captions: string[] = [], staged: string[] = [];
  Object.assign(scene, {
    store, revisit: false, combatSatchel: ["bells-tongue"], usedOneShots: [], checkpointStep: "arrival",
    typingInput: { getStats: () => stats }, clearActiveTargets: noop,
    fork1Choice: null, fork2Choice: null, companionChoice: null,
    band: { setObjective: noop }, narration: { say: noop },
    setNarrator: (text: string) => captions.push(text), readThen: (next: () => void) => gates.push(next),
    registerActiveTarget: (target: any) => targets.push(target),
    makeWoodForkWord: (_owner: unknown, options: any) => options,
    makeGhostKingWord: (options: any) => options, makeIngaWord: (options: any) => options, makeWord: (options: any) => options,
    ownerPassageWordPosition: () => ({ x: 600, y: 400 }),
    wrenContainer: { setPosition() { return this; }, setScale() { return this; }, setAlpha() { return this; } }, wrenSprite: {},
    tweens: { killTweensOf: noop }, scale: { width: 1920, height: 1080 },
    time: { delayedCall: (_delay: number, callback: () => void) => timers.push(callback) },
    fadeOutForkCue: noop, pulseShrine: noop, returnIngaToForeground: noop, attendInga: noop, attendGhostKing: noop,
    clearHeldWoodRelic: noop, igniteGroveLightCue: noop, showGatheredAshVial: noop,
    drawInga: () => staged.push("inga"), stageIngaAtTreeLine: () => staged.push("tree-line"),
    drawShrine: () => staged.push("shrine"), drawGhostKing: (king: boolean) => staged.push(king ? "king" : "empty-throne"),
    ensureCompassDrawn: () => staged.push("compass"),
    setAmbientMistFieldAlpha: (alpha: number) => staged.push(alpha === 0.2 ? "early-mist" : "dense-mist"), startWoodMist: () => staged.push("mist-timer"),
    showPathCue: noop, pathWrenPosition: () => ({ x: 900, y: 826 }),
    showFork1Cues: () => staged.push("fork1-props"), stageWrenAtPathEntrance: () => staged.push("path-entry"),
    showWispCatCompanion: () => staged.push("cat"), pulseWispCatCompanion: noop,
    settleWispCatByWren: (next: () => void) => { staged.push("cat-beside-wren"); next(); },
    dismissWispCatCompanion: () => staged.push("cat-departs"),
    settleBoneFluteInHand: (next: () => void) => { staged.push("flute-in-hand"); next(); },
  });
  return { scene, store, stats, targets, gates, timers, captions, staged,
    next() { assert(gates.length > 0, "a held response needs Continue"); gates.shift()!(); } };
}

await suite("Wood checkpoint: every stable boundary survives real backend reload", async () => {
  for (const step of WOOD_STEPS) {
    const f = fixture();
    f.stats.record(true); f.stats.record(false); f.stats.record(true);
    f.scene.usedOneShots = ["toll-strike"];
    f.scene.checkpoint(step, { index: 2, response: true });
    let blob = JSON.stringify(f.store.get());
    const restored = await SaveStore.load({ load: async () => JSON.parse(blob), save: async state => { blob = JSON.stringify(state); } });
    assertEqual(restored.get().checkpoint?.step, step, "the boundary is persisted");
    assertEqual(restored.get().checkpoint?.data.statsHits, "101", "rolling accuracy is retained");
    assertEqual(restored.get().checkpoint?.data.combatSatchel, "bells-tongue", "entry equipment is frozen independently of rewards");
    assertEqual(restored.get().checkpoint?.data.spentOneShots, "toll-strike", "spent charge is retained");
    assertEqual(restored.get().realms["haunted-wood"]?.cleared, false, "once-only events have a real realm record");
  }
});

await suite("Wood resume: all boundaries dispatch and rebuild the appropriate grounded stage", () => {
  const routes: Record<string, string> = { arrival: "startArrival", path: "startPathExploration", inga: "startIngaNPC", act2: "startAct2",
    "ward-intro": "startCrossroads1", ward: "startWardPractice", crossroads1: "beginCrossroads1", "crossroads1-cleared": "onCrossroads1Cleared",
    "crossroads2-intro": "startCrossroads2", crossroads2: "beginCrossroads2", "crossroads3-intro": "startCrossroads3", crossroads3: "beginCrossroads3",
    fork1: "startFork1", offering: "startFork1Offering", "offering-reward": "finishOffering", "inga-name": "startIngaNameReveal",
    "inga-name-answer": "finishIngaName", flute: "startFork1BoneFlute", "flute-reward": "finishFlute", act3: "startAct3", fork2: "startFork2",
    bargain: "startFork2Bargain", "bargain-reward": "finishBargain", force: "startFork2Force", "boss-intro": "startBossFight", "boss-a": "spawnBossWaveA",
    "boss-a-cleared": "onBossWaveACleared", "boss-b": "spawnBossWaveB", "boss-b-cleared": "onBossWaveBCleared", capstone: "startBossCapstone",
    "capstone-answer": "finishCapstone", "final-intro": "startFinalPassage", final1: "deliverFinalPassage", final2: "deliverFinalSecondPassage",
    sealed: "onFinalPassageComplete", "cat-gate": "startWispCatGate", "cat-answer": "finishCatChoice" };
  for (const step of WOOD_STEPS) {
    const f = fixture(); const called: string[] = [];
    for (const method of Object.values(routes)) f.scene[method] = () => called.push(method);
    f.scene.resumeWood({ scene: "HauntedWoodScene", step, data: { index: 1, response: true, begun: true } });
    assertEqual(called, [routes[step]], "only the saved act executes");
    if (WOOD_STEPS.indexOf(step) >= WOOD_STEPS.indexOf("ward")) assert(f.staged.includes("compass"), "learned punctuation compass persists after combat");
    if (["path", "inga"].includes(step)) assert(f.staged.includes("early-mist"), "early field remains subtle");
    if (WOOD_STEPS.indexOf(step) >= WOOD_STEPS.indexOf("act2")) assert(f.staged.includes("dense-mist"), "later scenes restore ambient mist");
    if (WOOD_STEPS.indexOf(step) >= WOOD_STEPS.indexOf("sealed")) assert(f.staged.includes("empty-throne"), "a defeated king stays absent but his throne remains");
  }
});

await suite("Wood reading: branch response resumes without retyping or repeating completed phrases", () => {
  for (const response of [false, true]) for (const index of [0, 1, 2]) {
    const f = fixture(); let complete = 0;
    const steps = [0, 1].map(i => ({ word: `phrase ${i}`, narrator: `answer ${i}` }));
    f.scene.runPassageChain(steps, () => complete++, { checkpoint: "bargain", index, response });
    if (index === 2) { assertEqual(complete, 1, "length is the settled end boundary"); continue; }
    if (response) {
      assertEqual(f.targets.length, 0, "a completed phrase has no typing target");
      assertEqual(f.captions.at(-1), `answer ${index}`, "the right response returns");
    } else {
      assertEqual(f.targets[0].word, `phrase ${index}`, "only the unfinished phrase restarts");
      f.targets[0].onComplete();
      assertEqual(f.store.get().checkpoint?.data.response, true, "completion saves before Continue");
    }
    f.next();
    assertEqual(index === 1 ? complete : f.targets.at(-1).word, index === 1 ? 1 : "phrase 1", "Continue advances once");
  }
});

await suite("Wood earned flute branch: both actual held responses reload with its locked choice and entry equipment", async () => {
  let blob = JSON.stringify({ ...emptySave(), typewriterAwakened: true, satchel: ["bells-tongue"] });
  const backend = { load: async () => JSON.parse(blob), save: async (state: SaveState) => { blob = JSON.stringify(state); } };
  const f = fixture();
  f.scene.store = await SaveStore.load(backend, { saveDelayMs: 60000 });
  f.scene.init({ store: f.scene.store });
  f.stats.record(true); f.stats.record(false); f.stats.record(true);
  f.scene.startFork1BoneFlute(); f.next();
  assertEqual(f.targets.at(-1).word, "reach in", "the original first phrase earns the held marker");
  f.targets.at(-1).onComplete();
  const restore = async (previous: ReturnType<typeof fixture>) => {
    await previous.scene.store.flush();
    const store = await SaveStore.load(backend, { saveDelayMs: 60000 });
    const next = fixture(structuredClone(store.get()) as SaveState);
    next.scene.store = store;
    next.scene.init({ store });
    next.stats.restoreCheckpoint(store.get().checkpoint!.data);
    next.scene.resumeWood(store.get().checkpoint);
    return next;
  };
  const first = await restore(f);
  assertEqual([first.targets.length, first.gates.length], [0, 1], "the earned first response stays held without retyping");
  assertEqual(first.scene.fork1Choice, "bone-flute", "the actual committed route survives backend reload");
  assertEqual(first.stats.captureCheckpoint(), f.stats.captureCheckpoint(), "held responses retain completed resources");
  first.next(); assertEqual(first.targets.at(-1).word, "take it", "Continue requests only the remaining original phrase");
  first.targets.at(-1).onComplete();
  const second = await restore(first);
  assertEqual([second.targets.length, second.gates.length], [0, 1], "the actual final phrase restores its handoff response");
  assert(second.staged.includes("flute-in-hand"), "the finished handoff is reconstructed before the response");
  second.next();
  assertEqual(second.scene.store.get().satchel, ["bells-tongue", "bone-flute"], "acknowledgment earns the original reward once");
  const reward = await restore(second);
  assertEqual(reward.scene.combatSatchel, ["bells-tongue"], "newly earned flute never activates in the entry loadout after reload");
  assertEqual(reward.scene.store.get().satchel, ["bells-tongue", "bone-flute"], "reward reload keeps one actual earned flute");
  await reward.scene.store.flush();
});

await suite("Wood passage: final-word timer gap saves the next word and never replays the first half", () => {
  const f = fixture(); let done = 0;
  f.scene.runWordByWordPassage(["but", "we", "are", "not", "silent."], () => done++, "final2", 3);
  assertEqual(f.targets[0].word, "not", "resume starts at the saved word");
  f.targets[0].onComplete();
  assertEqual(f.store.get().checkpoint?.data.index, 4, "the next index is durable before the decorative delay");
  f.timers.shift()!(); f.targets[1].onComplete(); f.timers.shift()!();
  assertEqual(done, 1, "completed passage advances once");
});

await suite("Wood completed fights: no replay during the clearance presentation delay", () => {
  for (const [before, after] of [["crossroads1", "crossroads1-cleared"], ["crossroads2", "crossroads3-intro"], ["crossroads3", "fork1"], ["boss-a", "boss-a-cleared"], ["boss-b", "boss-b-cleared"]]) {
    const f = fixture(); let callback = 0;
    f.scene.checkpointStep = before; f.scene.ghosts = [{ isDefeated: () => true }]; f.scene.onWaveCleared = () => callback++;
    f.scene.checkGhostWaveComplete();
    assertEqual(f.store.get().checkpoint?.step, after, "the settled encounter is saved before the delay");
    assertEqual(callback, 0, "the original presentation timing remains");
    f.timers.shift()!(); f.scene.checkGhostWaveComplete();
    assertEqual(callback, 1, "empty enemies cannot complete twice");
  }
});

await suite("Wood locked rewards: resume is idempotent and held cat decisions cannot change", () => {
  for (const [method, item] of [["finishOffering", "shrine-token"], ["finishFlute", "bone-flute"], ["finishBargain", "ghost-kings-promise"]]) {
    const f = fixture(); f.scene[method](); f.scene[method]();
    assertEqual(f.store.get().satchel.filter(value => value === item).length, 1, "a resumed reward is not duplicated");
  }
  for (const decision of ["call", "leave"]) {
    const f = fixture(); let ending = 0; f.scene.companionChoice = decision; f.scene.startEnding = () => ending++;
    f.scene.finishCatChoice();
    assertEqual(f.store.get().checkpoint?.step, "cat-answer", "the held choice response persists");
    assert(f.staged.includes(decision === "call" ? "cat-beside-wren" : "cat-departs"), "the choice restores its physical consequence");
    assertEqual(ending, 0, "the response is held"); f.next(); assertEqual(ending, 1, "Continue completes once");
  }
});

await suite("Wood completion: only its own checkpoint clears and revisits never overwrite progress", () => {
  for (const sceneName of ["HauntedWoodScene", "SkyIslandScene"] as const) {
    const f = fixture(); f.scene.checkpoint("boss-a");
    f.store.update(state => { state.checkpoint = { scene: sceneName, step: "boss", data: {} }; });
    f.scene.startEnding();
    assertEqual(f.store.get().realms["haunted-wood"].cleared, true, "completion is committed");
    assertEqual(f.store.get().checkpoint?.scene ?? null, sceneName === "HauntedWoodScene" ? null : sceneName, "other progress is preserved");
  }
  const f = fixture(); f.scene.revisit = true; f.scene.checkpoint("boss-a");
  assertEqual(f.store.get().checkpoint, null, "a revisit writes no unfinished checkpoint");
  assertEqual(woodStep("unknown"), "arrival", "unknown stage safely falls back");
  assertEqual([woodIndex(-3, 2), woodIndex(8, 2), woodIndex(NaN, 2), woodIndex(1.5, 2)], [0, 2, 0, 0], "indices reject malformed input");
});
