import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";

// Run the real scene method without booting Phaser or a browser. Only its
// renderer and beat clock are fake; no passage/progression code is copied here.
const path = new URL("../src/scenes/SunkenBellScene.ts", import.meta.url);
const file = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const sceneClass = file.statements.find(ts.isClassDeclaration)!;
const methods = ["startWardenPhase3", "registerBeatTarget"].map(name => sceneClass.members.find((member) =>
  member.name?.getText(file) === name)!.getText(file));
const code = ts.transpileModule(`class Harness { ${methods.join("\n")} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const Harness = new Function("reducedFlashes", "playChime", `${code}; return Harness;`)(
  () => true, () => {},
);

interface FakeTarget {
  word: string;
  complete: boolean;
  destroyed: boolean;
  alpha: number;
  depth: number;
  onComplete: () => void;
  isComplete(): boolean;
  destroy(): void;
  setVisualAlpha(value: number): void;
  setDepth(value: number): void;
}

function encounter(holdIntro = false) {
  let now = 0;
  const beats: Array<() => void> = [];
  const callbacks: Array<{ at: number; run: () => void }> = [];
  const spawned: Array<{ at: number; target: FakeTarget }> = [];
  const harness = new Harness();
  const captions: string[] = [];
  const tasks: string[] = [];
  let continueIntro: (() => void) | undefined;
  let defeats = 0;
  Object.assign(harness, {
    activeTargets: [] as FakeTarget[], typingInput: { register() {} },
    setNarrator: (text: string) => captions.push(text), playWardenStagePulse() {},
    band: { setObjective: (text: string) => tasks.push(text) },
    setStoryObjective(text: string) { this.beatPhase = "free"; tasks.push(text); },
    readThen: (next: () => void) => { continueIntro = next; },
    wardenWordPosition: () => ({ x: 0, y: 0 }),
    beatClock: { onNextBeat: (run: () => void) => beats.push(run) },
    makeWardenWord(_sprite: unknown, opts: { word: string; onComplete: () => void }) {
      const target: FakeTarget = {
        word: opts.word, complete: false, destroyed: false, alpha: 0, depth: 0,
        onComplete: opts.onComplete,
        isComplete() { return this.complete; },
        destroy() { this.destroyed = true; },
        setVisualAlpha(value: number) { this.alpha = value; },
        setDepth(value: number) { this.depth = value; },
      };
      spawned.push({ at: now, target });
      return target;
    },
    clearActiveTargets() { harness.activeTargets.forEach((target: FakeTarget) => target.destroy()); harness.activeTargets = []; },
    onWardenDefeated() { defeats += 1; },
  });
  const advanceTo = (time: number) => {
    callbacks.sort((a, b) => a.at - b.at);
    while (callbacks[0] && callbacks[0].at <= time) {
      const callback = callbacks.shift()!;
      now = callback.at;
      callback.run();
    }
    now = time;
  };
  const beat = (time: number) => {
    advanceTo(time);
    for (const run of beats.splice(0)) run();
  };
  const finish = (time: number, target = spawned.at(-1)!.target) => {
    advanceTo(time);
    target.complete = true;
    // TextWordTarget calls its scene callback after the320ms exit tween,
    // even when the scene destroys that target while the tween is running.
    callbacks.push({ at: time + 320, run: target.onComplete });
  };
  harness.startWardenPhase3({});
  const start = () => { continueIntro!(); beat(0); };
  if (!holdIntro) start();
  return { spawned, advanceTo, beat, finish, defeats: () => defeats,
    pending: () => beats.length, active: () => harness.activeTargets as FakeTarget[],
    captions, tasks, start };
}

await suite("Bell Warden: full verse waits for Continue and beat prompts are readable immediately", () => {
  const fight = encounter(true);
  assert(fight.captions[0]!.includes("i am the bell. i drink the sea."), "the full authored verse can be read before its first deadline");
  assert(fight.captions[0]!.includes("do not type spaces between prompts"), "one-word prompts teach the otherwise ambiguous space rule");
  assertEqual(fight.spawned.length, 0, "the instruction card cannot time out an unseen first word");
  assertEqual(fight.pending(), 0, "Continue controls when the first beat callback is armed");
  fight.start();
  assertEqual(fight.spawned[0]!.target.alpha, 1, "the word is fully visible at0ms of its175ms start window");
  assert(fight.spawned[0]!.target.depth > 1300, "the world echo cannot hide the new prompt throughout its start window");
  assert(fight.captions.at(-1)!.length < fight.captions[0]!.length, "the held lesson becomes a compact verse above the live target row");
  assert(fight.tasks.at(-1)!.includes("Next: “am”"), "the following word is previewed a full beat before it arrives");
  fight.beat(1000);
  assert(fight.tasks.at(-1)!.includes("Rest this toll") && fight.tasks.at(-1)!.includes("Next blue pulse: “i”"), "a failed sentence explains both the empty rest beat and the restart word");
  assertEqual(fight.active().length, 0, "rest remains the original empty beat, preserving retry timing");
  fight.beat(2000);
  assertEqual(fight.spawned.at(-1)!.target.alpha, 1, "the restarted word is immediately readable too");
  assertEqual(fight.spawned.at(-1)!.target.word, "i", "retry keeps the original sentence checkpoint");
});

await suite("Bell Warden: completed words advance once on the next toll, through the exit animation", () => {
  for (const completedAt of [150, 679, 680, 681, 800, 999]) {
    const fight = encounter();
    fight.finish(completedAt);
    fight.beat(1000);
    assertEqual(fight.spawned.map(({ target }) => target.word), ["i", "am"],
      `${completedAt}ms match advances exactly once on the1000ms toll`);
    fight.advanceTo(1400);
    assertEqual(fight.active().length, 1, "old animation cannot clear the next word");
    assertEqual(fight.pending(), 1, "exactly one deadline remains after delayed completion");
  }
});

await suite("Bell Warden: a timed-out attempt cannot complete after the sentence restarts", () => {
  const fight = encounter();
  const old = fight.spawned[0].target;
  fight.beat(1000);
  assert(old.destroyed, "unfinished word is removed at its deadline");
  fight.finish(1120, old);
  fight.beat(2000);
  assertEqual(fight.spawned.map(({ target }) => target.word), ["i", "i"],
    "stale completion neither advances nor duplicates the sentence restart");
  assertEqual(fight.pending(), 1, "restart owns one deadline");
});

await suite("Bell Warden: late success preserves sentence checkpoints and reaches defeat once", () => {
  const fight = encounter();
  // Finish the first sentence late on every beat, then time out the next word.
  for (let index = 0; index < 4; index += 1) {
    fight.finish(index * 1000 + 850);
    fight.beat((index + 1) * 1000);
  }
  fight.beat(5000);
  fight.beat(6000);
  assertEqual(fight.spawned.at(-1)!.target.word, "i", "second sentence restarts at its own first word");
  for (let index = 6; index < 10; index += 1) {
    fight.finish(index * 1000 + 850);
    fight.beat((index + 1) * 1000);
  }
  fight.advanceTo(11000);
  assertEqual(fight.defeats(), 1, "final delayed animation cannot trigger a second defeat");
  assertEqual(fight.pending(), 0, "completed passage has no stale beat callbacks");
});
