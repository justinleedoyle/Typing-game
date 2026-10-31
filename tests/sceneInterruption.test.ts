import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
import type Phaser from "phaser";
import { installTweenPauseClock } from "../src/game/sceneInterruption";
import { assert, assertEqual, suite } from "./_assert";

// Exercise the installed engine's full TweenManager and Clock unchanged. Only
// the renderer and wall clock are inert; no tween stepping math is reproduced.
const require = createRequire(import.meta.url);
const EventEmitter = require("eventemitter3");
const TweenManager = require("phaser/src/tweens/TweenManager.js");
const SceneClock = require("phaser/src/time/Clock.js");

const hudUrl = new URL("../src/game/heartSoulHud.ts", import.meta.url);
const hudSource = ts.createSourceFile(hudUrl.pathname, readFileSync(hudUrl, "utf8"), ts.ScriptTarget.Latest, true);
const hudOwner = hudSource.statements.find(ts.isClassDeclaration)!;
const hudMethods = ["tick", "tickLowHeartWatcher"].map(name =>
  hudOwner.members.find(member => member.name?.getText(hudSource) === name)!.getText(hudSource)).join("\n");
const hudConstants = hudSource.statements.filter(ts.isVariableStatement).map(statement => statement.getText(hudSource)).join("\n");
const hudCode = ts.transpileModule(`${hudConstants}\nclass Hud { ${hudMethods} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const Hud = new Function("PALETTE_HEX", `${hudCode}; return Hud;`)({ ember: 0 });

function withClock(work: (wall: { now: number }) => void): void {
  const original = Date.now;
  const wall = { now: 1000 };
  Date.now = () => wall.now;
  try { work(wall); }
  finally { Date.now = original; }
}

function fixture(wall: { now: number }, patched = true, duration = 1000) {
  const events = new EventEmitter();
  const scene = { events, sys: { events, game: { loop: { time: wall.now } } } } as unknown as Phaser.Scene;
  const tweens = new TweenManager(scene);
  const clock = new SceneClock(scene);
  Object.assign(scene, { tweens, time: clock });
  events.emit("boot"); events.emit("start");
  const dispose = patched ? installTweenPauseClock(scene) : () => {};
  const body = { x: 0 };
  let completions = 0, timerCompletions = 0;
  const tween = tweens.add({ targets: body, x: 1000, duration, ease: "Linear", onComplete: () => completions++ });
  // A tween's first frame initializes it; this timer mirrors its subsequent
  // active span so their completion consequences can be observed together.
  const timer = clock.delayedCall(duration + 16, () => timerCompletions++);
  return { scene, events, tweens, clock, body, tween, timer, dispose,
    get completions() { return completions; }, get timerCompletions() { return timerCompletions; },
    frame(ms: number, wallMs = ms) {
      wall.now += wallMs;
      clock.preUpdate(); clock.update(wall.now, ms); tweens.update();
    },
    pause(ms: number) { events.emit("pause"); wall.now += ms; },
    resume() { events.emit("resume"); },
  };
}

await suite("scene interruption: the real tween wall clock excludes short and long pauses like its owned TimerEvent", () => {
  // Demonstrate that the fixture detects the original defect on unmodified
  // Phaser: a300ms pause advances the body by316ms, while its timer advances16.
  withClock(wall => {
    const control = fixture(wall, false);
    for (let i = 0; i < 10; i++) control.frame(16);
    const before = control.body.x;
    control.pause(300); control.resume(); control.frame(16);
    assertEqual([control.body.x - before, control.timer.elapsed], [316, 176], "the unchanged engine reproduces pause catch-up");
  });
  for (const pausedMs of [0, 1, 179, 180, 250, 499, 500, 501, 60_000]) withClock(wall => {
    const f = fixture(wall);
    for (let i = 0; i < 10; i++) f.frame(16);
    const before = f.body.x;
    f.pause(pausedMs); f.resume(); f.frame(16);
    assertEqual([f.body.x - before, f.timer.elapsed], [16, 176], `${pausedMs}ms pause cannot move the enemy or consume the remaining timer`);
    assertEqual([f.completions, f.timerCompletions], [0, 0], "resuming has no premature consequence");
  });
});

await suite("scene interruption: a near-complete handoff or enemy cannot finish on resume without its remaining active time", () => {
  for (const pauseMs of [250, 60_000]) withClock(wall => {
    const f = fixture(wall, true, 200);
    for (let i = 0; i < 10; i++) f.frame(16);
    f.pause(pauseMs); f.resume(); f.frame(16);
    assertEqual([f.body.x, f.completions, f.timerCompletions], [800, 0, 0], "the same remaining handoff/enemy progress is still live");
    f.frame(39);
    assertEqual([f.completions, f.timerCompletions], [0, 0], "neither consequence can fire one active millisecond early");
    f.frame(16);
    assertEqual([f.body.x, f.completions, f.timerCompletions], [1000, 1, 1], "the existing engine completes both after their full active duration");
    f.frame(50);
    assertEqual([f.completions, f.timerCompletions], [1, 1], "completion consequences still run exactly once");
  });
});

await suite("scene interruption: repeated pauses preserve between-frame active time, lag policy and individual tween state", () => {
  withClock(wall => {
    const f = fixture(wall);
    for (let i = 0; i < 10; i++) f.frame(16);
    f.tweens.timeScale = 0.85;
    const decoration = { alpha: 0 };
    const held = f.tweens.add({ targets: decoration, alpha: 1, duration: 1000, paused: true });
    const policy = [f.tweens.timeScale, f.tweens.maxLag, f.tweens.lagSkip];
    let expected = f.body.x;
    for (const pauseMs of [200, 8000, 300]) {
      // Pause can start between renderer frames. This10ms is active play and
      // must remain in the next tween delta, alongside16ms after resuming.
      wall.now += 10;
      f.events.emit("pause"); wall.now += pauseMs / 2;
      f.events.emit("pause"); wall.now += pauseMs / 2;
      f.resume(); f.resume(); f.frame(16);
      expected += 26 * 0.85;
      assert(Math.abs(f.body.x - expected) < 0.000001, "duplicate notifications exclude only the actual pause, preserving active time");
      assertEqual([f.tweens.timeScale, f.tweens.maxLag, f.tweens.lagSkip], policy, "pause handling cannot retune speed or lag smoothing");
      assert(held.paused && decoration.alpha === 0, "a deliberately paused decorative tween stays paused");
    }
  });
});

await suite("scene interruption: installation and shutdown are idempotent and a previous pause cannot shift a later visit", () => {
  withClock(wall => {
    const f = fixture(wall);
    const pauseListeners = f.events.listenerCount("pause");
    assertEqual(installTweenPauseClock(f.scene), f.dispose, "one scene visit owns one clock helper");
    assertEqual(f.events.listenerCount("pause"), pauseListeners, "reinstallation cannot duplicate listeners");
    f.pause(400);
    f.events.emit("shutdown"); f.dispose();
    assertEqual([f.events.listenerCount("pause"), f.events.listenerCount("resume")], [0, 0], "shutdown drops both clock listeners");
    const previous = [f.tweens.startTime, f.tweens.prevTime];
    wall.now += 500; f.resume();
    assertEqual([f.tweens.startTime, f.tweens.prevTime], previous, "a late resume cannot touch the stopped manager");
    f.events.emit("start");
    const dispose = installTweenPauseClock(f.scene);
    assert(dispose !== f.dispose, "the next visit gets a new lifecycle");
    const fresh = [f.tweens.startTime, f.tweens.prevTime];
    f.resume();
    assertEqual([f.tweens.startTime, f.tweens.prevTime], fresh, "the previous visit's paused timestamp cannot leak");
    f.pause(2000); f.resume();
    assertEqual([f.tweens.startTime, f.tweens.prevTime], fresh.map(value => value + 2000), "a later visit excludes only its own pause");
    f.events.emit("destroy"); dispose();
    assertEqual([f.events.listenerCount("pause"), f.events.listenerCount("resume")], [0, 0], "destroy also releases the new visit");
  });
});

await suite("scene interruption: low-Heart encouragement threshold and cooldown count active play instead of time away", () => {
  let wall = 1000;
  const descriptor = Object.getOwnPropertyDescriptor(performance, "now");
  Object.defineProperty(performance, "now", { configurable: true, value: () => wall });
  try {
    let cues = 0, heart = 10;
    const hud = new Hud();
    Object.assign(hud, { pulseMs: 0, lowHeartSinceMs: null, lowHeartLastFiredMs: -Infinity,
      currentHeart: 100, showSoul: false, heartPips: [],
      opts: { getHeart: () => heart, onSustainedLowHeart: () => cues++ },
      maybePulseRow() {}, renderRow() {}, pulseRow() {},
    });
    const frame = (ms: number) => { wall += ms; hud.tick(ms); };
    frame(0); frame(1000);
    wall += 60_000; frame(0);
    assertEqual(cues, 0, "a minute away cannot fabricate three seconds of sustained low Heart");
    frame(1999);
    assertEqual(cues, 0, "the original threshold cannot fire one active millisecond early");
    frame(1);
    assertEqual(cues, 1, "the original three-second active threshold still fires once");
    frame(0); frame(3000);
    wall += 120_000; frame(0);
    assertEqual(cues, 1, "a second interruption cannot satisfy the thirty-second cue cooldown");
    frame(26_999);
    assertEqual(cues, 1, "the original cooldown is still in effect one active millisecond early");
    frame(1);
    assertEqual(cues, 2, "encouragement may recur after its unchanged active cooldown");
    heart = 100; frame(16);
    assertEqual(hud.lowHeartSinceMs, null, "recovered Heart clears the sustained-strain window normally");
  } finally {
    if (descriptor) Object.defineProperty(performance, "now", descriptor);
    else delete (performance as unknown as { now?: () => number }).now;
  }
});
