import { readFileSync } from "node:fs";
import ts from "typescript";
import { forgeSoundscapeMood } from "../src/audio/forgeSoundscape";
import { forgePassageIndex, type ForgeStep } from "../src/game/forgeCheckpoint";
import { rememberRealmFork, resolveRealmFork } from "../src/game/realmChoices";
import { emptySave, SaveStore, type SaveState } from "../src/game/saveState";
import { SessionStats } from "../src/game/sessionStats";
import { assert, assertEqual, suite } from "./_assert";

// Execute production scene/checkpoint methods and the real TextWordTarget
// completion dispatcher. Rendering and scheduling are inert at their boundary;
// no duplicated passage, callback-selection or resource logic lives here.
const source = ts.createSourceFile("ClockworkForgeScene.ts", readFileSync(new URL("../src/scenes/ClockworkForgeScene.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["checkpoint", "savedStageData", "hasSavedPassage", "commitFork", "startCatwalkBeats", "showCatwalkAnswer", "startFornBranch", "startCabalBranch", "runPassageChain", "startFork2PeacefulBranch", "showPeacefulOrderAnswer", "startRevisit"];
const constants = source.statements.filter(ts.isVariableStatement).map(statement => statement.getText(source)).join("\n");
const code = ts.transpileModule(`${constants}\nclass Forge { ${names.map(name => owner.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const noop = () => {};
const globals = { forgeSoundscapeMood, forgePassageIndex, rememberRealmFork, resolveRealmFork,
  playWrenAction: noop, playWrenFocus: noop, playBodyImpact: noop, playActorAttention: noop,
  playPortalArrivalWake: noop, reducedFlashes: () => false, PALETTE_HEX: { brass: 0xc6a267, ember: 0xe9a965 } };
const Forge = new Function(...Object.keys(globals), `${code}; return Forge;`)(...Object.values(globals));
const targetSource = ts.createSourceFile("wordTarget.ts", readFileSync(new URL("../src/game/wordTarget.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const targetOwner = targetSource.statements.find(ts.isClassDeclaration)!;
const complete = targetOwner.members.find(member => member.name?.getText(targetSource) === "onComplete")!;
const Target = new Function("playWordCompleteBurst", "PALETTE_HEX", ts.transpileModule(`class Target { ${complete.getText(targetSource)} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + "; return Target;")(noop, globals.PALETTE_HEX);
const stores: SaveStore[] = [];

function fixture(saved?: SaveState["checkpoint"], first: "forn" | "cabal" | null = null, second: "peaceful" | "fought" | null = null) {
  const state = emptySave(); state.typewriterAwakened = true;
  state.realms["clockwork-forge"] = { cleared: false, choices: {} }; state.checkpoint = saved ?? null;
  if (first) state.realms["clockwork-forge"].choices.fork1 = first;
  if (second) state.realms["clockwork-forge"].choices.fork2 = second;
  const store = new SaveStore({ load: async () => null, save: async () => {} }, state, { saveDelayMs: 60_000 }); stores.push(store);
  const stats = new SessionStats(); stats.bankSoulFraction(.425);
  const scene = new Forge(), cues: string[] = [], moods: string[] = [], events: string[] = [], targets: any[] = [];
  let gate: (() => void) | null = null;
  Object.assign(scene, {
    store, revisit: false, resumeCheckpoint: saved ?? null, fork1Choice: first, fork2Choice: second,
    usedOneShots: new Set(["toll-strike"]), oneShotInvoker: { getSpent: () => ["toll-strike", "bind-beat"] }, combatSatchel: ["bellows-hammer"],
    typingInput: { getStats: () => stats },
    soundscape: { setMood(mood: string) { moods.push(mood); events.push(`mood:${mood}`); }, cue(material: string) { cues.push(material); events.push(`cue:${material}`); } },
    scale: { width: 1920, height: 1080 }, wrenContainer: { x: 960, y: 820 }, wrenSprite: {}, activeTargets: [],
    band: { setObjective: noop }, setNarrator: noop,
    catwalkCueX: () => 600, catwalkWordPosition: () => ({ x: 600, y: 330 }), catwalkWrenX: () => 700,
    showCatwalkCue: noop, walkWrenAlongCatwalk: noop, pulseCatwalkCue: noop, releaseCatwalkCueWordAnchor: noop,
    attachCatwalkCueWordAnchor: noop, clearPeacefulGuards: noop,
    dismissForgeChoiceCue: noop, hideApprenticeSprite: noop, hideFornSprite: noop, approachForgeWork: noop,
    dismissBellowsWorkstation: noop, showApprenticeSprite: noop, pulseForgeChoiceCue: noop,
    showPeacefulGuards: noop, standDownCue: {}, apprenticeCue: {},
    forgePassageWordPosition: () => ({ x: 600, y: 500 }), forgeChoiceWordPosition: () => ({ x: 600, y: 500 }),
    makeWord: (options: any) => options, makeForgeChoiceWord: (_body: any, options: any) => options, makeFornWord: (options: any) => options,
    registerActiveTarget(...values: any[]) { scene.activeTargets = values; targets.push(...values); },
    clearActiveTargets() { scene.activeTargets = []; },
    readThen(next: () => void) { assert(!gate, "one deliberate Continue owns the current held story response"); gate = next; },
    tweens: { add(options: any) { options.onComplete?.(); } },
    cameras: { main: { flash: () => events.push("flash") } },
    afterFork1: (choice: string) => events.push(`reward1:${choice}`), afterFork2: (choice: string) => events.push(`reward2:${choice}`),
    showFornEmptyHands: noop, showForgeKeepsake: noop,
    restoreForgeRevisitAftermath: (a: string | null, b: string | null) => events.push(`restore:${a}:${b}`),
    deliverRevisitPassage: noop,
  });
  return { scene, store, stats, cues, moods, events, targets,
    active: () => scene.activeTargets as any[], gate: () => gate,
    continue() { const next = gate; assert(next, "Continue belongs to a waiting response"); gate = null; next!(); },
    complete(options = (scene.activeTargets as any[])[0], spell = false) {
      const target = new Target();
      Object.assign(target, { opts: options, spellClaimed: spell, altClaimed: false, container: { x: 600, y: 500 }, playBannerWake: noop, destroy: noop });
      target.onComplete();
    },
  };
}

await suite("Forge audio integration: checkpoints forward completed action data without spending resources or choosing branches", () => {
  for (const first of [null, "forn", "cabal"] as const) {
    const f = fixture(undefined, first, "peaceful"), choices = structuredClone(f.store.get().realms["clockwork-forge"].choices);
    for (const step of ["catwalk", "tutorial-fight", "cabal", "boss2", "boss-defeated", "peaceful", "peaceful-answer", "ending"] as ForgeStep[]) {
      f.scene.checkpoint(step, { index: 0, reading: true });
      assertEqual(f.moods.at(-1), forgeSoundscapeMood(step, first, "peaceful", { index: 0, reading: true }), "the actual durable checkpoint passes its completion evidence to the mood resolver");
      const saved = f.store.get().checkpoint!;
      assertEqual([saved.step, saved.data.statsSoul, saved.data.spentOneShots, saved.data.combatSatchel], [step, 42.5, "toll-strike,bind-beat", "bellows-hammer"], "audio adds no resource cost, fake choice, timing value or different loadout");
    }
    assertEqual(f.store.get().realms["clockwork-forge"].choices, choices, "soundscape routing cannot alter either saved story decision");
    const before = JSON.stringify(f.store.get().checkpoint); f.scene.revisit = true; f.scene.checkpoint("ending");
    assertEqual([f.moods.at(-1), JSON.stringify(f.store.get().checkpoint)], [forgeSoundscapeMood("ending", first, "peaceful"), before], "revisit atmosphere may update without overwriting the active journey checkpoint");
  }
});

await suite("Forge audio integration: only live catwalk completion sounds while restored held actions stay silent", () => {
  const expected = ["forge-gear", "forge-flame", "forge-lock"];
  for (let index = 0; index < 3; index++) {
    const f = fixture(); f.scene.startCatwalkBeats(index);
    assertEqual(f.cues, [], "constructing the displayed obstacle is silent");
    f.active()[0].onClaim(); assertEqual(f.cues, [], "claiming or moving toward metal is not completed passage evidence");
    f.complete(); assertEqual(f.cues, [expected[index]], "the real target dispatcher fires one completed obstacle material cue");
    const restored = fixture(structuredClone(f.store.get().checkpoint)); restored.scene.showCatwalkAnswer(index);
    assertEqual([restored.cues, restored.gate() !== null], [[], true], "reconstructing the saved held obstacle response cannot replay its physical action");
  }
});

await suite("Forge audio integration: native repair and valve actions own cues and only completed sabotage slows the room", () => {
  for (const first of ["forn", "cabal"] as const) {
    const f = fixture(); const start = (scene: any) => first === "forn" ? scene.startFornBranch() : scene.startCabalBranch();
    start(f.scene); assertEqual([f.cues, f.moods.at(-1)], [[], "forge-workshop"], "choosing a branch and its held introduction cannot claim the valve action");
    f.continue(); f.active()[0].onClaim(); assertEqual([f.cues, f.moods.at(-1)], [[], "forge-workshop"], "the first displayed phrase remains an unfinished action");
    f.complete();
    assertEqual([f.cues, f.moods.at(-1)], [[first === "forn" ? "forge-flame" : "forge-wheel"], first === "forn" ? "forge-workshop" : "forge-workshop-slow"], "settling the real first phrase sounds its material action and retains its completed environmental consequence");
    const saved = structuredClone(f.store.get().checkpoint), restored = fixture(saved, first); start(restored.scene);
    assertEqual([restored.cues, restored.moods.at(-1), restored.gate() !== null], [[], first === "forn" ? "forge-workshop" : "forge-workshop-slow", true], "restored reading rebuilds the same physical consequence without playing its action sound");
    restored.continue(); restored.complete();
    assertEqual(restored.cues, first === "forn" ? ["forge-gear"] : [], "only an actually new seam repair sounds; cheering has no invented mechanism cue");
    assertEqual(f.store.get().realms["clockwork-forge"].choices.fork1, first, "audio retains the committed branch and does not award its opposite");
  }
});

await suite("Forge audio integration: normal and spell stand-down dispatch one settling cue and restored answer stays silent", () => {
  for (const spell of [false, true]) {
    const f = fixture(undefined, "cabal"); f.scene.startFork2PeacefulBranch();
    assertEqual([f.cues, f.moods.at(-1)], [[], "forge-rest-slow"], "the displayed command has not yet stopped the machinery");
    f.complete(f.active()[0], spell);
    assertEqual([f.cues, f.moods.at(-1)], [["forge-lock"], "forge-still-slow"], "the actual TextWordTarget dispatcher chooses one normal-or-spell callback and only completed command stills machinery");
    assertEqual(f.events.filter(event => event === "flash").length, spell ? 1 : 0, "the original spell-only flash survives without duplicating a material sound");
    const restored = fixture(structuredClone(f.store.get().checkpoint), "cabal", "peaceful"); restored.scene.showPeacefulOrderAnswer(spell);
    assertEqual([restored.cues, restored.moods.at(-1), restored.gate() !== null], [[], "forge-still-slow", true], "restoring the obeyed order is silent and retains both the saved lowered furnace and still machinery");
    restored.continue(); assertEqual(restored.events.at(-1), "reward2:peaceful", "silent restoration still leads to the original Master Key destination");
  }
});

await suite("Forge audio integration: revisits resolve canonical and legacy outcomes before choosing atmosphere without changing saves", () => {
  const cases: { choices: Record<string, string>; satchel: string[]; mood: string; pair: string }[] = [
    { choices: { fork1: "forn", fork2: "peaceful" }, satchel: ["sabotage-wrench", "golem-heart"], mood: "forge-still", pair: "restore:forn:peaceful" },
    { choices: { ending: "cabal-peaceful" }, satchel: [], mood: "forge-still-slow", pair: "restore:cabal:peaceful" },
    { choices: {}, satchel: ["bellows-hammer", "golem-heart"], mood: "forge-rest", pair: "restore:forn:fought" },
    { choices: {}, satchel: ["bellows-hammer", "sabotage-wrench", "master-key", "golem-heart"], mood: "forge-rest", pair: "restore:null:null" },
  ];
  for (const test of cases) {
    const f = fixture(); f.store.update(state => { state.realms["clockwork-forge"] = { cleared: true, choices: test.choices }; state.satchel = test.satchel; });
    f.scene.revisit = true; const before = JSON.stringify(f.store.get()); f.scene.startRevisit();
    assertEqual([f.moods, f.cues, f.events.includes(test.pair)], [[test.mood], [], true], "the soundtrack uses the same canonical aftermath precedence as the visible original room, never a stale opposite reward");
    assertEqual(JSON.stringify(f.store.get()), before, "an atmospheric revisit cannot replace history, award another keepsake or overwrite a checkpoint");
  }
});

await Promise.all(stores.map(store => store.flush()));
