// Logic harness: every narration.say("<id>") in a scene resolves to a real
// Runa line.
//
// NarrationManager.say(id) looks the id up in runaLines.ts and, on a miss,
// renders a literal "[missing line: <id>]" caption — a silent content bug that
// ships fine and only shows up on screen. This test statically scans the REAL
// scene sources for say-call ids (plus the PortalChamber DESK_LINE_IDS map,
// whose values are passed to say() dynamically) and asserts each id exists.
//
// We read the scene files from disk rather than importing them: the scenes
// import Phaser, which needs a browser DOM and can't load under bare tsx. A
// static scan is exactly right here — say() ids are string literals.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { assert, assertEqual, suite } from "./_assert";
import { getRunaLine, RUNA_LINES, type RunaScene } from "../src/audio/runaLines";

const here = dirname(fileURLToPath(import.meta.url));
const scenesDir = join(here, "..", "src", "scenes");

const sceneFiles = readdirSync(scenesDir).filter((f) => f.endsWith(".ts"));

/** Read every scene source once. */
const sources = sceneFiles.map((f) => ({
  file: f,
  text: readFileSync(join(scenesDir, f), "utf8"),
}));

/** Pull `narration.say("ID")` / `.say("ID")` string-literal ids from one source. */
function extractSayIds(text: string): string[] {
  const ids: string[] = [];
  const re = /\.say\(\s*"([^"]+)"\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) ids.push(m[1]);
  return ids;
}

/** Pull any double-quoted token shaped like a Runa id (scene-prefixed) from a
 *  source. This catches ids that reach say() indirectly — e.g. the
 *  PortalChamber DESK_LINE_IDS map values, which are passed via
 *  say(DESK_LINE_IDS[...]). The scene-prefix shape makes false positives
 *  essentially impossible (no unrelated string starts with these prefixes). */
const ID_PREFIXES: readonly RunaScene[] = [
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
function extractIdShapedTokens(text: string): string[] {
  const ids: string[] = [];
  const re = /"((?:title|opening|hub|winter|sunken|forge|sky|wood|ambient|finale)_[a-z0-9_]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) ids.push(m[1]);
  return ids;
}

await suite("sayResolution: scene sources were found to scan", () => {
  assert(sceneFiles.length > 0, `no scene .ts files found in ${scenesDir}`);
  // The scenes we expect to drive narration must be present (guards against a
  // moved/renamed directory silently making this test a no-op).
  const names = sceneFiles.join(",");
  for (const expected of [
    "OpeningScene.ts",
    "PortalChamberScene.ts",
    "WinterMountainScene.ts",
    "SunkenBellScene.ts",
    "GreatBattleScene.ts",
  ]) {
    assert(names.includes(expected), `expected scene ${expected} not found among: ${names}`);
  }
});

await suite("sayResolution: every narration.say(\"id\") resolves to a real Runa line", () => {
  let totalSayCalls = 0;
  const unresolved: string[] = [];
  for (const { file, text } of sources) {
    for (const id of extractSayIds(text)) {
      totalSayCalls += 1;
      if (getRunaLine(id) === undefined) unresolved.push(`${file}: ${id}`);
    }
  }
  // There really are say() literals to check (catches a regex/path regression).
  assert(totalSayCalls >= 50, `expected many say() ids across scenes, found ${totalSayCalls}`);
  assertEqual(
    unresolved,
    [],
    `narration.say() references id(s) with NO matching Runa line (would render "[missing line: …]"):\n  ${unresolved.join("\n  ")}`,
  );
});

await suite("sayResolution: every id-shaped token referenced in a scene exists", () => {
  // Broader net: any "scene_*"-shaped string literal anywhere in a scene
  // (say() args, DESK_LINE_IDS values, etc.) must resolve. This is what catches
  // the indirect say(DESK_LINE_IDS[...]) ids in PortalChamberScene.
  const known = new Set(RUNA_LINES.map((l) => l.id));
  const unresolved = new Set<string>();
  let totalTokens = 0;
  for (const { file, text } of sources) {
    for (const id of extractIdShapedTokens(text)) {
      totalTokens += 1;
      if (!known.has(id)) unresolved.add(`${file}: ${id}`);
    }
  }
  assert(totalTokens >= 50, `expected many id-shaped tokens, found ${totalTokens}`);
  assertEqual(
    [...unresolved],
    [],
    `scene references id-shaped token(s) with NO matching Runa line:\n  ${[...unresolved].join("\n  ")}`,
  );
  // Confirm the prefix list we scan for matches the scenes the catalogue uses.
  for (const p of ID_PREFIXES) {
    assert(
      RUNA_LINES.some((l) => l.scene === p),
      `prefix "${p}" has no lines in the catalogue — prefix list is stale`,
    );
  }
});

await suite("sayResolution: the PortalChamber desk-line ids all resolve", () => {
  // Explicit belt-and-suspenders on the one dynamic dispatch we know about:
  // PortalChamberScene.DESK_LINE_IDS maps last-cleared-realm → hub_desk_* id,
  // then calls say() with the looked-up value. Assert each mapped value exists.
  const portal = sources.find((s) => s.file === "PortalChamberScene.ts");
  assert(portal !== undefined, "PortalChamberScene.ts not found");
  const deskIds = extractIdShapedTokens(portal!.text).filter((id) => id.startsWith("hub_desk_"));
  assert(deskIds.length >= 6, `expected >=6 hub_desk_* ids in PortalChamber, found ${deskIds.length}`);
  for (const id of deskIds) {
    assert(getRunaLine(id) !== undefined, `DESK_LINE_IDS value "${id}" has no Runa line`);
  }
});
