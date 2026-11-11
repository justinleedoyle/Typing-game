import { readFileSync } from "node:fs";
import ts from "typescript";
import { woodSoundscapeMood } from "../src/audio/woodSoundscape";
import { woodIndex, type WoodStep } from "../src/game/woodCheckpoint";
import { rememberRealmFork, resolveRealmFork } from "../src/game/realmChoices";
import { emptySave, SaveStore, type SaveState } from "../src/game/saveState";
import { SessionStats } from "../src/game/sessionStats";
import { assert, assertEqual, suite } from "./_assert";

// Execute original scene methods and the real target completion dispatcher.
// Drawing, animation and clock scheduling are inert at their boundaries; no
// duplicated choice, passage or resource implementation is used here.
const source = ts.createSourceFile("HauntedWoodScene.ts", readFileSync(new URL("../src/scenes/HauntedWoodScene.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["checkpoint", "commitFork", "startPathExploration", "startFork1Offering", "startFork1BoneFlute", "startFork2", "startFork2Bargain", "startFork2Force", "runPassageChain", "deliverFinalSecondPassage", "runWordByWordPassage", "startRevisit"];
const constants = source.statements.filter(ts.isVariableStatement).map(node => node.getText(source)).join("\n");
const code = ts.transpileModule(`${constants}\nclass Wood { ${names.map(name => owner.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const noop = () => {};
const globals = { woodSoundscapeMood, woodIndex, rememberRealmFork, resolveRealmFork,
  playWrenAction: noop, playWrenFocus: noop, playBodyImpact: noop, playChime: noop,
  playPortalArrivalWake: noop, PALETTE_HEX: { moss: 0xaabb99, brass: 0xc6a267 } };
const Wood = new Function(...Object.keys(globals), `${code}; return Wood;`)(...Object.values(globals));
const targetSource = ts.createSourceFile("wordTarget.ts", readFileSync(new URL("../src/game/wordTarget.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const targetOwner = targetSource.statements.find(ts.isClassDeclaration)!;
const complete = targetOwner.members.find(member => member.name?.getText(targetSource) === "onComplete")!;
const Target = new Function("playWordCompleteBurst", "PALETTE_HEX", ts.transpileModule(`class Target { ${complete.getText(targetSource)} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + "; return Target;")(noop, globals.PALETTE_HEX);
const stores: SaveStore[] = [];

function fixture(saved?: SaveState["checkpoint"], first: "offering" | "bone-flute" | null = null, second: "bargain" | "force" | null = null) {
  const state = emptySave(); state.typewriterAwakened = true;
  state.realms["haunted-wood"] = { cleared: false, choices: {} }; state.checkpoint = saved ?? null;
  if (first) state.realms["haunted-wood"].choices.fork1 = first;
  if (second) state.realms["haunted-wood"].choices.fork2 = second;
  const store = new SaveStore({ load: async () => null, save: async () => {} }, state, { saveDelayMs: 60_000 }); stores.push(store);
  const stats = new SessionStats(); stats.bankSoulFraction(.425); stats.record(true); stats.record(false);
  const scene = new Wood(), cues: string[] = [], moods: string[] = [], events: string[] = [], targets: any[] = [], timers: (() => void)[] = [];
  let gate: (() => void) | null = null, handoff: (() => void) | null = null;
  Object.assign(scene, {
    store, revisit: false, checkpointStep: "arrival", fork1Choice: first, fork2Choice: second,
    usedOneShots: ["toll-strike"], combatSatchel: ["bellows-hammer"], typingInput: { getStats: () => stats },
    soundscape: { setMood(mood: string) { moods.push(mood); events.push(`mood:${mood}`); }, cue(material: string) { cues.push(material); events.push(`cue:${material}`); } },
    scale: { width: 1920, height: 1080 },
    wrenContainer: { x: 960, y: 826, setPosition(x: number, y: number) { this.x = x; this.y = y; return this; } }, wrenSprite: {}, activeTargets: [],
    band: { setObjective: noop }, narration: { say: noop }, setNarrator: noop,
    pathWordPosition: () => ({ x: 600, y: 500 }), pathWrenPosition: () => ({ x: 700, y: 820 }),
    showPathCue: noop, pulsePathCue: noop, releasePathCueWordAnchor: noop, attachPathCueWordAnchor: noop,
    walkWrenToPathBeat: noop, dismissPathCue: noop, resetWrenToWoodStage: noop,
    fadeOutForkCue: noop, showFork2Cues: noop, attendGhostKing: noop, clearHeldWoodRelic: noop,
    igniteGroveLightCue: () => events.push("ignite"), showGatheredAshVial: noop,
    ownerPassageWordPosition: () => ({ x: 600, y: 500 }), offeringCue: { scene: true }, boneFluteCue: { scene: true }, ghostKingBody: { scene: true }, groveLightCue: { scene: true },
    makeWord: (options: any) => options, makeWoodForkWord: (_body: any, options: any) => options, makeGhostKingWord: (options: any) => options,
    registerActiveTarget(...values: any[]) { scene.activeTargets = values; targets.push(...values); },
    clearActiveTargets() { scene.activeTargets = []; },
    readThen(next: () => void) { assert(!gate, "one deliberate Continue owns the current held response"); gate = next; },
    settleBoneFluteInHand(next: () => void) { assert(!handoff, "one physical flute handoff owns its settlement callback"); handoff = next; },
    tweens: { add(options: any) { options.onComplete?.(); } },
    time: { delayedCall(_delay: number, next: () => void) { timers.push(next); } },
    finishOffering: () => events.push("reward:offering"), finishFlute: () => events.push("reward:flute"), finishBargain: () => events.push("reward:bargain"), startBossFight: () => events.push("boss"),
    onFinalPassageComplete: () => events.push("sealed"),
    restoreWoodRevisitAftermath: (a: string | null, b: string | null) => events.push(`restore:${a}:${b}`), deliverRevisitPassage: noop,
  });
  return { scene, store, stats, cues, moods, events, targets, timers,
    active: () => scene.activeTargets as any[], gate: () => gate,
    continue() { const next = gate; assert(next, "Continue belongs to a held response"); gate = null; next!(); },
    settle() { const next = handoff; assert(next, "a real flute handoff must be pending"); handoff = null; next!(); },
    complete(options = (scene.activeTargets as any[])[0]) {
      const target = new Target();
      Object.assign(target, { opts: options, spellClaimed: false, altClaimed: false, container: { x: 600, y: 500 }, playBannerWake: noop, destroy: noop });
      target.onComplete();
    },
  };
}

await suite("Wood audio integration: checkpoints pass actual completion data without changing choices or resources", () => {
  for (const first of [null, "offering", "bone-flute"] as const) {
    const f = fixture(undefined, first, "force"), choices = structuredClone(f.store.get().realms["haunted-wood"].choices);
    const resources = f.stats.captureCheckpoint();
    for (const step of ["path", "crossroads1", "flute", "force", "boss-a", "capstone", "final2", "sealed"] as WoodStep[]) {
      f.scene.checkpoint(step, { index: 1, response: true });
      assertEqual(f.moods.at(-1), woodSoundscapeMood(step, first, "force", { index: 1, response: true }), "the actual checkpoint forwards phrase completion to the resolver");
      const saved = f.store.get().checkpoint!;
      assertEqual([saved.step, saved.data.statsSoul, saved.data.spentOneShots, saved.data.combatSatchel], [step, resources.statsSoul, "toll-strike", "bellows-hammer"], "audio changes no resources, original boundary or frozen loadout");
      assertEqual(f.stats.captureCheckpoint(), resources, "routing alone cannot spend health, soul or accuracy history");
    }
    assertEqual(f.store.get().realms["haunted-wood"].choices, choices, "atmosphere never selects or replaces either branch");
    const before = JSON.stringify(f.store.get().checkpoint); f.scene.revisit = true; f.scene.checkpoint("sealed");
    assertEqual([f.moods.at(-1), JSON.stringify(f.store.get().checkpoint)], [woodSoundscapeMood("sealed", first, "force"), before], "revisit may update atmosphere without replacing active progress");
  }
});

await suite("Wood audio integration: the root step sounds once while quiet words and restored path responses stay silent", () => {
  for (let index = 0; index < 3; index++) {
    const f = fixture(); f.scene.startPathExploration(index);
    assertEqual(f.cues, [], "showing a path action does not complete it");
    f.active()[0].onClaim(); assertEqual(f.cues, [], "claiming/moving is not physical contact completion");
    f.complete(); assertEqual(f.cues, index === 0 ? ["wood-root"] : [], "only stepping over roots adds material sound; hush/wait do not invent speech or movement");
    const restored = fixture(structuredClone(f.store.get().checkpoint)); restored.scene.startPathExploration(index, true);
    assertEqual([restored.cues, restored.gate() !== null], [[], true], "restored held path responses have no replayed contact cue");
  }
});

await suite("Wood audio integration: offering and silent flute sounds belong to live actions rather than reconstructed handoffs", () => {
  const offering = fixture(); offering.scene.startFork1Offering();
  assertEqual([offering.cues, offering.moods.at(-1)], [[], "wood-hush"], "choosing the offering and reading its introduction stay silent");
  offering.continue(); offering.complete();
  assertEqual(offering.cues, ["wood-lantern"], "completing remembrance owns one shrine/light cue");
  const restoredOffering = fixture(structuredClone(offering.store.get().checkpoint), "offering"); restoredOffering.scene.startFork1Offering(0, true, true);
  assertEqual([restoredOffering.cues, restoredOffering.gate() !== null], [[], true], "restoring the glowing shrine response never plays its action again");

  const flute = fixture(); flute.scene.startFork1BoneFlute(); flute.continue(); flute.complete();
  assertEqual([flute.cues, flute.moods.at(-1)], [[], "wood-hush"], "reaching into the hollow has not taken the silent flute");
  flute.continue(); flute.complete();
  assertEqual([flute.cues, flute.moods.at(-1)], [["wood-stone"], "wood-restless"], "the live take-it target changes the forest and sounds the cold hollow contact, never a flute melody");
  assertEqual(flute.gate(), null, "the response still waits for its original physical handoff settlement");
  const saved = structuredClone(flute.store.get().checkpoint);
  assertEqual(saved?.data.response, true, "the completed action is durable before its handoff animation");
  flute.settle(); assert(flute.gate(), "original handoff settlement exposes Continue");
  const restoredFlute = fixture(saved, "bone-flute"); restoredFlute.scene.startFork1BoneFlute(1, true, true); restoredFlute.settle();
  assertEqual([restoredFlute.cues, restoredFlute.moods.at(-1), restoredFlute.gate() !== null], [[], "wood-restless", true], "a reconstructed flute handoff retains restlessness without replaying material sound");
});

await suite("Wood audio integration: the live fire choice sounds once and restored force does not replay ignition", () => {
  const f = fixture(undefined, "offering"); f.scene.startFork2();
  assertEqual([f.cues, f.moods.at(-1)], [[], "wood-hush"], "an undecided second fork has no invented fire");
  const force = f.active().find(target => target.word === "light the grove"); assert(force, "the original fork still exposes its authored physical lighting command");
  f.complete(force);
  assertEqual([f.cues, f.moods.at(-1), f.events.includes("ignite")], [["wood-lantern"], "wood-ash", true], "the real selected target owns one lighting cue and the completed fire mood");
  assertEqual([f.store.get().realms["haunted-wood"].choices.fork2, f.store.get().satchel], ["force", ["ash-vial"]], "audio preserves the original committed choice and one original reward");
  const restored = fixture(structuredClone(f.store.get().checkpoint), "offering", "force"); restored.scene.startFork2Force();
  assertEqual([restored.cues, restored.moods.at(-1), restored.events.includes("ignite")], [[], "wood-ash", true], "restoring the spent action rebuilds the original flame state without a new ignition cue");
});

await suite("Wood audio integration: living root response and the final seal never replay from completed checkpoints", () => {
  const f = fixture(undefined, "offering"); f.scene.startFork2Bargain(); f.continue(); f.complete();
  assertEqual(f.cues, ["wood-root"], "the completed first bargain phrase owns uncurling roots");
  const restored = fixture(structuredClone(f.store.get().checkpoint), "offering", "bargain"); restored.scene.startFork2Bargain(0, true, true);
  assertEqual(restored.cues, [], "restoring the listened-to response does not uncurl roots audibly again");
  restored.continue(); restored.complete(); assertEqual(restored.cues, [], "the remaining remembered words introduce no invented physical action");

  const seal = fixture(undefined, "offering", "bargain"); seal.scene.deliverFinalSecondPassage(4);
  assertEqual(seal.active()[0].word, "silent.", "the actual original final passage resumes at its last word");
  seal.complete();
  assertEqual([seal.cues, seal.store.get().checkpoint?.data.index], [["wood-seal"], 5], "the real final completion owns exactly one seal cue and saves the completed index before its timer");
  assertEqual(seal.events.includes("sealed"), false, "the original decorative settlement still owns its scheduled transition");
  seal.timers.shift()!(); assertEqual(seal.events.at(-1), "sealed", "the actual passage transitions once after its original delay");
  const restoredSeal = fixture(structuredClone(seal.store.get().checkpoint), "offering", "bargain"); restoredSeal.scene.deliverFinalSecondPassage(5);
  assertEqual([restoredSeal.cues, restoredSeal.targets.length, restoredSeal.events.at(-1)], [[], 0, "sealed"], "a completed saved timer-gap boundary advances without replaying a seal or target");
});

await suite("Wood audio integration: revisits use canonical or unambiguous legacy outcomes without altering history", () => {
  const cases: { choices: Record<string, string>; satchel: string[]; mood: string; pair: string }[] = [
    { choices: { fork1: "offering", fork2: "bargain" }, satchel: ["bone-flute", "ash-vial"], mood: "wood-rest", pair: "restore:offering:bargain" },
    { choices: { fork2: "light-grove" }, satchel: [], mood: "wood-rest-ash", pair: "restore:null:force" },
    { choices: {}, satchel: ["bone-flute", "ash-vial"], mood: "wood-rest-ash", pair: "restore:bone-flute:force" },
    { choices: {}, satchel: ["bone-flute", "shrine-token", "ghost-kings-promise", "ash-vial"], mood: "wood-rest", pair: "restore:null:null" },
  ];
  for (const test of cases) {
    const f = fixture(); f.store.update(state => { state.realms["haunted-wood"] = { cleared: true, choices: test.choices }; state.satchel = test.satchel; });
    f.scene.revisit = true; const before = JSON.stringify(f.store.get()); f.scene.startRevisit();
    assertEqual([f.moods, f.cues, f.events.includes(test.pair)], [[test.mood], [], true], "sound and original aftermath share canonical choice precedence, including legacy fire aliases");
    assertEqual(JSON.stringify(f.store.get()), before, "a revisit cannot invent a choice, award another relic or overwrite its checkpoint");
  }
});

await Promise.all(stores.map(store => store.flush()));
