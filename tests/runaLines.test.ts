// Logic harness: Voiced-Runa line catalogue (src/audio/runaLines.ts).
//
// Why this matters: every line `id` doubles as an audio filename
// (`runa_${id}.mp3`) AND as the NarrationManager lookup key. A duplicate id is
// invisible today (captions still render) but later silently maps two captions
// onto one voice file — one of them will never play. This test makes a dup a
// hard build failure NOW, while ids are cheap to fix.

import { assert, assertEqual, suite } from "./_assert";
import {
  RUNA_LINES,
  getRunaLine,
  getRunaLinesForScene,
  pickLowHeartLine,
  type RunaScene,
} from "../src/audio/runaLines";

const ALL_SCENES: readonly RunaScene[] = [
  "title",
  "opening",
  "hub",
  "winter",
  "sunken",
  "forge",
  "sky",
  "wood",
  "ambient",
  "finale",
];

await suite("runaLines: every line id is globally unique", () => {
  const seen = new Map<string, number>();
  for (const line of RUNA_LINES) {
    seen.set(line.id, (seen.get(line.id) ?? 0) + 1);
  }
  const dups = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  assertEqual(
    dups,
    [],
    `duplicate Runa line id(s) — each id becomes runa_<id>.mp3, so a dup silently breaks voice playback later: ${dups.join(", ")}`,
  );
  // Cross-check: unique-id count equals total line count.
  assertEqual(seen.size, RUNA_LINES.length, "unique id count must equal RUNA_LINES.length");
  // Sanity: the catalogue is non-trivial (guards against an accidental empty export).
  assert(RUNA_LINES.length >= 80, `expected a substantial catalogue, got ${RUNA_LINES.length}`);
});

await suite("runaLines: every line has the structural fields it needs", () => {
  for (const line of RUNA_LINES) {
    assert(typeof line.id === "string" && line.id.length > 0, `line missing id: ${JSON.stringify(line)}`);
    assert(
      typeof line.text === "string" && line.text.trim().length > 0,
      `line ${line.id} has empty text (would generate a silent/blank caption)`,
    );
    assert(typeof line.scene === "string" && line.scene.length > 0, `line ${line.id} missing scene`);
    assert(typeof line.tone === "string" && line.tone.length > 0, `line ${line.id} missing tone`);
    // ids are audio filenames — keep them filesystem-safe (no spaces/slashes/dots).
    assert(
      /^[a-z0-9_]+$/.test(line.id),
      `line id "${line.id}" is not filename-safe (expected /^[a-z0-9_]+$/ — becomes runa_<id>.mp3)`,
    );
  }
});

await suite("runaLines: getRunaLine resolves known ids and falls back gracefully", () => {
  // Known id round-trips to the same object.
  const first = RUNA_LINES[0];
  const got = getRunaLine(first.id);
  assert(got !== undefined, "getRunaLine should resolve a known id");
  assertEqual(got!.id, first.id, "getRunaLine returned the wrong line");

  // Unknown ids return undefined (NOT a throw) so NarrationManager.say() can
  // degrade to its "[missing line: …]" caption instead of crashing the scene.
  assertEqual(
    getRunaLine("___definitely_not_a_real_id___"),
    undefined,
    "unknown id must return undefined (graceful fallback contract)",
  );
  assertEqual(getRunaLine(""), undefined, "empty id must return undefined");
});

await suite("runaLines: each scene's line array is non-empty with unique ids", () => {
  for (const scene of ALL_SCENES) {
    const lines = getRunaLinesForScene(scene);
    assert(lines.length > 0, `scene "${scene}" has no Runa lines`);
    const ids = lines.map((l) => l.id);
    assertEqual(new Set(ids).size, ids.length, `scene "${scene}" has duplicate ids: ${ids.join(", ")}`);
    // Every line really belongs to the scene it was filtered by.
    for (const l of lines) {
      assertEqual(l.scene, scene, `line ${l.id} filtered into wrong scene`);
    }
  }
  // Every line belongs to one of the declared scenes (no orphan scene tag).
  for (const line of RUNA_LINES) {
    assert(
      (ALL_SCENES as readonly string[]).includes(line.scene),
      `line ${line.id} has an unknown scene "${line.scene}"`,
    );
  }
});

await suite("runaLines: pickLowHeartLine returns a real ambient low-heart line", () => {
  for (let i = 0; i < 50; i++) {
    const line = pickLowHeartLine();
    assert(line !== undefined, "pickLowHeartLine must return a line");
    assert(
      line.id.startsWith("ambient_low_heart_"),
      `pickLowHeartLine returned an off-pool line: ${line.id}`,
    );
    assertEqual(line.scene, "ambient", "low-heart line must be in the ambient scene");
    // And it must be a real catalogue entry (resolvable by id).
    assert(getRunaLine(line.id) !== undefined, `pickLowHeartLine returned an unknown id: ${line.id}`);
  }
});
