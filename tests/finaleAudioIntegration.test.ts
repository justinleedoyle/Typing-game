import { readFileSync } from "node:fs";
import ts from "typescript";
import { COMPANION_IDS, selectFinalPhrase } from "../src/game/relicAlignment";
import { getActiveRelicEffects } from "../src/game/relicEffects";
import { homecomingLines } from "../src/game/homecoming";
import { emptySave, SaveStore, CloudSaveError, type SaveState } from "../src/game/saveState";
import { titleHomecoming } from "../src/game/titleResume";
import { assert, assertEqual, suite } from "./_assert";

const noop = () => {};
const stores: SaveStore[] = [];
function node(x = 0, y = 0): any {
  return { x, y, scene: true, width: 100, height: 1000, scaleX: 1, scaleY: 1, alpha: 1, angle: 0, children: [] as any[], parentContainer: null,
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
    setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; return this; },
    setAngle(v: number) { this.angle = v; return this; }, setDepth(v: number) { this.depth = v; return this; },
    setVisible(v: boolean) { this.visible = v; return this; }, setAlpha(v: number) { this.alpha = v; return this; },
    setOrigin() { return this; }, setColor() { return this; }, setStyle() { return this; }, setText(v: string) { this.text = v; return this; },
    clear() { return this; }, fillStyle() { return this; }, fillRect() { return this; }, fillRoundedRect() { return this; },
    strokeCircle() { return this; }, lineStyle() { return this; }, lineBetween() { return this; }, strokeRoundedRect() { return this; },
    add(child: any) { if (Array.isArray(child)) child.forEach(c => this.add(c)); else { child.parentContainer?.remove(child); child.parentContainer = this; this.children.push(child); } return this; },
    remove(child: any) { this.children = this.children.filter((c: any) => c !== child); child.parentContainer = null; return this; },
    destroy() { this.scene = false; this.parentContainer?.remove(this); },
    getWorldTransformMatrix() { return { transformPoint: (x: number, y: number) => ({ x: this.x + x, y: this.y + y }) }; },
  };
}
function storeFor(state: SaveState) {
  let durable = JSON.stringify(state);
  const backend = { async load() { return JSON.parse(durable) as SaveState; }, async save(next: SaveState) { durable = JSON.stringify(next); } };
  const store = new SaveStore(backend, state, { saveDelayMs: 60_000 }); stores.push(store);
  return { store, backend, durable: () => JSON.parse(durable) as SaveState };
}
function audioEvidence() {
  const moods: string[] = [], events: string[] = []; let stopped = false;
  const handle = { setMood(mood: string) { if (!stopped) { moods.push(mood); events.push(`mood:${mood}`); } }, stop() { if (!stopped) { stopped = true; events.push("stop"); } }, cue() { throw new Error("Finale and homecoming must retain the original action sounds"); } };
  return { handle, moods, events, stopped: () => stopped };
}
const battleSource = ts.createSourceFile("GreatBattleScene.ts", readFileSync(new URL("../src/scenes/GreatBattleScene.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const battleOwner = battleSource.statements.find(ts.isClassDeclaration)!;
const battleCreate = battleOwner.members.find(member => member.name?.getText(battleSource) === "create") as ts.MethodDeclaration;
const audioBoot = battleCreate.body!.statements.find(statement => statement.getText(battleSource).includes("this.soundscape = installSoundscape"))!;
const methods = ["startPhase1", "startPhase2", "preparePhase2RelicState", "startPhase3", "deliverFinalPhrase", "runLossEnding", "onFinalPhraseComplete", "commitFinalVictory", "runPeriodSeal", "onShutdown"];
const constants = battleSource.statements.filter(ts.isVariableStatement).map(statement => statement.getText(battleSource)).join("\n");
const script = ts.transpileModule(`${constants}\nclass Battle { bootAudio() { ${audioBoot.getText(battleSource)} } ${methods.map(name => battleOwner.members.find(member => member.name?.getText(battleSource) === name)!.getText(battleSource)).join("\n")} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function battleFixture(satchel: string[] = [], clearedRealms: string[] = []) {
  const state = emptySave(); state.typewriterAwakened = true; state.satchel = satchel;
  for (const realm of clearedRealms) state.realms[realm] = { cleared: true, choices: {} };
  const saved = storeFor(state), audio = audioEvidence(), timers: Array<{ delay: number; next: () => void }> = [], phraseWords: string[][] = [];
  let snaps = 0;
  const bindings = { WINTER_WORD_BANK: [], SUNKEN_BELL_WORD_BANK: [], FORGE_WORD_BANK: [], SKY_ISLAND_WORD_BANK: [], HAUNTED_WOOD_WORD_BANK: [],
    COMPANION_IDS, selectFinalPhrase, getActiveRelicEffects, playSceneEventPulse: noop, playBodyImpact: noop, reducedMotion: () => true,
    flashQuietLordFragment: noop, SERIF: "serif", playPeriodSnapSting: () => { snaps++; },
    Phaser: { Cameras: { Scene2D: { Events: { FADE_OUT_COMPLETE: "fade" } } } },
    installSoundscape: (_scene: unknown, mood: string) => { audio.handle.setMood(mood); return audio.handle; },
  };
  const Battle = new Function(...Object.keys(bindings), `${script}; return Battle;`)(...Object.values(bindings));
  const scene = new Battle();
  Object.assign(scene, {
    store: saved.store, soundscape: undefined, runOver: false, enemies: [], candles: 3, scale: { width: 1920, height: 1080 },
    narration: { say: noop }, band: { setObjective: noop }, setNarrator: noop,
    quietLordContainer: node(960, 660), againText: node(0, 0), strikeLineGraphic: node(),
    clearActiveTargets: noop, playWallWardPulse: noop, playUntetheredWindCue: noop, showRelicNotice: noop,
    playFireflyLanternCue: noop, drawQuietLord: noop, showQuietLordDescription: noop,
    drawWrenDefender: noop, drawAgainRemnant: noop, attendSpeaker: noop,
    add: { graphics: () => node(), text: (x: number, y: number) => node(x, y) },
    tweens: { add: noop }, cameras: { main: { shake: noop, fadeOut: noop, once: noop } },
    time: { delayedCall(delay: number, next: () => void) { timers.push({ delay, next }); }, removeAllEvents() { timers.length = 0; } },
    input: { keyboard: { off: noop } }, run: { end: noop }, typingInput: { reset: noop },
    clearTargetAnchors: noop, dismissWrenDefender: noop, clearFacetSigil: noop, dismissWallWard: noop,
    runFinalPhraseWords: (words: string[]) => phraseWords.push(words), runWinFlash: () => audio.events.push("win-flash"),
  });
  return { ...saved, ...audio, scene, timers, phraseWords, snaps: () => snaps,
    tick(delay: number) { const index = timers.findIndex(timer => timer.delay === delay); assert(index >= 0, "the original presentation timer is scheduled"); timers.splice(index, 1)[0]!.next(); },
  };
}

await suite("Finale audio: original wall and duel phases select their mixes without changing combat state", () => {
  for (const cleared of [[], ["winter-mountain", "haunted-wood"]]) {
    const f = battleFixture([], cleared), before = JSON.stringify(f.store.get()); f.scene.bootAudio(); f.scene.startPhase1();
    assertEqual(f.moods.at(-1), cleared.length ? "finale-wall" : "finale-alone", "the actual empty wall stays quiet while remembered realm waves own the sparse battle mix");
    assertEqual(f.timers.map(t => t.delay), [cleared.length ? 900 : 2000], "audio does not add or change the original first-wave/alone timing");
    assertEqual([f.scene.candles, JSON.stringify(f.store.get())], [3, before], "sound cannot spend candles, change possessions or clear a realm");
  }
  for (const satchel of [[], ["bells-tongue", "sabotage-wrench", "beacon-spark"], ["quiet-chant", "master-key", "ettas-ledger"]]) {
    const f = battleFixture(satchel), before = JSON.stringify(f.store.get()); f.scene.bootAudio(); f.scene.startPhase2();
    assertEqual(f.moods.at(-1), getActiveRelicEffects(satchel).isKindnessDuel ? "finale-duel-kind" : "finale-duel", "the actual shared alignment resolver selects quieter kindness without rewriting its mechanics");
    assertEqual(JSON.stringify(f.store.get()), before, "duel audio does not alter alignment rewards or journey data");
  }
});

await suite("Finale audio: final-phrase variants preserve original text and no-companion silence", () => {
  const variants = [[], ["bells-tongue", "hunters-horn"], ["master-key", "quiet-chant"], ["glass-fish", "ghost-kings-promise"],
    ["quiet-chant", "master-key", "ettas-ledger"], ["bells-tongue", "sabotage-wrench", "beacon-spark"], ["lantern-moth"], ["unrecognized-item"]];
  for (const satchel of variants) {
    const f = battleFixture(satchel), before = JSON.stringify(f.store.get()); f.scene.bootAudio(); f.scene.startPhase3();
    assertEqual(f.moods.at(-1), COMPANION_IDS.some(id => satchel.includes(id)) ? "finale-phrase" : "finale-silence", "only an actual companion retains the quiet final-phrase score; ordinary relics cannot invent one");
    assertEqual(f.timers.map(t => t.delay), [800], "the remnant still settles for the original interval before typing");
    f.tick(800);
    assertEqual(f.phraseWords, [selectFinalPhrase(satchel).split(" ")], "each actual phrase remains selected by its existing composition rules, including empty/default/force/kindness/pairing variants");
    assertEqual(JSON.stringify(f.store.get()), before, "a musical phase cannot seal victory before the words are completed");
  }
});

await suite("Finale audio: loss drops the score, cancels the old flow and preserves all earned journey state", () => {
  const f = battleFixture(["lantern-moth"], ["sky-island"]), before = JSON.stringify(f.store.get());
  f.scene.bootAudio(); f.timers.push({ delay: 1, next: () => { throw new Error("A lost run cannot continue an old wave"); } });
  f.scene.runLossEnding();
  assertEqual(f.moods.at(-1), "finale-loss", "the original loss replaces combat music with low open air");
  assertEqual(f.timers.map(t => t.delay), [700, 2600, 7000], "loss keeps only its existing fragment, closing line and return timers");
  assertEqual(JSON.stringify(f.store.get()), before, "a loss cannot mark the finale cleared or change any realm/satchel history");
  const count = f.events.length; f.scene.runLossEnding();
  assertEqual(f.events.length, count, "repeated loss handling cannot recreate a score or a second ending");
  f.scene.onShutdown(); assert(f.stopped(), "the actual scene shutdown disposes the loss atmosphere");
});

await suite("Finale audio: victory silences loops before the unchanged period sting and durable reunion route", async () => {
  const f = battleFixture(["brass-songbird"]); f.scene.bootAudio(); f.scene.startPhase3(); f.tick(800);
  f.scene.onFinalPhraseComplete();
  assertEqual([f.moods.at(-1), f.snaps()], ["finale-silence", 0], "loops leave before the still period beat, without inventing or replaying its sting");
  assert(titleHomecoming(f.store.get()), "the original completed phrase already owns the pending reunion before presentation");
  await f.store.flush(); assert(titleHomecoming(f.durable()), "the actual save boundary retains victory while its period presentation is pending");
  f.tick(800); assertEqual(f.snaps(), 1, "the original native period timer still plays its one existing snap");
  f.tick(1700); assertEqual(f.events.filter(event => event === "win-flash").length, 1, "the unchanged period hold still reaches its original flash");
  f.scene.onShutdown(); assert(f.stopped(), "the battle owner stops before the reunion creates its own soundtrack");
});

const homeSource = ts.createSourceFile("HomecomingScene.ts", readFileSync(new URL("../src/scenes/HomecomingScene.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const homeOwner = homeSource.statements.find(ts.isClassDeclaration)!;
const homeScript = ts.transpileModule(`class Home { ${homeOwner.members.filter(member => !ts.isConstructorDeclaration(member)).map(member => member.getText(homeSource)).join("\n")} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const artwork = Object.fromEntries(homeSource.statements.filter(ts.isImportDeclaration).filter(statement => (statement.moduleSpecifier as ts.StringLiteral).text.endsWith(".png")).map(statement => [statement.importClause!.name!.text, "fixture-art"]));
function homeFixture(gender: "boy" | "girl" | null) {
  const state = emptySave(); state.typewriterAwakened = true; state.wrenGender = gender;
  state.realms["great-battle"] = { cleared: true, choices: { homecomingStarted: "yes" } };
  const saved = storeFor(state), audio = audioEvidence(), captions: string[] = [], shutdown: Array<() => void> = [], starts: string[] = [];
  const bindings = { ...artwork, beginAssetLoad: noop, assetLoadBlocked: () => false, preloadWren: noop, installChapterMenu: () => ({ handleKey: () => false, destroy: noop }),
    installSoundscape: (_scene: unknown, mood: string) => { audio.handle.setMood(mood); return audio.handle; },
    addIdleBreath: noop, addLocalGroundShadow: () => node(), applySceneActorLighting: noop, makeWrenSprite: () => node(), makeSiblingDrawing: () => node(),
    homecomingLines, reducedMotion: () => true, rememberLocalSaveNotice: noop, CloudSaveError, SERIF: "serif", UI_CSS: {}, UI_HEX: {}, cornerTicks: () => node(),
    NarrationManager: class { sayRaw(text: string) { captions.push(text); } clear() {} replay() {} },
    ChapterReading: class { next: (() => void) | null = null; show(next: () => void) { this.next = next; } destroy() { this.next = null; } handleKey() {} },
  };
  const Home = new Function(...Object.keys(bindings), `${homeScript}; return Home;`)(...Object.values(bindings));
  const scene = new Home();
  Object.assign(scene, { scale: { width: 1920, height: 1080 },
    add: { image: (x: number, y: number) => node(x, y), container: node, graphics: () => node(), rectangle: node, text: (x: number, y: number) => node(x, y) },
    tweens: { add: noop, killTweensOf: noop }, cameras: { main: { fadeIn: noop } },
    input: { keyboard: { on: noop, off: noop } }, events: { once: (_event: string, next: () => void) => shutdown.push(next) },
    scene: { start: (name: string) => starts.push(name) },
  });
  scene.init({ store: saved.store }); const before = JSON.stringify(saved.store.get()); scene.create();
  return { ...saved, ...audio, scene, before, captions, starts,
    next() { const next = scene.reading.next; assert(next, "the actual reunion/credits still offer deliberate Continue"); scene.reading.next = null; next(); },
    shutdown() { shutdown.forEach(next => next()); },
  };
}

await suite("Homecoming audio: every sibling/neutral return and credits keep one owned warm resolution without rewriting the story", () => {
  for (const gender of ["boy", "girl", null] as const) {
    const f = homeFixture(gender);
    assertEqual(f.moods, ["homecoming"], "ordinary creation and recovered pending reunion begin the same warm owner, without a battle loop or action sting");
    f.next(); f.next();
    assertEqual(f.captions, homecomingLines(gender).map(line => line.text), "audio retains each original sibling promise and Runa's closing line");
    assertEqual(f.moods, ["homecoming"], "neither embrace, returned drawing nor repeated reading restarts music");
    f.next(); assertEqual(f.moods, ["homecoming", "credits"], "only the actual credits card lowers the same continuing resolution mix");
    assertEqual(JSON.stringify(f.store.get()), f.before, "music and credits do not automatically finish the saved reunion");
    f.shutdown(); assert(f.stopped(), "the actual shutdown disposes the home/credits owner");
  }
});

await suite("Homecoming audio: failed and stale library returns cannot revive combat or orphan the credits owner", async () => {
  const f = homeFixture("boy"); f.next(); f.next(); f.next();
  let fail = true; f.store.flush = async () => { if (fail) throw new Error("fictional disk unavailable"); };
  await f.scene.returnToLibrary();
  assertEqual([f.starts, f.stopped(), f.moods.at(-1), f.scene.leaving], [[], false, "credits", false], "a failed final save leaves the same credits sound and visible retry path");
  fail = false; await f.scene.returnToLibrary();
  assertEqual(f.starts, ["PortalChamberScene"], "only the original successful retry returns to the library");
  f.shutdown(); assert(f.stopped(), "normal destination shutdown releases the credits atmosphere");
  const pending = homeFixture(null); let finish!: () => void; const originalFlush = pending.store.flush.bind(pending.store);
  pending.store.flush = () => new Promise<void>(resolve => { finish = resolve; });
  const leave = pending.scene.returnToLibrary(); pending.shutdown(); finish(); await leave; pending.store.flush = originalFlush;
  assertEqual([pending.starts, pending.stopped(), pending.moods], [[], true, ["homecoming"]], "a late save completion after shutdown cannot start a destination, create credits or restart sound");
});

await Promise.all(stores.map(store => store.flush()));
