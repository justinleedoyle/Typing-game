import { readFileSync } from "node:fs";
import ts from "typescript";
import { SaveStore, emptySave, migrate, type SaveState } from "../src/game/saveState";
import { SessionStats } from "../src/game/sessionStats";
import { resolveCombatLoadout } from "../src/game/relicEffects";
import { rememberRealmFork, resolveRealmFork, rememberCompanionDecision, resolveCompanionDecision } from "../src/game/realmChoices";
import { SKY_STEPS } from "../src/game/skyCheckpoint";
import { assert, assertEqual, suite } from "./_assert";

// Execute production methods, with Phaser's rendering/timer shell replaced.
// Every restart crosses the real serializer and SaveStore backend boundary.
const url = new URL("../src/scenes/SkyIslandScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const methods = ["init", "checkpoint", "savedStageData", "resumeSky", "settleResumedActor", "resumePath", "resumeBoss", "stageSkyRevisitAftermath", "restoreEttaBookPose", "setEttaCarryPose", "updateEttaBookCarry", "showEttaBookCue", "clearEttaBookCue", "resumeEttaBook", "finishRestoredEttaBook",
  "runPathBeats", "startLanternLighter", "onLighterConvoComplete", "startFirstSpiritEncounter", "beginFirstSpiritEncounter", "startFirstSpiritEncounterFixed", "defeatSpirit", "onFirstEncounterCleared",
  "startAct2", "startTemple", "quietLordIntrusionAnchor", "onTempleCleared", "startSealedScrollTemple", "startEttaEncounter", "startEttaHelp", "moveEttaBook", "startFork1", "startFork1HelpEtta", "setEttaHelpBeaconBright", "startFork1StealFlame", "startAct3",
  "startBossPhase1", "startBossPhase2", "startBossPhase3", "onBossDefeated", "startFork2", "startFork2KindEnding", "startFork2CutTether", "releaseFork2Spirit", "startLanternMothGate", "showMothAnswer", "restoreMothPerch",
  "startTrueNamePassage", "startEnding", "commitFork", "runPassageChain", "applyOneShot"];
const constants = source.statements.filter(ts.isVariableStatement).map(statement => statement.getText(source)).join("\n");
const helpers = source.statements.filter(ts.isFunctionDeclaration).map(statement => statement.getText(source)).join("\n");
const script = ts.transpileModule(`${constants}\n${helpers}\nclass Sky { ${methods.map(name => owner.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")} }`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const noop = () => {};
const globals = {
  resolveCombatLoadout, rememberRealmFork, resolveRealmFork, rememberCompanionDecision, resolveCompanionDecision,
  reducedMotion: (s: any) => s.reduced, PALETTE_HEX: { brass: 1, ember: 2, frost: 3 },
  Phaser: { Math: { Clamp: (n: number, min: number, max: number) => Math.max(min, Math.min(max, n)) },
    Scenes: { Events: { UPDATE: "update" } }, GameObjects: { Events: { DESTROY: "destroy" } }, Cameras: { Scene2D: { Events: { FADE_OUT_COMPLETE: "fade" } } } },
  setWrenPose: (sprite: any, pose: string) => { sprite.texture = { key: `wren-${pose}` }; sprite.setScale(240 / sprite.height); },
  makeWrenCarryHands: (scene: any) => { const hands = prop(); scene.carryHandBuilds.push(hands); return hands; },
  addLocalGroundShadow: () => prop(), applySceneActorLighting: noop,
  addIdleBreath: noop, playWrenFocus: noop, playWrenAction: noop, playChime: noop, playActorAttention: noop, playWaveSting: noop,
  playWrenHurt: noop, playQuietLordIntrusion: noop, flashQuietLordFragment: noop, playBellToll: noop, playSparkZap: noop,
  playBodyImpact: noop, dismissTrueNameSeal: noop, playClaimLine: noop, playBodyTypePulse: noop, playRealmReturnDeparture: noop,
  pickAdaptiveWords: (words: string[], count: number) => words.slice(0, count),
  SKY_ISLAND_WORD_BANK: ["lantern", "scholar", "summits"], SKY_ISLAND_PHRASE_BANK: ["one phrase", "two phrases", "three phrases", "four phrases"],
  ScrollingPhrase: class { constructor(options: any) { Object.assign(this, options); options.scene.phraseSpawns.push(this); } },
  stageTrueNameSeal: () => prop(960, 644), attachWordBodyAnchor: () => ({ destroy: noop }),
};
const Sky = new Function(...Object.keys(globals), `${script}; return Sky;`)(...Object.values(globals));
function prop(x = 0, y = 0): any {
  return { x, y, scene: true, alpha: 1, angle: 0, scale: 1, scaleX:1, scaleY:1, width:1000, height:1000, texture:{key:"test"}, children:[] as any[],
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
    setAlpha(n: number) { this.alpha = n; return this; }, setScale(n: number, y = n) { this.scale = n; this.scaleX = n; this.scaleY = y; return this; },
    setTexture(key:string) { this.texture={key};return this; }, setOrigin() {return this;}, setName(name:string) {this.name=name;return this;},
    setDisplaySize(width:number,height:number) {this.displayWidth=width;this.displayHeight=height;return this;},
    add(child:any) {this.children.push(...(Array.isArray(child)?child:[child]));return this;},
    setAngle(n: number) { this.angle = n; return this; }, setActive(active:boolean) {this.active=active;return this;}, setDepth() { return this; }, setVisible() { return this; }, setTint() { return this; },
    getAt() { return prop(); }, getByName() { return this.paper ??= prop(); }, once: noop, destroy() { this.scene = false; } };
}
function fixture(initial?: SaveState, reduced = false) {
  let stored = JSON.stringify(initial ?? { ...emptySave(), typewriterAwakened: true });
  const backend = { async load() { return migrate(JSON.parse(stored)); }, async save(state: SaveState) { stored = JSON.stringify(state); } };
  const store = new SaveStore(backend, migrate(JSON.parse(stored)), { saveDelayMs: 60000 });
  const scene = new Sky(), stats = new SessionStats();
  const updateListeners: Array<{fn:Function, context:any}> = [], carryHandBuilds:any[] = [], images:any[] = [];
  const sprite=prop();sprite.texture={key:"wren-front"};sprite.setScale(.24);
  sprite.getWorldTransformMatrix=()=>({tx:scene.wrenContainer.x+sprite.x,ty:scene.wrenContainer.y+sprite.y,a:sprite.scaleX,d:sprite.scaleY,
    transformPoint(x:number,y:number){return {x:this.tx+x*this.a,y:this.ty+y*this.d};}});
  const targets: any[] = [], gates: Array<() => void> = [], timers: Array<{ delay: number; callback: () => void }> = [], captions: string[] = [], tweens: any[] = [], entered: string[] = [];
  Object.assign(scene, {
    store, reduced, typingInput: { getStats: () => stats }, oneShotInvoker: { getSpent: () => [] },
    scale: { width: 1920, height: 1080 }, wrenContainer: prop(960, 826), wrenSprite: sprite, carryHandBuilds,
    events:{on(_event:string,fn:Function,context:any){updateListeners.push({fn,context});},off(_event:string,fn:Function,context:any){for(let n=updateListeners.length-1;n>=0;n--)if(updateListeners[n].fn===fn&&updateListeners[n].context===context)updateListeners.splice(n,1);}},
    add:{container:(x:number,y:number)=>prop(x,y),image:(x:number,y:number,key:string)=>{const image=prop(x,y);image.texture={key};images.push(image);return image;}},
    combat: resolveCombatLoadout([], "sky-island"), ambientLanterns: [], usedOneShots: [], phraseSpawns: [],
    time: { delayedCall(delay: number, callback: () => void) { timers.push({ delay, callback }); } },
    tweens: { killTweensOf: (body: any) => tweens.filter(tween => tween.targets === body).forEach(tween => tween.cancelled = true),
      add(options: any) { const tween = { ...options, stop: noop }; tweens.push(tween); return tween; } },
    cameras: { main: { shake: noop, fadeOut: noop, once: noop } },
    band: { setObjective: noop }, narration: { say: (text: string) => captions.push(text) }, setNarrator: (text: string) => captions.push(text),
    readThen(next: () => void) { assert(gates.length === 0, "one native reading gate owns continuation"); gates.push(next); },
    dismissPathCue: noop, setAmbientLanternFieldAlpha: noop, setTempleBeamsActive: noop, pulseSkyWave: noop, playScholarStagePulse: noop,
    clearActiveTargets() { scene.activeTargets = []; }, registerActiveTarget(...values: any[]) { targets.push(...values); scene.activeTargets = values; },
    makeWord(options: any) { return { ...options, setForgiveResets: noop, getAnchorX: () => options.x, getAnchorY: () => options.y }; },
    makePathWord: (options: any) => options, makeLighterReplyWord: (options: any) => options, makeEttaWord: (options: any) => options,
    makeEttaBookWord: (options: any) => options,
    makeScholarBossWord: (options: any) => ({ ...options, advance: noop, reverse: noop, resetCursor: noop, onRelease: noop, remaining: () => options.word }),
    makeLanternMothWord: (options: any) => options,
    makeSkyForkWord: (_body: unknown, options: any) => options,
    showPathCue(beat: string) { scene.pathCueBeat = beat; scene.pathCue ??= prop(); },
    pathWordPosition: () => ({ x: 500, y: 500 }), pathWrenPosition: () => ({ x: 900, y: 826 }), walkWrenToPathBeat: noop, pulsePathCue: noop, resetWrenToSkyStage: noop,
    showLanternLighter() { scene.lighterSprite = prop(); }, lighterReplyWordPosition: () => ({ x: 700, y: 500 }), playLighterWarningHandoff: noop,
    announceCombatLoadout: (next: () => void) => next(), hideLanternLighter: noop,
    spawnSpirit(...args: any[]) { scene.spirits.push(args); }, maybePlayWarmLightCue: noop,
    drawSealedScroll: () => prop(), skyOwnedWordPosition: () => ({ x: 700, y: 500 }),
    showEtta() { scene.ettaSprite ??= prop(); }, hideEtta() { scene.ettaSprite = null; },
    showEttaBookCue() { scene.ettaBookCue ??= prop(760, 826); scene.ettaBookShelf ??= prop(1260, 826); scene.ettaBookGroundShadow ??= prop(760, 828); return scene.ettaBookCue; },
    clearEttaBookWordAnchors:noop, fadeOutForkCue: noop, showFork1Cues() { scene.ettaSprite = prop(); scene.beaconFlameCue = scene.createBeaconFlameCue(); },
    showFork2Cues() { scene.kindAnswerCue = prop(); scene.tetherThreadCue = prop(); scene.fork2Scholar = prop(776,710); scene.beaconFlameCue = prop(1500,710); },
    dimBeaconFlameVisual() { scene.dimmed = true; }, takeBeaconSparkVisual() { scene.taken = true; scene.heldBeaconSpark = prop(); }, clearHeldBeaconSpark: noop,
    drawScholarSpirit: () => prop(960, 400), scholarBossWordPosition: () => ({ x: 960, y: 500 }), tweenBossBow: noop, flashBossEyes: noop, spawnBossLanternBurst: noop,
    showLanternMothCompanion() { scene.lanternMothCompanion ??= prop(1160, 650); }, pulseLanternMothCompanion: noop,
    settleLanternMothOnWren(callback: () => void) { scene.landed = true; callback(); }, dismissLanternMothCompanion() { scene.lanternMothCompanion = null; },
    createBeaconFlameCue() { const beacon=prop(1500,710),flame=prop(),light=prop();beacon.getByName=(name:string)=>name==="beacon-spark"?flame:name==="beacon-light"?light:null;scene.beaconBuilds.push(beacon);return beacon; },
    beaconBuilds:[],
    showAlmanacStamp: noop, playOneShotSourceLine: noop,
    startAct1() { entered.push("arrival"); scene.checkpoint("arrival"); },
    startRevisit() { entered.push("revisit"); },
  });
  scene.init({ store });
  stats.restoreCheckpoint(scene.resumeCheckpoint?.data ?? {});
  function next() { const gate = gates.shift(); assert(gate, "Continue has an existing native gate"); gate!(); }
  function complete() { const target = scene.activeTargets.at(-1); assert(target, "the pending phrase is visible"); target.onComplete(); }
  return { scene, store, stats, backend, targets, gates, timers, captions, tweens, entered, updateListeners, carryHandBuilds, images, next, complete,
    async reload() { await store.flush(); const restored = await SaveStore.load(backend, { saveDelayMs: 60000 }); return fixture(structuredClone(restored.get()) as SaveState, reduced); },
    async flush() { await store.flush(); },
  };
}

await suite("Sky checkpoints: every declared stage survives the real backend and dispatches after init", async () => {
  for (const step of SKY_STEPS) {
    const f = fixture();
    f.scene.checkpoint(step, { index: 0, phase: 1 });
    const before = structuredClone(f.store.get().checkpoint);
    const resumed = await f.reload();
    assertEqual(resumed.scene.resumeCheckpoint, before, `${step} survives migration, serialization and reload`);
    resumed.scene.resumeSky();
    assert(resumed.store.get().checkpoint !== null || resumed.store.get().realms["sky-island"]?.cleared, `${step} retains progress until actual completion`);
    await resumed.flush();
  }
});

await suite("Sky checkpoints: unrelated/completed/revisit markers cannot resume or be overwritten", async () => {
  const state = { ...emptySave(), typewriterAwakened: true };
  state.checkpoint = { scene: "SunkenBellScene", step: "fork1", data: {} };
  const other = fixture(state);
  assertEqual(other.scene.resumeCheckpoint, null, "only Sky can use its own marker");
  other.scene.init({ store: other.store, revisit: true }); other.scene.checkpoint("path", { index: 1 });
  assertEqual(other.store.get().checkpoint?.scene, "SunkenBellScene", "revisit cannot overwrite another incomplete realm");
  const finished = { ...state, realms: { "sky-island": { cleared: true, choices: {} } }, checkpoint: { scene: "SkyIslandScene" as const, step: "boss", data: {} } };
  const complete = fixture(finished); assertEqual(complete.scene.resumeCheckpoint, null, "realm completion outranks stale marker");
  await other.flush(); await complete.flush();
});

await suite("Sky path: every word and held response reloads after the previous physical landmark", async () => {
  for (let index = 0; index < 3; index++) {
    for (const reading of [false, true]) {
      const f = fixture(); f.scene.checkpoint("path", { index, reading }); const restored = await f.reload();
      restored.scene.resumeSky();
      const previous = reading ? index : index - 1;
      assertEqual([restored.scene.wrenContainer.x, restored.scene.wrenContainer.y], previous < 0 ? [832, 836] : [[756, 832], [890, 732], [1142, 826]][previous], "boots resume at the already crossed landmark");
      if (reading) {
        assertEqual(restored.targets.length, 0, "completed native word is not requested again");
        if (index === 1) assertEqual(restored.scene.pathCue.paper.angle, -22, "lifted lantern remains aside");
        assertEqual(restored.gates.length, 1, "the original acknowledgment remains held");
      } else assertEqual(restored.targets.at(-1)?.word, ["balance", "lantern", "stepping"][index], "only the pending original traversal word is requested");
      await restored.flush();
    }
  }
});

await suite("Sky restored staging: fresh entrances cannot later overwrite saved boots, Etta or her shadow", async () => {
  const f = fixture(); f.scene.checkpoint("path", { index: 1, reading: false });
  const path = await f.reload();
  const entrance = path.scene.tweens.add({ targets: path.scene.wrenContainer, y: 826, duration: 680 });
  path.scene.resumeSky();
  assert(entrance.cancelled, "restored path cancels the scene's pending Wren entrance before placing boots");
  assertEqual([path.scene.wrenContainer.x, path.scene.wrenContainer.y], [756, 832], "the completed bridge owns the pending lantern approach");
  await path.flush();
  const book = fixture(); book.scene.checkpoint("etta-book", { stage: "carried", nextTemple: 3 }); const restored = await book.reload();
  const etta = prop(520, 774), shadow = prop(520, 768); etta.alpha = shadow.alpha = 0; etta.getData = () => shadow;
  restored.scene.showEtta = () => { restored.scene.ettaSprite = etta; };
  const actorEntrance = restored.scene.tweens.add({ targets: etta, y: 760, duration: 760 });
  const shadowEntrance = restored.scene.tweens.add({ targets: shadow, alpha: .9, duration: 760 });
  restored.scene.resumeSky();
  assert(actorEntrance.cancelled && shadowEntrance.cancelled, "restored actor and planted shadow release stale entrance tweens together");
  assertEqual([etta.x, etta.y, etta.alpha, shadow.alpha], [520, 760, .9, .9], "the carried-book response begins with its original settled actor and shadow");
  await restored.flush();
});

await suite("Sky first spirits: actual final defeat survives reload during the bloom delay", async () => {
  const f = fixture();
  f.scene.spawnSpirit = () => f.scene.spirits.push({
    defeated: false, container: prop(), glowGfx: prop(), lanternSprite: prop(),
  });
  f.scene.startFirstSpiritEncounterFixed();
  const [first, last] = f.scene.spirits;
  f.scene.defeatSpirit(first);
  assertEqual(f.store.get().checkpoint?.data.reading, undefined, "a remaining spirit keeps the encounter unfinished");
  f.stats.record(true); f.stats.record(false); f.stats.record(true);
  f.scene.defeatSpirit(last);
  assertEqual(f.gates.length, 0, "the original bloom still precedes its held response");
  assertEqual(f.timers.at(-1)?.delay, 1600, "the native presentation delay remains unchanged");
  const restored = await f.reload(); restored.scene.resumeSky();
  assertEqual(restored.scene.spirits, [], "settled spirits never respawn after the final actual defeat");
  assertEqual([restored.targets.length, restored.gates.length], [0, 1], "the cleared response is the only pending action");
  assertEqual(restored.stats.captureCheckpoint(), f.stats.captureCheckpoint(), "completed encounter resources survive with the settled enemies");
  restored.next(); assertEqual(restored.store.get().checkpoint?.step, "temple-intro", "the original Continue enters the temple introduction once");
  f.timers.at(-1)!.callback(); assertEqual(f.gates.length, 1, "uninterrupted play still receives exactly one response");
  await restored.flush(); await f.flush();
});

await suite("Sky encounters: restart uses entry resources and preserves completed one-shot consumption", async () => {
  const f = fixture(); for (const hit of [true, true, false, true, true]) f.stats.record(hit);
  f.stats.bankSoulFraction(.45); f.scene.usedOneShots = ["toll-strike"];
  f.scene.startTemple(1); const entry = structuredClone(f.store.get().checkpoint);
  f.stats.spendSoul(10); f.stats.record(false); f.scene.usedOneShots.push("jam-foe");
  assertEqual(f.store.get().checkpoint, entry, "abandoning combat never combines restarted foes with partially spent resources");
  const restored = await f.reload(); restored.scene.resumeSky();
  assertEqual(restored.stats.captureCheckpoint(), { statsHits: "11011", statsSoul: 57, statsCombo: 2, statsBestCombo: 2 }, "Heart, Soul and combo return to the exact encounter entry");
  assertEqual(restored.scene.usedOneShots, ["toll-strike"], "only charges spent before the pending encounter remain spent");
  assertEqual(restored.scene.phraseSpawns.map((phrase: any) => [phrase.durationMs, phrase.delayMs]), [[12500, 0], [12500, 2400]], "pending temple keeps its native durations and stagger");
  restored.scene.usedOneShots.push("jam-foe"); restored.scene.onTempleCleared();
  assertEqual(restored.store.get().checkpoint?.data.usedOneShots, "toll-strike,jam-foe", "a cleared encounter commits charge consumption at its next safe boundary");
  await restored.flush();
});

await suite("Sky intrusion: the actual second gate keeps its scar clear of both scrolls and Wren", async () => {
  const f = fixture(); f.scene.startTemple(1);
  const rows = f.scene.phraseSpawns.map((phrase: any) => phrase.y);
  assertEqual(rows, [320, 430], "the actual two-scroll gate retains its authored rows");
  f.scene.activePhrases.forEach((phrase: any, index: number) => Object.assign(phrase, {
    isResolved: () => false, getProgress: () => index === 0 ? 0.4 : 0.2,
    getX: () => index === 0 ? 640 : 1280, getY: () => phrase.y,
  }));
  const anchor = f.scene.quietLordIntrusionAnchor();
  const scarHalfHeight = (32 + 58) / 2;
  const bannerHalfHeight = 72 / 2;
  assertEqual(anchor.x, 640, "the most advanced live scroll retains the original horizontal association");
  assert(anchor.y - scarHalfHeight >= Math.max(...rows) + bannerHalfHeight + 8,
    "the complete ink scar leaves a readable margin below both moving banner rows");
  assert(anchor.y + scarHalfHeight + 8 <= f.scene.wrenContainer.y - 240 - 5,
    "the complete scar stays above Wren's head even at the top of the existing idle breath");
  const intrusion = f.timers.find(timer => timer.delay === 1800);
  assert(intrusion, "the original delayed intrusion still belongs to the actual second gate");
  f.scene.activePhrases = [];
  assertEqual(f.scene.quietLordIntrusionAnchor(), { x: 960, y: anchor.y }, "a completed scroll cannot move the fallback into the words");
  await f.flush();
  for (const index of [3, 4]) {
    const later = fixture(); later.scene.startTemple(index);
    assertEqual(later.scene.phraseSpawns.map((phrase: any) => phrase.y), [320, 430, 540], "later three-scroll gates keep all original gameplay rows");
    assert(!later.timers.some(timer => timer.delay === 1800), "a fresh later gate cannot place this second-gate-only intrusion over its third row");
    await later.flush();
  }
});

await suite("Sky inventory: resume keeps realm-entry effects while retaining later earned items", async () => {
  const state = { ...emptySave(), typewriterAwakened: true, satchel: ["firefly-lantern", "bells-tongue"] };
  const f = fixture(state); f.scene.checkpoint("moth-answer", { accepted: true });
  f.store.update(save => { rememberCompanionDecision(save, "sky-island", "accepted"); save.satchel.push("lantern-moth"); });
  const restored = await f.reload();
  assertEqual(restored.scene.combatSatchel, ["firefly-lantern", "bells-tongue"], "combat snapshot excludes this realm's freshly earned companion");
  assertEqual(restored.store.get().satchel, ["firefly-lantern", "bells-tongue", "lantern-moth"], "earned inventory remains saved in the real satchel");
  const create = owner.members.find(member => member.name?.getText(source) === "create")!.getText(source);
  assert(create.includes("this.combatSatchel") && create.includes("initialSpent: this.usedOneShots"), "actual create resolves entry loadout and visibly restores spent cards");
  await restored.flush();
});

await suite("Sky one-shot: a synchronous final-scroll strike saves consumption before invoker marks its card", async () => {
  const f = fixture(); f.scene.templeIndex = 0; f.stats.bankSoulFraction(1); f.scene.startTemple(0);
  f.stats.spendSoul(50);
  f.scene.applyOneShot("toll-strike", [{ getX: () => 500, getY: () => 300, strike: () => f.scene.onTempleCleared() }]);
  assertEqual(f.store.get().checkpoint?.data.usedOneShots, "toll-strike", "temple completion cannot recharge its synchronous last killing invocation");
  assertEqual(f.store.get().checkpoint?.data.statsSoul, 50, "the next boundary retains the actual Soul spend"); await f.flush();
});

await suite("Sky scroll: completion saves its held response and never repeats the precision challenge", async () => {
  const f = fixture(); f.scene.templeIndex = 2; f.scene.startSealedScrollTemple(); f.next(); f.complete();
  const resumed = await f.reload(); resumed.scene.resumeSky();
  assertEqual([resumed.targets.length, resumed.gates.length], [0, 1], "completed exact-letter scroll restores its response with no retyping");
  resumed.next(); assertEqual(resumed.store.get().checkpoint?.step, "temple-cleared", "Continue advances only after acknowledgment");
  await resumed.flush();
});

await suite("Sky book: interrupted transfers settle the one book before the held result and reward once", async () => {
  for (const reduced of [false, true]) {
    for (const stage of ["carried", "place", "shelved"]) {
      const f = fixture(undefined, reduced); f.scene.checkpoint("etta-book", { stage, nextTemple: 3 });
      const resumed = await f.reload(); resumed.scene.resumeSky();
      const book = resumed.scene.ettaBookCue;
      assertEqual([book.x, book.y, book.angle], stage === "shelved" ? [1260, 732, 0] : [960, 722, -3], "restoration reconstructs the received or shelved pose without replaying a move");
      assert(!resumed.tweens.some(tween => tween.duration === 520), "reload does not replay the handoff animation");
      assertEqual(resumed.scene.ettaBookMoving, false, "restored input is not held by a stale transfer");
      if (stage === "place") assertEqual(resumed.targets.at(-1).word, "place it gently", "completed lift never repeats");
      if (stage === "shelved") {
        assertEqual(resumed.store.get().almanacLore, ["scholar-ettas-last-volume"], "restored final placement earns the original lore exactly once");
        const twice = await resumed.reload(); twice.scene.resumeSky();
        assertEqual(twice.store.get().almanacLore, ["scholar-ettas-last-volume"], "repeated reward reading cannot duplicate lore");
        assertEqual(twice.targets.length, 0, "neither completed book action repeats"); await twice.flush();
      }
      await resumed.flush();
    }
  }
});

await suite("Sky forks: actual phrase completion roundtrips every index and response with held spark", async () => {
  const f = fixture(); f.scene.showFork1Cues(); f.scene.startFork1StealFlame(); f.next();
  const phrases = ["reach for the flame", "the beacon dims slightly", "the spark is yours", "the island notices"];
  for (let index = 0; index < phrases.length; index++) {
    assertEqual(f.targets.at(-1).word, phrases[index], "canon phrase order is unchanged");
    for (const reading of [false, true]) {
      if (reading) f.complete();
      const expectedCaption = f.captions.at(-1);
      const resumed = await f.reload(); resumed.scene.resumeSky();
      assertEqual(resumed.captions.at(-1), expectedCaption, "pending and held theft reloads retain the caption matching the already-completed physical actions");
      assertEqual(resumed.store.get().realms["sky-island"].choices.fork1, "steal-flame", "committed choice survives interruption");
      assertEqual(resumed.gates.length, reading ? 1 : 0, "phrase response and native target remain distinct states");
      if (!reading) assertEqual(resumed.targets.at(-1).word, phrases[index], "only the unfinished phrase restarts");
      const completed = index + (reading ? 1 : 0);
      assertEqual(Boolean(resumed.scene.dimmed), completed >= 2, "beacon dimming matches completed phrases");
      assertEqual(Boolean(resumed.scene.taken), completed >= 3, "held painted spark matches the completed handoff");
      assert(!resumed.store.get().satchel.includes("ettas-ledger"), "restoring a route cannot earn the conflicting relic");
      await resumed.flush();
    }
    f.next();
  }
  assertEqual(f.store.get().checkpoint?.step, "boss-intro", "last held response leads to the existing boss introduction");
  await f.flush();
});

await suite("Sky help branch: one last volume keeps its four-versus-two phrases, poses and rewards through every reload", async () => {
  for (const helpedBefore of [false, true]) {
    const f = fixture();
    f.store.update(state => {
      if (!helpedBefore) return;
      state.almanacLore.push("scholar-ettas-last-volume");
      state.realms["sky-island"] = { cleared: false, choices: { ettaHelped: "yes" } };
    });
    f.scene.ettaDone = helpedBefore; f.scene.showFork1Cues(); f.scene.startFork1HelpEtta();
    const book = f.scene.ettaBookCue, beacon = f.scene.beaconFlameCue;
    const beaconState = (scene: any) => [scene.beaconFlameCue.x, scene.beaconFlameCue.y,
      scene.beaconFlameCue.getByName("beacon-spark").alpha,
      scene.beaconFlameCue.getByName("beacon-light").alpha];
    assertEqual(beaconState(f.scene), [1500, 710, 1, .12], "the waiting beacon remains visible on paving clear of Etta's shelf");
    const pose = (scene: any) => [scene.ettaBookCue.x, scene.ettaBookCue.y, scene.ettaBookCue.angle];
    const expectedPose = (completed: number) => helpedBefore || completed >= 2
      ? [1260, 732, 0] : completed === 1 ? [960, 722, -3] : [760, 826, 0];
    assert(book?.scene && f.scene.ettaBookShelf?.scene, "the later encounter stages the existing single volume and shelf");
    assertEqual(pose(f.scene), expectedPose(0), "the already-placed book begins shelved; skipped help begins with one ground volume");
    assertEqual(f.gates.length, 1, "the unchanged introduction remains held before typing");
    assertEqual(f.targets.length, 0, "book staging does not start a phrase early");
    assert(f.captions.at(-1).includes(helpedBefore ? "book you placed" : "last unburned book"), "both introductions refer to the same singular last volume");
    assert(!f.captions.at(-1).includes("remaining books"), "the skipped early encounter cannot invent more unburned volumes");
    f.next();
    const expected = helpedBefore ? ["etta thanks you quietly", "the beacon brightens"] : ["carry her book", "the shelf holds it", "etta thanks you quietly", "the beacon brightens"];
    for (let index = 0; index < expected.length; index++) {
      assertEqual(f.targets.at(-1).word, expected[index], "the short route stays two phrases and the first-time route stays four singular phrases");
      const pending = await f.reload();
      pending.scene.ettaDone = !helpedBefore;
      pending.scene.resumeSky();
      assertEqual(pending.targets.at(-1).word, expected[index], "pending reload honors the saved phrase list even if the live help flag differs");
      assertEqual(pending.gates.length, 0, "a pending phrase does not repeat its acknowledged introduction");
      assertEqual(pending.captions.at(-1), f.captions.at(-1), "a pending help reload describes the carried or shelved book exactly as natural Continue did");
      assertEqual(pose(pending.scene), expectedPose(index), "pending reload restores only already-completed book actions");
      assertEqual(beaconState(pending.scene), [1500, 710, 1, .12], "pending final help phrase restores a waiting beacon without claiming an untyped brightening");
      assertEqual(pending.store.get().checkpoint?.data.helpedBefore, helpedBefore, "pending reload preserves the original help-list decision");
      assert(!pending.store.get().satchel.includes("ettas-ledger"), "pending help cannot award the later realm-ending Ledger");
      await pending.flush();
      f.complete();
      assertEqual(f.scene.ettaBookCue, book, "one physical volume is reused through all later help phrases");
      assertEqual(f.scene.beaconFlameCue, beacon, "the help chain keeps one physical beacon rather than replacing or duplicating the flame");
      const bright = index === expected.length - 1;
      assertEqual(beaconState(f.scene), [1500, 710, 1, bright ? .24 : .12], "only completing the original final phrase brightens the same visible flame and its light");
      assertEqual(pose(f.scene), expectedPose(index + 1), "the same book reaches carried then shelved before its held response");
      if (!helpedBefore) {
        assertEqual(f.store.get().almanacLore, [], "placement lore waits for the original full help-chain completion");
        assertEqual(f.store.get().realms["sky-island"].choices.ettaHelped, undefined, "the help flag does not advance before the original final acknowledgment");
      }
      const restored = await f.reload();
      restored.scene.ettaDone = !helpedBefore;
      restored.scene.resumeSky();
      assertEqual(restored.targets.length, 0, "completed help phrase restores only its held reading gate");
      assertEqual(restored.gates.length, 1, "each unchanged response keeps one deliberate Continue gate");
      assertEqual(restored.captions.at(-1), f.captions.at(-1), "a held help reload still displays its current completed response");
      assertEqual(restored.store.get().checkpoint?.data.helpedBefore, helpedBefore, "reload never shortens an unfinished long passage");
      assertEqual(pose(restored.scene), expectedPose(index + 1), "held-response reload reconstructs the completed physical book pose");
      assertEqual(beaconState(restored.scene), [1500, 710, 1, bright ? .24 : .12], "held-response reload immediately reconstructs the exact earned beacon light without replay");
      assert(!restored.store.get().satchel.includes("ettas-ledger"), "held help responses do not grant the Ledger early");
      await restored.flush(); f.next();
    }
    assertEqual(f.store.get().checkpoint?.step, "boss-intro", "completion advances out of the committed branch");
    assertEqual(f.scene.beaconFlameCue, null, "the original final Continue releases help's beacon before the boss introduction");
    assertEqual(f.store.get().realms["sky-island"].choices.ettaHelped, "yes", "original full-chain completion retains the same durable help flag");
    assertEqual(f.store.get().almanacLore.filter(id => id === "scholar-ettas-last-volume").length, 1, "both help routes earn one original memory");
    assert(!f.store.get().satchel.includes("ettas-ledger"), "help completion still leaves Ledger inventory to the unchanged realm ending");
    await f.flush();
  }
});

await suite("Sky boss: each actual answered riddle restores its response and pending phases keep full phrases", async () => {
  for (const phase of [1, 2]) {
    const f = fixture(); f.scene.bossContainer = prop(960, 400);
    if (phase === 1) f.scene.startBossPhase1(); else f.scene.startBossPhase2();
    f.next(); assertEqual(f.targets.at(-1).word, phase === 1 ? "a portal" : "a written word", "unchanged full-sentence answer is required"); f.complete();
    const restored = await f.reload(); restored.scene.resumeSky();
    assertEqual([restored.targets.length, restored.gates.length], [0, 1], "answered riddle is never asked again before its response");
    assertEqual(restored.scene.bossContainer.alpha, 1, "restored Scholar begins in its stable stage pose");
    restored.next(); assertEqual(restored.store.get().checkpoint?.data.phase, phase + 1, "acknowledgment advances to only the next phase"); await restored.flush();
  }
  const third = fixture(); third.scene.checkpoint("boss", { phase: 3 }); const restored = await third.reload(); restored.scene.resumeSky(); restored.next();
  assertEqual(restored.targets.at(-1).word, "the sky that held the light", "final true-name riddle preserves its original full answer"); await restored.flush();
});

await suite("Sky aftermath routes: kindly and cut passages preserve every committed answer and held response", async () => {
  const kind = fixture(); kind.scene.showFork2Cues(); kind.scene.startFork2KindEnding(); kind.next();
  const pendingKind = await kind.reload(); pendingKind.scene.resumeSky();
  assertEqual([pendingKind.targets.at(-1)?.word, pendingKind.gates.length], ["you kept the light", 0], "an acknowledged kind introduction restores its unfinished answer directly");
  await pendingKind.flush();
  assertEqual(kind.targets.at(-1).word, "you kept the light", "kind answer keeps the original exact phrase"); kind.complete();
  const kindRestored = await kind.reload(); kindRestored.scene.resumeSky();
  assertEqual([kindRestored.targets.length, kindRestored.gates.length], [0, 1], "completed kind answer restores only the held response");
  assertEqual(kindRestored.store.get().realms["sky-island"].choices.fork2, "answer-kindly", "kind route remains committed"); await kindRestored.flush();
  const cut = fixture(); cut.scene.showFork2Cues(); cut.scene.startFork2CutTether(); cut.next();
  for (const [index, word] of ["pull the thread", "the tether falls"].entries()) {
    assertEqual(cut.targets.at(-1).word, word, "cut route keeps its original phrase order");
    const pending = await cut.reload(); pending.scene.resumeSky();
    assertEqual(pending.captions.at(-1), cut.captions.at(-1), "a pending cut phrase restores the last acknowledged thread response rather than the original invitation");
    assertEqual([pending.targets.at(-1).word, pending.gates.length], [word, 0], "restored thread context cannot add a reading gate or repeat a completed phrase");
    await pending.flush(); cut.complete();
    const restored = await cut.reload(); restored.scene.resumeSky();
    assertEqual(restored.captions.at(-1), cut.captions.at(-1), "the current held cut response remains unchanged");
    assertEqual([restored.targets.length, restored.gates.length], [0, 1], "finished cut phrase restores only its acknowledgment");
    assertEqual(restored.store.get().checkpoint?.data.index, index, "the exact completed cut phrase survives serialization"); await restored.flush(); cut.next();
  }
  assertEqual(cut.store.get().realms["sky-island"].choices.fork2, "cut-tether", "cut route remains committed"); await cut.flush();
});

await suite("Sky aftermath: accepted/declined moths remain durable", async () => {
  for (const accepted of [false, true]) {
    const f = fixture();
    f.store.update(state => {
      rememberRealmFork(state, "sky-island", "fork1", "help-etta");
      rememberCompanionDecision(state, "sky-island", accepted ? "accepted" : "declined");
      if (accepted) state.satchel.push("lantern-moth");
    });
    f.scene.checkpoint("moth-answer", { accepted }); const restored = await f.reload(); restored.scene.resumeSky();
    assertEqual(restored.gates.length, 1, "invitation response remains held after restart");
    assertEqual(restored.targets.length, 0, "the invitation is committed, never offered again");
    if (accepted) assertEqual([restored.scene.lanternMothCompanion.x, restored.scene.lanternMothCompanion.y, restored.scene.lanternMothCompanion.scale], [1009, 768, 36 / 104], "accepted moth is already perched on Wren's wrist");
    else assertEqual(restored.scene.lanternMothCompanion, null, "declined moth does not reappear");
    restored.next(); assertEqual(restored.store.get().checkpoint?.step, "true-name", "original response gates the final passage");
    await restored.flush();
  }
});

await suite("Sky completion: final passage retains marker until actual completion and clears only its own", async () => {
  for (const [fork1, fork2, rewards] of [
    ["help-etta", "answer-kindly", ["ettas-ledger", "wind-phrase"]],
    ["steal-flame", "cut-tether", ["beacon-spark", "tether-cord", "untethered-wind"]],
  ] as const) {
    const f = fixture(); f.scene.fork1Choice = fork1; f.scene.fork2Choice = fork2;
    f.scene.startTrueNamePassage(); f.next(); assertEqual(f.targets.at(-1).word, "the sky remembers every page that ever lit. nothing burned is truly gone.", "canonical punctuation stays in the full true-name passage"); f.complete();
    assertEqual(f.store.get().checkpoint?.step, "ending", "final typed passage saves the upcoming ending before its timer");
    assert(!f.store.get().realms["sky-island"]?.cleared, "typing alone does not prematurely clear the realm");
    f.store.update(state => { rememberRealmFork(state, "sky-island", "fork1", fork1); rememberRealmFork(state, "sky-island", "fork2", fork2); });
    const restored = await f.reload(); restored.scene.resumeSky();
    assertEqual(restored.store.get().checkpoint, null, "actual ending clears its own checkpoint");
    assert(restored.store.get().realms["sky-island"]?.cleared, "actual ending marks realm complete");
    assertEqual(restored.store.get().satchel, [...rewards], "only route-specific original rewards are granted"); await restored.flush();
  }
  const other = fixture(); other.scene.revisit = true;
  other.store.setCheckpoint({ scene: "SunkenBellScene", step: "fork1", data: {} });
  other.scene.startEnding(); assertEqual(other.store.get().checkpoint?.scene, "SunkenBellScene", "even ending cleanup on a revisit cannot clear another realm marker"); await other.flush();
});


await suite("Sky carrying: one bounded volume follows the painted carrying pose and foreground fingers through real save restoration", async () => {
  for(const reduced of [false,true]) {
    const f=fixture(undefined,reduced);
    f.scene.showEttaBookCue=()=>Sky.prototype.showEttaBookCue.call(f.scene);
    const before=JSON.stringify(f.store.get());
    f.scene.restoreEttaBookPose("carried");
    const book=f.scene.ettaBookCue,hands=f.scene.ettaCarryHands;
    assertEqual(f.images.filter((image:any)=>image.texture.key==="etta-volume").map((image:any)=>image.displayWidth),[112],"the actual book constructor bounds the single painted volume to the intended carry width");
    assertEqual([f.scene.wrenSprite.texture.key,book.x,book.y,book.angle],["wren-carry",960,722,-3],"the carried volume is centered across the dedicated forearms below the face");
    assertEqual(f.updateListeners.length,1,"one update listener keeps world-space anchors attached to the actor");
    book.setScale(1.03);const shelfEntrance=f.scene.tweens.add({targets:f.scene.ettaBookShelf,alpha:0,duration:420});
    f.scene.restoreEttaBookPose("carried");
    assertEqual([book.scaleX,book.scaleY,f.scene.ettaBookShelf.alpha],[1,1,1],"a restored grip cannot retain an attention pulse or a half-faded shelf");
    assert(shelfEntrance.cancelled,"restoration cancels the shelf entrance before it can later overwrite the settled pose");
    f.scene.setEttaCarryPose(true);
    assertEqual([f.carryHandBuilds.length,f.updateListeners.length],[1,1],"repeated restoration reuses one foreground grip and one update handler");
    f.scene.wrenSprite.getWorldTransformMatrix=()=>({tx:1008,ty:803,a:.27,d:.21,transformPoint(x:number,y:number){return {x:this.tx+x*this.a,y:this.ty+y*this.d};}});
    f.updateListeners[0].fn.call(f.updateListeners[0].context);
    assertEqual([book.x,book.y,hands.x,hands.y,hands.scaleX,hands.scaleY],[1008,712,1008,803,.27,.21],"book and finger layer follow actual world translation and nonuniform typing/breathing scale");
    f.scene.ettaBookMoving=true;
    f.scene.wrenSprite.getWorldTransformMatrix=()=>{throw new Error("moving volume is not owned by the carried update");};
    f.scene.updateEttaBookCarry();
    assertEqual([book.x,book.y],[1008,712],"a live transfer retains exclusive position ownership");
    f.scene.restoreEttaBookPose("shelved");
    assertEqual([book.x,book.y,book.angle],[1260,732,0],"the one volume settles onto the unchanged physical shelf");
    assertEqual([hands.scene,f.scene.ettaCarryHands,f.updateListeners.length,f.scene.wrenSprite.texture.key],[false,null,0,"wren-front"],"shelving destroys the foreground fingers, removes follow events and restores the normal actor pose");
    assertEqual(JSON.stringify(f.store.get()),before,"display and cleanup never change durable progress, rewards or inventory");
    f.scene.clearEttaBookCue();
    f.scene.updateEttaBookCarry();
    assertEqual([f.scene.ettaBookCue,f.scene.ettaBookShelf,f.updateListeners.length],[null,null,0],"cleanup leaves no book, shelf, grip or late update owner");
    await f.flush();
  }
});

await suite("Sky carrying: live and reduced transfers settle to the same supported pose, with stale callbacks cancelled on cleanup", async () => {
  for(const reduced of [false,true]) {
    const f=fixture(undefined,reduced);f.scene.showEttaBookCue();let delivered=0;
    f.scene.moveEttaBook("carried",()=>{delivered++;});
    if(!reduced) {
      assertEqual([delivered,f.scene.ettaBookMoving],[0,true],"live handoff remains owned by its original transfer until it settles");
      f.tweens.find(tween=>tween.duration===520).onComplete();
    }
    assertEqual([delivered,f.scene.ettaBookCue.x,f.scene.ettaBookCue.y,f.scene.ettaBookCue.angle,f.scene.wrenSprite.texture.key],[1,960,722,-3,"wren-carry"],"both modes use the exact restored carrying pose and one completion callback");
    f.scene.moveEttaBook("shelved",()=>{delivered++;});
    if(!reduced) f.tweens.filter(tween=>tween.duration===520).at(-1).onComplete();
    assertEqual([delivered,f.scene.ettaCarryHands,f.updateListeners.length],[2,null,0],"both modes release the physical grip when placing the book");
    await f.flush();
  }
  const f=fixture();f.scene.showEttaBookCue();let delivered=0;
  f.scene.moveEttaBook("carried",()=>{delivered++;});const late=f.tweens.find(tween=>tween.duration===520).onComplete;
  f.scene.clearEttaBookCue();late();
  assertEqual([delivered,f.scene.ettaCarryHands,f.updateListeners.length],[0,null,0],"leaving the scene invalidates a late handoff before it can create fingers or fire story progression");await f.flush();
});


await suite("Sky revisits: recorded book, empty beacon and summit light survive mixed and historical routes without new rewards", async () => {
  const rows=[
    {choices:{fork1:"help-etta",fork2:"cut-tether"},items:["ettas-ledger","tether-cord"],lore:[],book:true,flame:true,alpha:.42},
    {choices:{fork1:"steal-flame",fork2:"answer-kindly",ettaHelped:"yes"},items:["beacon-spark","wind-phrase"],lore:[],book:true,flame:false,alpha:1},
    {choices:{fork1:"steal-flame",fork2:"answer-kindly"},items:["beacon-spark","ettas-ledger","wind-phrase"],lore:[],book:false,flame:false,alpha:1},
    {choices:{},items:["ettas-ledger","wind-phrase"],lore:[],book:true,flame:true,alpha:1},
    {choices:{},items:[],lore:["scholar-ettas-last-volume"],book:true,flame:null,alpha:null},
    {choices:{},items:[],lore:[],book:false,flame:null,alpha:null},
  ];
  for(const row of rows) {
    const state={...emptySave(),typewriterAwakened:true,satchel:row.items,almanacLore:row.lore,
      realms:{"sky-island":{cleared:true,choices:row.choices}}};
    const f=fixture(state),before=JSON.stringify(f.store.get());let alpha:number|null=null;
    f.scene.setAmbientLanternFieldAlpha=(value:number,duration:number)=>{alpha=value;assertEqual(duration,0,"persisted lighting is restored immediately rather than replaying a choice");};
    f.scene.stageSkyRevisitAftermath();
    assertEqual(Boolean(f.scene.ettaBookCue?.scene),row.book,"only recorded early or later help retains the single volume");
    if(row.book) assertEqual([f.scene.ettaBookCue.x,f.scene.ettaBookCue.y,f.scene.ettaCarryHands],[1260,732,null],"the completed book stays on its original shelf, not back in Wren's arms");
    if(row.flame===null) assertEqual(f.scene.beaconBuilds.length,0,"unknown first-fork history does not invent a lit or stolen beacon");
    else {
      const beacon=f.scene.beaconFlameCue;
      assertEqual([beacon.x,beacon.y],[1500,710],"the beacon contact sits upstage on paving, clear of the descending cliff lip");
      assert(beacon.x-90>1260+130,"painted beacon and shelf silhouettes have a clear horizontal gap");
      assertEqual([beacon.getByName("beacon-spark").scene,beacon.getByName("beacon-light").scene],[row.flame,row.flame],"theft leaves the actual brazier empty without replaying a spark reward");
    }
    assertEqual(alpha,row.alpha,"independent kind/cut lighting follows resolved history; unknown remains neutral");
    f.scene.stageSkyRevisitAftermath();
    assertEqual(f.scene.beaconBuilds.length,row.flame===null?0:1,"rebuilding a return never creates duplicate masonry or light");
    assertEqual(JSON.stringify(f.store.get()),before,"visual aftermath never changes saved forks, rewards, inventory or completion");
    await f.flush();const restored=await f.reload();restored.scene.stageSkyRevisitAftermath();
    assertEqual(Boolean(restored.scene.ettaBookCue?.scene),row.book,"the same book aftermath is reconstructed after the real serializer/backend reload");await restored.flush();
  }
});


await suite("Sky pending passage context: a silent intermediate response retains the last acknowledged line through real save restoration", async () => {
  const f = fixture();
  const phrases = ["first action", "silent action", "last action"];
  const responses = ["The first action is complete.", "", "The last action is complete."];
  f.scene.setNarrator("Initial instructions.");
  f.scene.runPassageChain(phrases, responses, noop, undefined, "help-etta");
  assertEqual(f.captions.at(-1), "Initial instructions.", "the first pending phrase retains its untouched introduction");
  f.complete(); f.next(); f.complete();
  assertEqual([f.targets.at(-1).word, f.gates.length, f.captions.at(-1)],
    ["last action", 0, responses[0]], "a silent completed action naturally keeps the earlier acknowledged context without an extra reading gate");
  const restored = await f.reload();
  restored.scene.setNarrator("Initial instructions.");
  restored.scene.runPassageChain(phrases, responses, noop, undefined, "help-etta");
  assertEqual([restored.targets.at(-1).word, restored.gates.length, restored.captions.at(-1)],
    ["last action", 0, responses[0]], "reload skips the empty response, restores existing context, and leaves the last phrase unfinished");
  assertEqual(restored.store.get().checkpoint?.data.reading, false, "restoring prose cannot turn a pending phrase into a completed response");
  await restored.flush(); await f.flush();
});
