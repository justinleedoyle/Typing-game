import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";
import { BELL_STEPS, bellIndex, bellStep } from "../src/game/bellCheckpoint";
import { BreathMeter, MAX_AIR } from "../src/game/breathMeter";
import { SaveStore, emptySave, type SaveBackend, type SaveState } from "../src/game/saveState";
import { TypingInputController } from "../src/game/typingInput";
import { resolveCombatLoadout } from "../src/game/relicEffects";
import { rememberRealmFork, resolveRealmFork, rememberCompanionDecision, resolveCompanionDecision } from "../src/game/realmChoices";

// Production methods are compiled directly from the scene. Rendering is inert;
// decisions, passage indices, reward timing, checkpoints and dispatch are real.
const file = new URL("../src/scenes/SunkenBellScene.ts", import.meta.url);
const source = ts.createSourceFile(file.pathname, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const constants = source.statements.filter(ts.isVariableStatement).map(statement => statement.getText(source)).join("\n");
const methods = owner.members.filter(ts.isMethodDeclaration).map(method => method.getText(source)).join("\n");
const create = owner.members.find(member => member.name?.getText(source) === "create") as ts.MethodDeclaration;
const setup = create.body!.statements;
const setupStart = setup.findIndex(statement => statement.getText(source).startsWith("this.typingInput = new TypingInputController"));
const setupEnd = setup.findIndex(statement => statement.getText(source).startsWith("this.band = new ConsoleBand"));
assert(setupStart >= 0 && setupEnd > setupStart, "the actual create method owns a contiguous resource restoration block");
const resourceSetup = setup.slice(setupStart, setupEnd).map(statement => statement.getText(source)).join("\n");
const code = ts.transpileModule(`${constants}\nclass Bell { ${methods}\n initializeResourcesFixture() { ${resourceSetup} } }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const noop = () => {};
const globals: Record<string, unknown> = {
  bellStep, bellIndex, TypingInputController, resolveCombatLoadout, rememberRealmFork, resolveRealmFork, rememberCompanionDecision, resolveCompanionDecision,
  Phaser: { Math: { Clamp: (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n)) },
    GameObjects: { Events: { DESTROY: "destroy" } }, Cameras: { Scene2D: { Events: { FADE_OUT_COMPLETE: "fade" } } } },
  reducedMotion: () => true, reducedFlashes: () => true,
  SERIF: "serif", PALETTE: { frost: "white" }, PALETTE_HEX: { frost: 0xffffff },
  pickAdaptiveWords: (_bank: unknown, count: number) => ["tide", "salt", "still", "silt"].slice(0, count),
  SUNKEN_BELL_WORD_BANK: [],
};
for (const name of ["playChime", "playWaveSting", "playWrenAction", "playWrenFocus", "playBodyImpact",
  "playBodyTypePulse", "playActorAttention", "playPortalArrivalWake", "addLocalGroundShadow", "addContainerWake",
  "playDamageThud", "fadeOutStagedSprite", "playQuietLordIntrusion", "flashQuietLordFragment",
  "playRealmReturnDeparture", "playRealmClearResonance"]) globals[name] = noop;
globals.attachWordBodyAnchor = () => ({ destroy() {} });
const Bell = new Function(...Object.keys(globals), `${code}; return Bell;`)(...Object.values(globals));

class MemoryBackend implements SaveBackend {
  saved: SaveState | null = null;
  async load() { return this.saved ? JSON.parse(JSON.stringify(this.saved)) as SaveState : null; }
  async save(state: SaveState) { this.saved = JSON.parse(JSON.stringify(state)); }
}
function node(x = 960, y = 600): any {
  return { x, y, scene: true, alpha: 1, tint: 0, lit: false,
    setDepth() { return this; }, setAlpha(v: number) { this.alpha = v; return this; },
    setTint(v: number) { this.tint = v; return this; }, add() {}, once() {},
    destroy() { this.scene = false; },
  };
}
function fixture(initial = emptySave(), revisit = false) {
  initial.typewriterAwakened = true;
  const backend = new MemoryBackend();
  const store = new SaveStore(backend, initial);
  const scene = new Bell();
  const captions: string[] = [], tasks: string[] = [], targets: any[] = [], events: string[] = [];
  const timers: Array<{ ms: number; run: () => void }> = [], beats: Array<() => void> = [];
  let gate: (() => void) | undefined;
  Object.assign(scene, { clearBellKeeperLectern: noop, breath: new BreathMeter(), doorwayPassageToken: 0 });
  scene.init({ store, revisit });
  scene.initializeResourcesFixture();
  const stats = scene.typingInput.getStats();
  Object.assign(scene, {
    scale: { width: 1920, height: 1080 },
    wrenContainer: node(960, 820), wrenSprite: node(),
    band: { setObjective(text: string) { tasks.push(text); }, showNotice() {} },
    narration: { say(text: string) { captions.push(text); }, replay: noop },
    reading: { show(next: () => void) { assert(!gate, "a checkpoint cannot overwrite an unread story card"); gate = next; } },
    setNarrator(text: string) { captions.push(text); },
    rhythmLabel: node(), beatRing: node(), offbeatRing: node(),
    beatClock: { tempo: 2000, running: false, setTempo(ms: number) { this.tempo = ms; },
      start() { this.running = true; }, stop() { this.running = false; }, onNextBeat(run: () => void) { beats.push(run); } },
    time: { delayedCall(ms: number, run: () => void) { timers.push({ ms, run }); } },
    cameras: { main: { shake() {}, fadeOut() {}, once() {} } },
    tweens: { killTweensOf() {}, add() {} },
    add: { container: (x: number, y: number) => node(x, y), text: (x: number, y: number) => node(x, y) },
    clearActiveTargets() { scene.activeTargets = []; },
    drawOlin() { events.push("olin"); scene.olinImage = node(); },
    dismissOlin() { scene.olinImage = undefined; },
    setBandSpeaker() {}, pulseBellWave() {}, drawBreathBar() {}, setBreathActive(active: boolean) {
      scene.breathActive = active; if (active) scene.breath.reset();
    },
    drawBellKeeperLectern: node,
    clearBellKeeperLectern() { scene.bellKeeperLectern?.destroy(); scene.bellKeeperLectern = null; },
    showDoorCues() { events.push("doors"); scene.doorwayStage = node(); scene.doorChantCue = node(); scene.doorForceCue = node(); },
    openCathedralDoor(mode: string) { events.push("open:" + mode); },
    openForceDoorCue() { events.push("open:force"); },
    clearBellForkCues() { scene.doorwayStage = null; scene.doorChantCue = null; scene.doorForceCue = null; },
    fadeOutForkCue(cue: any) { cue?.destroy(); },
    showFateCues() { events.push("fate"); scene.aurlandFateCue = node(); scene.bellTongueCue = node(); },
    showAurland() { events.push("aurland"); scene.aurlandImage = node(); },
    showAurlandToken() { events.push("token"); scene.aurlandToken = node(); },
    clearAurlandToken() { scene.aurlandToken = undefined; }, hideAurland() { scene.aurlandImage = undefined; },
    showGlassFishCompanion() { events.push("fish"); scene.glassFishCompanion = node(); },
    dismissGlassFishCompanion() { scene.glassFishCompanion = null; },
    drawWarden() { events.push("warden"); return node(); }, playWardenStagePulse() {}, clearBossWordAnchors() {},
    makeWord(options: any) { return options; }, makeOlinWord(options: any) { return options; },
    makeBellForkWord(_cue: any, options: any) { return options; }, makeAurlandWord(options: any) { return options; },
    makeGlassFishWord(options: any) { return options; }, makeWardenWord(_cue: any, options: any) { return options; },
    registerActiveTarget(...values: any[]) { scene.activeTargets.push(...values); targets.push(...values); },
    bellPassageWordPosition: () => ({ x: 600, y: 500 }), olinPassageWordPosition: () => ({ x: 600, y: 500 }),
    wardenWordPosition: () => ({ x: 600, y: 500 }),
    spawnGhost(_x: number, _rx: number, _ry: number, word: string) { events.push("ghost:" + word); },
    beginCombatWave() { events.push("wave-procs"); Object.getPrototypeOf(scene).beginCombatWave.call(scene); },
    applyAutoEase() {}, applyCompanionTrip() {},
    showDescentLanterns() { scene.descentLanterns = [0, 1, 2].map(() => ({ container: node(), lit: false })); },
    showDescentLantern(index: number) { return scene.descentLanterns[index]; },
    activateDescentLantern() {}, lightDescentLantern(value: any) { value.lit = true; },
    descentLanternWordPosition: () => ({ x: 600, y: 500 }),
    attachDescentLanternWordAnchor: () => ({ destroy() {} }), releaseDescentLanternWordAnchor() {},
    dismissDescentLanterns() { scene.descentLanterns = []; }, swimWrenToX(_x: number, done: () => void) { done(); },
    resetWrenToFront() {}, swimWrenTowardDescentLantern() {},
    showAlmanacStamp(next: () => void) { next(); },
  });
  return { scene, stats, store, backend, captions, tasks, targets, events, timers, beats,
    hasGate: () => !!gate,
    next() { assert(gate, "the original Continue gate exists"); const next = gate!; gate = undefined; next(); },
    complete() { assert(scene.activeTargets.length > 0, "a native target exists"); const target = scene.activeTargets.at(-1); target.onComplete(); },
    tick() { assert(timers.length > 0, "a native transition timer exists"); timers.shift()!.run(); },
    async reload() { await store.flush(); return fixture((await backend.load())!); },
  };
}
function chosen(fork1: string | null, fork2: string | null): SaveState {
  const save = emptySave();
  save.realms["sunken-bell"] = { cleared: false, choices: { ...(fork1 ? { fork1 } : {}), ...(fork2 ? { fork2 } : {}) } };
  return save;
}

await suite("Bell checkpoints: schema helper and finite air restoration retain exact stakes", () => {
  for (const step of BELL_STEPS) assertEqual(bellStep(step), step, "every stable phase is recognized");
  assertEqual([bellStep("future"), bellIndex(-4, 4), bellIndex(99, 4), bellIndex(1.5, 4), bellIndex("2", 4)],
    ["arrival", 0, 4, 0, 0], "invalid future/partial progress fails safely");
  const air = new BreathMeter();
  for (const value of [0, 5, 25, 40, 85, 100]) { air.restore(value); assertEqual(air.getAir(), value, "entry air survives exactly"); }
  air.restore(-5); assertEqual(air.getAir(), 0, "negative air clamps");
  air.restore(1000); assertEqual(air.getAir(), 100, "excess air clamps");
  air.restore(40); for (const value of [NaN, Infinity, -Infinity]) air.restore(value);
  assertEqual(air.getAir(), 40, "invalid air cannot erase the last valid stake");
});

await suite("Bell checkpoints: actual init and checkpoint roundtrip preserve resources, decisions and scene ownership", async () => {
  const f = fixture(chosen("force", "free-aurland"));
  f.stats.restoreCheckpoint({ statsHits: "101", statsSoul: 31, statsCombo: 2, statsBestCombo: 9 });
  f.scene.breath.restore(40); f.scene.graceSaves = 0;
  f.scene.checkpoint("choir", { index: 2 });
  const saved = f.store.get().checkpoint!;
  assertEqual(saved.data, { statsHits: "101", statsSoul: 31, statsCombo: 2, statsBestCombo: 9, air: 40, graceSaves: 0, combatSatchel: "", index: 2 }, "all stable resource stakes use scalar data");
  f.stats.bankSoulFraction(0.6); f.scene.breath.reset(); f.scene.graceSaves = 5;
  const resumed = await f.reload();
  assertEqual([resumed.scene.fork1Choice, resumed.scene.fork2Choice], ["force", "free-aurland"], "committed forks survive actual SaveStore reload and init");
  assertEqual([resumed.stats.getHeart(), resumed.stats.getSoul(), resumed.scene.breath.getAir(), resumed.scene.graceSaves], [67, 31, 40, 0], "aborted encounter returns to entry stakes, with no fresh air/grace");
  resumed.scene.resumeBell();
  assertEqual(resumed.events.filter(event => event.startsWith("ghost:")).length, 3, "only the antiphon encounter restarts");
  assertEqual([resumed.scene.beatPhase, resumed.scene.beatClock.tempo, resumed.scene.breathActive], ["off", 2000, true], "the real orange-window rule, clock and air meter return");
  assertEqual(resumed.store.get().checkpoint!.data.statsSoul, 31, "encounter snapshot retains the actual precombat stats");
  assertEqual(resumed.events.filter(event => event === "wave-procs").length, 1, "the original per-wave procs initialize once");
  const twice = await resumed.reload(); twice.scene.resumeBell();
  assertEqual([twice.stats.getSoul(), twice.scene.breath.getAir()], [31, 40], "repeated reload cannot bank grants or refill air");
  const revisit = fixture(JSON.parse(JSON.stringify(f.store.get())), true);
  assertEqual(revisit.scene.resumeCheckpoint, null, "a revisit ignores the unfinished campaign checkpoint");
  const cp = JSON.stringify(revisit.store.get().checkpoint);
  revisit.scene.checkpoint("arrival");
  assertEqual(JSON.stringify(revisit.store.get().checkpoint), cp, "a revisit cannot replace campaign progress");
  const other = emptySave(); other.checkpoint = { scene: "SkyIslandScene", step: "arrival", data: {} };
  assertEqual(fixture(other).scene.resumeCheckpoint, null, "Bell cannot consume another realm's checkpoint");
});

await suite("Bell checkpoints: actual create restoration freezes entry relic effects while rewards stay current", async () => {
  const save = chosen("force", null); save.satchel = ["cairn-token"];
  const f = fixture(save); f.scene.graceSaves = 0;
  f.store.update(state => { state.satchel.push("lock-bar"); });
  f.scene.checkpoint("warden2");
  const resumed = await f.reload();
  assertEqual(resumed.scene.combatSatchel, ["cairn-token"], "create uses the saved realm-entry inventory");
  assertEqual(resumed.scene.combat.gracePool, 1, "the newly earned lock-bar cannot prematurely alter this realm's loadout");
  assertEqual(resumed.scene.graceSaves, 0, "already-spent entry grace is not replenished");
  assertEqual(resumed.store.get().satchel, ["cairn-token", "lock-bar"], "current rewards remain owned in the real satchel");
  const empty = fixture(chosen("force", null));
  empty.store.update(state => { state.satchel.push("lock-bar"); }); empty.scene.checkpoint("warden2");
  const emptyResume = await empty.reload();
  assertEqual([emptyResume.scene.combatSatchel, emptyResume.scene.combat.gracePool], [[], 0], "an explicitly empty entry inventory stays empty after rewards");
});

await suite("Bell checkpoints: every stable step dispatches to its owning phase without earlier acts", () => {
  const owners: Record<string, string> = {
    arrival: "startArrival", descent: "startDescent", olin: "startOlinNPC", "olin-taught": "onOlinTeachComplete",
    practice: "startRhythmPractice", "practice-done": "showRhythmPracticeComplete", choir: "beginFirstGhostEncounter",
    "choir-cleared": "showChoirCleared", chamber: "startBellKeepersChamber", "chamber-read": "startBellKeepersChamber",
    fork1: "startFork1", chant: "startFork1Chant", force: "startFork1Force", "force-break": "startFork1ForceBreak",
    "fork1-reward": "showFork1Reward", corridor: "startAct3Corridor", warden: "startAct3",
    "warden1-cleared": "showWardenPhase1Cleared", warden2: "startWardenPhase2", warden3: "startWardenPhase3",
    "warden-defeated": "onWardenDefeated", fork2: "startFork2", "free-aurland": "startFork2FreeAurland",
    "claim-tongue": "startFork2ClaimTongue", "fork2-reward": "showFork2Reward", fish: "startGlassFishGate",
    "companion-answer": "showCompanionAnswer", "true-name": "startTrueNamePassage", ending: "startEnding",
  };
  for (const step of BELL_STEPS) {
    const save = chosen("chant", "free-aurland");
    save.checkpoint = { scene: "SunkenBellScene", step, data: { index: 0, accepted: false } };
    const f = fixture(save), invoked: string[] = [];
    for (const name of new Set(Object.values(owners))) f.scene[name] = () => invoked.push(name);
    f.scene.resumeBell();
    assertEqual(invoked, [owners[step]], step + " dispatches exactly once");
    if (["chant", "force", "force-break", "fork1-reward", "corridor"].includes(step)) assert(f.events.includes("doors"), "door phases reconstruct the architectural stage");
    if (["free-aurland", "claim-tongue", "fork2-reward"].includes(step)) assert(f.events.includes("fate"), "fate phases reconstruct their owner props");
  }
});

await suite("Bell checkpoints: lantern indices and Olin response gates resume without replaying earlier words", async () => {
  const f = fixture(); f.scene.showDescentLanterns(); f.scene.startDescent();
  assertEqual(f.scene.activeTargets[0].word, "swim", "the initial lantern remains unchanged");
  f.complete();
  const resumed = await f.reload(); resumed.scene.resumeBell();
  assertEqual([resumed.scene.activeTargets[0].word, resumed.scene.descentLanterns[0].lit], ["glow", true], "the next lantern and completed light are reconstructed");
  const olin = fixture(); olin.scene.startOlinNPC(); olin.next(); olin.complete();
  assertEqual(olin.store.get().checkpoint!.data.index, 1, "Olin records the first earned response");
  const reply = await olin.reload(); reply.scene.resumeBell();
  assert(reply.hasGate() && reply.scene.activeTargets.length === 0, "the rhythm explanation remains a held response");
  assert(reply.captions.at(-1)!.includes("blue ring"), "the actual earned response returns");
  reply.next(); reply.next();
  assertEqual(reply.scene.activeTargets[0].word, "teach me", "Continue resumes the following original teaching request");
});

await suite("Bell checkpoints: chant response, open masonry and reward handoff survive reload without rerolling", async () => {
  const f = fixture(chosen(null, null)); f.scene.startFork1();
  f.scene.activeTargets.find((target: any) => target.word === "open slowly").onComplete();
  assertEqual(f.store.get().realms["sunken-bell"]!.choices.fork1, "chant", "branch is committed before its first passage");
  for (let i = 0; i < 4; i++) {
    assert(f.scene.activeTargets.length > 0, "the next original chant target exists");
    f.complete();
    if (i < 3) f.next();
  }
  const held = await f.reload(); held.scene.resumeBell();
  assert(held.hasGate() && held.scene.activeTargets.length === 0, "the final door-opening response stays held");
  assert(held.events.includes("open:chant"), "the doors are visibly open on the final response");
  assertEqual(held.store.get().satchel, [], "the original chant reward still waits for that response's Continue");
  held.next();
  assertEqual(held.store.get().satchel, ["quiet-chant"], "the chosen relic is granted once at its original boundary");
  assertEqual(held.store.get().checkpoint!.step, "fork1-reward", "reward acknowledgment is its own safe boundary");
  const reward = await held.reload(); reward.scene.resumeBell();
  assert(reward.hasGate() && reward.events.includes("open:chant"), "the open-door reward card is reconstructed");
  assertEqual(reward.store.get().satchel, ["quiet-chant"], "reload never grants the opposite or duplicate relic");
  reward.next(); assertEqual(reward.store.get().checkpoint!.step, "corridor", "Continue reaches the original corridor gate");
});

await suite("Bell checkpoints: force remains committed and resumes the next breaking word", async () => {
  const f = fixture(chosen(null, null)); f.scene.startFork1();
  f.scene.activeTargets.find((target: any) => target.word === "force them open").onComplete();
  assertEqual(f.store.get().satchel, ["lock-bar"], "the original force choice reward timing is preserved");
  f.next(); assertEqual(f.scene.activeTargets[0].word, "OPEN", "the original capitalized gate remains");
  f.complete(); f.tick(); f.complete();
  const resumed = await f.reload(); resumed.scene.resumeBell(); resumed.tick();
  assertEqual(resumed.scene.activeTargets[0].word, "crack", "the completed crash is not retyped");
  assertEqual(resumed.store.get().realms["sunken-bell"]!.choices.fork1, "force", "the path cannot be changed on resume");
  assertEqual(resumed.store.get().satchel, ["lock-bar"], "force restart does not duplicate or switch relics");
});

await suite("Bell checkpoints: Aurland binding, token reward and companion answer retain all original gates", async () => {
  const f = fixture(chosen("chant", null)); f.scene.showFateCues(); f.scene.startFork2FreeAurland();
  f.next(); f.complete();
  const reply = await f.reload(); reply.scene.resumeBell();
  assert(reply.hasGate() && reply.captions.at(-1) === "You are remembered.", "the earned binding response survives reload");
  assertEqual(reply.store.get().satchel, [], "no early ally or token is granted");
  reply.next(); assertEqual(reply.scene.activeTargets[0].word, "you are remembered", "the second original phrase follows the response");
  const current = await reply.reload(); current.scene.resumeBell();
  assertEqual(current.captions.at(-1), "You are remembered.", "a resumed unfinished phrase retains its already-acknowledged narrative context");
  reply.complete(); reply.next(); reply.complete();
  assertEqual(reply.store.get().satchel, ["king-aurland", "trident-token"], "ally and token arrive only after all three bindings");
  const gift = await reply.reload(); gift.scene.resumeBell();
  assert(gift.events.includes("aurland") && gift.events.includes("token") && gift.hasGate(), "the saved gift card rebuilds its giver and token");
  assertEqual(gift.store.get().satchel, ["king-aurland", "trident-token"], "the visible gift does not award it twice");
  gift.next(); gift.next();
  gift.scene.activeTargets.find((target: any) => target.word === "take her with you").onComplete();
  const fish = await gift.reload(); fish.scene.resumeBell();
  assert(fish.hasGate() && fish.events.includes("fish"), "acceptance returns the fish and its original response");
  assertEqual(fish.store.get().realms["sunken-bell"]!.choices.companion, "accepted", "acceptance is committed in realm choices");
  assertEqual(fish.store.get().satchel.filter(id => id === "glass-fish").length, 1, "the companion is awarded once");
  fish.next(); assertEqual(fish.store.get().checkpoint!.step, "true-name", "one original Continue reaches the true name");
});

await suite("Bell checkpoints: tongue consequence and a refused companion never turn into another reward", async () => {
  const f = fixture(chosen("force", null)); f.scene.showFateCues(); f.scene.startFork2ClaimTongue(); f.next(); f.complete();
  const reply = await f.reload(); reply.scene.resumeBell();
  assert(reply.hasGate() && !reply.scene.bellTongueCue, "the torn-free consequence returns without a hanging clapper");
  assertEqual(reply.store.get().satchel, [], "the original consequence precedes its reward");
  reply.next(); assertEqual(reply.store.get().satchel, ["bells-tongue"], "Continue awards only the chosen tongue");
  const reward = await reply.reload(); reward.scene.resumeBell(); reward.next();
  assertEqual(reward.store.get().checkpoint!.step, "true-name", "claiming the tongue never offers the ineligible companion");
  const refused = fixture(chosen("chant", "free-aurland")); refused.scene.startGlassFishGate(); refused.next();
  refused.scene.activeTargets.find((target: any) => target.word === "let her go").onComplete();
  const resumed = await refused.reload(); resumed.scene.resumeBell();
  assert(resumed.hasGate() && resumed.captions.at(-1)!.includes("let the glass-fish go"), "a refusal retains its own readable response");
  assertEqual(resumed.store.get().realms["sunken-bell"]!.choices.companion, "declined", "the explicit refusal survives");
  assertEqual(resumed.store.get().satchel, [], "a refused fish never becomes an accepted inventory fallback");
});

await suite("Bell checkpoints: choir and Warden completion boundaries skip defeated encounters", async () => {
  for (const index of [0, 1, 2, 3]) {
    const f = fixture(chosen(null, null)); f.scene.showChoirCleared(index);
    const resumed = await f.reload(); resumed.scene.resumeBell();
    assertEqual(resumed.events.filter(event => event.startsWith("ghost:")).length, 0, "clear handoff does not rebuild defeated choir actors");
    assertEqual(resumed.timers[0]!.ms, 1200, "the original clear delay is unchanged");
    resumed.tick();
    assertEqual(resumed.store.get().checkpoint!.step, index === 3 ? "chamber" : "choir", "the existing next encounter/lectern follows the clear delay");
  }
  const f = fixture(chosen("chant", null)); f.scene.showWardenPhase1Cleared(node());
  const resumed = await f.reload(); resumed.scene.resumeBell();
  assert(resumed.hasGate() && resumed.scene.activeTargets.length === 0, "the eyes-open response cannot replay phase1");
  resumed.next();
  assertEqual([resumed.store.get().checkpoint!.step, resumed.scene.beatClock.tempo, resumed.scene.beatLocked], ["warden2", 1000, true], "the next original phase retains its faster metered rule");
  const defeat = fixture(chosen("chant", null)); defeat.scene.onWardenDefeated(node());
  const freed = await defeat.reload(); freed.scene.resumeBell();
  assert(freed.hasGate() && freed.scene.activeTargets.length === 0 && !freed.scene.beatClock.running, "defeat response resumes with no combat or targets");
  freed.next(); assertEqual(freed.store.get().checkpoint!.step, "fork2", "Continue reaches the original fate fork");
});

await suite("Bell checkpoints: a fresh realm records its once-only intrusion before the first fork", async () => {
  const f = fixture(); f.scene.startWave2();
  assertEqual(f.store.get().realms["sunken-bell"]!.quietLordIntruded, true, "an initially absent realm records the intrusion durably");
  const resumed = await f.reload(); resumed.scene.resumeBell();
  assertEqual(resumed.scene.quietLordIntruded, true, "actual init restores the once-only flag");
  assertEqual(resumed.timers.length, 0, "restarting the current wave cannot replay the intrusion");
});

await suite("Bell checkpoints: read lectern persists and actual completion clears only its own checkpoint", async () => {
  const f = fixture(chosen("chant", "free-aurland")); f.scene.startBellKeepersChamber(); f.complete();
  const read = await f.reload(); read.scene.resumeBell();
  assert(read.hasGate() && read.scene.bellKeeperLectern?.scene && read.scene.activeTargets.length === 0, "the read lectern and held earned memory return without another read it target");
  assertEqual(read.store.get().almanacLore, ["old-olins-memory"], "lore remains unique");
  read.next(); assertEqual(read.store.get().checkpoint!.step, "chant", "Continue reaches the committed door branch");
  const ending = fixture(chosen("chant", "free-aurland")); ending.scene.checkpoint("ending"); ending.scene.startEnding();
  assertEqual([ending.store.get().realms["sunken-bell"]!.cleared, ending.store.get().checkpoint], [true, null], "actual realm completion clears its matching checkpoint");
  ending.scene.checkpoint("arrival"); assertEqual(ending.store.get().checkpoint, null, "late callbacks cannot install progress for a cleared realm");
  const unrelated = fixture(chosen("force", "claim-tongue"));
  unrelated.store.setCheckpoint({ scene: "SkyIslandScene", step: "arrival", data: {} });
  unrelated.scene.startEnding();
  assertEqual(unrelated.store.get().checkpoint?.scene, "SkyIslandScene", "completion cannot erase another scene's checkpoint");
  const revisit = fixture(chosen("chant", "free-aurland"), true);
  revisit.store.setCheckpoint({ scene: "SunkenBellScene", step: "choir", data: { index: 2 } });
  revisit.scene.startEnding();
  assertEqual(revisit.store.get().checkpoint?.step, "choir", "a revisit cannot clear the campaign checkpoint");
});
