import { strict as assert } from "node:assert";
import { checkpointIndex, committedWinterChoices, openingStep, readingAction, winterStep } from "../src/game/chapterFlow";

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
