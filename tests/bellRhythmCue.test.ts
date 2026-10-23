import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";
import { isOffBeat, isOnBeat } from "../src/game/beatGate";

// Exercise the actual scene cue methods against the real acceptance policy.
// Only drawing, tweens and the scene clock are inert; no browser/save is used.
const path = new URL("../src/scenes/SunkenBellScene.ts", import.meta.url);
const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const sceneClass = source.statements.find(ts.isClassDeclaration)!;
const methods = ["createEchoDim", "onBeatTick", "pulseBeatRing", "pulseOffbeatRing",
  "spawnSplitGhost", "bellPassageWordPosition", "startFork1ForceBreak"].map(name =>
  sceneClass.members.find(member => member.name?.getText(source) === name)!.getText(source));
const code = ts.transpileModule(`class Harness { ${methods.join("\n")} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const Harness = new Function("reducedFlashes", "PALETTE_HEX", "Phaser", `${code}; return Harness;`)(
  (scene: { reducedFlashes: boolean }) => scene.reducedFlashes, { frost: 0xabcdef, ember: 0xfedcba },
  { Math: { Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(value, max)) } },
);

function encounter(tempo: number, phase: "on" | "off" | "free", reducedFlashes = true) {
  const cue = () => ({
    alpha: 0, depth: 1500, rect: [] as number[],
    clear() {}, lineStyle() {}, strokeCircle() {}, fillStyle() {},
    fillRect(...rect: number[]) { this.rect = rect; },
    setAlpha(alpha: number) { this.alpha = alpha; return this; }, setScale() { return this; },
    setDepth(depth: number) { this.depth = depth; return this; },
    setScrollFactor() { return this; },
  });
  const blue = cue();
  const orange = cue();
  const dim = cue();
  let now = 0;
  const pulses: Array<{ ring: unknown; start: number; duration: number; ease: string }> = [];
  const callbacks: Array<{ at: number; run: () => void }> = [];
  const harness = new Harness();
  Object.assign(harness, {
    beatRing: blue, offbeatRing: orange, beatPhase: phase,
    rhythmLabel: cue(),
    reducedFlashes, combat: { warmLight: 0.2 },
    add: { graphics: () => dim }, scale: { width: 1920 }, band: { bandTopY: 860 },
    cameras: { main: { flash() { throw new Error("Rhythm cue must never use a full-camera black flash"); } } },
    beatClock: { getTempo: () => tempo, getWindowMs: () => tempo * 0.175 },
    time: { delayedCall: (delay: number, run: () => void) => callbacks.push({ at: now + delay, run }) },
    tweens: { killTweensOf() {}, add: (opts: { targets: unknown; duration: number; ease: string }) =>
      pulses.push({ ring: opts.targets, start: now, duration: opts.duration, ease: opts.ease }) },
  });
  harness.createEchoDim();
  return {
    harness, pulses, callbacks, blue, orange, dim,
    runNext() { const callback = callbacks.shift()!; now = callback.at; callback.run(); },
  };
}

await suite("Bell rhythm cue: visible openings match slow and fast acceptance windows", () => {
  for (const tempo of [2000, 1000]) {
    const window = tempo * 0.175;
    const e = encounter(tempo, "off");
    e.harness.onBeatTick();
    assertEqual(e.pulses[0]!.ring, e.blue, "the toll opens the blue ring");
    assertEqual(e.pulses[0]!.start, 0, "blue opening follows the actual toll");
    assertEqual(e.pulses[0]!.duration, window, "blue has no misleading tail after acceptance closes");
    assertEqual(e.callbacks[0]!.at, tempo / 2 - window / 2, "orange begins at the centered answer window's opening");
    e.runNext();
    const answer = e.pulses[1]!;
    assertEqual(answer.ring, e.orange, "the answer opens the orange ring");
    assertEqual(answer.duration, window, "orange remains inside exactly one answer window");
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      assert(isOnBeat(e.pulses[0]!.start + window * fraction, window), "every visible blue instant permits a word start");
      assert(isOffBeat(answer.start + window * fraction, tempo, window), "every visible orange instant permits an answer start");
    }
    assert(!isOnBeat(window + 1, window), "blue is gone when the toll window closes");
    assert(!isOffBeat(answer.start + answer.duration + 1, tempo, window), "orange is gone when the answer window closes");
  }
});

await suite("Bell rhythm cue: echo darkening preserves the HUD ring throughout its opening", () => {
  const e = encounter(2000, "on", false);
  e.harness.onBeatTick();
  assertEqual(e.dim.rect, [0, 0, 1920, 860], "echo darkening ends at the world edge above the console");
  assert(e.dim.depth < e.blue.depth, "echo renders below the timing ring");
  assertEqual(e.blue.alpha, 1, "toll opens the ring at full visibility");
  assertEqual(e.dim.alpha, 1, "world retains its original opaque echo opening");
  const echo = e.pulses.find(pulse => pulse.ring === e.dim)!;
  assertEqual(echo.duration, 240, "warm-light still shortens the original300ms echo by20percent");
  assertEqual(echo.ease, "Linear", "world dim keeps the camera flash's linear decay");
  assertEqual(e.pulses.find(pulse => pulse.ring === e.blue)!.duration, 350, "rhythm acceptance window is unchanged");
  // At150ms the old camera black alpha=.375 and ring alpha≈.377. Its blue
  // channel would be roughly62 (below the observed95 sampling threshold),
  // while the same ring above a world-only dim remains roughly99.
  const ringAlpha = 1 - Math.sin((150 / 350) * Math.PI / 2);
  const ringBlue = 210 * ringAlpha + 32 * (1 - ringAlpha);
  assert(ringBlue > 95, "the ordinary visible ring clears the observed blue threshold");
  assert(ringBlue * (150 / 240) < 95, "full-camera darkening had hidden that same visible ring");
  e.harness.reducedFlashes = true;
  e.harness.onBeatTick();
  assertEqual(e.dim.alpha, 0, "reduced flashes clears a previous echo instead of leaving a black world");
});

await suite("Bell rhythm cue: ordinary waves and departed answer waves never show an orange invitation", () => {
  const ordinary = encounter(2000, "on");
  ordinary.harness.onBeatTick();
  assertEqual(ordinary.callbacks.length, 0, "ordinary tolls schedule no off-beat cue");
  const departed = encounter(2000, "off");
  departed.harness.onBeatTick();
  departed.harness.beatPhase = "on";
  departed.runNext();
  assertEqual(departed.pulses.length, 1, "a queued answer cue cannot survive the wave that required it");
  const story = encounter(2000, "free");
  story.harness.onBeatTick();
  assertEqual(story.pulses.length, 0, "free story actions show no misleading timing invitation");
  assertEqual(story.callbacks.length, 0, "story does not queue an answer pulse");
});

await suite("Bell split cue: children keep separate lanes when their parent dies beside Wren", () => {
  for (const parentX of [650, 780, 850, 900, 959.9, 960, 1000, 1100, 1300]) {
    const bell = new Harness();
    const spawned: Array<{ startX: number; restX: number; restY: number; word: string; delay: number; advanceMs: number }> = [];
    Object.assign(bell, {
      wrenContainer: { x: 960 },
      spawnGhost(startX: number, restX: number, restY: number, word: string, delay: number, advanceMs: number) {
        spawned.push({ startX, restX, restY, word, delay, advanceMs });
      },
    });
    bell.spawnSplitGhost({ restX: parentX - 60, restY: 740, word: "ebb" }, parentX);
    bell.spawnSplitGhost({ restX: parentX + 60, restY: 740, word: "drift" }, parentX);
    assertEqual(spawned[1].restX - spawned[0].restX, 120, "both labels retain the authored sibling spacing");
    assert(spawned.every((child) => Math.abs(child.restX - 960) >= 180), "neither child begins over Wren");
    assertEqual(spawned.map((child) => [child.word, child.restY, child.delay, child.advanceMs]),
      [["ebb", 740, 0, 5000], ["drift", 740, 0, 5000]], "words, height and full deadlines remain unchanged");
    assert(spawned.every((child) => child.startX === child.restX), "children still appear locally instead of crossing the screen");
    if (Math.abs(parentX - 960) >= 240) {
      assertEqual(spawned.map((child) => child.restX), [parentX - 60, parentX + 60], "an already clear pair keeps its original positions");
    }
  }
});

await suite("Bell door cue: enlarged arches leave their passage words above the stone crown", () => {
  const bell = new Harness();
  const quiet = { scene: true, x: 560, y: 812, scaleY: 2.2 };
  const force = { scene: true, x: 1360, y: 812, scaleY: 2.2 };
  Object.assign(bell, { scale: { width: 1920, height: 1080 }, doorChantCue: quiet, doorForceCue: force });
  for (const door of [quiet, force]) {
    for (const long of [false, true]) {
      const position = bell.bellPassageWordPosition(door, -62, { long });
      assert(position.y + 24 < door.y - 105 * door.scaleY, "text cannot cross the enlarged doorway");
      assert(position.x >= 300 && position.x <= 1620, "the word remains inside the readable screen area");
    }
  }
  const other = { scene: true, x: 690, y: 812, scaleY: 1 };
  assertEqual(bell.bellPassageWordPosition(other, -48), { x: 840, y: 650 }, "other Bell props keep their existing word placement");
});

await suite("Bell force door: the closed prop leaves only after all four breaking words", () => {
  const bell = new Harness();
  const events: string[] = [];
  const words: string[] = [];
  let begin: (() => void) | undefined;
  let target: { word: string; onComplete(): void } | undefined;
  let continueReading: (() => void) | undefined;
  const door = { scene: true, destroy() { events.push("destroy"); } };
  Object.assign(bell, {
    doorForceCue: door,
    time: { delayedCall(delay: number, callback: () => void) {
      assertEqual(delay, 400, "the original first-word delay is unchanged");
      begin = callback;
    } },
    tweens: { killTweensOf(value: unknown) {
      assertEqual(value, door, "only the completed closed doorway is stopped");
      events.push("stop-door");
    } },
    setNarrator(text: string) {
      if (text.startsWith("The doors burst wide.")) {
        assertEqual(bell.doorForceCue, null, "the completed-open caption cannot retain a closed door");
        assert(events.includes("destroy"), "the closed prop is gone before the acknowledgment");
        events.push("acknowledge");
      }
    },
    setStoryObjective() {},
    bellPassageWordPosition() { return { x: 0, y: 0 }; },
    makeBellForkWord(body: unknown, options: { word: string; onComplete(): void }) {
      assertEqual(body, door, "all four words keep their original doorway anchor");
      words.push(options.word);
      return options;
    },
    registerActiveTarget(next: typeof target) { target = next; },
    clearActiveTargets() { events.push("clear-word"); },
    readThen(callback: () => void) { continueReading = callback; },
    startAct3Corridor() { events.push("corridor"); },
  });
  bell.startFork1ForceBreak();
  assertEqual(words.length, 0, "the chain still waits for the authored initial delay");
  begin!();
  for (const expected of ["crash", "crack", "clear", "we pass"]) {
    assertEqual(target!.word, expected, "each exact authored target is preserved");
    assertEqual(bell.doorForceCue, door, "the closed doorway stays through the unfinished chain");
    assert(!events.includes("destroy"), "no earlier word falsely opens the door");
    target!.onComplete();
  }
  assertEqual(words, ["crash", "crack", "clear", "we pass"], "the sequence has no extra targets");
  assertEqual(events.slice(-4), ["clear-word", "stop-door", "destroy", "acknowledge"],
    "the final word releases before its prop, then the readable acknowledgment begins");
  assert(!events.includes("corridor"), "the final response remains held for Continue");
  continueReading!();
  assertEqual(events.at(-1), "corridor", "Continue still reaches the original corridor transition");
});
