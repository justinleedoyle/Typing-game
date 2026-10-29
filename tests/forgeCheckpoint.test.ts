import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";
import { checkpointIndex } from "../src/game/chapterFlow";
import { FORGE_STEPS, forgePassageIndex, forgeStep } from "../src/game/forgeCheckpoint";
import { emptySave, migrate, SaveStore, type SaveState } from "../src/game/saveState";
import { SessionStats, SPELL_COST } from "../src/game/sessionStats";
import { rememberCompanionDecision, rememberRealmFork, resolveCompanionDecision, resolveRealmFork } from "../src/game/realmChoices";
import { resolveCombatLoadout } from "../src/game/relicEffects";
import { OFFENSIVE_ONE_SHOTS, isSingleTargetOneShot, pickHardestEnemy } from "../src/game/oneShotInvocation";

// Execute the real progression, save, restoration and phrase methods. Only the
// renderer/audio and decorative clock are inert; no scene flow is copied here.
const url = new URL("../src/scenes/ClockworkForgeScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["init", "checkpoint", "savedStageData", "hasSavedPassage", "restoreForgeStage", "resumeForge",
  "startAct1Arrival", "startCatwalkBeats", "showCatwalkAnswer", "startGregorConversation", "gregorStep2",
  "gregorTutorialMove", "showTutorialMoveAnswer", "gregorTutorialCommand", "showTutorialCommandAnswer",
  "startTutorialGolemFight", "beginTutorialGolemFight", "startAct2", "startWave1", "startFornEncounter", "startWave2",
  "startFork1", "startFornBranch", "startCabalBranch", "afterFork1", "startAct3", "startBossPhase1", "startBossPhase2",
  "startBossPhase3", "bossDefeated", "startFork2", "startFork2PeacefulBranch", "showPeacefulOrderAnswer",
  "startFork2FightBranch", "showFightAnswer", "afterFork2", "startCompanionGate", "awardSongbird", "showSongbirdAnswer",
  "perchSongbirdOnWren", "startTrueNamePassage", "deliverTrueNamePassage", "startEnding", "commitFork",
  "runPassageChain", "beginCombatWave", "applyOneShot", "catwalkCueX", "catwalkEntranceWrenX", "catwalkWrenX", "catwalkWordPosition"];
const constants = source.statements.filter(ts.isVariableStatement).map(statement => statement.getText(source)).join("\n");
const code = ts.transpileModule(`${constants}\nclass Forge {
  ${names.map(name => owner.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const noop = () => {};
const body = (x = 0, y = 0) => ({ x, y, scene: true, alpha: 1,
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
  setAlpha(value: number) { this.alpha = value; return this; }, setScale() { return this; },
  once: noop, destroy() { this.scene = false; }, getAt: () => ({ setVisible: noop }),
});
const bindings = {
  checkpointIndex, forgePassageIndex, forgeStep, rememberCompanionDecision, rememberRealmFork, resolveCompanionDecision, resolveRealmFork, OFFENSIVE_ONE_SHOTS,
  reducedMotion: () => true, reducedFlashes: () => true,
  Phaser: { GameObjects: { Events: { DESTROY: "destroy" } }, Math: { Clamp: (n: number, a: number, b: number) => Math.max(a, Math.min(b, n)) } },
  PALETTE_HEX: { ember: 1, brass: 2 }, playPortalArrivalWake: noop, playWrenFocus: noop, playWrenAction: noop,
  playBodyImpact: noop, playActorAttention: noop, playBodyTypePulse: noop, playClaimLine: noop, playChime: noop, addIdleBreath: noop,
  playWaveSting: noop, playQuietLordIntrusion: noop, flashQuietLordFragment: noop,
  stageTrueNameSeal: () => body(960, 762), dismissTrueNameSeal: noop,
  attachWordBodyAnchor: () => ({ destroy: noop }),
  FORGE_COMMAND_BANK: ["turnTURN", "stepSTEP", "holdHOLD", "standSTAND"],
  pickAdaptiveWords: (bank: string[], count: number) => bank.slice(0, count), shuffle: (items: unknown[]) => items.slice(),
};
const Forge = new Function(...Object.keys(bindings), code + "; return Forge;")(...Object.values(bindings));
const stores: SaveStore[] = [];

function fresh(): SaveState {
  const save = emptySave(); save.typewriterAwakened = true;
  save.realms["clockwork-forge"] = { cleared: false, choices: {} };
  return save;
}

function fixture(initial = fresh(), revisit = false) {
  let persisted: SaveState | null = null;
  const store = new SaveStore({ load: async () => initial, save: async state => { persisted = structuredClone(state); } }, initial,
    { saveDelayMs: 60_000 });
  stores.push(store);
  const scene = new Forge();
  const captions: string[] = [], props: string[] = [], gifts: Array<{ id: string; restored: boolean }> = [];
  const timers: Array<() => void> = [];
  let gate: (() => void) | null = null, word: any = null, clearWave: (() => void) | null = null;
  let spent = [] as string[];
  const stats = new SessionStats();
  const makeWord = (options: any) => { word = options; return options; };
  Object.assign(scene, {
    clearForgeKeepsake: noop, scale: { width: 1920, height: 1080 },
    wrenContainer: body(522, 460), wrenSprite: body(),
    tweens: { killTweensOf: noop, add: noop }, cameras: { main: { shake: noop, flash: noop } },
    band: { setObjective: noop }, narration: { say: (key: string) => captions.push(key) },
    setNarrator: (text: string) => captions.push(text),
    readThen(next: () => void) { assert(!gate, "a checkpoint cannot replace an unread response"); gate = next; },
    clearActiveTargets() { word = null; }, registerActiveTarget: noop, makeWord,
    makeFornWord: makeWord, makeCommandGolemWord: makeWord, makeSongbirdWord: makeWord,
    makeStaticGolemWord: (_golem: unknown, opts: any) => makeWord(opts),
    makeForgeChoiceWord: (_cue: unknown, opts: any) => makeWord(opts),
    forgePassageWordPosition: () => ({ x: 600, y: 440 }), forgeForkWordPosition: () => ({ x: 600, y: 440 }),
    forgeChoiceWordPosition: () => ({ x: 600, y: 440 }), staticGolemWordPosition: () => ({ x: 1530, y: 300 }),
    time: { delayedCall: (_delay: number, next: () => void) => timers.push(next) },
    spawnStaticGolem: (x: number, y: number) => { props.push("tutorial-golem"); return { container: body(x, y), sprite: body() }; },
    spawnAdvancingGolem: (x: number, y: number, command: string) => ({ container: body(x, y), command }),
    watchForWaveClear: (next: () => void) => { clearWave = next; },
    showGregorSprite() { this.gregorSprite = body(); props.push("gregor"); }, hideGregorSprite: noop,
    showFornSprite() { this.fornSprite = body(); props.push("forn"); }, hideFornSprite: noop,
    showFork1ChoiceCues() { this.apprenticeCue = body(); props.push("bellows", "valve"); },
    showApprenticeSprite: noop, hideApprenticeSprite: noop,
    showFork2ChoiceCues() { this.standDownCue = body(); this.fightCue = body(); props.push("console", "fight-cue"); },
    showPeacefulGuards: () => props.push("peaceful-guards"), clearPeacefulGuards: noop,
    spawnBossVisual() { this.bossContainer = body(1160, 686); this.bossSprite = body(); props.push("boss"); },
    flashGolemCommanded: () => props.push("commanded"),
    showForgeKeepsake: (id: string, _fromX: number, restored = false) => gifts.push({ id, restored }),
    showSongbirdCompanion() { this.songbirdCompanion = body(1280, 470); props.push("songbird"); },
    pulseSongbirdCompanion: noop, dismissSongbirdCompanion: noop,
    showCatwalkCue: () => props.push("catwalk-cue"), dismissCatwalkCue: noop,
    releaseCatwalkCueWordAnchor: noop, attachCatwalkCueWordAnchor: noop, pulseCatwalkCue: noop,
    walkWrenAlongCatwalk: (_x: number, next?: () => void) => next?.(), resetWrenToFront: noop,
    swapWrenFootingToFoundry: () => props.push("foundry-footing"), descendWrenToFoundry: (next: () => void) => next(),
    approachForgeWork: noop, pulseForgeChoiceCue: noop, dismissForgeChoiceCue: noop, dismissBellowsWorkstation: noop,
    clearForgeChoiceCues: noop, golemTurnHead: noop, golemCommandFlash: noop,
    announceCombatLoadout: (next: () => void) => next(), playCommandGolemRiseCue: noop, playCommandGolemStagePulse: noop,
    pulseForgeWave: noop, playSoulBankCue: noop, applyAutoEase: noop, applyCompanionTrip: noop,
    quietLordIntrusionAnchor: () => ({ x: 0, y: 0 }),
  });
  scene.init({ store, revisit });
  if (scene.resumeCheckpoint) stats.restoreCheckpoint(scene.resumeCheckpoint.data);
  scene.typingInput = { getStats: () => stats };
  scene.combat = resolveCombatLoadout(revisit ? [] : scene.combatSatchel, "clockwork-forge");
  scene.spellCost = Math.ceil(SPELL_COST * scene.combat.soulThriftMult);
  scene.director = { wordLengthBias: () => 0, advanceMs: (value: number) => value, enemyCount: (value: number) => value };
  spent = typeof scene.resumeCheckpoint?.data.spentOneShots === "string" ? scene.resumeCheckpoint.data.spentOneShots.split(",").filter(Boolean) : [];
  scene.oneShotInvoker = { getSpent: () => spent };
  return { scene, store, stats, props, gifts, captions,
    word: () => word, gate: () => gate,
    continue() { assert(gate, "the native Continue gate is held"); const next = gate!; gate = null; next(); },
    tick() { assert(timers.length, "an original timer is pending"); timers.shift()!(); },
    untilWord() { for (let i = 0; !word && timers.length && i < 20; i++) timers.shift()!(); assert(word, "the original timed progression produces a word"); return word; },
    clearWave() { assert(clearWave, "the actual encounter watches for completion"); clearWave!(); },
    spendOneShot: () => { spent.push("toll-strike"); }, spent: () => spent,
    async reload() { await store.flush(); assert(persisted, "SaveStore persisted a real snapshot"); return fixture(migrate(JSON.parse(JSON.stringify(persisted)))); },
  };
}

await suite("Forge checkpoints: every stable step routes through actual scene entry after a save roundtrip", async () => {
  for (const step of FORGE_STEPS) {
    const save = fresh();
    save.realms["clockwork-forge"]!.choices = { fork1: "forn", fork2: "peaceful", companion: "accepted" };
    save.satchel = ["bellows-hammer", "master-key", "brass-songbird"];
    save.checkpoint = { scene: "ClockworkForgeScene", step, data: { index: 1, reading: false, combatSatchel: "", statsSoul: 63 } };
    const f = fixture(migrate(JSON.parse(JSON.stringify(save))));
    f.scene.resumeForge();
    assertEqual(f.stats.getSoul(), 63, `${step} preserves the checkpoint's Soul before any wave grant`);
    assert(f.gate() || f.word() || ["tutorial-fight", "wave1", "wave2", "fight", "boss1", "true-name"].includes(step), `${step} reaches an encounter, reading or timed phrase`);
    assertEqual(f.scene.wrenContainer.y, ["arrival", "catwalk", "catwalk-answer", "gregor", "gregor-lesson", "tutorial-move", "tutorial-move-answer", "tutorial-command", "tutorial-command-answer", "tutorial-fight", "act2"].includes(step) ? 460 : 866,
      `${step} reconstructs Wren on the correct floor`);
    if (["wave1", "forn-encounter", "wave2", "fork1"].includes(step)) assertEqual(f.scene.wrenContainer.x, 960,
      "the early foundry encounters preserve the descent's centered combat position");
    if (step !== "ending") assert(!f.store.get().realms["clockwork-forge"]!.cleared, `${step} cannot complete the realm early`);
  }
  assertEqual(forgeStep("unknown-future-stage"), "arrival", "unknown scene steps safely use the arrival");
  assertEqual([forgePassageIndex(-9, 4), forgePassageIndex(99, 4), forgePassageIndex(1.5, 4)], [0, 4, 0], "completed passages retain their end boundary and reject fractional indices");
});

await suite("Forge checkpoints: native repair phrases and held Hammer acknowledgment resume without another fork or gift", async () => {
  for (const branch of ["forn", "cabal"] as const) for (let index = 0; index < 4; index++) for (const reading of [false, true]) {
    const save = fresh(); save.realms["clockwork-forge"]!.choices.fork1 = branch;
    save.checkpoint = { scene: "ClockworkForgeScene", step: branch, data: { index, reading, combatSatchel: "" } };
    const f = fixture(save); f.scene.resumeForge();
    assert(f.props.includes("valve") && f.props.includes("bellows"), "the saved branch reconstructs its machinery");
    assertEqual(!!f.gate(), reading, "a completed phrase resumes its existing response; an unfinished phrase restarts directly");
    assertEqual(f.gifts.filter(gift => gift.id === "bellows-hammer").length, branch === "forn" && (index > 2 || (index === 2 && reading)) ? 1 : 0,
      "only progress at or after the real gift phrase restores the Hammer");
    assert(f.gifts.every(gift => gift.restored), "restoration settles the hand prop without replaying its transfer");
    assertEqual(f.store.get().satchel, [], "neither phrase restoration nor acknowledgment grants the reward early");
    if (reading) f.continue();
    const expected = branch === "forn" ? ["work the bellows", "seal the seam", "forn gives you his hammer", "the forge breathes again"]
      : ["block the valve", "the apprentices cheer", "they hand you a wrench", "the forge chokes and slows"];
    if (!reading || index < 3) assertEqual(f.word().word, expected[index + (reading ? 1 : 0)], "the actual next phrase is exact");
    else {
      assertEqual(f.store.get().satchel, [branch === "forn" ? "bellows-hammer" : "sabotage-wrench"], "only the original final-response Continue earns its branch's reward");
      const resumed = await f.reload(); resumed.scene.resumeForge();
      assertEqual(resumed.store.get().satchel, f.store.get().satchel, "reward reading reload is idempotent");
      assert(resumed.gate() && !resumed.word(), "the original reward card stays held before boss entry");
    }
  }
});

await suite("Forge checkpoints: boss word boundaries preserve capitals and both true-name repetitions", async () => {
  for (const [step, words] of [["boss1", ["forge", "iron", "brass"]], ["boss2", ["HOLD", "STAND", "YIELD"]], ["boss3", ["stand DOWN", "stand DOWN"]]] as const) {
    for (let index = 0; index < words.length; index++) {
      const save = fresh(); save.checkpoint = { scene: "ClockworkForgeScene", step, data: { index, combatSatchel: "" } };
      const f = fixture(save); f.scene.resumeForge();
      const word = f.untilWord();
      assertEqual(word.word, words[index], "the saved boss phrase is reconstructed exactly");
      assertEqual(word.caseSensitive ?? false, step !== "boss1", "capital and mixed-case gates still require Shift");
      assert(f.props.includes("boss"), "each resumed phase reconstructs its boss body before its word");
      if (step !== "boss1") assert(f.props.includes("commanded"), "later phases restore the commanded boss appearance");
      word.onComplete();
      const cp = f.store.get().checkpoint!;
      assertEqual(cp.step, index + 1 < words.length ? step : step === "boss1" ? "boss2" : step === "boss2" ? "boss3" : "boss-defeated", "word completion saves the next boundary before its timer");
      if (index + 1 < words.length) assertEqual(cp.data.index, index + 1, "the completed boss word will not be reoffered");
      const resumed = await f.reload(); resumed.scene.resumeForge();
      if (cp.step === "boss-defeated") assert(resumed.gate() && !resumed.word(), "the final repetition restores defeat reading without recreating the boss fight");
      else assertEqual(resumed.untilWord().word, index + 1 < words.length ? words[index + 1] : cp.step === "boss2" ? "HOLD" : "stand DOWN", "persisted completion resumes the next actual target");
    }
  }
});

await suite("Forge checkpoints: spell fuel, per-wave grants, spent relics and entry loadout survive actual checkpoint writes", async () => {
  const save = fresh(); save.satchel = ["king-aurland", "bells-tongue"];
  const f = fixture(save);
  for (let i = 0; i < 4; i++) f.stats.record(true);
  f.stats.record(false); f.spendOneShot();
  f.scene.startWave1();
  const entry = f.store.get().checkpoint!;
  assertEqual(entry.data.statsSoul, 12, "wave checkpoint captures fuel before the original bank grant");
  assert(f.stats.getSoul() > 12, "the original encounter still grants its relic's Soul head start");
  const expectedStats = f.stats.captureCheckpoint();
  const resumed = await f.reload(); resumed.scene.resumeForge();
  assertEqual(resumed.stats.captureCheckpoint(), expectedStats, "restarting a wave applies the bank once, with its saved Heart and combo");
  assertEqual(resumed.spent(), ["toll-strike"], "spent one-shot state reaches the reconstructed invoker");
  f.store.update(state => { state.satchel.push("bellows-hammer"); });
  f.scene.checkpoint("boss-intro");
  const afterReward = await f.reload();
  assertEqual(afterReward.scene.combatSatchel, ["king-aurland", "bells-tongue"], "newly earned Forge relics stay out of the original entry loadout");
  assertEqual(afterReward.scene.spellCost, SPELL_COST, "reload does not newly discount Alt spells after earning a Hammer");
});

await suite("Forge checkpoints: actual one-shot fire records its spent charge before a synchronous saved effect", () => {
  const invokerUrl = new URL("../src/game/oneShotInvoker.ts", import.meta.url);
  const invokerSource = ts.createSourceFile(invokerUrl.pathname, readFileSync(invokerUrl, "utf8"), ts.ScriptTarget.Latest, true);
  const invokerClass = invokerSource.statements.find(ts.isClassDeclaration)!;
  const fire = invokerClass.members.find(member => member.name?.getText(invokerSource) === "fire")!;
  const fireCode = ts.transpileModule(`class Invoker { ${fire.getText(invokerSource)} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const Invoker = new Function("isSingleTargetOneShot", "pickHardestEnemy", `${fireCode}; return Invoker;`)(isSingleTargetOneShot, pickHardestEnemy);
  const f = fixture(); f.stats.bankSoulFraction(1);
  const widget = { effect: "toll-strike", state: "ready", target: {} };
  const invoker = new Invoker();
  f.scene.tollStrike = () => {
    assertEqual(widget.state, "ready", "the real invoker has not marked its widget spent before invoking the effect");
    f.scene.startFornEncounter();
  };
  invoker.cfg = { cost: 50, getThreats: () => [{ enemy: {}, progress: 1, wordLength: 8 }],
    spendSoul: (cost: number) => f.stats.spendSoul(cost),
    applyEffect: (effect: string, targets: unknown[]) => f.scene.applyOneShot(effect, targets) };
  invoker.markSpent = () => { widget.state = "spent"; };
  invoker.fire(widget);
  assertEqual(f.store.get().checkpoint!.data.statsSoul, 50, "the immediate next boundary saves the already-paid Soul cost");
  assertEqual(f.store.get().checkpoint!.data.spentOneShots, "toll-strike", "the same boundary cannot silently recharge the paid one-shot");
  assertEqual(widget.state, "spent", "the original invoker still finishes its native spent-state transition");
});

await suite("Forge checkpoints: peaceful console response and true-name completion preserve their existing Continue gates", async () => {
  const f = fixture();
  f.scene.fork1Choice = "forn"; f.scene.fork2Choice = "peaceful";
  f.scene.startFork2PeacefulBranch();
  assertEqual([f.word().word, f.word().caseSensitive], ["STAND DOWN", true], "the final peaceful order stays exact and capitalized");
  f.word().onSpellComplete();
  assertEqual(f.store.get().checkpoint!.step, "peaceful-answer", "the command acknowledgment is durable before its reward Continue");
  const resumed = await f.reload(); resumed.scene.resumeForge();
  assert(resumed.props.includes("console") && resumed.props.includes("peaceful-guards"), "the held command response restores its console and subjects");
  assert(resumed.gate() && !resumed.word(), "the capital order is not repeated after completion");
  assertEqual(resumed.store.get().satchel, [], "the Master Key still waits for the original Continue");
  resumed.continue();
  assertEqual(resumed.store.get().satchel, ["master-key"], "the original callback awards its one Master Key");
  const nameSave = fresh(); nameSave.checkpoint = { scene: "ClockworkForgeScene", step: "true-name", data: { index: 2, combatSatchel: "" } };
  const final = fixture(nameSave); final.scene.resumeForge();
  assertEqual(final.word().word, "its makers are remembered.", "the final true-name phrase resumes at its real index");
  final.word().onComplete();
  const complete = await final.reload(); complete.scene.resumeForge();
  assertEqual(complete.store.get().checkpoint!.step, "ending", "the completed true-name boundary continues through its original final transition");
  complete.tick();
  assert(complete.store.get().realms["clockwork-forge"]!.cleared, "completion after the last phrase survives the final transition timer");
  assertEqual(complete.store.get().checkpoint, null, "actual completion clears the Forge checkpoint");
  assert(complete.store.get().almanacLore.includes("the-forge-true-name"), "completion still stamps its existing lore page");
});

await suite("Forge checkpoints: actual locked forks cannot reoffer the opposite branch or duplicate its reward", async () => {
  for (const branch of ["forn", "cabal"] as const) {
    const save = fresh(); save.realms["clockwork-forge"]!.choices.fork1 = branch;
    save.checkpoint = { scene: "ClockworkForgeScene", step: branch === "forn" ? "cabal" : "forn", data: { combatSatchel: "" } };
    const f = fixture(save); f.scene.resumeForge();
    assert(f.gate(), "a stale opposite checkpoint routes to the committed branch's introduction");
    f.continue();
    assertEqual(f.word().word, branch === "forn" ? "work the bellows" : "block the valve", "only the committed branch's actual first action is available");
    assertEqual(f.store.get().realms["clockwork-forge"]!.choices.fork1, branch, "the original commitment is unchanged");
  }
  const save = fresh(); save.realms["clockwork-forge"]!.choices = { fork1: "cabal", fork2: "fought" };
  save.checkpoint = { scene: "ClockworkForgeScene", step: "peaceful", data: { combatSatchel: "" } };
  const f = fixture(save); f.scene.resumeForge();
  assertEqual(f.scene.golems.length, 2, "a stale peaceful checkpoint reconstructs the committed two-golem fight");
  assertEqual(f.store.get().checkpoint!.step, "fight", "the active encounter is saved as the real committed branch");
  f.clearWave();
  assertEqual(f.store.get().checkpoint!.step, "fight-answer", "clearing the guards saves its existing held acknowledgment");
  const resumed = await f.reload(); resumed.scene.resumeForge();
  assertEqual(resumed.scene.golems.length, 0, "the completed guards are not restarted from their response");
  resumed.continue();
  assertEqual(resumed.store.get().satchel, ["golem-heart"], "only the committed fight reward is earned");
  const reward = await resumed.reload(); reward.scene.resumeForge();
  assertEqual(reward.store.get().satchel, ["golem-heart"], "reloading its reward reading cannot duplicate the Heart");
});

await suite("Forge checkpoints: songbird acceptance and refusal resume through their original gates", async () => {
  for (const accepted of [false, true]) {
    const save = fresh(); save.realms["clockwork-forge"]!.choices = { fork1: "forn", fork2: "peaceful" };
    const f = fixture(save); f.scene.startCompanionGate();
    if (accepted) f.scene.awardSongbird();
    else f.word().onComplete(); // The actual second target is "leave it be".
    const resumed = await f.reload(); resumed.scene.resumeForge();
    assertEqual(resumed.store.get().realms["clockwork-forge"]!.choices.companion, accepted ? "accepted" : "declined", "the actual choice remains durable");
    assertEqual(resumed.store.get().satchel, accepted ? ["brass-songbird"] : [], "the companion reward remains singular and consistent with its answer");
    assert(resumed.gate() && !resumed.word(), "reload retains the acknowledgment or true-name introduction instead of reoffering the companion");
    if (accepted) {
      assertEqual([resumed.scene.songbirdCompanion.x, resumed.scene.songbirdCompanion.y],
        [resumed.scene.wrenContainer.x + 52, resumed.scene.wrenContainer.y - 148], "the accepted companion is reconstructed on Wren's actual shoulder");
      resumed.continue();
      assertEqual(resumed.store.get().checkpoint!.step, "true-name-intro", "the original companion Continue leads to the final passage introduction");
    } else assert(!resumed.props.includes("songbird"), "a declined companion does not reappear in the final passage");
  }
});

await suite("Forge checkpoints: revisits and completed realms cannot replace another realm's unfinished checkpoint", () => {
  const save = fresh(); save.checkpoint = { scene: "WinterMountainScene", step: "wave", data: { index: 2 } };
  const f = fixture(save, true); f.scene.checkpoint("arrival");
  assertEqual(f.scene.resumeCheckpoint, null, "a revisit cannot consume an unfinished Forge checkpoint");
  assertEqual(f.store.get().checkpoint, save.checkpoint, "a free replay preserves the other unfinished realm");
  const finished = fresh(); finished.realms["clockwork-forge"]!.cleared = true;
  finished.checkpoint = { scene: "WinterMountainScene", step: "wave", data: { index: 1 } };
  const completed = fixture(finished); completed.scene.checkpoint("arrival");
  assertEqual(completed.store.get().checkpoint, finished.checkpoint, "a cleared realm cannot replace another checkpoint even without a revisit flag");
});

await Promise.all(stores.map(store => store.flush()));
