import { readFileSync } from "node:fs";
import ts from "typescript";
import { skySoundscapeMood } from "../src/audio/skySoundscape";
import { rememberRealmFork, resolveRealmFork } from "../src/game/realmChoices";
import { emptySave, SaveStore, type SaveState } from "../src/game/saveState";
import { SessionStats } from "../src/game/sessionStats";
import { assert, assertEqual, suite } from "./_assert";

// Exercise original scene/checkpoint methods and the real target dispatcher.
// Only rendering, output and scheduling are replaced at their boundaries.
const source = ts.createSourceFile("SkyIslandScene.ts", readFileSync(new URL("../src/scenes/SkyIslandScene.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["checkpoint", "savedStageData", "commitFork", "runPathBeats", "resumePath", "startEttaHelp", "resumeEttaBook", "finishRestoredEttaBook", "startFork1HelpEtta", "startFork1StealFlame", "startFork2KindEnding", "startFork2CutTether", "runPassageChain", "startRevisit"];
const constants = source.statements.filter(ts.isVariableStatement).map(statement => statement.getText(source)).join("\n");
const code = ts.transpileModule(`${constants}\nclass Sky { ${names.map(name => owner.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const noop = () => {};
const globals = { skySoundscapeMood, rememberRealmFork, resolveRealmFork,
  playWrenAction: noop, playWrenFocus: noop, playBodyImpact: noop, playActorAttention: noop,
  playPortalArrivalWake: noop, playChime: noop, PALETTE_HEX: { brass: 0xc6a267 } };
const Sky = new Function(...Object.keys(globals), `${code}; return Sky;`)(...Object.values(globals));
const targetSource = ts.createSourceFile("wordTarget.ts", readFileSync(new URL("../src/game/wordTarget.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const targetOwner = targetSource.statements.find(ts.isClassDeclaration)!;
const complete = targetOwner.members.find(member => member.name?.getText(targetSource) === "onComplete")!;
const Target = new Function("playWordCompleteBurst", "PALETTE_HEX", ts.transpileModule(`class Target { ${complete.getText(targetSource)} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + "; return Target;")(noop, globals.PALETTE_HEX);
const stores: SaveStore[] = [];
function body(x = 0, y = 0): any {
  return { x, y, scene: true, alpha: 1, angle: 0,
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
    setAngle(angle: number) { this.angle = angle; return this; }, getByName: () => body() };
}
function fixture(saved?: SaveState["checkpoint"], first: "help-etta" | "steal-flame" | null = null, second: "answer-kindly" | "cut-tether" | null = null) {
  const state = emptySave(); state.typewriterAwakened = true;
  state.realms["sky-island"] = { cleared: false, choices: {} }; state.checkpoint = saved ?? null;
  if (first) state.realms["sky-island"].choices.fork1 = first;
  if (second) state.realms["sky-island"].choices.fork2 = second;
  const store = new SaveStore({ load: async () => null, save: async () => {} }, state, { saveDelayMs: 60_000 }); stores.push(store);
  const stats = new SessionStats(); stats.bankSoulFraction(.425);
  const scene = new Sky(), cues: string[] = [], moods: string[] = [], events: string[] = [], targets: any[] = [], moves: Array<() => void> = [];
  let gate: (() => void) | null = null;
  Object.assign(scene, {
    store, revisit: false, resumeCheckpoint: saved ?? null, fork1Choice: first, fork2Choice: second,
    usedOneShots: new Set(["toll-strike"]), oneShotInvoker: { getSpent: () => ["toll-strike", "bind-beat"] }, combatSatchel: ["ettas-ledger"],
    typingInput: { getStats: () => stats },
    soundscape: { setMood(mood: string) { moods.push(mood); events.push(`mood:${mood}`); }, cue(material: string) { cues.push(material); events.push(`cue:${material}`); } },
    scale: { width: 1920, height: 1080 }, wrenContainer: body(960, 826), wrenSprite: {}, activeTargets: [],
    band: { setObjective: noop }, setNarrator: noop,
    pathWordPosition: () => ({ x: 600, y: 330 }), pathWrenPosition: () => ({ x: 700, y: 800 }),
    showPathCue() { scene.pathCue = body(); }, walkWrenToPathBeat: noop, pulsePathCue: noop,
    dismissPathCue: noop, resetWrenToSkyStage: noop, setAmbientLanternFieldAlpha: noop,
    tweens: { killTweensOf: noop, add(options: any) { options.onComplete?.(); } }, time: { delayedCall: noop },
    makePathWord: (options: any) => options, makeEttaWord: (options: any) => options,
    makeSkyForkWord: (_body: any, options: any) => options, makeEttaBookWord: (options: any) => options,
    registerActiveTarget(...values: any[]) { scene.activeTargets = values; targets.push(...values); },
    clearActiveTargets() { scene.activeTargets = []; },
    readThen(next: () => void) { assert(!gate, "one deliberate Continue owns the held original response"); gate = next; },
    showEtta() { scene.ettaSprite ??= body(); }, hideEtta: noop, ettaDone: false,
    ettaSprite: body(), beaconFlameCue: body(), fork2Scholar: body(), tetherThreadCue: body(), kindAnswerCue: body(),
    showEttaBookCue: () => body(760, 826),
    restoreEttaBookPose: (pose: string) => events.push(`book:${pose}`),
    moveEttaBook(pose: string, settled: () => void) { events.push(`move:${pose}`); moves.push(settled); },
    setEttaHelpBeaconBright: (bright: boolean) => events.push(`beacon:${bright}`),
    dimBeaconFlameVisual: () => events.push("beacon:dim"), takeBeaconSparkVisual: () => events.push("beacon:take"), clearHeldBeaconSpark: noop,
    releaseFork2Spirit: (restored: boolean) => events.push(`release:${restored}`),
    fadeOutForkCue: noop, skyOwnedWordPosition: () => ({ x: 600, y: 500 }),
    startAct3: () => events.push("boss"), startTemple: (index: number) => events.push(`temple:${index}`),
    startLanternMothGate: () => events.push("moth"),
    stageSkyRevisitAftermath: () => events.push("revisit-paintings"), deliverRevisitPassage: noop,
  });
  return { scene, store, stats, cues, moods, events, targets,
    active: () => scene.activeTargets as any[], gate: () => gate,
    continue() { const next = gate; assert(next, "the original scene offers a deliberate Continue"); gate = null; next!(); },
    settle() { const next = moves.shift(); assert(next, "the original physical action has a pending settlement"); next!(); },
    complete(options = (scene.activeTargets as any[])[0], spell = false) {
      const target = new Target();
      Object.assign(target, { opts: options, spellClaimed: spell, altClaimed: false, container: { x: 600, y: 500 }, playBannerWake: noop, destroy: noop });
      target.onComplete();
    },
  };
}

await suite("Sky audio integration: durable checkpoints forward action evidence without changing resources or story choices", () => {
  for (const first of [null, "help-etta", "steal-flame"] as const) {
    const f = fixture(undefined, first, "answer-kindly"), choices = structuredClone(f.store.get().realms["sky-island"].choices);
    for (const step of ["path", "first-spirits", "temple", "help-etta", "steal-flame", "boss", "boss-defeated", "answer-kindly", "cut-tether", "ending"]) {
      const data = { index: 1, reading: true, helpedBefore: true };
      f.scene.checkpoint(step, data);
      assertEqual(f.moods.at(-1), skySoundscapeMood(step, first, "answer-kindly", data), "the actual durable checkpoint forwards its completed phrase evidence to the owned mix");
      const saved = f.store.get().checkpoint!;
      assertEqual([saved.step, saved.data.statsSoul, saved.data.usedOneShots, saved.data.combatSatchel], [step, 42.5, "toll-strike,bind-beat", "ettas-ledger"], "sound adds no cost, resource restoration, timing field or different combat loadout");
    }
    assertEqual(f.store.get().realms["sky-island"].choices, choices, "audio routing cannot change saved branches");
    const before = JSON.stringify(f.store.get().checkpoint); f.scene.revisit = true; f.scene.checkpoint("ending");
    assertEqual([f.moods.at(-1), JSON.stringify(f.store.get().checkpoint)], [skySoundscapeMood("ending", first, "answer-kindly"), before], "a cleared/revisit room updates sound without overwriting the pending journey");
  }
});

await suite("Sky audio integration: live traversal owns one material cue and held path reconstruction stays silent", () => {
  for (let index = 0; index < 3; index++) {
    const f = fixture(); f.scene.runPathBeats(index);
    assertEqual(f.cues, [], "drawing the next obstacle cannot claim its action");
    f.active()[0].onClaim(); assertEqual(f.cues, [], "claiming and walking toward an object are silent until completion");
    f.complete(); assertEqual(f.cues, [index === 1 ? "sky-lantern" : "sky-stone"], "the original target dispatcher completes exactly one material contact");
    const restored = fixture(structuredClone(f.store.get().checkpoint)); restored.scene.resumePath(index, true);
    assertEqual([restored.cues, restored.gate() !== null], [[], true], "restoring the held traversal response never replays a footstep or lantern lift");
  }
});

await suite("Sky audio integration: the one physical book sounds on live lift and placement, including resumed placement", () => {
  for (const spell of [false, true]) {
    const f = fixture(); f.scene.startEttaHelp(3); f.continue();
    assertEqual(f.cues, [], "approach and displayed lift wait for the actual completed target");
    f.complete(f.active()[0], spell);
    assertEqual([f.cues, f.store.get().checkpoint?.data.stage], [["sky-book"], "carried"], "normal or spell completion dispatches only one live book lift");
    const carried = fixture(structuredClone(f.store.get().checkpoint)); carried.scene.resumeEttaBook();
    assertEqual([carried.cues, carried.events.includes("book:carried"), carried.gate() !== null], [[], true, true], "restoring the carried pose is silent and still awaits acknowledgment");
    carried.continue(); carried.complete();
    assertEqual(carried.cues, ["sky-book"], "a resumed pending placement is a genuinely new action");
    const shelved = fixture(structuredClone(carried.store.get().checkpoint)); shelved.scene.resumeEttaBook();
    assertEqual([shelved.cues, shelved.events.includes("book:shelved")], [[], true], "restoring the shelved reward does not repeat paper movement");
    assertEqual(shelved.store.get().almanacLore, ["scholar-ettas-last-volume"], "silent restoration preserves the original one-time book memory");
    f.settle(); f.continue(); f.complete();
    assertEqual(f.cues, ["sky-book", "sky-book"], "the uninterrupted original branch has the same one lift and one placement");
    assertEqual(f.store.get().almanacLore, [], "audio completion cannot grant lore before the original book settlement");
    f.settle(); assertEqual(f.store.get().almanacLore, ["scholar-ettas-last-volume"], "the original visual settlement still owns the memory reward");
  }
});

await suite("Sky audio integration: Etta and theft cues belong only to live phrases, never replayed visual restoration", () => {
  for (const helpedBefore of [false, true]) {
    const f = fixture(); f.scene.ettaDone = helpedBefore; f.scene.startFork1HelpEtta(); f.continue();
    const expected = helpedBefore ? [[], ["sky-lantern"]] : [["sky-book"], ["sky-book"], [], ["sky-lantern"]];
    let prior: string[] = [];
    for (let index = 0; index < expected.length; index++) {
      f.complete(); prior = [...prior, ...expected[index]!];
      assertEqual(f.cues, prior, "each actually completed help phrase owns only its physical book or final beacon sound");
      const restored = fixture(structuredClone(f.store.get().checkpoint), "help-etta"); restored.scene.startFork1HelpEtta();
      assertEqual([restored.cues, restored.moods.at(-1)], [[], f.moods.at(-1)], "replaying book/beacon poses for the held response preserves its mix with no action cue");
      if (index < expected.length - 1) f.continue();
    }
    assertEqual(f.moods.at(-1), "sky-rest", "only the completed final beacon phrase receives warmer rest");
  }
  const theft = fixture(); theft.scene.startFork1StealFlame(); theft.continue();
  for (let index = 0; index < 4; index++) {
    theft.complete();
    assertEqual(theft.cues, index < 2 ? [] : ["sky-lantern"], "taking the actual spark owns one cue; narrative theft acknowledgments do not add fake physical sounds");
    const restored = fixture(structuredClone(theft.store.get().checkpoint), "steal-flame"); restored.scene.startFork1StealFlame();
    assertEqual([restored.cues, restored.moods.at(-1)], [[], theft.moods.at(-1)], "held or prior spark/dimming consequences reconstruct silently with the saved atmosphere");
    if (index < 3) theft.continue();
  }
  assertEqual(theft.store.get().realms["sky-island"].choices.fork1, "steal-flame", "sound cannot switch to Etta's reward branch");
});

await suite("Sky audio integration: summit answer completion changes sound once and restored responses stay silent", () => {
  for (const spell of [false, true]) {
    const kind = fixture(undefined, "steal-flame"); kind.scene.startFork2KindEnding(); kind.continue();
    assertEqual([kind.cues, kind.moods.at(-1)], [[], "sky-rest-dim"], "displaying the kind answer cannot claim its restored light yet");
    kind.complete(kind.active()[0], spell);
    assertEqual([kind.cues, kind.moods.at(-1)], [["sky-lantern"], "sky-kind"], "actual normal or spell completion plays one light cue and brightens the summit mix");
    const restored = fixture(structuredClone(kind.store.get().checkpoint), "steal-flame", "answer-kindly"); restored.scene.startFork2KindEnding();
    assertEqual([restored.cues, restored.moods.at(-1), restored.gate() !== null], [[], "sky-kind", true], "held kind response retains its bright consequence without an action replay");
  }
  const cut = fixture(undefined, "steal-flame"); cut.scene.startFork2CutTether(); cut.continue();
  cut.complete(); assertEqual([cut.cues, cut.moods.at(-1)], [[], "sky-rest-dim"], "pulling the thread has not completed its release");
  cut.continue(); cut.complete();
  assertEqual([cut.cues, cut.moods.at(-1)], [["sky-tether"], "sky-freed-dim"], "only the completed fall releases the wind and sounds its material action");
  const restored = fixture(structuredClone(cut.store.get().checkpoint), "steal-flame", "cut-tether"); restored.scene.startFork2CutTether();
  assertEqual([restored.cues, restored.moods.at(-1), restored.events.includes("release:true")], [[], "sky-freed-dim", true], "tether pose restoration stays silent and retains its independently dark beacon");
});

await suite("Sky audio integration: revisits resolve canonical and legacy branch history without changing the save", () => {
  const cases: { choices: Record<string, string>; satchel: string[]; mood: string }[] = [
    { choices: { fork1: "help-etta", fork2: "answer-kindly" }, satchel: ["beacon-spark", "tether-cord"], mood: "sky-kind" },
    { choices: { fork1: "beacon", fork2: "cut-tether" }, satchel: [], mood: "sky-freed-dim" },
    { choices: {}, satchel: ["ettas-ledger", "tether-cord"], mood: "sky-freed" },
    { choices: {}, satchel: ["ettas-ledger", "beacon-spark", "wind-phrase", "tether-cord"], mood: "sky-rest" },
  ];
  for (const test of cases) {
    const f = fixture(); f.store.update(state => { state.realms["sky-island"] = { cleared: true, choices: test.choices }; state.satchel = test.satchel; });
    f.scene.revisit = true; const before = JSON.stringify(f.store.get()); f.scene.startRevisit();
    assertEqual([f.moods, f.cues, f.events.includes("revisit-paintings")], [[test.mood], [], true], "the owned soundtrack follows the same canonical aftermath precedence as the visible original room");
    assertEqual(JSON.stringify(f.store.get()), before, "a quiet revisit cannot change choices, reward inventory, lore or the journey checkpoint");
  }
});

await Promise.all(stores.map(store => store.flush()));
