import { readFileSync } from "node:fs";
import ts from "typescript";
import { resolveRealmFork } from "../src/game/realmChoices";
import { assert, assertEqual, suite } from "./_assert";

const url = new URL("../src/scenes/ClockworkForgeScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const method = owner.members.find(value => value.name?.getText(source) === "startRevisit")!;
const code = ts.transpileModule(`class Forge { ${method.getText(source)} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const Forge = new Function("playPortalArrivalWake", "resolveRealmFork", "PALETTE_HEX",
  `${code}; return Forge;`)(() => {}, resolveRealmFork, { ember: 0 });

function revisit(choices: Readonly<Record<string, string>>, satchel: readonly string[] = []) {
  const state = Object.freeze({
    realms: Object.freeze({ "clockwork-forge": Object.freeze({ cleared: true, choices: Object.freeze({ ...choices }) }) }),
    satchel: Object.freeze([...satchel]),
  });
  const before = JSON.stringify(state);
  const forge = new Forge();
  let caption = "";
  let objective = "";
  const gates: Array<() => void> = [];
  const memories: string[][] = [];
  Object.assign(forge, {
    wrenContainer: {}, store: { get: () => state },
    setNarrator: (line: string) => { caption = line; },
    band: { setObjective: (line: string) => { objective = line; } },
    readThen: (next: () => void) => gates.push(next),
    deliverRevisitPassage: (words: string[]) => memories.push(words),
  });
  forge.startRevisit();
  assertEqual(gates.length, 1, "the return memory stays behind one deliberate reading gate");
  assertEqual(memories.length, 0, "no memory word is typed before Continue");
  assert(objective.includes("forge memory"), "the return task names this realm");
  gates[0]!();
  assertEqual(memories.length, 1, "Continue starts the memory once");
  assertEqual(JSON.stringify(state), before, "reviewing an ending never rewrites decisions, inventory or completion");
  return { caption, words: memories[0]! };
}

await suite("Forge revisit: all four saved routes remember the chosen workers and final golems", () => {
  for (const fork1 of ["forn", "cabal"]) for (const fork2 of ["peaceful", "fought"]) {
    const { caption, words } = revisit({ fork1, fork2 });
    if (fork1 === "forn") {
      assert(caption.includes("repaired bellows"), "repairing the bellows remains part of the return");
      assert(!caption.includes("apprentices"), "a repaired-bellows return cannot claim the apprentices' valve choice");
    } else {
      assert(caption.includes("apprentices") && caption.includes("furnace low"), "the apprentices' slower furnace persists");
      assert(!caption.includes("Forn") && !caption.includes("repaired bellows"), "joining the apprentices never claims Forn's repair");
    }
    assertEqual(caption.includes("Golem Heart"), fork2 === "fought", "only direct combat recalls taking the heart");
    assertEqual(/golems (?:still )?rest/.test(caption), fork2 === "peaceful", "only the peaceful order leaves the last golems resting");
    assertEqual(words, fork2 === "peaceful" ? ["iron", "holds", "the", "heat"]
      : ["gears", "turn", "without", "orders"], "the existing typed memory and return path are preserved");
  }
});

await suite("Forge revisit: explicit forks outrank stale endings and inventory; legacy endings still work", () => {
  for (const fork1 of ["forn", "cabal"]) for (const fork2 of ["peaceful", "fought"]) {
    const expected = revisit({ fork1, fork2 });
    assertEqual(revisit({ ending: `${fork1}-${fork2}` }), expected, "historical combined endings retain the same truthful memory");
    const opposite1 = fork1 === "forn" ? "cabal" : "forn";
    const opposite2 = fork2 === "peaceful" ? "fought" : "peaceful";
    const staleSatchel = [opposite1 === "forn" ? "bellows-hammer" : "sabotage-wrench",
      opposite2 === "peaceful" ? "master-key" : "golem-heart"];
    assertEqual(revisit({ fork1, fork2, ending: `${opposite1}-${opposite2}` }, staleSatchel), expected,
      "the recorded forks win over both an old combined ending and opposite keepsakes");
  }
});

await suite("Forge revisit: incomplete legacy records stay bounded rather than inventing a route", () => {
  const unrecorded = revisit({});
  assert(!/Forn|apprentices|repaired|Golem Heart|golems rest/.test(unrecorded.caption), "no record cannot manufacture workers or an aftermath");
  assertEqual(revisit({ ending: "not-a-real-ending" }), unrecorded, "unknown historical text does not imply a branch");
  const firstOnly = revisit({ fork1: "cabal" });
  assert(firstOnly.caption.includes("apprentices") && !/Golem Heart|golems rest/.test(firstOnly.caption), "a known worker choice does not manufacture the final golem choice");
  const finalOnly = revisit({ fork2: "peaceful" });
  assert(finalOnly.caption.includes("lowered arms") && !/Forn|apprentices|repaired/.test(finalOnly.caption), "a known final order does not manufacture the worker choice");
  assertEqual(revisit({}, ["bellows-hammer", "sabotage-wrench", "master-key", "golem-heart"]), unrecorded,
    "contradictory legacy rewards do not choose a history");
});
