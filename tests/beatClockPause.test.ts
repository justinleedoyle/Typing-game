import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { isOffBeat, isOnBeat, windowMsFor } from "../src/game/beatGate";
import { assert, assertEqual, suite } from "./_assert";

// Use the installed Phaser scene Clock and TimerEvent unchanged. Its global
// `now` jumps after a pause; the owned TimerEvent advances only by active delta.
const require = createRequire(import.meta.url);
const SceneClock = require("phaser/src/time/Clock.js");
const url = new URL("../src/game/beatClock.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const constants = source.statements.filter(ts.isVariableStatement).map(statement => statement.getText(source)).join("\n");
const owner = source.statements.find(ts.isClassDeclaration)!;
const code = ts.transpileModule(`${constants}\n${owner.getText(source).replace(/^export /, "")}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const noop = () => {};
const BeatClock = new Function("Phaser", "playBellToll", "isOffBeat", "isOnBeat", "windowMsFor", `${code}; return BeatClock;`)(
  { Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy" } } }, noop, isOffBeat, isOnBeat, windowMsFor,
);

function fixture(tempo = 2000) {
  const events = { once: noop, on: noop, off: noop };
  const scene: any = { events, sys: { events, game: { loop: { time: 0 } } } };
  const clock = new SceneClock(scene);
  scene.time = clock;
  const beats: Array<{ at: number; accepting: boolean }> = [];
  const beat = new BeatClock(scene, { tempoMs: tempo, audio: false,
    onBeat: () => beats.push({ at: clock.now, accepting: beat.isInWindow() }) });
  let wallTime = 0;
  return { clock, beat, beats,
    frame(activeMs: number, wallMs = activeMs) {
      wallTime += wallMs;
      clock.preUpdate();
      clock.update(wallTime, activeMs);
    },
    pause(ms: number) { wallTime += ms; },
  };
}

await suite("Beat clock pause: visible slow and fast openings retain their remaining active time after scene resume", () => {
  for (const tempo of [2000, 1000]) {
    const f = fixture(tempo), window = tempo * 0.175;
    f.beat.start(); f.frame(100);
    assert(f.beat.isInWindow(), "the original opening accepts before pausing");
    f.pause(60_000); f.frame(0);
    assertEqual(f.clock.now, 60_100, "the installed Phaser Clock exposes the resumed global timestamp");
    assertEqual(f.beat.timer.elapsed, 100, "the same installed TimerEvent retains its pre-pause elapsed time");
    assert(f.beat.isInWindow(), "a still-visible opening cannot close just because the owner was paused");
    f.frame(window - 100);
    assert(f.beat.isInWindow(), "the original inclusive acceptance boundary remains exact");
    f.frame(1);
    assert(!f.beat.isInWindow(), "one active millisecond after the original boundary still rejects");
    assertEqual(f.beats.length, 1, "pause and resume cannot insert an extra toll");
    f.frame(tempo - window - 1);
    assertEqual(f.beats.length, 2, "the original next toll follows exactly one tempo of active time");
    assert(f.beats[1].accepting && f.beat.isInWindow(), "the actual timer callback and its live gate agree on the new toll");
  }
});

await suite("Beat clock pause: the orange answer window follows the same paused TimerEvent as its scheduled cue", () => {
  const f = fixture(); f.beat.start(); f.frame(825);
  assert(f.beat.isInOffbeatWindow(), "the original centered orange window opens at825ms");
  f.pause(45_000); f.frame(0);
  assert(f.beat.isInOffbeatWindow(), "a paused orange opening keeps its remaining active duration");
  f.frame(350);
  assert(f.beat.isInOffbeatWindow(), "the original1175ms inclusive orange boundary remains exact");
  f.frame(1);
  assert(!f.beat.isInOffbeatWindow(), "the answer closes at1176ms of active time");
  assert(!f.beat.isInWindow(), "the orange phase never opens a new blue window");
});

await suite("Beat clock pause: tempo changes preserve elapsed phase without fabricating an invitation", () => {
  const f = fixture(); f.beat.start(); f.frame(500);
  f.pause(20_000); f.frame(0); f.beat.setTempo(1000);
  assertEqual([f.beat.getTempo(), f.beat.getWindowMs()], [1000, 175], "the original faster tempo and window are unchanged");
  assert(!f.beat.isInWindow(), "changing tempo at500ms since the last toll does not invent an unseen new blue pulse");
  f.frame(999);
  assertEqual(f.beats.length, 1, "tempo changes retain the existing next-toll scheduling policy");
  f.frame(1);
  assertEqual(f.beats.length, 2, "the next toll still occurs1000 active milliseconds after the tempo change");
  assert(f.beats[1].accepting && f.beat.isInWindow(), "the rescheduled real toll resets the acceptance phase exactly once");
  f.beat.stop();
  assert(f.beat.isInWindow() && f.beat.isInOffbeatWindow(), "stopped story phases still accept ordinary typing");
  f.pause(5000); f.frame(0); f.beat.start();
  assert(f.beat.isInWindow(), "a restarted clock still gives the original immediate toll");
});
