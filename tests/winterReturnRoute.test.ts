import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  winterReturnRoute, winterRouteActions, winterRouteProgress, winterReturnPending,
  winterRouteMemory, WINTER_ROUTE_REACTIONS,
} from "../src/game/winterReturnRoute";
import { checkpointIndex, committedWinterChoices, winterStep } from "../src/game/chapterFlow";
import { emptySave, SaveStore, type SaveState } from "../src/game/saveState";
import { SessionStats } from "../src/game/sessionStats";
import { winterFoxCareBindings } from "./_winterFoxCare";
import { winterRealmSummary } from "../src/game/realmLore";
import { assert, assertEqual, suite } from "./_assert";

await suite("Winter return route: only explicit versioned decisions create a route or completed memory", () => {
  for (const choices of [{}, { returnRoute: "crossing" }, { returnRouteVersion: "0", returnRoute: "bank" },
    { returnRouteVersion: "2", returnRoute: "crossing" }, { returnRouteVersion: "1", returnRoute: "other" },
    { returnRouteVersion: "1", returnRouteDone: "1" }]) {
    assertEqual(winterReturnRoute(choices), null, "missing, unsupported and unknown route records stay legacy");
    assertEqual(winterReturnPending(choices), false, "legacy journeys do not acquire new return work");
    assertEqual(winterRouteMemory(choices), "", "a historical or malformed record cannot invent a prepared or walked route");
  }
  for (const route of ["crossing", "bank"] as const) {
    const choices = { returnRouteVersion: "1", returnRoute: route };
    assertEqual(winterReturnRoute(choices), route, "an explicit version1 choice is recognized exactly");
    assertEqual([winterReturnPending(choices), winterRouteMemory(choices)], [route === "bank", ""], "a crossing is unavailable until its preparation is actually committed");
    const complete = { ...choices, ...(route === "crossing" ? { returnPrepared: "1" } : {}), returnRouteDone: "1" };
    assertEqual(winterReturnPending(complete), false, "a completed return cannot be offered again");
    const memory = winterRouteMemory(complete);
    assert(memory.includes(route === "crossing" ? "prepared a pine crossing" : "left the crossing alone"), "the completed memory names the actually chosen path");
    assert(!memory.includes(route === "crossing" ? "ducked along the bank" : "prepared a pine crossing"), "the other route is never claimed");
  }
});

await suite("Winter return route: preparation and homeward actions encode the real work ordering", () => {
  assertEqual(winterRouteActions("crossing", "prepare"), ["seat", "brace"], "the crossing requires two explicit preparation actions before climbing");
  assertEqual(winterRouteActions("bank", "prepare"), [], "the bank defers work rather than granting a fake preparation task");
  assertEqual(winterRouteActions("crossing", "return"), ["cross"], "the prepared crossing is available as one actual homeward action");
  assertEqual(winterRouteActions("bank", "return"), ["step", "duck"], "the bank has its different physical return sequence");
  const actions = new Set([...[...winterRouteActions("crossing", "prepare")], ...winterRouteActions("crossing", "return"), ...winterRouteActions("bank", "return")]);
  assertEqual(actions.size, 5, "the two routes expose five distinct physical actions");
  for (const action of actions) assert(WINTER_ROUTE_REACTIONS[action].length > 30, "every completed physical action has an authored reaction");
});

await suite("Winter return route: checkpoint indexes are bounded and only version1 restores held reading", () => {
  for (const length of [0, 1, 2]) {
    for (const index of [-2, 2.5, Number.NaN, Number.POSITIVE_INFINITY, "1", true, null, undefined]) {
      const data = { returnRouteVersion: 1, ...(index !== undefined ? { index } : {}) } as any;
      assertEqual(winterRouteProgress(data, length), { index: 0, reading: false }, "invalid partial action progress safely starts at a real action");
    }
    assertEqual(winterRouteProgress({ returnRouteVersion: 1, index: 999, reading: true }, length), {
      index: Math.max(0, length - 1), reading: true,
    }, "an out-of-range index restores only the final valid held response");
  }
  assertEqual(winterRouteProgress({ index: 1, reading: true }, 2), { index: 1, reading: false }, "unversioned data cannot invent a completed held action");
  assertEqual(winterRouteProgress({ returnRouteVersion: 2, index: 1, reading: true }, 2), { index: 1, reading: false }, "future metadata cannot masquerade as a known held response");
  assertEqual(winterRouteProgress({ returnRouteVersion: 1, index: 1, reading: true }, 2), { index: 1, reading: true }, "a valid completed action restores its actual reading boundary");
});

const url = new URL("../src/scenes/WinterMountainScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = new Set(["init", "checkpoint", "savedStageData", "resumeWinter", "onKeyDown", "runPassageChain", "startEnding"]);
const methods = owner.members.filter(member => ts.isMethodDeclaration(member)
  && (names.has(member.name!.getText(source)) || /Return/.test(member.name!.getText(source))));
const constants = source.statements.filter(ts.isVariableStatement).map(statement => statement.getText(source)).join("\n");
const code = ts.transpileModule(`${constants}\nclass Winter {
  ${methods.map(member => member.getText(source)).join("\n")}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const noop = () => {};
class ReturnStageBoundary {
  ended = false;
  presentations: any[] = [];
  approaches: string[] = [];
  performances: Array<{ action: string; done: () => void }> = [];
  subjects = new Map<string, any>();
  constructor(scene: any, actors: any) {
    if (scene.actualReturnStage) { const stage = scene.actualReturnStage(actors); scene.stages.push(stage); return stage; }
    scene.stages.push(this);
  }
  present(route: string | null, phase: string, completed: number) { this.presentations.push({ route, phase, completed }); }
  subject(action: string) {
    if (!this.subjects.has(action)) this.subjects.set(action, { action, scene: true, x: 980, y: 810 });
    return this.subjects.get(action);
  }
  approach(action: string) { this.approaches.push(action); }
  perform(action: string, done: () => void) { this.performances.push({ action, done }); }
  destroy() { this.ended = true; }
}
const globals = {
  ...winterFoxCareBindings, winterReturnRoute, winterRouteActions, winterRouteProgress,
  winterReturnPending, WINTER_ROUTE_REACTIONS, checkpointIndex, committedWinterChoices, winterStep,
  WinterReturnStage: ReturnStageBoundary,
  PALETTE_HEX: { frost: 1, ember: 2, brass: 3 },
  playWrenFocus: noop, playWrenAction: noop, playClack: noop, playChime: noop, setWrenPose: noop,
  playBodyImpact: noop, playBodyTypePulse: noop, playClaimLine: noop, playActorAttention: noop,
  beginAssetLoad: noop, isPuristToggleKey: () => false, togglePuristMode: noop, SPELL_COST: 50,
  reducedMotion: (scene: any) => scene.store.get().reducedMotion,
};
const Winter = new Function(...Object.keys(globals), `${code}; return Winter;`)(...Object.values(globals));
const stores: SaveStore[] = [];
function routeState(step = "return-plan", branch: "huntress" | "firefly" = "huntress", route?: "crossing" | "bank"): SaveState {
  const state = emptySave(); state.typewriterAwakened = true;
  state.realms["winter-mountain"] = { cleared: false, choices: { fox: "spared", fork1: branch,
    ...(route ? { returnRouteVersion: "1", returnRoute: route } : {}) } };
  state.almanacLore = ["the-wounded-foxs-name", branch === "huntress" ? "the-huntress-song" : "the-firefly-trail"];
  state.checkpoint = { scene: "WinterMountainScene", step,
    data: { candles: 2, foxDecided: true, statsHits: "1101", statsSoul: 37.5, statsCombo: 2, statsBestCombo: 8 } };
  return state;
}
function fixture(initial: SaveState = routeState(), reopened?: SaveStore, persistedBackend?: any) {
  let persisted = structuredClone(initial);
  const backend = persistedBackend ?? { load: async () => structuredClone(persisted),
    save: async (value: SaveState) => { persisted = JSON.parse(JSON.stringify(value)); } };
  const store = reopened ?? new SaveStore(backend, initial, { saveDelayMs: 60_000 }); stores.push(store);
  const scene = new Winter(), stages: ReturnStageBoundary[] = [], targets: any[] = [], keys: string[] = [];
  const waves: number[] = [], endings: number[] = [], captions: string[] = [], tasks: string[] = [], checkpoints: any[] = [];
  const stats = new SessionStats(); stats.restoreCheckpoint(store.get().checkpoint?.data ?? {});
  let gate: (() => void) | null = null;
  const scheduled: Array<{ delay: number; next: () => void }> = [];
  Object.assign(scene, {
    stages, store, typingInput: { getStats: () => stats, handleChar: (key: string) => keys.push(key) },
    scale: { width: 1920, height: 1080 }, wrenContainer: { scene: true, x: 960, y: 842 }, wrenSprite: {},
    huntressHornTransferToken: 0, trailGeneration: 0,
    clearFireflyLantern: noop, clearHeldPelt: noop, clearWinterForkCues: noop, resetWrenToWinterStage: noop,
    tweens: { killTweensOf: noop },
    narration: { bottom: () => 300, say: (line: string) => captions.push(line) },
    setNarrator: (line: string) => captions.push(line), band: { setObjective: (line: string) => tasks.push(line) },
    makeWord: (options: any) => ({ ...options, getAnchorX: () => options.x, getAnchorY: () => options.y }),
    makeWinterForkWord: (subject: any, options: any) => ({ ...options, subject, getAnchorX: () => options.x, getAnchorY: () => options.y }),
    registerActiveTarget(...values: any[]) { scene.activeTargets = values; targets.push(...values); },
    clearActiveTargets() { scene.activeTargets = []; },
    winterPassageOwnerBinding: () => null,
    presentWinterPassageReaction(_owner: string, _step: number, reaction: string, next: () => void) {
      captions.push(reaction); scene.readThen(next);
    },
    readThen(next: () => void) { assert(!gate, "only the visible current response owns Continue"); gate = next; },
    reading: { handleKey: () => false }, chapterMenu: undefined, setShiftHeld: noop, setAltHeld: noop,
    time: { delayedCall(delay: number, next: () => void) { scheduled.push({ delay, next }); return { remove: noop }; } },
    startWave: (index: number) => waves.push(index), startEnding: () => endings.push(1), showAlmanacStamp: noop,
  });
  const checkpoint = scene.checkpoint.bind(scene);
  scene.checkpoint = (step: string, data: any = {}) => { checkpoint(step, data); checkpoints.push(structuredClone(store.get().checkpoint)); };
  scene.init({ store });
  return { scene, store, stats, stages, targets, keys, waves, endings, captions, tasks, checkpoints, scheduled,
    active: () => scene.activeTargets as any[], gate: () => gate,
    target(word: string) { const target = (scene.activeTargets as any[]).find(value => value.word === word);
      assert(target, `the actual route exposes ${word}`); return target; },
    continue() { assert(gate, "a held route response waits for native Continue"); const next = gate!; gate = null; next(); },
    settle() { const action = stages.at(-1)?.performances.at(-1); assert(action, "a physical action is pending"); action.done(); },
    async reload() { await store.flush(); const restored = await SaveStore.load(backend, { saveDelayMs: 60_000 }); return fixture(restored.get(), restored, backend); },
  };
}

await suite("Winter return route: both original Fork1 passages save the new decision before their delayed transition", async () => {
  for (const branch of ["huntress", "firefly"] as const) {
    const f = fixture(routeState(branch, branch)); let done = 0;
    f.scene.runPassageChain(["one"], ["a held original response"], () => { done++; }, "none", undefined, branch);
    f.target("one").onComplete();
    assertEqual([f.store.get().checkpoint!.step, f.gate() !== null, done], [branch, true, 0], "the original earned phrase holds its response first");
    f.continue();
    assertEqual([f.store.get().checkpoint!.step, f.store.get().checkpoint!.data.returnRouteVersion, done], ["return-plan", 1, 0], "the new decision is durable before the original900ms callback");
    assertEqual(f.scheduled.map(value => value.delay), [900], "the passage's original presentation interval is retained");
    const resumed = await f.reload(); resumed.scene.resumeWinter();
    assertEqual(resumed.active().map(target => target.word), ["prepare the crossing", "take the bank"], "reload cannot jump past the new choice into the pack");
    assertEqual(resumed.store.get().realms["winter-mountain"].choices.fork1, branch, "the new nested route never changes the canonical original fork");
    f.scheduled.shift()!.next(); assertEqual(done, 1, "the existing delayed continuation still runs once");
  }
});

await suite("Winter return route: final choice character locks the route before visuals without an extra reward", async () => {
  for (const branch of ["huntress", "firefly"] as const) for (const route of ["crossing", "bank"] as const) {
    const f = fixture(routeState("return-plan", branch)); f.scene.resumeWinter();
    const before = { stats: f.stats.captureCheckpoint(), lore: [...f.store.get().almanacLore], satchel: [...f.store.get().satchel] };
    const chosen = f.target(route === "crossing" ? "prepare the crossing" : "take the bank");
    chosen.onSettled();
    const cp = f.store.get().checkpoint!;
    assertEqual([cp.step, cp.data.index, cp.data.reading, cp.data.returnRouteVersion], ["return-prep", 0, route === "bank", 1], "the final character serializes the exact next preparation boundary");
    assertEqual([winterReturnRoute(f.store.get().realms["winter-mountain"].choices), f.scene.returnTransitionPending], [route, true], "the chosen route is locked through the word exit");
    f.scene.commitReturnRoute(route === "crossing" ? "bank" : "crossing");
    assertEqual(winterReturnRoute(f.store.get().realms["winter-mountain"].choices), route, "an opposite settlement cannot switch the committed route");
    assertEqual({ stats: f.stats.captureCheckpoint(), lore: f.store.get().almanacLore, satchel: f.store.get().satchel }, before, "route bookkeeping changes no stats, lore cardinality or inventory");
    assertEqual([f.scene.candles, f.waves, f.endings], [2, [], []], "no combat or reward starts during the completion exit");
    const restored = await f.reload(); restored.scene.resumeWinter();
    assertEqual(restored.store.get().realms["winter-mountain"].choices.fork1, branch, "all four original-fork/route combinations retain the original choice");
    if (route === "crossing") assertEqual(restored.active().map(target => target.word), ["seat"], "a chosen crossing still requires its actual preparation");
    else assert(restored.gate() && restored.active().length === 0, "bank entry holds its ready response with no fabricated work");
    assertEqual(restored.stats.captureCheckpoint(), before.stats, "the actual durable reload preserves Heart, fractional Soul and streaks");
    chosen.onComplete();
    if (route === "crossing") assertEqual(f.active().map(target => target.word), ["seat"], "ordinary completion exposes the first physical task");
    else { assert(f.gate(), "the bank response waits for deliberate Continue"); f.continue(); assertEqual(f.waves, [2], "bank preparation reaches the unchanged third wolf wave"); }
  }
});

await suite("Winter return crossing: each final action commits before staging and reloaded responses never repeat physical work", async () => {
  const f = fixture(routeState("return-prep", "huntress", "crossing")); f.scene.resumeWinter();
  const before = f.stats.captureCheckpoint();
  const seat = f.target("seat"); seat.onClaim();
  assertEqual(f.stages[0].approaches, ["seat"], "claiming approaches the pine without seating it");
  assertEqual(f.stages[0].performances, [], "only a fully settled word can perform the action");
  seat.onSettled();
  assertEqual([f.store.get().checkpoint!.data.index, f.store.get().checkpoint!.data.reading,
    f.store.get().realms["winter-mountain"].choices.returnPrepared], [0, true, undefined], "seating is durable but does not invent the uncompleted brace");
  const seated = await f.reload(); seated.scene.resumeWinter();
  assertEqual(seated.stages[0].presentations, [{ route: "crossing", phase: "prepare", completed: 1 }], "reload reconstructs the completed seating directly");
  assertEqual([seated.stages[0].performances, seated.active()], [[], []], "the saved seating response has no repeated action or live word");
  seated.continue();
  const brace = seated.target("brace"); brace.onSettled();
  assertEqual([seated.store.get().realms["winter-mountain"].choices.returnPrepared, seated.store.get().checkpoint!.data.index], ["1", 1], "the brace's final character commits actual preparation before its visual exit");
  const braced = await seated.reload(); braced.scene.resumeWinter();
  assertEqual(braced.stages[0].presentations, [{ route: "crossing", phase: "prepare", completed: 2 }], "the prepared return restores its two settled actions and braces");
  assert(braced.gate() && braced.active().length === 0, "the restored final preparation response still owns Continue");
  assertEqual(braced.stats.captureCheckpoint(), before, "scene reactions grant no resource/stat bonus");
  braced.continue();
  assertEqual([braced.waves, braced.store.get().checkpoint!.step, braced.store.get().checkpoint!.data.index], [[2], "wave", 2], "one Continue commits and enters the unchanged final pack");
  assert(braced.stages[0].ended, "the preparation stage is destroyed before combat resumes");
  seat.onComplete();
  assertEqual([f.active(), f.gate(), f.waves], [[], null, []], "ordinary completion stages the pine without exposing a premature reading or wave");
  f.settle(); assert(f.gate(), "only the physical settlement releases the response");
});

await suite("Winter return: true-name completion saves the later route before delayed exit and preserves old journeys", async () => {
  for (const route of [null, "crossing", "bank"] as const) {
    const state = routeState("true-name", "firefly", route ?? undefined);
    if (route === "crossing") state.realms["winter-mountain"].choices.returnPrepared = "1";
    const f = fixture(state); let done = 0;
    f.scene.runPassageChain(["settles"], ["mountain settled"], () => { done++; }, "none", undefined, "true-name");
    f.target("settles").onComplete(); f.continue();
    assertEqual([f.store.get().checkpoint!.step, done], [route ? "return-trail" : "ending", 0], "the correct new or historical destination is durable before the callback");
    assertEqual(f.scheduled.map(value => value.delay), [900], "the original transition interval remains unchanged");
    if (route) {
      const restored = await f.reload(); restored.scene.resumeWinter();
      assertEqual(restored.active().map(target => target.word), route === "crossing" ? ["cross"] : ["step"], "the return offers only the physical route chosen earlier");
    }
    f.scheduled.shift()!.next(); assertEqual(done, 1, "the original true-name continuation is not duplicated");
  }
  for (const step of ["wave", "boss", "true-name", "ending"]) {
    const f = fixture(routeState(step));
    f.scene.startReturnTrail();
    assertEqual([f.endings, f.stages, f.active()], [[1], [], []], "an older later journey does not acquire new route work");
    assertEqual(winterReturnRoute(f.store.get().realms["winter-mountain"].choices), null, "legacy route choices stay unrecorded");
  }
  const unfinished = fixture(routeState("return-trail", "huntress", "crossing")); unfinished.scene.startReturnTrail();
  assertEqual([unfinished.endings, unfinished.stages], [[1], []], "a malformed late crossing without committed braces never invents a prepared bridge");
});

await suite("Winter return: completed final characters restore their held homeward response and cannot repeat the route", async () => {
  for (const route of ["crossing", "bank"] as const) {
    const state = routeState("return-trail", "huntress", route);
    if (route === "crossing") state.realms["winter-mountain"].choices.returnPrepared = "1";
    const f = fixture(state); f.scene.resumeWinter();
    const actions = winterRouteActions(route, "return");
    for (const [index, action] of actions.entries()) {
      const target = f.target(action); target.onSettled();
      assertEqual([f.store.get().checkpoint!.step, f.store.get().checkpoint!.data.index, f.store.get().checkpoint!.data.reading], ["return-trail", index, true], "each final character is durable before its physical return movement");
      assertEqual(f.store.get().realms["winter-mountain"].choices.returnRouteDone, index === actions.length - 1 ? "1" : undefined, "only the final return action commits the route as done");
      if (index < actions.length - 1) { target.onComplete(); f.settle(); f.continue(); }
    }
    const restored = await f.reload(); restored.scene.resumeWinter();
    assertEqual([restored.active(), restored.endings, restored.stages[0].performances], [[], [], []], "a completed route reloads into its existing held answer, without replaying or prematurely stamping the chapter");
    assertEqual(restored.stages[0].presentations.at(-1), { route, phase: "return", completed: actions.length }, "the exact final route geometry is reconstructed before reading");
    assertEqual(restored.captions.at(-1), WINTER_ROUTE_REACTIONS[actions.at(-1)!], "the held answer names the action actually completed");
    const again = restored.gate()!; restored.continue(); again();
    assertEqual([restored.endings, restored.store.get().checkpoint!.step], [[1], "ending"], "one deliberate Continue reaches the existing ending exactly once");
    assert(restored.stages[0].ended, "the homeward stage retires before the original stamp");
    const later = await restored.reload(); later.scene.startReturnTrail();
    assertEqual([later.endings, later.stages], [[1], []], "a route already past its held answer cannot be replayed from a later checkpoint");
  }
});

await suite("Winter return: four route/fork histories preserve canonical rewards, fox gates and four Almanac paragraphs", () => {
  for (const branch of ["huntress", "firefly"] as const) for (const route of ["crossing", "bank"] as const) {
    const state = routeState("ending", branch, route);
    const choices = state.realms["winter-mountain"].choices;
    Object.assign(choices, { fork2: "bury", returnRouteDone: "1", ...(route === "crossing" ? { returnPrepared: "1" } : {}) });
    if (branch === "huntress") { choices.companion = "accepted"; state.satchel.push("snow-fox-cub"); }
    const before = winterRealmSummary({ cleared: true, choices: { fox: "spared", fork1: branch, fork2: "bury", ...(branch === "huntress" ? { companion: "accepted" } : {}) } }, state.satchel);
    const f = fixture(state);
    Winter.prototype.startEnding.call(f.scene);
    const saved = f.store.get(), summary = winterRealmSummary(saved.realms["winter-mountain"], saved.satchel);
    assertEqual(saved.satchel, [...state.satchel, branch === "huntress" ? "hunters-horn" : "firefly-lantern", "cairn-token"], "the route creates no new item and retains the original mutually exclusive branch rewards");
    assertEqual(saved.almanacLore, state.almanacLore, "route consequences create no additional numbered lore page");
    assertEqual(summary.passages.length, 4, "the original four-paragraph Winter summary cardinality stays fixed");
    assertEqual(summary.companion, before.companion, "route preparation does not change the original fox eligibility or acceptance");
    assertEqual([summary.passages[0], summary.passages[2], summary.passages[3]], [before.passages[0], before.passages[2], before.passages[3]], "fox, aftermath and companion records retain their canonical meaning");
    assertEqual(summary.passages[1], `${before.passages[1]} ${winterRouteMemory(choices)}`, "only the existing trail paragraph appends the completed route actually walked");
    assertEqual(saved.checkpoint, null, "the original realm ending still clears its checkpoint");
    assert(saved.realms["winter-mountain"].cleared, "the actual original ending still owns the realm clear");
    const legacy = { ...choices }; delete legacy.returnRouteVersion;
    assertEqual(winterRealmSummary({ cleared: true, choices: legacy }, saved.satchel).passages[1], before.passages[1], "old or unversioned histories retain their original trail prose");
  }
});

await suite("Winter return: pending physical actions retain pause ownership and stale callbacks cannot change a reused journey", () => {
  const f = fixture(routeState("return-prep", "huntress", "crossing")); f.scene.resumeWinter();
  const seat = f.target("seat"); seat.onSettled(); seat.onComplete();
  const oldStage = f.stages[0], lateAction = oldStage.performances[0].done;
  let prevented = 0, pauses = 0;
  f.scene.chapterMenu = { handleKey(event: any) { if (event.key !== "Escape") return false; pauses++; return true; } };
  const key = (key: string, modifiers = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    preventDefault() { prevented++; }, ...modifiers });
  for (const value of ["Enter", " ", "x", "Backspace"]) f.scene.onKeyDown(key(value));
  f.scene.onKeyDown(key("Escape")); f.scene.onKeyDown(key("r", { metaKey: true }));
  assertEqual([f.keys, prevented, pauses], [[], 4, 1], "early typing cannot become a miss while pause and browser shortcuts remain available");
  f.scene.clearReturnStage(); const snapshot = JSON.stringify(f.store.get());
  lateAction(); seat.onSettled(); seat.onComplete();
  assertEqual([JSON.stringify(f.store.get()), f.gate(), f.waves], [snapshot, null, []], "late visual/word callbacks cannot rewrite a retired route stage or start combat");
  assert(oldStage.ended, "cleanup destroys the old physical stage");
  const replacement = fixture(routeState("return-plan", "firefly"));
  f.scene.init({ store: replacement.store }); const before = JSON.stringify(replacement.store.get());
  lateAction(); seat.onSettled(); seat.onComplete();
  assertEqual(JSON.stringify(replacement.store.get()), before, "callbacks from the previous run cannot mutate a newly initialized journey");
  assertEqual([f.scene.returnStage, f.scene.returnTransitionPending], [null, false], "actual init releases stage and input ownership together");
});

// Exercise the production stage too: only Phaser's display, event and tween
// boundaries are inert. Checkpoints above and these visible states share the
// actual action indexes rather than an independent mock implementation.
const stageSource = ts.createSourceFile("winterReturnStage.ts", readFileSync(new URL("../src/game/winterReturnStage.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const stageOwner = stageSource.statements.find(ts.isClassDeclaration)!;
const stageCode = ts.transpileModule(stageOwner.getText(stageSource).replace(/^export /, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const actualStageGlobals = {
  applySceneActorLighting: noop, addLocalGroundShadow: () => stageDisplay(),
  reducedMotion: (scene: any) => scene.motionReduced,
  setWrenPose(sprite: any, pose: string) { sprite.pose = pose; sprite.scaleY = 1; },
};
const ActualReturnStage = new Function(...Object.keys(actualStageGlobals), `${stageCode}; return WinterReturnStage;`)(...Object.values(actualStageGlobals));
const stageDimensions = Object.fromEntries([
  ["winter-fallen-pine", "../art/winter/fallen-pine.png"],
  ["winter-aftermath-cairn", "../art/winter/aftermath-cairn.png"],
].map(([key, path]) => {
  const png = readFileSync(new URL(path!, import.meta.url));
  return [key, { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }];
}));
function stageDisplay(x = 0, y = 0, key = ""): any {
  return { x, y, key, scene: true, visible: true, alpha: 1, depth: 0, scaleX: 1, scaleY: 1, destroyed: 0, children: [], marks: [],
    ...stageDimensions[key],
    setOrigin(...values: number[]) { this.origin = values; return this; },
    setDisplaySize(width: number, height: number) { this.displayWidth = width; this.displayHeight = height; return this; },
    setDepth(depth: number) { this.depth = depth; return this; },
    setScale(scale: number) { this.scaleX = this.scaleY = scale; return this; },
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
    setVisible(visible: boolean) { this.visible = visible; return this; },
    setAlpha(alpha: number) { this.alpha = alpha; return this; },
    add(child: any) { this.children.push(child); return this; },
    clear() { this.marks = []; return this; }, fillStyle() { return this; },
    fillEllipse(...values: number[]) { this.marks.push(values); return this; },
    destroy() { this.destroyed++; this.scene = false; for (const child of this.children) child.destroy(); },
  };
}
function stageFixture(reduced = false) {
  const roots: any[] = [], tweens: any[] = [], listeners = new Set<() => void>();
  const wren = stageDisplay(960, 842), sprite = stageDisplay(); wren.setVisible(false).setDepth(37);
  const scene = { motionReduced: reduced, scale: { width: 1920, height: 1080 },
    add: {
      container(x: number, y: number) { const body = stageDisplay(x, y); roots.push(body); return body; },
      image(x: number, y: number, key: string) { const body = stageDisplay(x, y, key); roots.push(body); return body; },
      graphics() { const body = stageDisplay(); roots.push(body); return body; },
    },
    events: { once(_event: string, callback: () => void) { listeners.add(callback); },
      off(_event: string, callback: () => void) { listeners.delete(callback); } },
    tweens: { add(options: any) { const entry = { ...options, cancelled: false }; tweens.push(entry); return entry; },
      killTweensOf(target: any) { for (const entry of tweens) if (entry.targets === target) entry.cancelled = true; } },
  };
  const stage = new ActualReturnStage(scene, { wren, sprite });
  return { scene, stage, wren, sprite, roots, tweens, listeners,
    complete(entry: any) { assert(!entry.cancelled, "only a live physical tween can move an actor");
      for (const property of ["x", "y"]) if (typeof entry[property] === "number") entry.targets[property] = entry[property];
      entry.onComplete?.(); },
  };
}

await suite("Winter return stage: actual saved states reconstruct prepared crossing or walked bank without replaying movement", () => {
  const f = stageFixture();
  const pine = f.stage.subject("seat"), bank = f.stage.subject("step");
  assertEqual([f.stage.subject("choice-crossing"), f.stage.subject("choice-bank"), f.stage.subject("duck")], [pine, bank, bank], "choice words and physical return words share their real route subjects");
  assert(f.wren.depth > pine.depth && f.wren.depth > bank.depth, "the temporarily staged actor draws above both route subjects instead of being cut through by the pine");
  assertEqual(f.stage.braces.children.map((stone: any) => [stone.x, stone.y, stone.scaleX * 1383]), [[664, 794, 68], [1290, 760, 68]], "both painted wedges meet the accepted pine's two uneven banks");
  for (const [completed, x, ready] of [[0, 1260, false], [1, 980, false], [2, 980, true]] as const) {
    f.stage.present("crossing", "prepare", completed);
    assertEqual([pine.x, f.stage.braces.visible, f.wren.x], [x, ready, completed ? 1370 : 1630], "each held preparation has the physical pine and braces it actually earned");
  }
  f.stage.present("crossing", "return", 0);
  assertEqual([pine.x, f.stage.braces.visible, f.wren.x], [980, true, 1350], "the prepared return starts from the far end of its braced crossing");
  f.stage.present("crossing", "return", 1);
  assertEqual(f.wren.x, 610, "the held completed crossing is already on the homeward side");
  assert(f.stage.footprints.marks.length > 0 && f.stage.footprints.marks.every((mark: number[]) => mark[1]! >= 664 && mark[1]! <= 685), "the saved crossing reconstructs footprints on its sloping painted ridge");
  for (const [completed, x] of [[0, 1330], [1, 1510], [2, 1700]] as const) {
    f.stage.present("bank", "return", completed);
    assertEqual([pine.x, f.stage.braces.visible, f.wren.x], [1260, false, x], "the bank never invents the crossing's earlier preparation");
    assertEqual(f.stage.footprints.marks.length > 0, completed > 0, "only an actually walked saved bank reconstructs footprints");
  }
  assertEqual(f.tweens, [], "restoring any saved state starts no replay choreography");
  f.stage.destroy();
});

await suite("Winter return stage: normal crossing waits for all three real movements while reduced motion settles immediately", () => {
  for (const reduced of [false, true]) {
    const f = stageFixture(reduced); f.stage.present("crossing", "return", 0); let settled = 0;
    f.stage.perform("cross", () => settled++);
    if (!reduced) {
      assertEqual([settled, f.tweens.length], [0, 1], "the response cannot appear before Wren steps onto the prepared log");
      for (const [index, position] of [[1230, 667], [750, 682], [610, 810]].entries()) {
        f.complete(f.tweens[index]);
        assertEqual([f.wren.x, f.wren.y, settled], [...position, index === 2 ? 1 : 0], "each actual movement reaches the next supported path point before the held response");
      }
      assertEqual(f.tweens.map(entry => entry.duration), [420, 420, 420], "normal crossing uses its authored movement sequence");
    } else assertEqual([f.tweens.length, settled, f.wren.x, f.wren.y], [0, 1, 610, 810], "reduced motion reconstructs the same completed physical return immediately");
    assertEqual(f.sprite.pose, "front", "settlement releases the walking pose before reading");
    const playedTracks = structuredClone(f.stage.footprints.marks);
    f.stage.present("crossing", "return", 1);
    assertEqual(f.stage.footprints.marks, playedTracks, "restoring the held crossing preserves the same ridge footprints made by its actual movement");
    f.stage.destroy();
    assertEqual([f.wren.x, f.wren.y, f.wren.visible, f.wren.depth], [960, 842, false, 37], "cleanup restores the owning scene's original actor position, visibility and draw depth");
  }
});

await suite("Winter return stage: re-present, replacement and shutdown invalidate late movement without leaking actors or listeners", () => {
  const f = stageFixture(); let oldSettled = 0, newSettled = 0;
  f.stage.present("crossing", "return", 0); f.stage.perform("cross", () => oldSettled++);
  const old = f.tweens[0]; f.stage.present("bank", "return", 0);
  old.onComplete();
  assertEqual([oldSettled, f.tweens.length, f.wren.x], [0, 1, 1330], "a stale crossing callback cannot walk a re-presented bank or reveal an obsolete response");
  assert(old.cancelled, "re-present cancels the abandoned physical tween");
  f.stage.perform("duck", () => newSettled++);
  const duck = f.tweens.at(-1);
  assert(f.sprite.scaleY < 1, "the live bank action visibly ducks under the bough before settlement");
  const shutdown = [...f.listeners][0]; shutdown();
  const before = [f.wren.x, f.wren.y, f.wren.visible, f.sprite.scaleY, f.wren.depth, f.tweens.length];
  duck.onComplete(); old.onComplete(); f.stage.perform("cross", () => newSettled++); f.stage.destroy(); shutdown();
  assertEqual([oldSettled, newSettled, f.listeners.size], [0, 0, 0], "retired movement cannot call reading and cleanup removes its shutdown listener");
  assertEqual([f.wren.x, f.wren.y, f.wren.visible, f.sprite.scaleY, f.wren.depth, f.tweens.length], before, "late callbacks and repeated cleanup cannot alter the restored owning actor");
  assertEqual(before.slice(0, 5), [960, 842, false, 1, 37], "shutdown restores original placement, visibility, standing pose and draw depth even while ducking");
  assert(f.roots.every(body => body.destroyed === 1), "each temporary painted root and child is destroyed exactly once");
  assert(duck.cancelled, "shutdown cancels the ducking tween");
});

function joinedReturnState(route: "crossing" | "bank", reading = false, index = 0) {
  const state = routeState("return-trail", "huntress", route);
  Object.assign(state.realms["winter-mountain"].choices, { fork2: "bury", companion: "accepted",
    ...(route === "crossing" ? { returnPrepared: "1" } : {}) });
  state.satchel.push("snow-fox-cub");
  Object.assign(state.checkpoint!.data, { returnRouteVersion: 1, reading, index });
  return state;
}
function attachReturnRendering(f: ReturnType<typeof fixture>, reduced = false) {
  const r = stageFixture(reduced), foxes: any[] = [];
  f.store.update(state => { state.reducedMotion = reduced; });
  Object.assign(f.scene, { wrenContainer: r.wren, wrenSprite: r.sprite, tweens: r.scene.tweens,
    actualReturnStage: () => r.stage,
    // The real companion painting factory is an inert display boundary; the
    // scene's actual placement, movement, save rules and cleanup all execute.
    showFoxCompanion(options: any) {
      if (f.scene.foxCompanion?.scene) return;
      const fox = stageDisplay(options.startX, options.startY);
      f.scene.foxCompanion = fox; foxes.push(fox);
      r.scene.tweens.add({ targets: fox, x: options.x, y: options.y, duration: 720 });
    },
  });
  return { ...r, foxes,
    completeNext(target: any) {
      const tween = r.tweens.find(entry => entry.targets === target && !entry.cancelled && !entry.testDone);
      assert(tween, "the actual actor has its next supported movement");
      tween.testDone = true; r.complete(tween); return tween;
    },
  };
}

await suite("Winter joined fox: both actual return routes keep her on supported banks and follow the same ridge in normal or reduced motion", async () => {
  for (const route of ["crossing", "bank"] as const) for (const reduced of [false, true]) {
    const f = fixture(joinedReturnState(route)), r = attachReturnRendering(f, reduced);
    const gladeFox = stageDisplay(836, 842); f.scene.foxCompanion = gladeFox;
    const before = { satchel: [...f.store.get().satchel], stats: f.stats.captureCheckpoint() };
    f.scene.resumeWinter();
    const fox = f.scene.returnFox;
    assertEqual([gladeFox.destroyed, fox === f.scene.foxCompanion, r.foxes.length], [1, true, 1], "the previous glade cameo is retired and one joined fox enters the actual trail");
    assertEqual([fox.x, fox.y, fox.visible, fox.alpha], [route === "crossing" ? 1466 : 1435, 810, true, 1], "the fox waits on the supported right bank beside Wren, not at her old glade coordinates in the stream");
    assert(fox.depth > r.stage.subject("cross").depth && fox.depth > r.stage.braces.depth, "the complete fox silhouette draws above the crossing and bank wedges");
    assert(r.tweens.filter(entry => entry.targets === fox && entry.duration === 720).every(entry => entry.cancelled), "the gate's old entrance tween cannot drag the trail fox back to its glade");
    const actions = winterRouteActions(route, "return");
    for (const [index, action] of actions.entries()) {
      const target = f.target(action); target.onSettled(); target.onComplete();
      if (!reduced) {
        const start = { x: fox.x, y: fox.y };
        assertEqual(f.scheduled.map(timer => timer.delay), [110], "the fox starts a small beat behind Wren without delaying the original response");
        f.scheduled.shift()!.next();
        const points = action === "cross" ? [[1230, 667], [750, 682], [494, 810]] : action === "step" ? [[1435, 810]] : [[1584, 810]];
        assertEqual([fox.x, fox.y], [start.x, start.y], "scheduling the follower does not teleport her across unsupported ground");
        for (const point of points) {
          r.completeNext(r.wren);
          const movement = r.completeNext(fox);
          assertEqual([movement.x, movement.y, movement.duration], [...point, 420], "the fox traverses the same supported ridge or bank as the existing actor movement");
          assertEqual([fox.x, fox.y, fox.visible], [...point, true], "the companion stays visible through every actual movement");
        }
      } else assertEqual(f.scheduled, [], "reduced motion places the joined fox directly without adding a follower timer");
      assertEqual([fox.x, fox.y], [route === "crossing" ? 494 : action === "step" ? 1435 : 1584, 810], "the settled companion rests beside Wren on the bank reached by this action");
      assert(f.gate() && f.endings.length === 0, "the existing response still waits for deliberate Continue after the movement");
      if (index < actions.length - 1) f.continue();
    }
    const restored = await f.reload(), replay = attachReturnRendering(restored, reduced); restored.scene.resumeWinter();
    const returnedFox = restored.scene.returnFox;
    assertEqual([returnedFox.x, returnedFox.y, returnedFox.visible, replay.foxes.length], [route === "crossing" ? 494 : 1584, 810, true, 1], "a real saved final response restores one accepted fox beside the settled actor");
    assertEqual(replay.tweens.filter(entry => !entry.cancelled), [], "restored held responses never replay the companion's arrival or traversal");
    assertEqual({ satchel: restored.store.get().satchel, stats: restored.stats.captureCheckpoint() }, before, "visual repair leaves the saved companion, inventory and typing resources unchanged");
    restored.continue(); f.continue();
    assertEqual([returnedFox.destroyed, restored.scene.foxCompanion, restored.scene.returnFox, fox.destroyed], [1, null, null, 1], "retiring the temporary trail destroys both live/reloaded fox cameos instead of jumping them back into the stamp glade");
  }
});

await suite("Winter joined fox: declined or unrecorded companions cannot be invented by either return route", () => {
  for (const route of ["crossing", "bank"] as const) for (const answer of [undefined, "declined"]) {
    const state = joinedReturnState(route);
    if (answer) state.realms["winter-mountain"].choices.companion = answer;
    else delete state.realms["winter-mountain"].choices.companion;
    const f = fixture(state), r = attachReturnRendering(f);
    const old = stageDisplay(836, 842); old.setVisible(false); f.scene.foxCompanion = old;
    const before = JSON.stringify(f.store.get().realms["winter-mountain"].choices);
    f.scene.resumeWinter();
    assertEqual([old.destroyed, r.foxes, f.scene.foxCompanion, f.scene.returnFox], [1, [], null, null], "a stale hidden wounded fox or carried relic cannot fabricate an accepted trail companion");
    assertEqual(JSON.stringify(f.store.get().realms["winter-mountain"].choices), before, "rendering does not infer acceptance or rewrite the declined/unrecorded decision");
  }
});

await suite("Winter joined fox: leaving during the trailing timer or ridge movement cannot revive a retired companion", () => {
  for (const duringMovement of [false, true]) {
    const f = fixture(joinedReturnState("crossing")), r = attachReturnRendering(f); f.scene.resumeWinter();
    const fox = f.scene.returnFox, target = f.target("cross"); target.onSettled(); target.onComplete();
    const timer = f.scheduled.shift()!;
    if (duringMovement) timer.next();
    const lateMovement = r.tweens.find(entry => entry.targets === fox && !entry.cancelled);
    f.scene.clearReturnStage(); const after = JSON.stringify(f.store.get());
    timer.next(); lateMovement?.onComplete?.(); target.onComplete(); f.scene.clearReturnStage();
    assertEqual([fox.destroyed, r.foxes.length, f.scene.foxCompanion, f.scene.returnFox], [1, 1, null, null], "late delayed/tween callbacks cannot resurrect or replace the retired fox");
    assertEqual([JSON.stringify(f.store.get()), f.gate(), f.endings], [after, null, []], "leaving changes no canonical choices and cannot reveal a stale reading or ending");
    if (lateMovement) assert(lateMovement.cancelled, "scene cleanup cancels the in-progress follower tween");
  }
});

await Promise.all(stores.map(store => store.flush()));

