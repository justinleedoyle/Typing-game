import { readFileSync } from "node:fs";
import ts from "typescript";
import { woodSoundscapeMood } from "../src/audio/woodSoundscape";
import { WOOD_STEPS } from "../src/game/woodCheckpoint";
import { assert, assertEqual, suite } from "./_assert";

await suite("Wood soundscape: saved future branches cannot change the earlier path or unfinished flute", () => {
  assertEqual(woodSoundscapeMood(), "wood-path", "fresh arrival begins with the open forest palette");
  for (const first of [undefined, "offering", "bone-flute", "unknown"]) {
    for (const second of [undefined, "bargain", "force", "unknown"]) {
      assertEqual(woodSoundscapeMood("arrival", first, second), "wood-path", "later branches cannot change arrival");
      assertEqual(woodSoundscapeMood("path", first, second, { index: 0 }), "wood-path", "the first uncompleted root step keeps the exploration mix");
      for (const step of ["inga", "ward", "fork1", "flute", "offering"]) {
        assertEqual(woodSoundscapeMood(step, first, second), "wood-hush", "a future theft/fire record cannot claim a completed physical action here");
      }
    }
  }
  for (const index of [undefined, null, "1", -1, .5, NaN, Infinity]) {
    assertEqual(woodSoundscapeMood("flute", "bone-flute", "force", { index, response: true }), "wood-hush", "unsupported completion evidence cannot make the forest restless");
  }
  assertEqual(woodSoundscapeMood("future-stage", "bone-flute", "force"), "wood-path", "unknown histories never invent completed fire or flute actions");
});

await suite("Wood soundscape: taking the silent flute changes the forest only at actual second-phrase completion", () => {
  for (const [data, expected] of [
    [{ index: 0 }, "wood-hush"], [{ index: 0, response: true }, "wood-hush"],
    [{ index: 1, response: false }, "wood-hush"], [{ index: 1, response: true }, "wood-restless"],
    [{ index: 2 }, "wood-restless"],
  ] as const) {
    assertEqual(woodSoundscapeMood("flute", "bone-flute", null, data), expected, "reaching into the hollow is distinct from taking the flute");
  }
  for (const first of [undefined, "offering", "unknown"]) {
    assertEqual(woodSoundscapeMood("flute", first, null, { index: 1, response: true }), "wood-hush", "a passage-shaped value cannot override the recognized story choice");
  }
  for (const step of ["flute-reward", "act3", "fork2", "bargain", "bargain-reward", "final1", "final2"]) {
    assertEqual(woodSoundscapeMood(step, "bone-flute", "bargain"), "wood-restless", "later quiet stages retain the known theft consequence");
  }
});

await suite("Wood soundscape: fire, fights and sealed aftermath retain distinct story boundaries", () => {
  assertEqual(woodSoundscapeMood("fork2", "offering", "force"), "wood-hush", "a selected fire route does not ignite the displayed undecided fork");
  assertEqual(woodSoundscapeMood("force", "offering", "force"), "wood-ash", "the force checkpoint records the completed grove-lighting action");
  for (const step of ["crossroads1", "crossroads2", "crossroads3", "boss-intro", "boss-a", "boss-b"]) {
    assertEqual(woodSoundscapeMood(step, "bone-flute", "force"), "wood-threat", "directional marks and original fight feedback remain in the foreground");
  }
  for (const step of ["boss-a-cleared", "boss-b-cleared", "capstone", "capstone-answer", "final-intro", "final1", "final2"]) {
    assertEqual(woodSoundscapeMood(step, "bone-flute", "force"), "wood-ash", "the grove's actual fire consequence returns outside moving-enemy pressure");
  }
  for (const step of ["sealed", "cat-gate", "cat-answer", "ending"]) {
    assertEqual(woodSoundscapeMood(step, "bone-flute", "force"), "wood-rest-ash", "a sealed force ending retains spent fire rather than resetting the forest");
    for (const second of [undefined, "bargain", "unknown"]) {
      assertEqual(woodSoundscapeMood(step, "bone-flute", second), "wood-rest", "unknown second choices receive neutral aftermath without inventing fire");
    }
  }
  const moods = ["wood-path", "wood-hush", "wood-restless", "wood-ash", "wood-threat", "wood-rest", "wood-rest-ash"];
  for (const step of WOOD_STEPS) assert(moods.includes(woodSoundscapeMood(step)), `${step} always stays within the Wood's owned palette`);
});

await suite("Wood soundscape: real layer configuration leaves feedback clear and retains compatible source identities", () => {
  const source = ts.createSourceFile("soundscapes.ts", readFileSync(new URL("../src/audio/soundscapes.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const declarations = source.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]);
  const loop = declarations.find(node => node.name.getText(source) === "loop")!;
  const moods = declarations.find(node => node.name.getText(source) === "moods")!.initializer as ts.ObjectLiteralExpression;
  const selected = moods.properties.filter(node => ts.isPropertyAssignment(node) && node.name.getText(source).replaceAll('"', '').startsWith("wood-"));
  const code = ts.transpileModule(`const ${loop.getText(source)}; const moods = { ${selected.map(node => node.getText(source)).join(",")} };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const table = new Function("woodTheme", "woodClearTheme", "woodAir", "woodLeaves", `${code}; return moods;`)("theme", "clear", "air", "leaves") as Record<string, { id: string; url: string; gain: number }[]>;
  const gain = (mood: string, id: string) => table[mood]!.find(layer => layer.id === id)?.gain ?? 0;
  assertEqual(table["wood-threat"]!.map(layer => layer.id), ["wood-theme", "wood-air"], "threat passages omit leaf contacts that could compete with ward-mark feedback");
  assert(gain("wood-threat", "wood-theme") < gain("wood-hush", "wood-theme"), "active combat lowers the music beneath quiet reading");
  assert(gain("wood-restless", "wood-air") > gain("wood-hush", "wood-air"), "taking the silent flute changes environmental movement instead of adding a flute melody");
  assertEqual(table["wood-rest"]![0]!.id, "wood-clear-theme", "sealing the realm changes the score to its warmer aftermath recording");
  assert(gain("wood-rest-ash", "wood-theme") === 0 && gain("wood-rest-ash", "wood-clear-theme") < gain("wood-rest", "wood-clear-theme"), "spent fire keeps a subdued aftermath and cannot restart the old threat score");
  for (const layers of Object.values(table)) {
    assertEqual(new Set(layers.map(layer => layer.id)).size, layers.length, "a mood cannot duplicate a playing source identity");
    assert(layers.every(layer => Number.isFinite(layer.gain) && layer.gain > 0 && layer.gain <= 1), "all authored levels have finite bounded gains");
    assert(layers.some(layer => layer.id === "wood-air" && layer.url === "air"), "air retains its identity and playhead across compatible mood changes");
  }
});
