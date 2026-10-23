import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";

const url = new URL("../src/scenes/SkyIslandScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const method = owner.members.find(value => value.name?.getText(source) === "startRevisit")!;
const code = ts.transpileModule(`class Sky { ${method.getText(source)} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const Sky = new Function("playPortalArrivalWake", `${code}; return Sky;`)(() => {});

await suite("Sky revisit: each saved ending keeps its island outcome and leaves progress unchanged", () => {
  for (const fork2 of ["answer-kindly", "cut-tether"] as const) {
    const state = Object.freeze({
      realms: Object.freeze({ "sky-island": Object.freeze({ cleared: true, choices: Object.freeze({ fork2 }) }) }),
      satchel: Object.freeze(fork2 === "answer-kindly" ? ["wind-phrase"] : ["tether-cord", "untethered-wind"]),
    });
    const before = JSON.stringify(state);
    const s = new Sky();
    let caption = "";
    let objective = "";
    const gates: Array<() => void> = [];
    const memories: string[][] = [];
    Object.assign(s, {
      wrenContainer: {}, store: { get: () => state },
      setNarrator: (line: string) => { caption = line; },
      band: { setObjective: (line: string) => { objective = line; } },
      readThen: (next: () => void) => gates.push(next),
      deliverRevisitPassage: (words: string[]) => memories.push(words),
    });
    s.startRevisit();
    if (fork2 === "answer-kindly") {
      assert(caption.includes("lit summit"), "kind answer recalls an intact, lit island");
      assert(!caption.includes("where the island was"), "kind answer cannot imply the island disappeared");
    } else {
      assert(caption.includes("island is higher"), "cut tether keeps its distinct open-sky outcome");
    }
    assertEqual(gates.length, 1, "revisit caption remains held for deliberate reading");
    assertEqual(memories.length, 0, "the memory does not start before Continue");
    gates[0]();
    assertEqual(memories, [fork2 === "answer-kindly" ? ["the", "lanterns", "hold", "the", "dark"]
      : ["the", "sky", "is", "wide", "and", "open"]], "existing typed memory words and route stay unchanged");
    assert(objective.includes("bell memory") === false && objective.includes("sky memory"), "revisit retains its Sky return task");
    assertEqual(JSON.stringify(state), before, "revisiting cannot change the saved choice, rewards, or completion");
  }
});
