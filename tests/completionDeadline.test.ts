import { readFileSync } from "node:fs";
import ts from "typescript";
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
