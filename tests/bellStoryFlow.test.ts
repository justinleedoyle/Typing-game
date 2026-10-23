import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";

// Exercise the actual story entry and callbacks with inert rendering. Neither
// the story transitions nor their Continue gates are reproduced in the test.
const path = new URL("../src/scenes/SunkenBellScene.ts", import.meta.url);
const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const methods = ["startBellKeepersChamber", "onWardenDefeated", "startFork2", "startFork2FreeAurland", "setStoryObjective"].map(name =>
  owner.members.find(value => value.name?.getText(source) === name)!.getText(source));
const code = ts.transpileModule(`class Harness { ${methods.join("\n")} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const noop = () => {};
const Harness = new Function("Phaser", "BELL_BURST_COLOR", "PALETTE_HEX", "addLocalGroundShadow",
  "addContainerWake", "addIdleBreath", "attachWordBodyAnchor", "playBodyImpact", "dismissStagedCue", "playChime", "fadeOutStagedSprite",
  `${code}; return Harness;`)(
  { GameObjects: { Events: { DESTROY: "destroy" } } }, 0x4ab8d6, { brass: 0xbaa463 },
  () => ({}), noop, noop, () => ({ destroy() {} }), noop, noop, noop,
  (scene: { departures: unknown[] }, sprite: unknown) => scene.departures.push(sprite),
);

function story() {
  const h = new Harness();
  const state = { almanacLore: [] as string[], satchel: [] as string[] };
  let next: (() => void) | null = null;
  const captions: string[] = [];
  const tasks: string[] = [];
  const rings = [1, 1, 1].map(alpha => ({ alpha, setAlpha(value: number) { this.alpha = value; return this; } }));
  Object.assign(h, {
    beatPhase: "off", beatLocked: true, beatRing: rings[0], offbeatRing: rings[1], rhythmLabel: rings[2],
    scale: { width: 1920, height: 1080 },
    band: { setObjective: (text: string) => tasks.push(text) },
    tweens: { killTweensOf() {}, add() {} },
    store: { update: (edit: (value: typeof state) => void) => edit(state) },
    setNarrator: (text: string) => captions.push(text),
    readThen: (callback: () => void) => { assert(!next, "a new story card never overwrites an unread one"); next = callback; },
    fadeOutForkCue() {}, showAurland() {}, hideAurland() {},
    clearActiveTargets() {}, setBreathActive() {}, drawBellKeeperLectern: () => ({}),
    clearBossWordAnchors() {}, departures: [] as unknown[],
    commitFork: (_fork: string, requested: string) => requested,
  });
  return { h, state, captions, tasks, rings,
    hasGate: () => next !== null,
    continue() { const callback = next; next = null; assert(callback, "Continue must have a waiting story card"); callback!(); },
  };
}

await suite("Bell story: read it is free typing and its earned memory waits for Continue", () => {
  const s = story();
  let complete: (() => void) | undefined;
  let doors = 0;
  const cue = { x: 960, y: 690, setDepth() { return this; }, setAlpha() { return this; }, add() {}, once() {} };
  Object.assign(s.h, {
    add: { container: () => cue },
    makeWord: (opts: { word: string; onComplete: () => void }) => {
      assertEqual(opts.word, "read it", "the actual side-room target remains unchanged"); complete = opts.onComplete;
      return { getAnchorX: () => 960, getAnchorY: () => 598 };
    },
    registerActiveTarget() {}, startFork1: () => { doors += 1; },
  });
  s.h.startBellKeepersChamber();
  assertEqual(s.h.beatPhase, "free", "the side room cannot inherit the antiphon gate");
  assertEqual(s.h.beatLocked, false, "story clears the boss's metered flag");
  assert(s.rings.every(ring => ring.alpha === 0), "old rhythm cues disappear with the old timing requirement");
  assert(s.tasks.at(-1)!.includes("read it") && !s.tasks.at(-1)!.includes("watch air"), "the task describes the current interaction");
  complete!();
  assert(s.state.almanacLore.includes("old-olins-memory"), "reading still earns the existing journal page");
  assert(s.captions.at(-1)!.includes("Almanac page"), "the earned memory is acknowledged on screen");
  assertEqual(doors, 0, "the doors cannot overwrite an unread memory response");
  assert(s.hasGate(), "the earned memory has a deliberate Continue gate");
  s.continue();
  assertEqual(doors, 1, "Continue enters the doors once");
});

await suite("Bell story: the defeated Warden leaves before both explained choices become available", () => {
  const s = story();
  const warden = { scene: {} as object | undefined, destroy() { this.scene = undefined; } };
  let clockStops = 0;
  let fateCues = 0;
  const choices: string[] = [];
  Object.assign(s.h, {
    beatClock: { stop: () => { clockStops += 1; } }, narration: { say() {} },
    showFateCues: () => {
      assert(!warden.scene, "the right-hand choice cannot share its space with the defeated actor"); fateCues += 1;
    },
    bellPassageWordPosition: () => ({ x: 0, y: 0 }),
    makeBellForkWord: (_body: unknown, opts: { word: string }) => ({ word: opts.word }),
    registerActiveTarget: (...targets: Array<{ word: string }>) => choices.push(...targets.map(target => target.word)),
  });
  s.h.onWardenDefeated(warden);
  assertEqual(clockStops, 1, "the Warden's defeat still stops combat rhythm");
  assertEqual(s.h.departures, [warden], "the defeated actor begins its existing-style staged departure");
  assertEqual(fateCues, 0, "the defeat card remains readable before the next scene state");
  s.continue();
  assertEqual(fateCues, 1, "Continue removes the actor even if its departure tween has not finished");
  const explanation = s.captions.at(-1)!;
  assert(explanation.includes("King Aurland") && explanation.includes("trapped inside the bell's voice"), "the choice first establishes who needs freeing");
  assert(explanation.includes("gain his aid") && explanation.includes("as a relic") && explanation.includes("silent for good"), "both paths explain their actual consequences");
  assertEqual(choices.length, 0, "the choices cannot replace an unread explanation");
  assertEqual(s.state.satchel, [], "teaching the choice grants no reward before a decision");
  s.continue();
  assertEqual(choices, ["free king aurland", "claim the tongue"], "both original alternatives remain available");
  assertEqual(s.h.beatPhase, "free", "the explained choice remains ordinary typing");
});

await suite("Bell story: freeing Aurland holds both the binding instructions and reward acknowledgment", () => {
  const s = story();
  let freeKing: (() => void) | undefined;
  let fishGate = 0;
  Object.assign(s.h, {
    runFreePassageChain: (steps: Array<{ word: string }>, onDone: () => void) => {
      assertEqual(steps.map(step => step.word), ["break the silence", "you are remembered", "swim free king"], "the original binding passages remain unchanged");
      freeKing = onDone;
    },
    startGlassFishGate: () => { fishGate += 1; },
  });
  s.h.startFork2FreeAurland();
  assertEqual(s.h.beatPhase, "free", "the king's binding passage is ordinary typing");
  assert(!freeKing, "the first passage waits while its instruction card is read");
  s.continue();
  freeKing!();
  assertEqual(s.state.satchel, ["king-aurland", "trident-token"], "the original ally and token rewards are unchanged");
  assert(s.state.almanacLore.includes("king-auriands-promise"), "the historical saved lore ID is preserved");
  assert(s.captions.at(-1)!.includes("trident token"), "Aurland's actual reward is acknowledged");
  assertEqual(fishGate, 0, "the companion cannot overwrite the reward response");
  s.continue();
  assertEqual(fishGate, 1, "Continue leads to the original companion offer");
});
