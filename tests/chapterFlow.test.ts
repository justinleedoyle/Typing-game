import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import ts from "typescript";
import type Phaser from "phaser";
import { checkpointIndex, committedWinterChoices, openingStep, readingAction, winterStep } from "../src/game/chapterFlow";
import { ChapterReading } from "../src/game/ui/chapterReading";

assert.equal(readingAction("Enter"), "continue");
assert.equal(readingAction(" "), "continue");
assert.equal(readingAction("Enter", true), "ignore", "held keys cannot skip paragraphs");
assert.equal(readingAction("R"), "replay");
assert.equal(readingAction("Escape"), "pause");
assert.equal(readingAction("k"), "ignore", "typing cannot silently advance a story gate");
assert.equal(checkpointIndex(-4, 3), 0);
assert.equal(checkpointIndex(99, 3), 2);
assert.equal(checkpointIndex(1.5, 3), 0);
assert.equal(checkpointIndex("2", 3), 0);
assert.equal(openingStep("portal-name"), "portal-name");
assert.equal(openingStep("stale-future-scene"), "arrival");
assert.equal(winterStep("boss"), "boss");
assert.equal(winterStep("stale-future-scene"), "arrival");
console.log("chapterFlow: reading input and checkpoint boundaries passed");

const undecided = { fox: null, fork1: null, fork2: null } as const;
assert.deepEqual(committedWinterChoices({}, undecided), {}, "entering a realm must not answer its forks");
const legacy = { fox: "ignored", fork1: "none", fork2: "none", companion: "accepted" };
assert.deepEqual(committedWinterChoices(legacy, undecided), { companion: "accepted" }, "provisional legacy answers clear without losing explicit companion decisions");
assert.deepEqual(legacy, { fox: "ignored", fork1: "none", fork2: "none", companion: "accepted" }, "snapshot selection never mutates the old save");
assert.deepEqual(committedWinterChoices({}, { fox: "ignored", fork1: null, fork2: null }), { fox: "ignored" }, "an explicit refusal is retained");
assert.deepEqual(committedWinterChoices({ fox: "spared", fork1: "huntress", companion: "declined" }, {
  fox: "spared", fork1: "huntress", fork2: "bury",
}), { fox: "spared", fork1: "huntress", fork2: "bury", companion: "declined" }, "progress adds the next decision without undoing the chosen branch");
console.log("chapterFlow: only committed branch choices enter checkpoints");

// Exercise the gate itself with inert display objects. No renderer, timers,
// or scene implementation is copied into this test.
class ReadingDisplay {
  x = 960;
  y = 316;
  width = 700;
  height = 44;
  visible = false;
  destroyed = false;
  text = "";
  setText(text: string) { this.text = text; return this; }
  setDepth() { return this; }
  setOrigin() { return this; }
  setVisible(visible: boolean) { this.visible = visible; return this; }
  setY(y: number) { this.y = y; return this; }
  setFontSize() { return this; }
  clear() { return this; }
  fillStyle() { return this; }
  fillRoundedRect() { return this; }
  lineStyle() { return this; }
  strokeRoundedRect() { return this; }
  destroy() { this.destroyed = true; }
}
const displays: ReadingDisplay[] = [];
const display = () => { const value = new ReadingDisplay(); displays.push(value); return value; };
let listeners = 0;
const clock = { now: 0 };
const readingScene = {
  time: clock,
  scale: { width: 1920 },
  add: { graphics: display, text: display },
  data: { get: () => undefined },
  events: { on: () => { listeners += 1; }, off: () => { listeners -= 1; } },
} as unknown as Phaser.Scene;
const gate = new ChapterReading(readingScene, 316);
let continued = 0;
let replayed = 0;
const key = (value: string, repeat = false, ctrlKey = false) => gate.handleKey({
  key: value, repeat, ctrlKey, metaKey: false, altKey: false, preventDefault() {},
} as KeyboardEvent);
gate.show(() => {
  continued += 1;
  gate.show(() => { continued += 1; }, () => { replayed += 1; });
}, () => { replayed += 1; });
assert.equal(key("Enter"), true);
assert.equal(continued, 0, "the key completing the previous typed beat cannot also skip its response");
clock.now = 200;
assert.equal(key("R"), true);
assert.equal(replayed, 1, "replay repeats the current caption without continuing");
assert.equal(key("Enter", false, true), true);
assert.equal(continued, 0, "browser shortcuts never advance a paragraph");
assert.equal(key("x"), true, "ordinary typing stays out of the gameplay controller while reading");
assert.equal(key("Escape"), false, "Escape reaches the pause handler without discarding the gate");
assert.equal(key("Enter"), true);
assert.equal(continued, 1);
clock.now = 500;
assert.equal(key("Enter", true), true);
assert.equal(continued, 1, "holding Enter cannot skip the next paragraph even after its opening guard expires");
assert.equal(key(" "), true);
assert.equal(continued, 2, "a fresh Space press continues the next paragraph");
assert.equal(key("x"), false, "the final continuation releases ordinary gameplay input");
gate.show(() => { continued += 1; }, null);
assert(!displays.at(-1)!.text.includes("read again"), "credits without replay do not advertise a dead control");
clock.now = 800;
assert.equal(key("R"), true);
assert.equal(continued, 2, "replay never becomes an accidental credit exit");
assert.equal(key("Enter"), true);
assert.equal(continued, 3, "credits retain a deliberate exit");
gate.destroy();
assert.equal(listeners, 0, "shutdown removes the presentation listener");
assert(displays.every((value) => value.destroyed && !value.visible), "shutdown removes the reading UI");
console.log("chapterFlow: actual reading gate protects deliberate progression and replay");

// Run the actual layout method against the photographed cairn/actor geometry.
// The renderer is unnecessary for this label-placement regression.
const winterPath = new URL("../src/scenes/WinterMountainScene.ts", import.meta.url);
const winterSource = ts.createSourceFile(winterPath.pathname, readFileSync(winterPath, "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const winterClass = winterSource.statements.find(ts.isClassDeclaration)!;
const passageMethod = winterClass.members.find((member) => member.name?.getText(winterSource) === "winterPassageWordPosition")!;
const passageCode = ts.transpileModule(`class Harness { ${passageMethod.getText(winterSource)} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const PassageLayout = new Function("Phaser", `${passageCode}; return Harness;`)({
  Math: { Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(value, max)) },
});
const cairn = { scene: true, x: 650, y: 792 };
const winter = new PassageLayout();
Object.assign(winter, { scale: { width: 1920, height: 1080 }, cairnCue: cairn });
for (const word of ["carry the stones", "let him rest here"]) {
  const position = winter.winterPassageWordPosition(cairn, -42, word);
  const generousHalfWidth = word.length * 18 / 2;
  assert(position.x + generousHalfWidth < 880, "the cairn passage stays clear of centered Wren's hood and body");
  assert(position.x - generousHalfWidth > 180, "the full cairn passage remains on screen");
  assert(position.y >= 280 && position.y <= 670, "passage remains in the existing reading lane");
}
const pelt = { scene: true, x: 1270, y: 790 };
winter.peltCue = pelt;
for (const y of [808, 790]) for (const word of ["claim the pelt", "carry it home"]) {
  pelt.y = y;
  const position = winter.winterPassageWordPosition(pelt, -38, word);
  const generousHalfWidth = word.length * 18 / 2;
  assert(position.x - generousHalfWidth > 1040, "the whole pelt passage clears Wren's hood throughout the prop entrance");
  assert(position.x + generousHalfWidth < 1740, "the pelt passage remains inside the clear right reading lane");
  assert(position.y >= 280 && position.y <= 670, "the pelt passage keeps the established reading height");
}
const lantern = { scene: true, x: 1330, y: 790 };
assert.deepEqual(winter.winterPassageWordPosition(lantern, -34, "take the lantern"),
  { x: 1150, y: 654 }, "the firefly/lantern passage keeps its existing placement");
console.log("chapterFlow: actual cairn and pelt passage layouts stay clear of Wren");

// These are the real revisit methods, exercised against the photographed actor
// bounds. In particular Winter's middle "one" and Wood's "remembered" crossed
// the hood despite the ground memory marker being correctly placed.
for (const [sceneName, feetY, passages] of [
  ["WinterMountainScene", 842, [
    ["the", "old", "one", "rests", "now"],
    ["the", "snow", "keeps", "the", "quiet"],
  ]],
  ["HauntedWoodScene", 826, [
    ["the", "remembered", "rest", "now"],
    ["we", "are", "not", "forgotten"],
  ]],
] as const) {
  const path = new URL(`../src/scenes/${sceneName}.ts`, import.meta.url);
  const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const sceneClass = source.statements.find(ts.isClassDeclaration)!;
  const methods = ["revisitMemoryCuePosition", "revisitMemoryWordPosition"].map((name) =>
    sceneClass.members.find((member) => member.name?.getText(source) === name)!.getText(source));
  const code = ts.transpileModule(`class Harness { ${methods.join("\n")} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const Layout = new Function(`${code}; return Harness;`)();
  const layout = new Layout();
  layout.scale = { width: 1920, height: 1080 };
  layout.wrenContainer = { x: 960, y: feetY };
  for (const words of passages) words.forEach((word, index) => {
    const cue = layout.revisitMemoryCuePosition(index, words.length);
    const answer = layout.revisitMemoryWordPosition(index, words.length);
    const halfWidth = word.length * 13;
    const overlapsActorX = answer.x + halfWidth > 895 && answer.x - halfWidth < 1025;
    if (overlapsActorX) assert(answer.y + 28 < feetY - 240,
      `${sceneName} memory ${word} must fit wholly above Wren's hood`);
    assert(answer.x - halfWidth > 180 && answer.x + halfWidth < 1740,
      `${sceneName} memory ${word} stays on screen`);
    assert(answer.y - 28 > 360, `${sceneName} memory ${word} clears the reading caption`);
    assert.equal(answer.x, cue.x, "the answer still points to its actual ground memory");
    if (Math.abs(cue.x - 960) >= 160) assert(answer.y >= 630,
      "outer memories retain their established trail reading lane");
  });
}
console.log("chapterFlow: actual Winter and Wood revisit answers clear Wren and the caption");

// Run the offering entry and passage chain, rather than duplicating its chosen
// side in the test. Removing that choice recreates the photographed hood overlap.
const woodPath = new URL("../src/scenes/HauntedWoodScene.ts", import.meta.url);
const woodSource = ts.createSourceFile(woodPath.pathname, readFileSync(woodPath, "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const woodClass = woodSource.statements.find(ts.isClassDeclaration)!;
const woodMethods = ["startFork1Offering", "runPassageChain", "ownerPassageWordPosition"].map((name) =>
  woodClass.members.find((member) => member.name?.getText(woodSource) === name)!.getText(woodSource));
const woodCode = ts.transpileModule(`class Harness { ${woodMethods.join("\n")} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const OfferingLayout = new Function(`${woodCode}; return Harness;`)();
const offeringScene = new OfferingLayout();
let offeringWord: { word: string; x: number; y: number } | null = null;
Object.assign(offeringScene, {
  scale: { width: 1920, height: 1080 },
  offeringCue: { scene: true, x: 690, y: 792 },
  commitFork: (_fork: string, requested: string) => requested,
  fadeOutForkCue: () => {},
  setNarrator: () => {},
  band: { setObjective: () => {} },
  readThen: (next: () => void) => next(),
  makeWoodForkWord: (_body: unknown, opts: { word: string; x: number; y: number }) => { offeringWord = opts; return opts; },
  registerActiveTarget: () => {},
});
offeringScene.startFork1Offering();
assert(offeringWord, "the actual offering entry creates its remembrance target");
const offeringTarget = offeringWord as { word: string; x: number; y: number };
assert(offeringTarget.x + offeringTarget.word.length * 18 / 2 < 880,
  "the whole remembrance phrase stays clear of centered Wren's hood");
assert(offeringTarget.x - offeringTarget.word.length * 18 / 2 > 180,
  "the phrase stays fully within the existing scene");
assert(offeringTarget.y >= 330 && offeringTarget.y <= 720, "the phrase retains the established reading lane");
console.log("chapterFlow: actual offering entry keeps its remembrance phrase clear of Wren");
