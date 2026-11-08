import { readFileSync } from "node:fs";
import ts from "typescript";
import { bellSoundscapeMood } from "../src/audio/bellSoundscape";
import { bellIndex, type BellStep } from "../src/game/bellCheckpoint";
import { rememberRealmFork } from "../src/game/realmChoices";
import { emptySave, SaveStore, type SaveState } from "../src/game/saveState";
import { SessionStats } from "../src/game/sessionStats";
import { assert, assertEqual, suite } from "./_assert";

// Execute production checkpoints and passage callbacks; only the rendering,
// target display, Web Audio output and Phaser scheduling boundaries are inert.
const source = ts.createSourceFile("SunkenBellScene.ts", readFileSync(new URL("../src/scenes/SunkenBellScene.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["checkpoint", "takeStageData", "commitFork", "startDescent", "startFork1Chant", "runBeatLockedChain", "startFork1ForceBreak",
  "startFork2FreeAurland", "startFork2ClaimTongue", "runFreePassageChain", "beginRhythmEncounters", "onBeatTick"];
const constants = source.statements.filter(ts.isVariableStatement).map(statement => statement.getText(source)).join("\n");
const create = owner.members.find(member => member.name?.getText(source) === "create") as ts.MethodDeclaration;
const beatSetup = create.body!.statements.find(statement => statement.getText(source).startsWith("this.beatClock = new BeatClock"));
assert(beatSetup, "the scene owns its installed timing clock configuration");
const clockSource = ts.createSourceFile("beatClock.ts", readFileSync(new URL("../src/game/beatClock.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const clockOwner = clockSource.statements.find(ts.isClassDeclaration)!;
const fire = clockOwner.members.find(member => member.name?.getText(clockSource) === "fire")!;
const tolls: string[] = [], noop = () => {};
const Clock = new Function("playBellToll", ts.transpileModule(`class Clock {
  constructor(_scene, config) { this.config = config; this.audio = config.audio ?? true; this.onBeat = config.onBeat; this.oneShotListeners = []; }
  ${fire.getText(clockSource)}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + "; return Clock;")(() => tolls.push("clock-toll"));
const code = ts.transpileModule(`${constants}\nclass Bell {
  ${names.map(name => owner.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")}
  setupBeatFixture() { ${beatSetup!.getText(source)} }
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const globals = { bellSoundscapeMood, bellIndex, rememberRealmFork, BeatClock: Clock,
  playBellToll: () => tolls.push("scene-toll"), playWrenAction: noop, playWrenFocus: noop,
  playBodyImpact: noop, playActorAttention: noop };
const Bell = new Function(...Object.keys(globals), `${code}; return Bell;`)(...Object.values(globals));
const stores: SaveStore[] = [];
function fixture(saved?: SaveState["checkpoint"], fork2: "free-aurland" | "claim-tongue" | null = null) {
  const state = emptySave(); state.typewriterAwakened = true;
  state.realms["sunken-bell"] = { cleared: false, choices: {} }; state.checkpoint = saved ?? null;
  if (fork2) state.realms["sunken-bell"].choices.fork2 = fork2;
  const store = new SaveStore({ load: async () => null, save: async () => {} }, state, { saveDelayMs: 60_000 }); stores.push(store);
  const stats = new SessionStats(); stats.bankSoulFraction(.425);
  const scene = new Bell(), cues: string[] = [], moods: string[] = [], events: string[] = [], targets: any[] = [], timers: any[] = [];
  let gate: (() => void) | null = null;
  Object.assign(scene, {
    store, revisit: false, resumeCheckpoint: saved ?? null, fork2Choice: fork2, graceSaves: 2, combatSatchel: ["quiet-chant"],
    typingInput: { getStats: () => stats }, breath: { getAir: () => 77 },
    soundscape: { setMood(mood: string) { moods.push(mood); events.push(`mood:${mood}`); }, cue(material: string) { cues.push(material); events.push(`cue:${material}`); } },
    scale: { width: 1920, height: 1080 }, wrenContainer: { x: 960, y: 820 }, wrenSprite: {}, activeTargets: [],
    band: { setObjective: noop }, setStoryObjective: noop, setNarrator: noop, narration: { say: noop },
    fadeOutForkCue: noop, clearAurlandToken: noop, showAurland: noop,
    bellPassageWordPosition: () => ({ x: 600, y: 500 }),
    makeWord: (options: any) => options, makeBellForkWord: (_body: any, options: any) => options, makeAurlandWord: (options: any) => options,
    registerActiveTarget(...values: any[]) { scene.activeTargets = values; targets.push(...values); },
    clearActiveTargets() { scene.activeTargets = []; },
    readThen(next: () => void) { assert(!gate, "the current story response retains one deliberate Continue"); gate = next; },
    time: { delayedCall(delay: number, next: () => void) { timers.push({ delay, next }); } },
    openCathedralDoor(mode: string, immediate = false) { events.push(`door:${mode}:${immediate}`); },
    openForceDoorCue(immediate = false) { events.push(`door:force:${immediate}`); },
    showFork1Reward: () => events.push("reward1"), showFork2Reward: () => events.push("reward2"),
    showDescentLantern: (index: number) => ({ index }), lightDescentLantern: (lantern: any) => events.push(`light:${lantern.index}`),
    activateDescentLantern: noop, descentLanternWordPosition: () => ({ x: 600, y: 500 }),
    attachDescentLanternWordAnchor: () => ({}), releaseDescentLanternWordAnchor: noop,
    rhythmLabel: { setAlpha: noop }, pulseBeatRing: () => events.push("ring:on"), pulseOffbeatRing: () => events.push("ring:off"),
    startFirstGhostEncounter: () => events.push("first-encounter"),
  });
  return { scene, store, stats, cues, moods, events, targets, timers,
    active: () => scene.activeTargets as any[], gate: () => gate,
    continue() { const next = gate; assert(next, "Continue belongs to a waiting response"); gate = null; next!(); },
    timer() { const next = timers.shift(); assert(next, "the existing scene timer is pending"); next.next(); },
  };
}

await suite("Bell audio integration: actual checkpoints change atmosphere without changing saved resources or story choices", () => {
  for (const choice of [null, "free-aurland", "claim-tongue"] as const) {
    const f = fixture(undefined, choice), before = structuredClone(f.store.get().realms["sunken-bell"].choices);
    for (const step of ["descent", "practice", "choir", "chamber", "chant", "force-break", "warden2", "warden-defeated", "fork2-reward", "ending"] as BellStep[]) {
      f.scene.checkpoint(step, { index: 1, reading: true });
      assertEqual(f.moods.at(-1), bellSoundscapeMood(step, choice ?? undefined), "actual durable progress owns the same atmosphere as restored entry");
      const saved = f.store.get().checkpoint!;
      assertEqual([saved.step, saved.data.statsSoul, saved.data.air, saved.data.graceSaves, saved.data.combatSatchel], [step, 42.5, 77, 2, "quiet-chant"], "audio adds no resource cost, timing data or alternate gameplay checkpoint");
    }
    assertEqual(f.store.get().realms["sunken-bell"].choices, before, "soundtrack selection cannot choose or reverse either story outcome");
  }
});

await suite("Bell audio integration: restored lanterns stay silent and only new completed descent actions sound", () => {
  const f = fixture(); f.scene.startDescent();
  assertEqual(f.cues, [], "building unlit lanterns does not play an action cue");
  f.active()[0].onComplete();
  assertEqual(f.cues, ["bell-lantern"], "completing a new lantern owns one material sound");
  const restored = fixture(structuredClone(f.store.get().checkpoint)); restored.scene.startDescent();
  assertEqual([restored.cues, restored.events.filter(value => value.startsWith("light:"))], [[], ["light:0"]], "restoring earned light reconstructs the lantern without replaying its sound");
  restored.active()[0].onComplete();
  assertEqual(restored.cues, ["bell-lantern"], "the next uncompleted lantern can sound normally after reload");
});

await suite("Bell audio integration: the quiet door sounds on its last live character while restored held opening stays silent", () => {
  const f = fixture(); f.scene.startFork1Chant();
  for (let index = 0; index < 4; index++) {
    const target = f.active()[0]; target.onAdvance(target.word.length - 1, target.word.length);
    assertEqual(f.cues, [], "partial quiet phrases cannot claim an opening sound");
    target.onAdvance(target.word.length, target.word.length);
    if (index === 3) assertEqual(f.events.slice(-2), ["cue:bell-latch", "door:chant:false"], "the live final character couples the latch sound with the physical door opening before its exit");
    target.onComplete();
    if (index < 3) f.continue();
  }
  assertEqual(f.cues, ["bell-latch"], "settling the same open leaves for reading adds no second latch sound");
  const restored = fixture(structuredClone(f.store.get().checkpoint)); restored.scene.startFork1Chant();
  assertEqual([restored.cues, restored.events.filter(value => value.startsWith("door:")), restored.gate() !== null], [[], ["door:chant:true"], true], "the actual saved final response opens masonry immediately and silently");
});

await suite("Bell audio integration: force break keeps one physical rubble cue and skips it on completed passage restoration", () => {
  const f = fixture(); f.scene.startFork1ForceBreak(); f.timer();
  for (let index = 0; index < 4; index++) {
    const target = f.active()[0]; target.onAdvance(target.word.length, target.word.length);
    assertEqual(f.cues, index === 3 ? ["bell-rubble"] : [], "only the last breaking word owns the door's physical rupture");
    target.onComplete();
  }
  const restored = fixture(structuredClone(f.store.get().checkpoint)); restored.scene.startFork1ForceBreak(); restored.timer();
  assertEqual([restored.cues, restored.events.filter(value => value.startsWith("door:"))], [[], ["door:force:true"]], "a completed force passage restores its open door without a second break sound");
  assert(f.events.includes("reward1") && restored.events.includes("reward1"), "sound leaves the original held reward destination intact");
});

await suite("Bell audio integration: free and claim cues belong to live passages rather than restored prop settlement", () => {
  for (const fate of ["free-aurland", "claim-tongue"] as const) {
    const f = fixture(undefined, fate);
    const start = (scene: any) => fate === "free-aurland" ? scene.startFork2FreeAurland() : scene.startFork2ClaimTongue();
    start(f.scene); f.continue();
    const count = fate === "free-aurland" ? 3 : 1;
    let heldBeforeFinal: SaveState["checkpoint"] = null;
    for (let index = 0; index < count; index++) {
      const target = f.active()[0]; target.onComplete();
      if (index < count - 1) {
        assertEqual(f.cues, [], "unbinding words do not release the king before his final live phrase");
        heldBeforeFinal = structuredClone(f.store.get().checkpoint); f.continue();
      }
    }
    assertEqual(f.cues, [fate === "free-aurland" ? "bell-release" : "bell-latch"], "the completed chosen action sounds once and does not imitate a timing toll");
    // Claim's held reaction invokes its original prop hook on restore. The
    // freeing route's final word skips straight to reward, so restore its
    // preceding held response and verify new completion remains earned.
    const checkpoint = fate === "free-aurland" ? heldBeforeFinal : structuredClone(f.store.get().checkpoint);
    const restored = fixture(checkpoint, fate); start(restored.scene);
    assertEqual(restored.cues, [], "restored reading/prop callbacks cannot replay the branch's action Foley");
    assert(restored.gate(), "the same earned reaction still requires deliberate Continue after restoring");
    if (fate === "free-aurland") {
      restored.continue(); restored.active()[0].onComplete();
      assertEqual(restored.cues, ["bell-release"], "an actually unfinished final release may still sound after restoring the previous response");
    }
  }
});

await suite("Bell audio integration: rhythm entry lowers the score before its first unchanged timing anchor", () => {
  const f = fixture(); const ordering: string[] = [];
  f.scene.soundscape.setMood = (mood: string) => ordering.push(`mood:${mood}`);
  f.scene.beatClock = { setTempo: (value: number) => ordering.push(`tempo:${value}`), start: () => ordering.push("first-toll") };
  const saved = JSON.stringify(f.store.get()); f.scene.beginRhythmEncounters();
  assertEqual(ordering, ["mood:bell-rhythm", "tempo:2000", "first-toll"], "the practice transition reserves the existing first toll before its2s encounter wait");
  assertEqual(f.timers.map(value => value.delay), [2000], "audio does not retune the original encounter timing");
  assertEqual(JSON.stringify(f.store.get()), saved, "the pre-encounter mix adds no fabricated combat progress or resource snapshot");
});

await suite("Bell audio integration: the actual clock retains its schedule but sounds only while the scene owns a rhythm phase", () => {
  const f = fixture(); f.scene.setupBeatFixture();
  assertEqual(f.scene.beatClock.config.audio, false, "the generic clock does not also emit an unconditional duplicate toll");
  Object.assign(f.scene.beatClock, { getTempo: () => 2000, getWindowMs: () => 350 });
  const before = tolls.length;
  for (const phase of ["free", "on", "off"]) { f.scene.beatPhase = phase; f.scene.beatClock.fire(); }
  assertEqual(tolls.slice(before), ["scene-toll", "scene-toll"], "the actual fire callback is silent for untimed story and emits one original toll for on/off rhythm");
  assertEqual(f.events.filter(value => value === "ring:on").length, 2, "both original rhythm phases retain the visual timing anchor");
  assertEqual(f.timers.map(value => value.delay), [825], "the antiphon still opens its centered visual window at the original offset");
});

await Promise.all(stores.map(store => store.flush()));
