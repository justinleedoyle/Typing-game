import { readFileSync } from "node:fs";
import ts from "typescript";
import { TypingInputController, type WordTarget } from "../src/game/typingInput";
import { decideBeatGate, isOnBeat, isOffBeat } from "../src/game/beatGate";
import { advanceDurationMs, splitChildPositions } from "../src/game/movingWordMath";
import { assert, assertEqual, suite } from "./_assert";

// The real scene handler owns the rhythm decision; the real typing controller
// owns shared-prefix claiming. Only renderer, clock and feedback are fake.
const url = new URL("../src/scenes/SunkenBellScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const owner = source.statements.find(ts.isClassDeclaration)!;
const method = owner.members.find((member) => member.name?.getText(source) === "onKeyDown")!;
const code = ts.transpileModule(`class Harness { ${method.getText(source)} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const Bell = new Function("decideBeatGate", "isPuristToggleKey", "playClack", `${code}; return Harness;`)(
  decideBeatGate, () => false, () => {},
);

class Target implements WordTarget {
  cursor = 0;
  completions = 0;
  constructor(readonly word: string) {}
  remaining() { return this.word.slice(this.cursor); }
  isComplete() { return this.cursor === this.word.length; }
  advance() { this.cursor += 1; }
  resetCursor() { this.cursor = 0; }
  miss() {}
  onClaim() {}
  onRelease() { this.cursor = 0; }
  onComplete() { this.completions += 1; }
  setDimmed() {}
  setCandidate() {}
}
function encounter(words: string[], metered = false, phase = "on") {
  let now = 0;
  const input = new TypingInputController();
  const targets = words.map((word) => new Target(word));
  targets.forEach((target) => input.register(target));
  const stumbles: boolean[] = [];
  const bell = new Bell();
  Object.assign(bell, {
    typingInput: input, reading: { handleKey: () => false }, beatPhase: phase, beatLocked: metered,
    beatClock: {
      isInWindow: () => isOnBeat(now % 2000, 350),
      isInOffbeatWindow: () => isOffBeat(now % 2000, 2000, 350),
    },
    registerStumble(desync: boolean) { stumbles.push(desync); if (desync) input.resetClaimedProgress(); },
  });
  return { input, targets, stumbles, type(char: string, at: number) {
    now = at;
    bell.onKeyDown({ key: char, ctrlKey: false, metaKey: false, repeat: false });
  } };
}

await suite("Bell rhythm: a shared first letter owns the beat while the player disambiguates", () => {
  const fight = encounter(["salt", "still"]);
  fight.type("s", 340);
  assert(!fight.input.hasClaim(), "salt/still remains ambiguous after the first s");
  assert(fight.input.hasPendingInput(), "accepted shared prefix counts as a started word");
  fight.type("a", 400);
  fight.type("l", 460);
  fight.type("t", 520);
  assertEqual(fight.targets[0].completions, 1, "salt finishes freely after starting on the toll");
  assertEqual(fight.stumbles, [], "disambiguating after the window causes no stumble");
  assert(!fight.input.hasPendingInput(), "completion releases beat ownership");
  fight.type("s", 600);
  assertEqual(fight.stumbles, [false], "the next word still must start on a toll");
  assertEqual(fight.targets[1].cursor, 0, "offbeat next word gains no progress");
  fight.type("s", 2340);
  for (const [index, char] of [..."till"].entries()) fight.type(char, 2400 + index * 60);
  assertEqual(fight.targets[1].completions, 1, "the other shared-prefix word stays playable");
});

await suite("Bell rhythm: an offbeat answer prefix continues freely after its answer window", () => {
  const fight = encounter(["salt", "still"], false, "off");
  fight.type("s", 1170);
  fight.type("a", 1230);
  fight.type("l", 1290);
  fight.type("t", 1350);
  assertEqual(fight.targets[0].completions, 1, "antiphon prefix also establishes word ownership");
  assertEqual(fight.stumbles, [], "leaving the midpoint window midword is allowed");
});

await suite("Bell rhythm: pending-input ownership preserves metered hyphens and cancellation", () => {
  const fight = encounter(["tide-and-toll"], true);
  for (const [index, char] of [..."tide"].entries()) fight.type(char, 340 + index * 60);
  fight.type("-", 600);
  assertEqual(fight.stumbles, [true], "hyphen outside the toll still desynchronizes");
  assertEqual(fight.targets[0].cursor, 0, "desync wipes the metered word");
  fight.type("Escape", 700);
  assert(!fight.input.hasPendingInput(), "Escape releases metered ownership");
  const shared = encounter(["salt", "still"]);
  shared.type("s", 340);
  shared.type("Backspace", 400);
  assert(!shared.input.hasPendingInput(), "Backspace clears a one-letter shared prefix");
  shared.type("s", 460);
  assertEqual(shared.stumbles, [false], "cleared prefix cannot bypass the next start gate");
});

await suite("Bell story input: exploration, doors and rewards never inherit combat timing", () => {
  for (const word of ["read it", "open slowly", "crash", "take her with you", "the bell remembers."]) {
    const story = encounter([word], false, "free");
    for (const [index, char] of [...word].entries()) story.type(char, 600 + index * 70);
    assertEqual(story.targets[0].completions, 1, `${word} completes while the old combat window is closed`);
    assertEqual(story.stumbles, [], `${word} cannot lose heart or air to an unexplained beat gate`);
  }
  const staleMeter = encounter(["hold-here"], true, "free");
  for (const [index, char] of [..."hold-here"].entries()) staleMeter.type(char, 600 + index * 70);
  assertEqual(staleMeter.targets[0].completions, 1, "free-story input stays safe even with a stale metered flag");
  assertEqual(staleMeter.stumbles, [], "story hyphens are ordinary punctuation");
});

await suite("Bell wave staging: every authored ghost starts in a clear approach lane", () => {
  const names = ["beginFirstGhostEncounter", "startWave1", "startAntiphon", "startWave2"];
  const methods = names.map((name) => owner.members.find((member) => member.name?.getText(source) === name)!.getText(source));
  const code = ts.transpileModule(`class Harness { ${methods.join("\n")} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const Waves = new Function("playWaveSting", "reducedMotion", "pickAdaptiveWords", "SUNKEN_BELL_WORD_BANK", `${code}; return Harness;`)(
    () => {}, () => true, (_bank: string[], count: number) => Array.from({ length: count }, (_, i) => `word${i}`), [],
  );
  const wave = new Waves();
  const spawns: Array<{ word: string; startX: number; restX: number; advanceMs: number }> = [];
  Object.assign(wave, {
    scale: { width: 1920 }, quietLordIntruded: true,
    store: { get: () => ({ keyStats: {} }) }, narration: { say() {} }, band: { setObjective() {} },
    pulseBellWave() {}, dismissOlin() {}, setBandSpeaker() {}, setBreathActive() {}, beginCombatWave() {}, setNarrator() {},
    spawnGhost(startX: number, restX: number, _restY: number, word: string, _delay: number, advanceMs: number) {
      spawns.push({ word, startX, restX, advanceMs });
    },
  });
  for (const name of names) wave[name]();
  assertEqual(spawns.length, 15, "all four authored combat waves are inspected");
  for (const spawn of spawns) {
    assert(spawn.startX < 0 ? spawn.restX < 960 : spawn.restX > 960,
      `${spawn.word} enters from its own side instead of resting over Wren`);
  }
  const salt = spawns.find((spawn) => spawn.word === "salt")!;
  assertEqual(salt.restX, 1360, "initial salt ghost uses a readable right approach lane");
  assertEqual(salt.advanceMs, 16000, "initial encounter keeps its authored hit deadline");
  const range = Math.abs(salt.restX - 960);
  assertEqual(advanceDurationMs(salt.advanceMs, range, range, 1), 16000,
    "nonzero lane keeps the full approach deadline instead of the zero-range30percent floor");
});

await suite("Bell split staging: children born near Wren keep visible lanes and the explicit5second deadline", () => {
  const method = owner.members.find((member) => member.name?.getText(source) === "spawnSplitGhost")!;
  const code = ts.transpileModule(`class Harness { ${method.getText(source)} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const Spawn = new Function(`${code}; return Harness;`)();
  const bell = new Spawn();
  let last: { startX: number; restX: number; restY: number; word: string; delay: number; advanceMs: number };
  Object.assign(bell, {
    wrenContainer: { x: 960 },
    spawnGhost(startX: number, restX: number, restY: number, word: string, delay: number, advanceMs: number) {
      last = { startX, restX, restY, word, delay, advanceMs };
    },
  });
  for (const parentX of [720, 780, 900, 959.9]) {
    const children = splitChildPositions(parentX, 740, [{ word: "ebb", dx: -60 }, { word: "drift", dx: 60 }], 960);
    for (const child of children) {
      bell.spawnSplitGhost(child, parentX);
      assert(Math.abs(last!.restX - 960) >= 180, "split child cannot appear over Wren's hood");
      assertEqual(last!.word, child.word, "split child keeps its authored word");
      assertEqual([last!.startX, last!.restY, last!.delay], [last!.restX, 740, 0], "body-first local spawn and timing offset are retained");
      const range = Math.abs(last!.restX - 960);
      assertEqual(advanceDurationMs(last!.advanceMs, range, range, 1), 5000, "every child retains the explicit full5second approach");
      if (children.every((sibling) => Math.abs(sibling.restX - 960) >= 180)) {
        assertEqual(last!.restX, child.restX, "an already clear pair stays unchanged");
      }
    }
  }
});

await suite("Bell choir labels: ordinary and split ghosts opt into their existing readable rest lanes", () => {
  const names = ["spawnGhost", "spawnSplitGhost"];
  const code = ts.transpileModule(`class Harness { ${names.map((name) =>
    owner.members.find((member) => member.name?.getText(source) === name)!.getText(source)).join("\n")} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const configs: Array<Record<string, any>> = [];
  class Enemy { constructor(readonly config: Record<string, any>) { configs.push(config); } }
  const Spawn = new Function("MovingWordEnemy", "addContainerWake", "GHOST_KNOCKBACK_PAUSE_MS",
    "DANGER_RAMP_START", "BELL_BURST_COLOR", `${code}; return Harness;`)(Enemy, () => {}, 2000, 0.4, 1);
  const bell = new Spawn();
  Object.assign(bell, {
    ghosts: [], activeTargets: [], wrenContainer: { x: 960 }, combat: { advanceMult: 1 },
    typingInput: {}, drawGhostInto() {},
    add: { container: (x: number, y: number) => ({ x, y, setAlpha() { return this; } }) },
  });
  for (const [index, restX] of [240, 1680, 480, 1440, 720].entries()) {
    bell.spawnGhost(-100, restX, 700 + index * 10, "sorrow", index * 350, 13000, index === 4);
    const config = configs.at(-1)!;
    assertEqual(config.wordAnchorX, restX, "the Bell alone pins each answer to its existing horizontal approach lane");
    assertEqual([config.restX, config.advanceMs, config.entranceDelayMs, config.word],
      [restX, 13000, index * 350, "sorrow"], "the ordinary body, deadline, stagger and answer are unchanged");
  }
  for (const parentX of [720, 900, 959.9]) {
    for (const [word, dx] of [["ebb", -60], ["drift", 60]] as const) {
      bell.spawnSplitGhost({ word, restX: parentX + dx, restY: 740 }, parentX);
    }
    const children = configs.slice(-2);
    assertEqual(children.map((child) => child.wordAnchorX), [660, 780], "near-Wren splits retain two separate visible answer lanes");
    assertEqual(children.map((child) => [child.word, child.restX, child.restY, child.advanceMs]),
      [["ebb", 660, 740, 5000], ["drift", 780, 740, 5000]], "the authored split bodies and five-second deadlines are unchanged");
  }
});

await suite("Bell Warden layout: compound rows keep spacing when their boss is near the right edge", () => {
  const method = owner.members.find((member) => member.name?.getText(source) === "wardenWordPosition")!;
  const code = ts.transpileModule(`class Harness { ${method.getText(source)} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const Layout = new Function("Phaser", `${code}; return Harness;`)({
    Math: { Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(value, max)) },
  });
  const bell = new Layout();
  bell.scale = { width: 1920, height: 1080 };
  const phases = [
    { words: ["weight", "silence", "deep"], fontSize: 36 },
    { words: ["tide-and-toll", "deep-and-dark", "still-and-stir"], fontSize: 34 },
    { words: ["i", "am", "the", "bell.", "drink", "sea."], fontSize: 40, sequential: true },
  ];
  for (const bossX of [1400, 1650]) for (const phase of phases) {
    const positions = phase.words.map((word, index) => bell.wardenWordPosition(
      { x: bossX, y: 610 }, word, phase.sequential ? 0 : index, phase.sequential ? 1 : phase.words.length,
    ));
    for (const [index, position] of positions.entries()) {
      // A conservative3/4em per glyph is wider than these serif labels; checking
      // the full labels also covers their centered typed/remaining text split.
      const halfWidth = phase.words[index].length * phase.fontSize * 0.75 / 2;
      assert(position.x - halfWidth >= 24 && position.x + halfWidth <= 1896,
        "full boss label stays within the viewport with an outside margin");
      assert(position.y > 250 && position.y < 780, "boss labels stay below narration and above the HUD");
      if (!phase.sequential && index > 0) {
        const previousHalf = phase.words[index - 1].length * phase.fontSize * 0.75 / 2;
        assert(position.x - halfWidth - (positions[index - 1].x + previousHalf) >= 24,
          "simultaneous labels retain a visible gap instead of overlapping at the right clamp");
      }
    }
  }
});
