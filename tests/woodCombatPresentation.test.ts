import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";
import { advanceDurationMs, dangerRamp } from "../src/game/movingWordMath";
import { HAUNTED_WOOD_BASE_BANK, woodWardWord } from "../src/game/wordBank";

function source(path: string) {
  const url = new URL(path, import.meta.url);
  return ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
}
const wood = source("../src/scenes/HauntedWoodScene.ts");
function actualWood(names: string[], globals: Record<string, unknown> = {}) {
  const declarations = wood.statements.filter(ts.isVariableStatement).map(value => value.getText(wood)).join("\n");
  const helpers = wood.statements.filter(ts.isFunctionDeclaration).map(value => value.getText(wood)).join("\n");
  const owner = wood.statements.find(ts.isClassDeclaration)!;
  const methods = names.map(name => owner.members.find(value => value.name?.getText(wood) === name)!.getText(wood)).join("\n");
  const code = ts.transpileModule(`${declarations}\n${helpers}\nclass Wood { ${methods} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(globals), `${code}; return Wood;`)(...Object.values(globals));
}

await suite("Wood live wards: held story yields the top lane before every ghost batch", () => {
  const Wood = actualWood([
    "startCrossroads1", "beginCrossroads1", "startCrossroads2", "beginCrossroads2",
    "startCrossroads3", "beginCrossroads3", "startBossFight", "spawnBossWaveA",
    "onBossWaveACleared", "spawnBossWaveB", "spawnGhostsByDirection", "quietLordIntrusionAnchor",
  ], {
    playWaveSting() {}, reducedMotion: () => true, HAUNTED_WOOD_BASE_BANK, woodWardWord,
    pickAdaptiveWords: (_bank: unknown, count: number) => ["still", "vapor", "crypt", "hush"].slice(0, count),
    playQuietLordIntrusion() {},
  });
  const cases = [
    ["startCrossroads1", ["west", "east", "north"], 300, 0],
    ["startCrossroads2", ["north", "south", "east", "west"], 280, 0],
    ["startCrossroads3", ["north", "north", "east", "west"], 300, 0],
    ["startBossFight", ["west", "east", "north"], 350, 800],
    ["onBossWaveACleared", ["south", "south", "north"], 350, 1200],
  ] as const;
  for (const [entry, directions, stagger, preparationDelay] of cases) {
    const s = new Wood();
    let caption = "";
    let objective = "";
    let clears = 0;
    let waveProcs = 0;
    const gates: Array<() => void> = [];
    const timers: Array<{ ms: number; next: () => void }> = [];
    const ghosts: Array<{ direction: string; word: string; delay: number }> = [];
    const save = { realms: { "haunted-wood": { quietLordIntruded: false } }, keyStats: {} };
    Object.assign(s, {
      checkpoint() {},
      ghosts: [], activeTargets: [], fork2Choice: "bargain", scale: { width: 1920, height: 1080 },
      narration: { say: (line: string) => { caption = line; }, clear: () => { caption = ""; clears += 1; } },
      setNarrator: (line: string) => { caption = line; },
      band: { setObjective: (line: string) => { objective = line; } },
      readThen: (next: () => void) => gates.push(next), announceCombatLoadout: (next: () => void) => next(),
      // Practice behavior is covered with the real controller in guidedPractice;
      // this suite checks the unchanged combat handoff after that boundary.
      startWardPractice() { this.announceCombatLoadout(() => this.beginCrossroads1()); },
      pulseWoodWave() {}, playGhostKingStagePulse() {}, attendGhostKing() {},
      beginCombatWave: () => { waveProcs += 1; },
      time: { delayedCall: (ms: number, next: () => void) => timers.push({ ms, next }) },
      store: { get: () => save, update: (mutate: (state: typeof save) => void) => mutate(save) },
      spawnGhost(direction: string, word: string, delay: number) {
        assertEqual(caption, "", `${entry}: story card is gone before live targets appear`);
        ghosts.push({ direction, word, delay });
      },
    });
    s[entry]();
    assert(caption.length > 0 && clears === 0, `${entry}: story remains readable until Continue`);
    assertEqual(ghosts.length, 0, `${entry}: no deadline begins behind the held story`);
    assertEqual(gates.length, 1, `${entry}: one deliberate gate owns the transition`);
    gates[0]();
    if (preparationDelay) {
      assertEqual(ghosts.length, 0, `${entry}: existing boss preparation delay remains`);
      assertEqual(timers[0].ms, preparationDelay, `${entry}: original preparation duration is preserved`);
      timers.shift()!.next();
    }
    assertEqual(ghosts.map(ghost => ghost.direction), [...directions], `${entry}: authored direction composition is unchanged`);
    assertEqual(ghosts.map(ghost => ghost.delay), directions.map((_direction, i) => i * stagger), `${entry}: stagger timing is unchanged`);
    assert(objective.includes("above . / below ! / left , / right ?"), `${entry}: direction guide remains in the console`);
    assertEqual([clears, waveProcs], [1, 1], `${entry}: one batch clears the card and arms existing combat procs once`);
  }
});

await suite("Wood whispers: the intrusion stays above the earliest active north ward", () => {
  const Wood = actualWood(["quietLordIntrusionAnchor", "spawnPositionFor"]);
  for (const width of [1366, 1920, 2450]) {
    const s = new Wood(); s.scale = { width, height: 1080 };
    const whisper = s.quietLordIntrusionAnchor();
    const north = s.spawnPositionFor("north", 0);
    assertEqual(whisper.x, width / 2, "whisper uses the cleared caption lane instead of following a live enemy");
    const scarBottom = whisper.y + (32 + 58) / 2; // actual intrusion font32 + scar padding58
    const wardTop = north.restY - 92 - 30; // actual ghost anchor offset, with conservative glyph bounds
    assert(scarBottom + 24 < wardTop, "scar and stroke leave a margin before the first overhead ward");
  }
});

await suite("Wood vertical arrivals: all four compass ghosts land on screen and the fourth defeat completes the wave", () => {
  class Target {
    complete = false;
    constructor(readonly opts: Record<string, any>) {}
    playEntryWake() {}
    getAnchorX() { return this.opts.x; }
    getAnchorY() { return this.opts.y; }
    isComplete() { return this.complete; }
    destroy() {}
  }
  const enemySource = source("../src/game/movingWordEnemy.ts");
  const owner = enemySource.statements.find(ts.isClassDeclaration)!;
  const code = ts.transpileModule(owner.getText(enemySource).replace(/^export /, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const Enemy = new Function("TextWordTarget", "advanceDurationMs", "dangerRamp", "attachWordBodyAnchor", "playBodyImpact", "PALETTE_HEX",
    `${code}; return MovingWordEnemy;`)(Target, advanceDurationMs, dangerRamp, () => ({ destroy() {} }), () => {}, { brass: 1 });
  const Wood = actualWood(["spawnGhost", "spawnPositionFor", "checkGhostWaveComplete"], {
    MovingWordEnemy: Enemy, addContainerWake() {}, playChime() {},
  });
  const s = new Wood();
  const tweens: any[] = [];
  const timers: Array<{ ms: number; next: () => void; remove: () => void }> = [];
  const registered = new Set<Target>();
  let advanced = 0;
  Object.assign(s, {
    scale: { width: 1920, height: 1080 }, ghosts: [], activeTargets: [], combat: { advanceMult: 1 },
    ensureCompassDrawn() {}, drawGhostInto() {}, onWaveCleared: () => { advanced += 1; },
    typingInput: { register: (target: Target) => registered.add(target), unregister: (target: Target) => registered.delete(target) },
    add: { container: (x: number, y: number) => ({ x, y, alpha: 0, scene: true, scaleX: 1, scaleY: 1,
      setAlpha(alpha: number) { this.alpha = alpha; }, setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; }, destroy() {} }) },
    tweens: { add(opts: any) { tweens.push(opts); return { stop() {} }; }, killTweensOf() {} },
    time: { delayedCall(ms: number, next: () => void) { const timer = { ms, next, remove() {} }; timers.push(timer); return timer; } },
  });
  for (const [index, direction] of ["north", "south", "east", "west"].entries()) {
    s.spawnGhost(direction, "te!st", index * 280);
    const entrance = tweens.find(tween => tween.targets === s.ghosts[index].container && tween.alpha === 0.6);
    const expected = s.spawnPositionFor(direction, 0);
    assertEqual([entrance.x, entrance.y], [expected.restX, expected.restY], `${direction}: entrance reaches both authored rest coordinates`);
    assertEqual([entrance.duration, entrance.delay], [900, index * 280], `${direction}: entrance timing stays authored`);
    Object.assign(entrance.targets, { x: entrance.x, y: entrance.y, alpha: entrance.alpha });
    entrance.onComplete();
    const arrival = timers.find(timer => timer.ms === 140)!;
    timers.splice(timers.indexOf(arrival), 1); arrival.next();
    const ghost = s.ghosts[index];
    const target = ghost.target as Target;
    assert(target.opts.y > 0 && target.opts.y < 840, `${direction}: the answer starts above the console instead of outside the viewport`);
    const advance = tweens.find(tween => tween.targets === ghost.container && tween.x === 960 && tween.y === 826);
    assertEqual(advance.duration, 11000, `${direction}: arrival distance cannot inflate the authored live deadline`);
  }
  const ghosts = [...s.ghosts];
  assertEqual(registered.size, 4, "the fourth/south ghost is present and typeable");
  for (let index = 0; index < 4; index++) {
    const target = ghosts[index].target as Target;
    target.complete = true; target.opts.onComplete();
    if (index < 3) assertEqual(timers.filter(timer => timer.ms === 1000).length, 0, "three defeats cannot incorrectly finish a four-ghost wave");
  }
  assertEqual(registered.size, 0, "all four typed defeats detach their answers");
  const completion = timers.filter(timer => timer.ms === 1000);
  assertEqual(completion.length, 1, "fourth defeat schedules the existing continuation once");
  completion[0].next();
  assertEqual(advanced, 1, "the four-direction wave proceeds normally");
  const horizontal = s.add.container(-120, 700);
  new Enemy({ scene: s, container: horizontal, word: "walk", typingInput: s.typingInput,
    restX: 340, restY: 700, wrenX: 960, advanceMs: 15000 });
  const entrance = tweens.at(-1);
  assertEqual([entrance.targets.y, entrance.y], [700, 700], "horizontal realms retain their existing fixed-y entrance");
  assertEqual([entrance.duration, entrance.delay], [800, 0], "default horizontal entrance timing is unchanged");

  // Boss wave B adds a second south slot just20px from Wren's x. Before
  // vertical landing was fixed, measuring from offscreen inflated this close
  // far more than the first south slot and hid its answer below the console.
  s.spawnGhost("south", "pa!th", 350, 1);
  const secondSouth = s.ghosts.at(-1);
  const secondEntrance = tweens.find(tween => tween.targets === secondSouth.container && tween.alpha === 0.6);
  assertEqual([secondEntrance.x, secondEntrance.y], [980, 792], "the second south slot lands at its own authored rest point");
  assertEqual([secondEntrance.duration, secondEntrance.delay], [900, 350], "second-slot entrance and boss stagger stay unchanged");
  Object.assign(secondEntrance.targets, { x: secondEntrance.x, y: secondEntrance.y, alpha: secondEntrance.alpha });
  secondEntrance.onComplete();
  const secondArrival = timers.find(timer => timer.ms === 140)!;
  timers.splice(timers.indexOf(secondArrival), 1); secondArrival.next();
  const secondTarget = secondSouth.target as Target;
  assertEqual([secondTarget.opts.x, secondTarget.opts.y], [980, 700], "the second south answer is visible above the console at arrival");
  const secondAdvance = tweens.find(tween => tween.targets === secondSouth.container && tween.x === 960 && tween.y === 826);
  assertEqual(secondAdvance.duration, 11000, "the nearby second slot cannot inflate its live deadline from offscreen distance");
  secondTarget.complete = true; secondTarget.opts.onComplete();
  assert(secondSouth.isDefeated() && !registered.has(secondTarget), "typing the second south answer resolves and detaches it normally");
});
