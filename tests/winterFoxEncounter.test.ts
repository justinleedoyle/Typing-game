import { readFileSync } from "node:fs";
import ts from "typescript";
import { committedWinterChoices, checkpointIndex, winterStep } from "../src/game/chapterFlow";
import { emptySave, SaveStore, type SaveState } from "../src/game/saveState";
import { SessionStats } from "../src/game/sessionStats";
import { assert, assertEqual, suite } from "./_assert";
import { winterFoxCareBindings as helpers } from "./_winterFoxCare";

// Execute the production encounter and checkpoint methods. The only replacement
// is the visual stage/Phaser boundary; earned saves use the real SaveStore.
const url = new URL("../src/scenes/WinterMountainScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = new Set(["checkpoint", "savedStageData", "resumeWinter", "init", "onKeyDown"]);
const methods = owner.members.filter(member => ts.isMethodDeclaration(member)
  && (names.has(member.name!.getText(source)) || /fox/i.test(member.name!.getText(source))));
const constants = source.statements.filter(ts.isVariableStatement).map(statement => statement.getText(source)).join("\n");
const code = ts.transpileModule(`${constants}\nclass Winter {
  ${methods.map(member => member.getText(source)).join("\n")}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const noop = () => {};

const { resolveWinterFoxApproach, winterFoxCareData } = helpers;

class StageBoundary {
  ended = false;
  presented: Array<{ approach: string; restored: boolean; settle: () => void }> = [];
  constructor(readonly scene: any, readonly actors: any) { scene.stageInstances.push(this); }
  present(approach: string, restored: boolean, settle: () => void) {
    this.presented.push({ approach, restored, settle });
    if (restored || this.scene.store.get().reducedMotion) settle();
  }
  destroy() { this.ended = true; }
}

const globals = {
  ...helpers, committedWinterChoices, checkpointIndex, winterStep, WinterFoxCareStage: StageBoundary,
  PALETTE_HEX: { frost: 1, ember: 2, brass: 3 },
  reducedMotion: (scene: any) => scene.store.get().reducedMotion,
  playWrenFocus: noop, playClack: noop, playChime: noop, setWrenPose: noop,
  beginAssetLoad: noop, isPuristToggleKey: () => false, togglePuristMode: noop,
  SPELL_COST: 50,
};
const Winter = new Function(...Object.keys(globals), `${code}; return Winter;`)(...Object.values(globals));
const stores: SaveStore[] = [];

function display(x = 0, y = 0): any {
  return { x, y, visible: true, scene: true, active: true,
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
    setVisible(value: boolean) { this.visible = value; return this; },
    setAlpha(value: number) { this.alpha = value; return this; },
    destroy() { this.scene = false; this.active = false; },
  };
}

function fixture(initial: SaveState = emptySave(), reopened?: SaveStore) {
  initial.typewriterAwakened = true;
  let persisted: SaveState = structuredClone(initial);
  const backend = {
    load: async () => structuredClone(persisted),
    save: async (state: SaveState) => { persisted = JSON.parse(JSON.stringify(state)); },
  };
  const store = reopened ?? new SaveStore(backend, initial, { saveDelayMs: 60_000 });
  stores.push(store);
  const scene = new Winter(), captions: string[] = [], tasks: string[] = [], waves: number[] = [];
  const targets: any[] = [], stageInstances: StageBoundary[] = [], keys: string[] = [], checkpoints: any[] = [];
  const stats = new SessionStats();
  stats.restoreCheckpoint(store.get().checkpoint?.data ?? {});
  let gate: (() => void) | null = null;
  Object.assign(scene, {
    stageInstances, scale: { width: 1920, height: 1080 },
    store, typingInput: { getStats: () => stats, reset: noop, hasClaim: () => false,
      getTypingBuffer: () => "", handleChar: (key: string) => keys.push(key) },
    wrenContainer: display(960, 842), wrenSprite: display(), scene: { isActive: () => true },
    chapterMenu: undefined, reading: { handleKey: () => false },
    narration: { say: (line: string) => captions.push(line), bottom: () => 300 },
    setNarrator: (text: string) => captions.push(text),
    band: { setObjective: (text: string) => tasks.push(text) },
    clearFireflyLantern: noop, clearHeldPelt: noop, clearReturnStage: noop, resetWrenToWinterStage: noop,
    makeWord: (options: any) => ({ ...options, getAnchorX: () => options.x, getAnchorY: () => options.y }),
    makeFoxWord: (options: any) => ({ ...options, getAnchorX: () => options.x, getAnchorY: () => options.y }),
    registerActiveTarget(...items: any[]) { scene.activeTargets = items; targets.push(...items); },
    clearActiveTargets() { scene.activeTargets = []; },
    clearFoxWordAnchors: noop,
    showFoxCompanion(options: any = {}) {
      if (scene.foxCompanion?.scene) return;
      if (!scene.foxCompanion) scene.foxCompanion = display();
      scene.foxCompanion.setPosition(options.x ?? 1250, options.y ?? 842).setVisible(true);
    },
    dismissFoxCompanion: noop,
    readThen(next: () => void) { assert(!gate, "a settled fox response retains only one held Continue"); gate = next; },
    startWave: (index: number) => waves.push(index), setShiftHeld: noop, setAltHeld: noop,
    time: { delayedCall(_delay: number, next: () => void) { return { next, remove: noop }; } },
  });
  const realCheckpoint = scene.checkpoint.bind(scene);
  scene.checkpoint = (step: string, data: any = {}) => {
    realCheckpoint(step, data); checkpoints.push(structuredClone(store.get().checkpoint));
  };
  scene.init({ store });
  return { scene, store, stats, captions, tasks, waves, targets, stageInstances, keys, checkpoints,
    active: () => scene.activeTargets as any[], gate: () => gate,
    target(word: string) {
      const target = (scene.activeTargets as any[]).find(value => value.word === word);
      assert(target, `the actual encounter exposes ${word}`); return target;
    },
    settleStage() {
      const stage = stageInstances.at(-1); assert(stage, "an actual care stage is present");
      stage.presented.at(-1)!.settle();
    },
    continue() { assert(gate, "the response is held before the next wave"); const next = gate!; gate = null; next(); },
    async reload() {
      await store.flush(); const restored = await SaveStore.load(backend, { saveDelayMs: 60_000 });
      return fixture(restored.get(), restored);
    },
  };
}

function foxCheckpoint(data: Record<string, string | number | boolean | null> = {}, step = "fox"): SaveState {
  const state = emptySave();
  state.typewriterAwakened = true;
  state.realms["winter-mountain"] = { cleared: false, choices: {} };
  state.checkpoint = { scene: "WinterMountainScene", step, data: { candles: 2, foxDecided: false, ...data } };
  return state;
}

await suite("Winter fox care: old, malformed and unrelated checkpoints cannot invent an approach", () => {
  assertEqual(resolveWinterFoxApproach(null, {}), null, "an older journey has no invented care method");
  assertEqual(resolveWinterFoxApproach(foxCheckpoint().checkpoint, {}), null, "an old fox checkpoint retains its original undecided entry");
  const malformed: Array<Record<string, string | number | boolean | null>> = [
    { foxApproach: "light" }, { foxCareVersion: 0, foxApproach: "light" },
    { foxCareVersion: 2, foxApproach: "space" }, { foxCareVersion: 1, foxApproach: "other" },
    { foxCareVersion: 1, foxApproach: true }, { foxCareVersion: "1", foxApproach: "space" },
  ];
  for (const data of malformed) {
    assertEqual(resolveWinterFoxApproach(foxCheckpoint(data).checkpoint, {}), null, "unsupported or malformed approach data falls back safely");
  }
  const valid = foxCheckpoint({ foxCareVersion: 1, foxApproach: "light" }).checkpoint!;
  assertEqual(resolveWinterFoxApproach({ ...valid, scene: "SkyIslandScene" }, {}), null, "another realm cannot seed fox care");
  assertEqual(resolveWinterFoxApproach({ ...valid, step: "wave" }, {}), null, "a later encounter cannot reopen an unfinished approach");
  assertEqual(resolveWinterFoxApproach(null, { foxApproach: "space" }), null, "uncommitted metadata alone does not become a recorded decision");
  for (const approach of ["light", "space"] as const) {
    for (const step of ["fox", "fox-answer"]) {
      assertEqual(resolveWinterFoxApproach(foxCheckpoint({ foxCareVersion: 1, foxApproach: approach }, step).checkpoint, {}), approach, "the supported fox entry and response reconstruct the exact chosen method");
    }
    assertEqual(winterFoxCareData(approach), { foxCareVersion: 1, foxApproach: approach }, "only bounded scalar metadata is serialized");
  }
  assertEqual(winterFoxCareData(null), {}, "legacy answers need no new metadata");
  assertEqual(resolveWinterFoxApproach(valid, { fox: "spared", foxApproach: "space" }), "space", "a committed remembered approach outranks an unfinished checkpoint");
  assertEqual(resolveWinterFoxApproach(null, { fox: "ignored", foxApproach: "light" }), "light", "leaving after an approach still remembers the physical method");
});

await suite("Winter fox care: ordinary and historical undecided entries show approaches without inventing kindness", () => {
  for (const placeholder of [false, true]) {
    const state = foxCheckpoint();
    if (placeholder) state.realms["winter-mountain"].choices.fox = "ignored";
    const f = fixture(state); f.scene.resumeWinter();
    assertEqual(f.active().map(target => target.word), ["offer light", "give space", "i don't have time"], "the fox entry names all available native typing commands");
    assertEqual([f.scene.foxDecided, f.scene.foxCareApproach, f.stageInstances.length, f.waves, f.gate()], [false, null, 0, [], null], "an old placeholder is still an unanswered encounter");
    assertEqual(f.store.get().almanacLore, [], "approaching cannot earn the fox's lore early");
    assertEqual(f.store.get().satchel, [], "the original compound companion gate is unchanged");
    assertEqual(f.store.get().realms["winter-mountain"].choices, {}, "uncommitted historical ignored is not promoted to a permanent refusal");
  }
});

await suite("Winter fox care: final approach character is durable before any staging and restores to reassurance", async () => {
  for (const [word, approach] of [["offer light", "light"], ["give space", "space"]] as const) {
    const state = foxCheckpoint({ statsHits: "1101", statsSoul: 37.5, statsCombo: 2, statsBestCombo: 8 });
    const f = fixture(state); f.scene.resumeWinter();
    const beforeStats = f.stats.captureCheckpoint(), choice = f.target(word);
    choice.onSettled();
    const cp = f.store.get().checkpoint!;
    assertEqual([cp.step, cp.data.foxCareVersion, cp.data.foxApproach, cp.data.foxDecided], ["fox", 1, approach, false], "the settled final character serializes only the unfinished approach");
    assertEqual([f.scene.foxCareTransitionPending, f.stageInstances.length, f.gate()], [true, 0, null], "the original word exit is guarded before the visual constructor runs");
    assertEqual(f.store.get().realms["winter-mountain"].choices, {}, "the physical method is not yet a canonical kindness decision");
    assertEqual([f.store.get().almanacLore, f.store.get().satchel, f.scene.candles, f.stats.captureCheckpoint()], [[], [], 2, beforeStats], "the approach awards no resource, lore or companion and changes no saved stakes");
    const restored = await f.reload(); restored.scene.resumeWinter();
    assertEqual(restored.stageInstances.at(-1)!.presented.map(value => [value.approach, value.restored]), [[approach, true]], "a durable unfinished approach reconstructs its settled physical state");
    assertEqual(restored.active().map(target => target.word), ["i mean no harm", "i don't have time"], "restoration directly exposes reassurance, not the already-completed approach");
    assertEqual([restored.scene.foxCareTransitionPending, restored.scene.candles, restored.stats.captureCheckpoint()], [false, 2, beforeStats], "restored care is interactive with identical resources and no timed staging wait");
    choice.onComplete();
    assertEqual(f.stageInstances.at(-1)!.presented.map(value => [value.approach, value.restored]), [[approach, false]], "normal completion starts the original visual staging path");
    assertEqual([f.active(), f.scene.foxCareTransitionPending, f.waves], [[], true, []], "no live reassurance or wolf arrives during staging");
    f.settleStage();
    assertEqual(f.active().map(target => target.word), ["i mean no harm", "i don't have time"], "only a settled stage releases the visible reassurance commands");
  }
});

await suite("Winter fox care: a final reassurance commits once before visuals and the response owns Continue", async () => {
  for (const approach of ["light", "space"] as const) {
    const f = fixture(foxCheckpoint({ foxCareVersion: 1, foxApproach: approach })); f.scene.resumeWinter();
    const kind = f.target("i mean no harm"), leave = f.target("i don't have time");
    const before = f.stats.captureCheckpoint();
    kind.onSettled();
    assertEqual(f.store.get().realms["winter-mountain"].choices, { foxApproach: approach, fox: "spared" }, "the actual final-character callback records the selected canonical answer and method");
    assertEqual([f.store.get().checkpoint!.step, f.store.get().checkpoint!.data.foxDecided, f.scene.foxCareTransitionPending, f.gate()], ["fox-answer", true, true, null], "the stable answer is durable before the held response is shown");
    kind.onSettled(); leave.onSettled();
    assertEqual(f.store.get().realms["winter-mountain"].choices.fox, "spared", "duplicate/stale opposite settlement cannot change an already-decided answer");
    assertEqual(f.store.get().almanacLore, ["the-wounded-foxs-name"], "the existing fox lore is awarded exactly once");
    assertEqual([f.store.get().satchel, f.stats.captureCheckpoint(), f.scene.candles], [[], before, 2], "trust is not an extra companion or resource reward");
    const reopened = await f.reload(); reopened.scene.resumeWinter();
    assertEqual([reopened.active(), reopened.waves, reopened.scene.foxSpared], [[], [], true], "a committed answer reloads as a settled response with no reopenable choice");
    assert(reopened.gate(), "the restored response still waits for the original deliberate Continue");
    assertEqual(reopened.captions.at(-1), approach === "light" ? "winter_fox_light_trusted" : "winter_fox_space_trusted", "the recorded method selects only its own earned reaction");
    kind.onComplete();
    assertEqual([f.active(), f.waves, f.scene.foxCareTransitionPending], [[], [], false], "visual completion reveals the held answer without starting combat");
    const continueAgain = f.gate()!; f.continue(); continueAgain();
    assertEqual(f.waves, [1], "one original Continue starts the same paired wave exactly once");
    assert(f.stageInstances.at(-1)!.ended, "leaving the fox response destroys its stage");
    assertEqual(f.store.get().realms["winter-mountain"].choices, { foxApproach: approach, fox: "spared" }, "departure preserves the original future companion eligibility");
  }
});

await suite("Winter fox care: leaving before or after an approach stays a durable refusal without lore", async () => {
  for (const approach of [null, "light", "space"] as const) {
    const f = fixture(foxCheckpoint(winterFoxCareData(approach))); f.scene.resumeWinter();
    const leave = f.target("i don't have time"); leave.onSettled();
    assertEqual([f.store.get().checkpoint!.step, f.scene.foxDecided, f.scene.foxSpared], ["fox-answer", true, false], "the final character locks the refusal before the word's visual exit");
    assertEqual(f.store.get().realms["winter-mountain"].choices, { ...(approach ? { foxApproach: approach } : {}), fox: "ignored" }, "the original ignored branch is retained, with a method only if one was actually chosen");
    f.scene.commitFoxAnswer(true); leave.onSettled();
    assertEqual([f.store.get().realms["winter-mountain"].choices.fox, f.store.get().almanacLore], ["ignored", []], "a stale kindness callback cannot reverse a refusal or award its lore");
    const restored = await f.reload(); restored.scene.resumeWinter();
    assertEqual([restored.active(), restored.captions.at(-1), restored.waves], [[], "winter_fox_dismissed", []], "refusal reloads directly into its original held response");
    leave.onComplete(); assert(f.gate(), "leaving retains the original held acknowledgment");
    f.continue(); assertEqual(f.waves, [1], "the original next-wave index remains unchanged");
  }
});

await suite("Winter fox care: legacy settled kindness and refusal never replay new approaches", () => {
  for (const spared of [true, false]) {
    const state = foxCheckpoint({ foxDecided: true }, "fox-answer");
    state.realms["winter-mountain"].choices.fox = spared ? "spared" : "ignored";
    if (spared) state.almanacLore.push("the-wounded-foxs-name");
    const f = fixture(state); f.scene.resumeWinter();
    assertEqual([f.active(), f.scene.foxSpared, f.stageInstances], [[], spared, []], "old settled answers stay settled without a fabricated new method or performance");
    assertEqual(f.captions.at(-1), spared ? "winter_fox_spared_ear" : "winter_fox_dismissed", "legacy text follows the original branch");
    assertEqual(f.store.get().checkpoint!.data.foxCareVersion, undefined, "legacy saves need no marker migration");
    f.continue(); assertEqual(f.waves, [1], "legacy Continue resumes the original campaign boundary");
  }
});

await suite("Winter fox care: early typing is owned through staging while navigation keeps pause and shortcuts", () => {
  const f = fixture(foxCheckpoint()); f.scene.resumeWinter();
  const approach = f.target("offer light"); approach.onSettled();
  let prevented = 0, pauses = 0;
  f.scene.chapterMenu = { handleKey(event: any) { if (event.key !== "Escape") return false; pauses++; return true; } };
  const event = (key: string, modifiers = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    preventDefault() { prevented++; }, ...modifiers });
  for (const key of ["Enter", " ", "x", "Backspace"]) f.scene.onKeyDown(event(key));
  f.scene.onKeyDown(event("Escape")); f.scene.onKeyDown(event("r", { metaKey: true }));
  assertEqual([prevented, pauses, f.keys], [4, 1, []], "pending visual exit absorbs typing while the existing pause menu and browser shortcuts retain ownership");
  approach.onComplete(); f.settleStage();
  f.scene.onKeyDown(event("i"));
  assertEqual(f.keys, ["i"], "ordinary typing resumes only once the care stage has settled");
});

await suite("Winter fox care: replaced approaches and scene reuse cannot settle stale choices into another journey", () => {
  const f = fixture(foxCheckpoint()); f.scene.resumeWinter();
  const light = f.target("offer light"), leave = f.target("i don't have time");
  light.onSettled(); light.onComplete();
  const staleStage = f.stageInstances.at(-1)!;
  f.scene.clearFoxCare();
  staleStage.presented.at(-1)!.settle(); leave.onSettled(); leave.onComplete();
  assertEqual([f.active(), f.waves, f.gate(), f.store.get().realms["winter-mountain"].choices], [[], [], null, {}], "destroyed-stage and old target callbacks cannot create an answer or advance combat");
  assert(staleStage.ended, "care cleanup releases its visual stage");
  const replacement = fixture(foxCheckpoint());
  f.scene.init({ store: replacement.store });
  const unchanged = JSON.stringify(replacement.store.get());
  light.onSettled(); light.onComplete(); staleStage.presented.at(-1)!.settle(); leave.onSettled(); leave.onComplete();
  assertEqual(JSON.stringify(replacement.store.get()), unchanged, "callbacks retained from the previous scene run cannot mutate the newly initialized journey");
  assertEqual([f.scene.foxCareStage, f.scene.foxCareTransitionPending, f.scene.foxCareApproach], [null, false, null], "actual init clears the previous performance, lock and physical method");
});

await Promise.all(stores.map(store => store.flush()));

