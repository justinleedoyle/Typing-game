import { readFileSync } from "node:fs";
import ts from "typescript";
import { TypingInputController, type WordTarget } from "../src/game/typingInput";
import { assert, assertEqual, suite } from "./_assert";

// Exercise the actual renderer-coupled methods with inert bodies/tweens. The
// only simulated delay is TextWordTarget's320ms exit before scene completion.
function methods(path: string, names: string[], globals: Record<string, unknown> = {}) {
  const url = new URL(path, import.meta.url);
  const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const owner = source.statements.find(ts.isClassDeclaration)!;
  const members = names.map((name) => {
    const member = owner.members.find((value) => value.name?.getText(source) === name);
    if (!member) throw new Error(`Missing actual method ${name} in ${path}`);
    return member.getText(source);
  });
  const code = ts.transpileModule(`class Harness { ${members.join("\n")} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(globals), `${code}; return Harness;`)(...Object.values(globals));
}

function target(complete: boolean) {
  return { destroyed: 0, isComplete: () => complete, destroy() { this.destroyed += 1; } };
}
function body() { return { x: 0, y: 0, scene: true, destroy() { this.scene = false; } }; }
function scene() {
  return { tweens: { add: () => ({ stop() {} }), killTweensOf() {} },
    time: { delayedCall() {} } };
}

await suite("completion deadline: moving enemies cannot hit after the final matched character", () => {
  const Enemy = methods("../src/game/movingWordEnemy.ts", [
    "reachWren", "handleComplete", "defeat", "dropTarget",
  ]);
  for (const complete of [true, false]) {
    let hits = 0;
    let successes = 0;
    const word = target(complete);
    const enemy = new Enemy();
    Object.assign(enemy, {
      defeated: false, completedByPlayer: false, wordTarget: word,
      cfg: { scene: scene(), container: body(), typingInput: { unregister() {} },
        onReachWren: () => { hits += 1; }, onComplete: () => { successes += 1; } },
      waveActive: () => true, clearFreeze() {}, clearArrivalTimer() {}, playDefeatImpact() {},
    });
    enemy.reachWren();
    assertEqual(hits, complete ? 0 : 1, "contact respects logical typing completion");
    if (complete) {
      assertEqual(word.destroyed, 0, "contact keeps the already completed word animation intact");
      enemy.handleComplete({ spell: false, alt: false });
      enemy.handleComplete({ spell: false, alt: false });
      assertEqual(successes, 1, "delayed completion defeats exactly once");
      assert(enemy.defeated, "the completed body leaves the wave normally");
    } else {
      assertEqual(word.destroyed, 1, "unfinished target still resets on contact");
      assertEqual(successes, 0, "contact does not award an untyped word");
    }
  }
});

await suite("completion deadline: a fully typed scroll resolves as success at the exit edge once", () => {
  const Scroll = methods("../src/game/scrollingPhrase.ts", ["handleMiss", "handleComplete", "dropTarget"], {
    playBodyImpact() {}, PALETTE_HEX: { brass: 0 }, PALETTE: {},
  });
  for (const complete of [true, false]) {
    let misses = 0;
    let successes = 0;
    const word = target(complete);
    const scroll = new Scroll();
    Object.assign(scroll, {
      target: word, resolved: false, container: body(), bannerW: 100,
      opts: { scene: scene(), typingInput: { unregister() {} },
        onMiss: () => { misses += 1; }, onComplete: () => { successes += 1; } },
      clearWordAttachTimer() {},
    });
    scroll.handleMiss();
    scroll.handleMiss();
    scroll.handleComplete();
    assertEqual([successes, misses], complete ? [1, 0] : [0, 1],
      "edge callback and late animation cannot resolve the same banner twice");
    assertEqual(word.destroyed, complete ? 0 : 1, "only an unfinished word is discarded at the edge");
  }
});

await suite("completion deadline: finale wall contact honors completed words and charges real breaches once", () => {
  let chimes = 0;
  const Finale = methods("../src/scenes/GreatBattleScene.ts", ["breachEnemy", "defeatEnemy"], {
    reducedMotion: () => true, playChime: () => { chimes += 1; },
    finaleWakeForRealm: () => ({}), playBodyImpact() {}, playDamageThud() {}, flashDamageVignette() {},
  });
  for (const complete of [true, false]) {
    chimes = 0;
    let lostCandles = 0;
    const word = target(complete);
    const enemy = { defeated: false, target: word, graphic: body(), body: { x: 0, y: 0 },
      realmId: "winter-mountain" };
    const battle = new Finale();
    Object.assign(battle, {
      runOver: false, activeTargets: [word], tweens: scene().tweens,
      typingInput: { unregister() {} }, stopFinaleEnemyMotion() {},
      loseCandle: () => { lostCandles += 1; },
    });
    battle.breachEnemy(enemy);
    battle.breachEnemy(enemy);
    battle.defeatEnemy(enemy); // the completed target's320ms delayed callback
    assertEqual(lostCandles, complete ? 0 : 1, "only unfinished contact costs one candle");
    assertEqual(chimes, complete ? 1 : 0, "only actual typing awards one defeat cue");
    assertEqual(word.destroyed, complete ? 0 : 1, "completed word owns its existing exit animation");
    assertEqual(battle.activeTargets.length, 0, "resolved target leaves the gameplay list");
  }
});

await suite("finale moth: a delayed round bonus cannot overwrite a later round or completed words", () => {
  const Finale = methods("../src/scenes/GreatBattleScene.ts", [
    "startPhase2bMainRounds", "applyLanternMothHitWindow",
  ], { BATTLE_WORD_BANK: [], pickAdaptiveWords: () => ["one", "two", "three"] });
  for (const state of ["live", "cleared", "next-round", "typed-waiting-animation", "loss"] as const) {
    const objectives: string[] = [];
    const timers: Array<() => void> = [];
    let bonuses = 0;
    const battle = new Finale();
    const graphics = { setDepth() { return this; }, setAlpha() { return this; },
      fillStyle() { return this; }, fillRect() { return this; } };
    Object.assign(battle, {
      runOver: false, activeTargets: [], scale: { width: 1920 },
      store: { get: () => ({ satchel: ["lantern-moth"], keyStats: {} }) },
      band: { setObjective: (text: string) => objectives.push(text) },
      lordDuelWordPosition: () => ({ x: 0, y: 0 }),
      makeLordWord: () => ({ complete: false, isComplete() { return this.complete; } }),
      registerActiveTarget: (word: unknown) => battle.activeTargets.push(word),
      time: { delayedCall: (_ms: number, callback: () => void) => timers.push(callback) },
      tweens: scene().tweens, add: { graphics: () => graphics },
      showRelicNotice() {}, showFinaleCompanionAction: body, playLanternMothThroneCue() {},
      makeWindowStrikeWord() { bonuses += 1; return target(false); },
    });
    battle.startPhase2bMainRounds();
    const scheduledBonus = timers.shift()!;
    if (state === "cleared") battle.activeTargets = [];
    if (state === "next-round") battle.activeTargets = [target(false)];
    if (state === "typed-waiting-animation") {
      battle.activeTargets.forEach((word: { complete: boolean }) => { word.complete = true; });
    }
    if (state === "loss") battle.runOver = true;
    const objectiveCount = objectives.length;
    scheduledBonus();
    assertEqual(bonuses, state === "live" ? 1 : 0, `${state}: only its own live round receives the bonus`);
    assertEqual(objectives.length - objectiveCount, state === "live" ? 1 : 0,
      `${state}: stale timer cannot replace the current objective`);
  }
});

await suite("completion deadline: finale facets honor the final matched letter before the exit animation", () => {
  const Finale = methods("../src/scenes/GreatBattleScene.ts", ["runFacetChallenge"], {
    FACET_CHALLENGE_MS: 6000, reducedMotion: () => true,
    playDamageThud() {}, flashDamageVignette() {}, playChime() {},
  });
  for (const finishAt of [5900, 5999, null]) {
    let now = 0;
    let lostCandles = 0;
    let advances = 0;
    let held = 0;
    let completed = false;
    let objective = "";
    let resolvedAt = -1;
    let completion!: () => void;
    const timers: Array<{ at: number; removed: boolean; run: () => void }> = [];
    const battle = new Finale();
    Object.assign(battle, {
      runOver: false, facetSigil: null,
      setNarrator() {}, band: { setObjective(text: string) { objective = text; } }, narration: { say() {} },
      facetDefenseWordPosition: () => ({ x: 0, y: 0 }),
      clearTargetAnchor() {}, clearActiveTargets() {}, clearFacetSigil() {},
      registerActiveTarget() {},
      playFacetImpact(_facet: unknown, outcome: string) { if (outcome === "held") held += 1; resolvedAt = now; },
      loseCandle() { lostCandles += 1; },
      time: { delayedCall(ms: number, run: () => void) {
        const timer = { at: now + ms, removed: false, run,
          remove() { this.removed = true; } };
        timers.push(timer);
        return timer;
      } },
      makeWord(opts: { onComplete: () => void }) {
        completion = opts.onComplete;
        return { isComplete: () => completed };
      },
    });
    battle.runFacetChallenge({ name: "the Cold", defenseWord: "endure" }, () => { advances += 1; });
    assertEqual(objective, "Type endure before the facet lands.", "the live timed defense retains its original instruction");
    if (finishAt !== null) {
      now = finishAt;
      completed = true;
      timers.push({ at: now + 320, removed: false, run: completion });
    }
    while (timers.length) {
      timers.sort((a, b) => a.at - b.at);
      const timer = timers.shift()!;
      now = timer.at;
      if (!timer.removed) {
        if (resolvedAt >= 0 && now === resolvedAt + 1200) {
          assertEqual(advances, 0, "the original response interval cannot advance the next facet early");
          assertEqual(objective, finishAt === null ? "The facet lands. A candle goes out." : "the Cold is answered. Hold steady.",
            "the response interval acknowledges the outcome instead of asking for a vanished defense target");
        }
        timer.run();
      }
    }
    completion(); // A stale animation callback cannot resolve it again.
    assertEqual(lostCandles, finishAt === null ? 1 : 0,
      `${finishAt}: only an unfinished answer costs a candle`);
    assertEqual(held, finishAt === null ? 0 : 1,
      `${finishAt}: a logically completed answer receives its held cue once`);
    assertEqual(advances, 1, `${finishAt}: the facet advances exactly once`);
    assertEqual(objective, finishAt === null ? "The facet lands. A candle goes out." : "the Cold is answered. Hold steady.",
      `${finishAt}: a stale completion callback cannot replace the resolved objective`);
  }
});

await suite("finale duel: the second word round clears the resolved whirlwind instruction", () => {
  const Finale = methods("../src/scenes/GreatBattleScene.ts", ["startPhase2bRound2"], {
    BATTLE_WORD_BANK: ["light", "voice", "break", "last", "hold", "still"],
    pickAdaptiveWords: (words: string[], count: number) => words.slice(0, count),
  });
  const events: string[] = [];
  const battle = new Finale();
  Object.assign(battle, {
    phase2Round1Words: ["light", "voice", "break"],
    narration: { clear: () => events.push("clear") },
    band: { setObjective: (text: string) => events.push(text) },
    store: { get: () => ({ keyStats: {} }) },
    lordDuelWordPosition: () => ({ x: 0, y: 0 }),
    makeLordWord: (opts: { word: string }) => { events.push(opts.word); return opts; },
    registerActiveTarget() {},
  });
  battle.startPhase2bRound2();
  assertEqual(events, ["clear", "Clear the last three duel words.", "last", "hold", "still"],
    "stale defense prose clears before the new task and three real word targets");
});

await suite("finale duel: facet narration cannot survive the Bell's Tongue and Tether opening", () => {
  const Finale = methods("../src/scenes/GreatBattleScene.ts", ["startPhase2a", "startPhase2b"], {
    reducedFlashes: () => true, playChime() {},
  });
  let caption: string | null = "You already know this grief by name.";
  const events: string[] = [];
  const timers: Array<() => void> = [];
  let bindTarget!: { word: string; onComplete: () => void };
  const battle = new Finale();
  Object.assign(battle, {
    bellsTongueSuperHitAvailable: true, tetherCordBindUsed: false,
    quietLordContainer: { alpha: 1 },
    store: { get: () => ({ satchel: ["bells-tongue", "tether-cord"] }) },
    narration: {
      clear() { caption = null; events.push("clear-caption"); },
      say(id: string) { caption = id; events.push(id); },
    },
    band: { setObjective() {} },
    showRelicNotice(id: string) {
      assertEqual(caption, null, `${id}: old facet prose has left before the new relic notice`);
      events.push(id);
    },
    time: { delayedCall(_ms: number, run: () => void) { timers.push(run); } },
    tweens: { add(opts: { onComplete: () => void }) { opts.onComplete(); } },
    playBellsTongueStrikeCue() {}, playTetherCordBindCue() {}, clearActiveTargets() {},
    lordDuelWordPosition: () => ({ x: 0, y: 0 }),
    makeLordWord(opts: typeof bindTarget) { bindTarget = opts; return opts; },
    registerActiveTarget(word: typeof bindTarget) {
      assertEqual(caption, null, "bound is readable without the prior Grief card");
      events.push(word.word);
    },
    runPhase2bRounds() { events.push("round-one"); },
  });
  battle.startPhase2a();
  assertEqual(battle.bellsTongueSuperHitAvailable, false, "Bell's Tongue still consumes its one-shot");
  assertEqual(timers.length, 1, "the authored Bell's Tongue delay is retained");
  timers.shift()!();
  assertEqual(events, ["clear-caption", "finale_relic_bells_tongue", "clear-caption", "finale_relic_tether_cord", "bound"],
    "actual Bell strike transitions to exactly one cleared Tether prompt");
  assertEqual(battle.tetherCordBindUsed, true, "the Tether one-shot is committed normally");
  bindTarget.onComplete();
  assertEqual(caption, "finale_phase2_breaks_free", "new authored response still appears after bound");
  timers.shift()!();
  assertEqual(events.at(-1), "round-one", "the normal duel resumes after the original response delay");
});

await suite("finale duel: caption cleanup preserves fresh counter prose and both non-Tether routes", () => {
  const Finale = methods("../src/scenes/GreatBattleScene.ts", ["startPhase2a", "startPhase2b"]);
  for (const wrench of [false, true]) {
    let caption: string | null = "old facet";
    let words: string[] = [];
    let rounds = 0;
    const battle = new Finale();
    Object.assign(battle, {
      bellsTongueSuperHitAvailable: false,
      store: { get: () => ({ satchel: wrench ? ["sabotage-wrench"] : [] }) },
      narration: { clear() { caption = null; }, say(id: string) { caption = id; } },
      band: { setObjective() {} }, showRelicNotice() {}, clearActiveTargets() {},
      runSequentialWords(sequence: string[], _index: number, done: () => void) {
        words = sequence;
        assertEqual(caption, wrench ? null : "finale_phase2_unmake",
          "base counter prose is fresh; Wrench assistance does not inherit a facet card");
        done();
      },
      runPhase2bRounds() { rounds += 1; assertEqual(caption, null, "new duel starts after counter prose clears"); },
    });
    battle.startPhase2a();
    assertEqual(words, wrench ? ["unmake", "unsay"] : ["unmake", "unsay", "unfound"],
      "caption cleanup does not alter the earned counter-word sequence");
    assertEqual(rounds, 1, "both no-Tether loadouts reach their normal duel exactly once");
  }
});

await suite("finale final phrase: the low stepping word clears Wren's cloak", () => {
  const Finale = methods("../src/scenes/GreatBattleScene.ts", ["finalPhraseWordPosition"]);
  for (const width of [1920, 2450]) {
    const battle = new Finale();
    Object.assign(battle, { scale: { width }, againText: { x: width / 2 + 120, y: 430 } });
    const wrenX = width / 2 - 320;
    for (const index of [0, 3, 6, 9]) {
      const position = battle.finalPhraseWordPosition(index);
      // At44px the observed silence label spans roughly150px. Allow220px
      // for a longer native word and still leave room beyond the cloak edge.
      assert(position.x - 110 > wrenX + 65, "even a long low-path label has visible cloak clearance");
      assertEqual(position.y, 730, "the grounded stepping point keeps its authored height");
    }
    const second = battle.finalPhraseWordPosition(1);
    const third = battle.finalPhraseWordPosition(2);
    assert(second.x < third.x && second.y > third.y, "the upper stepping path still rises toward Again");
  }
});

await suite("Sky expiry: actual last scroll misses hand fresh input to the library fork", () => {
  const Scroll = methods("../src/game/scrollingPhrase.ts", ["handleMiss", "dropTarget"], {
    PALETTE: {},
  });
  const Sky = methods("../src/scenes/SkyIslandScene.ts", [
    "onPhraseResolved", "onTempleCleared", "startFork1",
  ], { playWrenHurt() {}, reducedMotion: () => true, ETTA_CHOICE_WORD_LIFT: 244,
    TEMPLE_PHRASE_CONFIGS: Array.from({ length: 5 }, () => ({})) });
  const input = new TypingInputController();
  const callbacks: Array<() => void> = [];
  const checkpoints: Array<{ step: string; data: Record<string, unknown> }> = [];
  const choices: WordTarget[] = [];
  let selected = 0;
  let misses = 0;
  const state = { almanacLore: [] as string[] };
  const sky = new Sky();
  const phraseTarget = (word: string, onDone: () => void = () => {}) => {
    let cursor = 0;
    return {
      remaining: () => word.slice(cursor), isComplete: () => cursor === word.length,
      advance: () => { cursor += 1; }, miss() {}, onClaim() {},
      onRelease: () => { cursor = 0; }, onComplete: onDone,
      setDimmed() {}, destroy() {},
    };
  };
  const makeChoice = (opts: { word: string; onComplete: () => void }) =>
    phraseTarget(opts.word, opts.onComplete);
  Object.assign(sky, {
    checkpoint(step: string, data: Record<string, unknown> = {}) { checkpoints.push({ step, data }); },
    templeIndex: 4, templePhrasesRemaining: 2, activePhrases: [],
    typingInput: input, wrenSprite: {}, fork1Choice: null,
    narration: { say() {} }, band: { setObjective() {} },
    store: { update: (mutate: (s: typeof state) => void) => mutate(state) },
    time: { delayedCall: (_ms: number, run: () => void) => callbacks.push(run) },
    setTempleBeamsActive() {}, showFork1Cues() {},
    skyOwnedWordPosition: () => ({ x: 0, y: 0 }),
    makeEttaWord: makeChoice,
    makeSkyForkWord: (_body: unknown, opts: Parameters<typeof makeChoice>[0]) => makeChoice(opts),
    registerActiveTarget(...targets: WordTarget[]) {
      choices.push(...targets);
      targets.forEach((target) => input.register(target));
    },
    clearActiveTargets() { choices.forEach((target) => input.unregister(target)); },
    startFork1StealFlame() { selected += 1; }, startFork1HelpEtta() {},
  });
  const banners = ["the lantern remembers", "the beacon waits"].map((word) => {
    const target = phraseTarget(word);
    input.register(target);
    const scroll = new Scroll();
    Object.assign(scroll, {
      target, resolved: false, container: body(), clearWordAttachTimer() {},
      opts: { scene: scene(), typingInput: input,
        onMiss() { misses += 1; sky.onPhraseResolved(false); } },
    });
    return scroll;
  });
  input.handleChar("t"); input.handleChar("h");
  banners[0].handleMiss();
  assertEqual(input.getTypingBuffer(), "th", "first expiry preserves the second live scroll's prefix");
  banners[1].handleMiss();
  banners[1].handleMiss();
  assertEqual([misses, sky.templePhrasesRemaining], [2, 0], "both real scroll misses resolve once");
  assert(!input.hasPendingInput(), "last miss releases orphaned prefix before scheduled fork");
  assertEqual(callbacks.length, 1, "actual final temple schedules exactly one fork");
  callbacks.shift()!();
  assertEqual(choices.length, 2, "actual fork registers both help and steal choices");
  assertEqual(checkpoints, [{ step: "temple-cleared", data: { index: 4 } }, { step: "fork1", data: {} }],
    "the real expiry-to-choice handoff records only the completed temple and pending fork");
  for (const char of "steal the flame") assert(input.handleChar(char), `fresh fork consumes ${char}`);
  assertEqual([selected, sky.fork1Choice], [1, "steal-flame"], "the first full choice works without an Escape repair");
  assert(state.almanacLore.includes("the-five-temple-riddles"), "actual final-temple record remains intact");
});
