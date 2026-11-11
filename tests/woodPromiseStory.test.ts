import { readFileSync } from "node:fs";
import ts from "typescript";
import { emptySave } from "../src/game/saveState";
import { ALMANAC_LORE_PAGES } from "../src/game/almanacLorePages";
import { realmPathSummary } from "../src/game/realmLore";
import { assert, assertEqual, suite } from "./_assert";

const url = new URL("../src/scenes/HauntedWoodScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const methods = ["finishFlute", "finishIngaName"].map(name =>
  owner.members.find(value => value.name?.getText(source) === name)!.getText(source));
const code = ts.transpileModule(`class Wood { ${methods.join("\n")} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const Wood = new Function("playChime", `${code}; return Wood;`)(() => {});

await suite("Wood story: taking the flute acknowledges the unfulfilled name promise without inventing a rescue", () => {
  const state = emptySave();
  state.typewriterAwakened = true;
  state.realms["haunted-wood"] = { cleared: false, choices: { fork1: "bone-flute" } };
  state.almanacLore.push("the-crossroads-ghost");
  const wood = new Wood();
  let caption = "";
  let objective = "";
  let nextAct = 0;
  let clearedHand = 0;
  const gates: Array<() => void> = [];
  Object.assign(wood, {
    store: { get: () => state, update: (update: (state: ReturnType<typeof emptySave>) => void) => update(state) },
    checkpoint() {}, fadeOutForkCue() {}, boneFluteCue: {},
    setNarrator: (line: string) => { caption = line; },
    band: { setObjective: (line: string) => { objective = line; } },
    readThen: (next: () => void) => gates.push(next),
    clearHeldWoodRelic: () => { clearedHand++; },
    startAct3: () => { nextAct++; },
  });
  wood.finishFlute();
  assert(caption.includes("Restless whispers") && caption.includes("name unfound"), "the flute's consequence includes the still-open promise");
  assert(caption.includes("lost ghost") && !caption.includes("Inga"), "the unchosen offering route cannot reveal her name");
  assertEqual(state.satchel, ["bone-flute"], "the existing reward is unchanged");
  assertEqual(state.almanacLore, ["the-crossroads-ghost"], "taking the flute never earns Inga's name page");
  assertEqual([nextAct, clearedHand, gates.length], [0, 0, 1], "the consequence stays visible before deliberate Continue");
  assert(objective.includes("Bone-Flute collected"), "the task still confirms the collected item");
  gates[0]!();
  assertEqual([nextAct, clearedHand], [1, 1], "Continue clears the hand and takes the original route forward");
  const summary = realmPathSummary("haunted-wood", state.realms["haunted-wood"].choices);
  assert(summary.primary.includes("name remained unfound") && !summary.primary.includes("Inga"), "the Almanac records the same unresolved outcome without giving away a name");
});

await suite("Wood story: returning the remembered name still earns its page and keeps the final seal bounded", () => {
  const state = emptySave();
  const wood = new Wood();
  let caption = "";
  let speaker: string | undefined;
  const gates: Array<() => void> = [];
  Object.assign(wood, {
    store: { update: (update: (state: ReturnType<typeof emptySave>) => void) => update(state) },
    checkpoint() {}, attendInga() {}, startAct3() {},
    setNarrator: (line: string, who?: string) => { caption = line; speaker = who; },
    band: { setObjective() {} }, readThen: (next: () => void) => gates.push(next),
  });
  wood.finishIngaName();
  assertEqual(state.almanacLore, ["ingas-name"], "the named rescue retains its page");
  assertEqual(speaker, "Inga", "only the earned name response identifies her");
  assert(!caption.includes("unfound"), "the completed promise cannot be described as unresolved");
  assertEqual(gates.length, 1, "the remembered name response remains held for reading");
  const seal = ALMANAC_LORE_PAGES["the-wood-true-name"]!.body;
  assert(seal.includes("we are remembered. we are quiet. but we are not silent."), "the canonical typed seal stays exact");
  assert(!seal.includes("the ghosts walked at last") && !seal.includes("Inga"), "the shared ending does not invent every ghost's departure or a branch-specific rescue");
});
