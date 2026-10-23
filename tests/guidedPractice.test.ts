import { readFileSync } from "node:fs";
import ts from "typescript";
import { TypingInputController, type WordTarget } from "../src/game/typingInput";
import { decideBeatGate } from "../src/game/beatGate";
import { woodWardWord } from "../src/game/wordBank";
import { assert, assertEqual, suite } from "./_assert";

function methods(file: string, names: string[], globals: Record<string, unknown>) {
  const url = new URL(`../src/scenes/${file}.ts`, import.meta.url);
  const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
  const owner = source.statements.find(ts.isClassDeclaration)!;
  const code = ts.transpileModule(`class Harness { ${names.map((name) =>
    owner.members.find((member) => member.name?.getText(source) === name)!.getText(source)).join("\n")} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(globals), `${code}; return Harness;`)(...Object.values(globals));
}
function display(x = 0, y = 0) {
  return { x, y, text: "", scene: true, destroyed: false,
    setText(text: string) { this.text = text; return this; }, setAlpha() { return this; },
    setOrigin() { return this; }, setDepth() { return this; },
    destroy() { this.destroyed = true; this.scene = false; },
  };
}
class Target implements WordTarget {
  cursor = 0; destroyed = false;
  constructor(readonly word: string, readonly done: () => void) {}
  remaining() { return this.word.slice(this.cursor); }
  isComplete() { return this.cursor === this.word.length; }
  advance() { this.cursor += 1; }
  miss() { throw new Error("A rehearsal typo must not enter the accuracy/damage path"); }
  onClaim() {} onRelease() { this.cursor = 0; } setDimmed() {}
  onComplete() { this.done(); }
  destroy() { this.destroyed = true; }
}
const key = (value: string) => ({ key: value, repeat: false, ctrlKey: false, metaKey: false,
  altKey: false, preventDefault() {} } as KeyboardEvent);

await suite("guided Bell: real rhythm starts are safe, remaining letters flow, and combat waits for Continue", () => {
  const Bell = methods("SunkenBellScene", ["startRhythmPractice", "clearRhythmPractice", "beginRhythmEncounters", "onKeyDown"], {
    SERIF: "serif", PALETTE: { frost: "white" }, decideBeatGate,
    playClack() {}, isPuristToggleKey: () => false,
  });
  const bell = new Bell();
  const input = new TypingInputController();
  const targets: Target[] = [];
  const gates: Array<() => void> = [];
  const timers: Array<{ ms: number; run: () => void }> = [];
  let windowOpen = false, stumbles = 0, encounters = 0, stopped = 0;
  Object.assign(bell, {
    typingInput: input, activeTargets: [] as Target[], rhythmPracticeActive: false,
    rhythmPracticeCoach: null, rhythmPracticeTarget: null,
    reading: { handleKey: () => false }, scale: { width: 1920 },
    add: { text: (x: number, y: number) => display(x, y) },
    setBreathActive: (active: boolean) => { assert(!active, "air remains inactive throughout rehearsal"); },
    setNarrator() {}, setStoryObjective() {}, band: { setObjective() {} },
    olinPassageWordPosition: () => ({ x: 600, y: 500 }), rhythmLabel: display(),
    beatClock: { setTempo: (ms: number) => assertEqual(ms, 2000, "original slow toll retained"),
      start() {}, stop() { stopped += 1; }, isInWindow: () => windowOpen },
    time: { delayedCall: (ms: number, run: () => void) => timers.push({ ms, run }) },
    registerStumble: () => { stumbles += 1; },
    readThen: (next: () => void) => gates.push(next),
    makeOlinWord: (opts: { word: string; onComplete: () => void }) => {
      const target = new Target(opts.word, opts.onComplete); targets.push(target); return target;
    },
    registerActiveTarget(target: Target) { this.activeTargets.push(target); input.register(target); },
    clearActiveTargets() { this.activeTargets.forEach((target: Target) => { input.unregister(target); target.destroy(); }); this.activeTargets = []; },
    startFirstGhostEncounter() { encounters += 1; },
  });
  bell.startRhythmPractice();
  assertEqual(targets.map((target) => target.word), ["tide"], "one stationary real-input target rehearses the rule");
  const initialHeart = input.getStats().getHeart();
  bell.onKeyDown(key("t"));
  assertEqual(input.hasPendingInput(), false, "an off-beat t does not bypass the real gate");
  windowOpen = true;
  bell.onKeyDown(key("x"));
  assertEqual(input.getStats().getHeart(), initialHeart, "off-beat starts and wrong letters have no Heart cost");
  assertEqual(stumbles, 0, "safe practice cannot invoke combat stumble damage");
  bell.onKeyDown(key("t"));
  assert(input.hasClaim(), "the first t starts only inside the original blue window");
  windowOpen = false;
  for (const char of "ide") bell.onKeyDown(key(char));
  assert(!bell.rhythmPracticeActive && targets[0]!.destroyed, "success removes the rehearsal target and coaching");
  assertEqual(stopped, 1, "the practice clock stops before its held success response");
  assertEqual(timers.length, 0, "there is no enemy deadline or hidden auto-advance during practice");
  assertEqual(encounters, 0, "completion alone cannot start combat");
  targets[0]!.done();
  assertEqual(gates.length, 1, "a stale completion cannot duplicate the transition gate");
  gates.shift()!();
  assertEqual(timers.map((timer) => timer.ms), [2000], "Continue retains the original first-encounter delay");
  timers[0]!.run();
  assertEqual(encounters, 1, "only the original scheduled encounter starts");
  bell.startRhythmPractice();
  const priorPractice = targets.at(-1)!;
  bell.startRhythmPractice();
  assert(priorPractice.destroyed, "re-entering rehearsal destroys its previous target");
  priorPractice.done();
  assertEqual(gates.length, 0, "the old rehearsal cannot advance the replacement");
  bell.clearRhythmPractice();
  assertEqual(bell.activeTargets.length, 0, "shutdown-style cleanup unregisters the last practice target");
});

await suite("guided Bell: the real blue window leaves its practice word visible and preserves combat dimming", () => {
  const Bell = methods("SunkenBellScene", ["pulseBeatRing"], {
    PALETTE_HEX: { frost: 1 }, reducedFlashes: () => false,
  });
  for (const practice of [true, false]) {
    const bell = new Bell();
    const alpha: number[] = [];
    const tweens: Array<{ targets: unknown; duration: number }> = [];
    const ring = { clear() { return this; }, lineStyle() { return this; }, strokeCircle() { return this; },
      setAlpha() { return this; }, setScale() { return this; } };
    const echo = { setAlpha(value: number) { alpha.push(value); return this; } };
    Object.assign(bell, {
      rhythmPracticeActive: practice, beatRing: ring, echoDim: echo,
      beatClock: { getWindowMs: () => 350 }, combat: { warmLight: 0 },
      tweens: { killTweensOf() {}, add: (opts: typeof tweens[number]) => tweens.push(opts) },
    });
    bell.pulseBeatRing();
    assertEqual(tweens[0]!.duration, 350, "the exact visual/input blue window remains unchanged");
    assertEqual(alpha, practice ? [0] : [0, 1], "only the safe demonstration omits the world-black hazard");
    assertEqual(tweens.filter((tween) => tween.targets === echo).map((tween) => tween.duration),
      practice ? [] : [300], "original combat keeps its authored echo dim duration");
  }
});

await suite("guided Wood: four real masked examples precede original combat without mist, rewards or contact", () => {
  let reduced = false;
  const Wood = methods("HauntedWoodScene", ["startWardPractice", "clearWardPracticeVisual", "finishWardPractice",
    "beginCrossroads1", "triggerMistRoll", "onKeyDown"], {
    woodWardWord, reducedMotion: () => reduced, playChime() {}, playClack() {}, playWaveSting() {},
    isPuristToggleKey: () => false, WARD_INPUT_HINT: "original guide",
  });
  const wood = new Wood();
  const input = new TypingInputController();
  const entries: Array<{ word: string; maskMarks: boolean; done: () => void }> = [];
  const gates: Array<() => void> = [];
  const arrivals: Array<{ duration: number; onComplete: () => void; targets: ReturnType<typeof display> }> = [];
  const loadout: Array<() => void> = [];
  const waves: unknown[] = [];
  let mistGraphics = 0, caption = "";
  Object.assign(wood, {
    typingInput: input, activeTargets: [] as Target[], ghosts: [], wardPracticeGeneration: 0,
    wardPracticeBody: null, wardPracticeTarget: null, wardPracticeActive: false,
    mistTimer: { paused: false }, narration: { bottom: () => 200 },
    band: { setObjective() {} }, setNarrator(value: string) { caption = value; }, ensureCompassDrawn() {},
    compassGlyphs: Array.from({ length: 4 }, () => display()),
    reading: { handleKey: () => false }, readThen: (next: () => void) => gates.push(next),
    add: { container: (x: number, y: number) => display(x, y), graphics: () => { mistGraphics += 1; return display(); } },
    tweens: { killTweensOf() {}, add: (opts: typeof arrivals[number]) => arrivals.push(opts) },
    spawnPositionFor: () => ({ startX: 0, startY: 0, restX: 760, restY: 340 }),
    drawGhostInto() {}, pulseWoodWave() {}, cameras: { main: { shake() {} } },
    makeWord: (opts: { word: string; maskMarks: boolean; onComplete: () => void }) => {
      entries.push({ word: opts.word, maskMarks: opts.maskMarks, done: opts.onComplete });
      return new Target(opts.word, opts.onComplete);
    },
    registerActiveTarget(target: Target) { this.activeTargets.push(target); input.register(target); },
    clearActiveTargets() { this.activeTargets.forEach((target: Target) => { input.unregister(target); target.destroy(); }); this.activeTargets = []; },
    announceCombatLoadout: (next: () => void) => loadout.push(next),
    spawnGhostsByDirection: (...args: unknown[]) => waves.push(args),
  });
  wood.startWardPractice();
  for (const [index, word] of ["ho.wl", "ho!wl", "ho,wl", "ho?wl"].entries()) {
    if (index === 1) assert(caption.includes("Put an exclamation mark (!)"), "the below-spirit lesson names its mark naturally");
    assert(wood.wardPracticeActive && wood.mistTimer.paused, "practice pauses the incidental mist timer");
    wood.triggerMistRoll();
    assertEqual(mistGraphics, 0, "even an already-queued mist callback cannot obscure practice");
    assertEqual(wood.ghosts, [], "no advancing or one-shot-eligible enemies exist during the example");
    const arrival = arrivals.shift()!;
    assertEqual(arrival.duration, 900, "only a decorative approach precedes the waiting word");
    arrival.onComplete();
    assertEqual(entries[index]!.word, word, "the real compass insertion supplies the taught key");
    assert(entries[index]!.maskMarks, "the real target still masks the mark as a dot");
    const heart = input.getStats().getHeart();
    wood.onKeyDown(key("x"));
    assertEqual(input.getStats().getHeart(), heart, "a wrong practice key simply waits without a Heart cost");
    for (const char of word) wood.onKeyDown(key(char));
    assert(!wood.wardPracticeTarget && !wood.wardPracticeBody, "completion removes that spirit and target before its reading response");
    assertEqual(waves.length, 0, "a demonstration cannot start combined threats by completing a word");
    entries[index]!.done();
    assertEqual(gates.length, 1, "stale completion cannot duplicate the next reading gate");
    gates.shift()!();
  }
  assert(!wood.wardPracticeActive, "the fourth deliberate Continue ends rehearsal");
  assertEqual(loadout.length, 1, "the existing satchel announcement follows all four examples once");
  assertEqual(waves.length, 0, "combined threats still wait through the original loadout announcement");
  loadout[0]!();
  assertEqual(waves, [[["west", "east", "north"], 300]], "the original first-wave directions and stagger are unchanged");
  assert(!wood.mistTimer.paused, "original combat resumes its mist clock");

  wood.startWardPractice();
  const staleArrival = arrivals.shift()!;
  const before = entries.length;
  wood.clearWardPracticeVisual();
  staleArrival.onComplete();
  assertEqual(entries.length, before, "a cleared/re-entered practice cannot register an orphaned arrival target");
  assert(staleArrival.targets.destroyed, "cleanup removes the previous practice actor");
  reduced = true;
  wood.startWardPractice();
  const reducedArrival = arrivals.shift()!;
  assertEqual(reducedArrival.duration, 0, "reduced motion skips the decorative approach");
  reducedArrival.onComplete();
  assertEqual(entries.at(-1)!.word, "ho.wl", "reduced motion keeps the exact north mark and real target");
  wood.clearWardPracticeVisual();
  assertEqual(wood.activeTargets.length, 0, "practice teardown unregisters the reduced-motion target too");
});
