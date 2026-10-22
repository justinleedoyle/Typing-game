import { strict as assert } from "node:assert";
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
