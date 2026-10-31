import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";
import { rememberRealmFork, resolveRealmFork } from "../src/game/realmChoices";
import type { SaveState } from "../src/game/saveState";
import { getRunaLine } from "../src/audio/runaLines";

/** Execute the scene methods themselves without constructing Phaser's renderer. */
function sceneMethods(file: string, className: string, names: string[], bindings: Record<string, unknown>): any {
  const url = new URL(`../src/scenes/${file}.ts`, import.meta.url);
  const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
  const owner = source.statements.find(ts.isClassDeclaration)!;
  const methods = names.map(name => owner.members.find(value => value.name?.getText(source) === name)!.getText(source));
  const code = ts.transpileModule(`class ${className} { ${methods.join("\n")} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(bindings), `${code}; return ${className};`)(...Object.values(bindings));
}

const noArrivalWake = () => {};
const Winter = sceneMethods("WinterMountainScene", "Winter", ["startRevisit"], {
  playPortalArrivalWake: noArrivalWake, PALETTE_HEX: { frost: 0 },
});
const Bell = sceneMethods("SunkenBellScene", "Bell", ["startRevisit", "startEnding"], {
  playPortalArrivalWake: noArrivalWake, BELL_BURST_COLOR: 0, resolveRealmFork, rememberRealmFork,
});
const hubUrl = new URL("../src/scenes/PortalChamberScene.ts", import.meta.url);
const hubSource = ts.createSourceFile(hubUrl.pathname, readFileSync(hubUrl, "utf8"), ts.ScriptTarget.Latest, true);
const hubConstants = hubSource.statements.filter(ts.isVariableStatement)
  .flatMap(statement => statement.declarationList.declarations)
  .filter(declaration => ["ARCHES", "REALM_SEQUENCE", "DESK_LINE_IDS"].includes(declaration.name.getText(hubSource)))
  .map(declaration => `const ${declaration.getText(hubSource)};`).join("\n");
const hubValues = new Function(ts.transpileModule(`${hubConstants}\nreturn { REALM_SEQUENCE, DESK_LINE_IDS };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText)();
const Hub = sceneMethods("PortalChamberScene", "Hub", ["deskReflectionLineId", "registerDeskZoneTargets"], {
  resolveRealmFork, ...hubValues,
});

function frozenStory(realm: string, choices: Record<string, string>, satchel: string[] = []) {
  return Object.freeze({
    realms: Object.freeze({ [realm]: Object.freeze({ cleared: true, choices: Object.freeze(choices) }) }),
    satchel: Object.freeze(satchel),
  });
}

function startMemory(Scene: any, state: unknown) {
  const before = JSON.stringify(state);
  const scene = new Scene();
  let caption = "";
  let objective = "";
  const gates: Array<() => void> = [];
  const memories: string[][] = [];
  Object.assign(scene, {
    wrenContainer: {}, store: { get: () => state },
    setNarrator: (line: string) => { caption = line; },
    band: { setObjective: (line: string) => { objective = line; } },
    readThen: (next: () => void) => gates.push(next),
    deliverRevisitPassage: (words: string[]) => memories.push(words),
    time: { delayedCall: () => { throw new Error("A revisit cannot advance its reading on a timer"); } },
  });
  scene.startRevisit();
  assertEqual(gates.length, 1, "revisit holds one deliberate Continue gate");
  assertEqual(memories, [], "memory typing waits for Continue");
  gates[0]!();
  assertEqual(memories.length, 1, "Continue starts the memory once");
  assertEqual(JSON.stringify(state), before, "revisit does not rewrite saved choices, rewards or completion");
  return { caption, objective, words: memories[0]! };
}

await suite("Winter branches: both aftermath memories wait for deliberate reading and preserve saved outcomes", () => {
  for (const fork2 of ["bury", "pelt", "unknown"]) {
    const story = startMemory(Winter, frozenStory("winter-mountain", { fork2 }));
    assert(story.objective.includes("mountain memory"), "return task still identifies the mountain memory");
    if (fork2 === "bury") {
      assert(story.caption.includes("cairn"), "burial recalls the cairn");
      assertEqual(story.words, ["the", "snow", "keeps", "the", "quiet"], "burial memory stays unchanged");
    } else if (fork2 === "pelt") {
      assert(story.caption.includes("weight you carried"), "pelt recalls the carried weight");
      assert(!story.caption.includes("cairn"), "pelt cannot invent a burial");
      assertEqual(story.words, ["the", "old", "one", "rests", "now"], "pelt memory stays unchanged");
    } else {
      assert(!story.caption.includes("cairn"), "unknown outcome cannot invent a burial");
      assertEqual(story.words, ["cold,", "and", "still,", "and", "clean"], "unknown outcome keeps its neutral memory");
    }
  }
});

await suite("Bell branches: revisits honor canonical and legacy choices before contradictory carried relics", () => {
  for (const sample of [
    { fork2: "free-aurland", satchel: ["bells-tongue"], king: true },
    { fork2: "free-king", satchel: ["bells-tongue"], king: true },
    { fork2: "claim-tongue", satchel: ["king-aurland", "trident-token"], king: false },
  ]) {
    const story = startMemory(Bell, frozenStory("sunken-bell", { fork2: sample.fork2 }, sample.satchel));
    assert(story.objective.includes("bell memory"), "revisit still identifies the bell return task");
    assertEqual(story.caption.includes("King Aurland"), sample.king, "saved branch controls King Aurland's return memory");
    assertEqual(story.caption.includes("bell is silent"), !sample.king, "tongue branch alone recalls permanent silence");
    assertEqual(story.words, sample.king ? ["the", "deep", "is", "listening"] : ["silence", "holds", "its", "shape"], "memory follows the chosen branch");
  }
});

await suite("Bell branches: unambiguous old rewards recover a memory while conflicting or absent history stays neutral", () => {
  for (const sample of [
    { satchel: ["trident-token"], king: true },
    { satchel: ["king-aurland", "trident-token"], king: true },
    { satchel: ["bells-tongue"], king: false },
    { satchel: ["trident-token", "bells-tongue"], king: null },
    { satchel: [], king: null },
  ]) {
    const story = startMemory(Bell, frozenStory("sunken-bell", {}, sample.satchel));
    assertEqual(story.caption.includes("King Aurland"), sample.king === true, "only unambiguous king history names Aurland");
    assertEqual(story.caption.includes("bell is silent"), sample.king === false, "only unambiguous tongue history names permanent silence");
    if (sample.king === null) assertEqual(story.words, ["the", "bell", "remembers", "still"], "unknown history has a neutral memory");
  }
});

await suite("Bell branches: completion records either fate without promising to restore the removed bell tongue", () => {
  for (const fork2 of ["free-aurland", "free-king", "claim-tongue"]) {
    const state = {
      realms: { "sunken-bell": { cleared: false, choices: { fork1: "force", fork2, unrelated: "preserved" } } },
      satchel: fork2 === "claim-tongue" ? ["lock-bar", "bells-tongue"] : ["lock-bar", "king-aurland", "trident-token"],
      checkpoint: { scene: "SunkenBellScene", step: "ending" },
    } as unknown as SaveState;
    const beforeSatchel = JSON.stringify(state.satchel);
    const beforeChoices = JSON.stringify(state.realms["sunken-bell"]!.choices);
    const objectives: string[] = [];
    const gates: Array<() => void> = [];
    let stamp: (() => void) | undefined;
    const scene = new Bell();
    Object.assign(scene, {
      revisit: false, fork1Choice: "force", fork2Choice: fork2 === "free-king" ? "free-aurland" : fork2,
      store: { get: () => state, update: (update: (draft: SaveState) => void) => update(state) },
      setStoryObjective: (line: string) => objectives.push(line), setNarrator: () => {},
      showAlmanacStamp: (next: () => void) => { stamp = next; }, readThen: (next: () => void) => gates.push(next),
    });
    scene.startEnding();
    assertEqual(state.realms["sunken-bell"]!.cleared, true, "either ending still completes the realm");
    assertEqual(state.checkpoint, null, "completion clears only the unfinished chapter checkpoint");
    assertEqual(JSON.stringify(state.realms["sunken-bell"]!.choices), beforeChoices, "completion preserves recorded choices and aliases");
    assertEqual(JSON.stringify(state.satchel), beforeSatchel, "wording does not alter earned inventory");
    assert(stamp !== undefined, "completion still shows its earned Almanac stamp");
    stamp!();
    assertEqual(objectives.length, 2, "recording and return instructions remain present");
    assert(objectives.every(line => !/restor/i.test(line)), "neither completion card claims the bell was physically restored");
    assert(objectives[0]!.includes("records") && objectives[1]!.includes("remembered"), "completion describes the recorded journey");
    assertEqual(gates.length, 1, "return still waits for deliberate Continue");
  }
});

await suite("Hub branches: desk reflections follow explicit and legacy decisions before stale opposite rewards", () => {
  for (const sample of [
    { realm: "sunken-bell", choices: { fork2: "free-aurland" }, satchel: ["bells-tongue"], id: "hub_desk_sunken_freed", phrase: "Aurland is free" },
    { realm: "sunken-bell", choices: { fork2: "free-king" }, satchel: ["bells-tongue"], id: "hub_desk_sunken_freed", phrase: "Aurland is free" },
    { realm: "sunken-bell", choices: { fork2: "claim-tongue" }, satchel: ["trident-token"], id: "hub_desk_sunken", phrase: "absence" },
    { realm: "clockwork-forge", choices: { fork1: "forn" }, satchel: ["sabotage-wrench"], id: "hub_desk_forge", phrase: "Forn" },
    { realm: "clockwork-forge", choices: { fork1: "cabal" }, satchel: ["bellows-hammer"], id: "hub_desk_forge_cabal", phrase: "apprentices" },
    { realm: "clockwork-forge", choices: { ending: "cabal-fought" }, satchel: ["bellows-hammer"], id: "hub_desk_forge_cabal", phrase: "apprentices" },
    { realm: "clockwork-forge", choices: { ending: "forn-peaceful" }, satchel: ["sabotage-wrench"], id: "hub_desk_forge", phrase: "Forn" },
    { realm: "sky-island", choices: { fork1: "steal-flame", fork2: "answer-kindly" }, satchel: ["tether-cord"], id: "hub_desk_sky_kind", phrase: "Scholar-Spirit" },
    { realm: "sky-island", choices: { fork1: "help-etta", fork2: "cut-tether" }, satchel: ["wind-phrase"], id: "hub_desk_sky_untethered", phrase: "loosened the tether" },
  ]) {
    const state = frozenStory(sample.realm, sample.choices as Record<string, string>, sample.satchel);
    const before = JSON.stringify(state);
    const scene = new Hub();
    Object.assign(scene, { store: { get: () => state } });
    const id = scene.deskReflectionLineId(sample.realm);
    assertEqual(id, sample.id, "reflection identifies the branch actually chosen");
    const line = getRunaLine(id);
    assert(line?.text.includes(sample.phrase), "selected catalog text recalls the branch's consequence");
    assert(!line!.text.includes("She was right"), "reflection has no unnamed, unintroduced referent");
    if (sample.id === "hub_desk_forge_cabal") assert(!line!.text.includes("Forn"), "apprentice route does not credit unhelped Forn");
    assertEqual(JSON.stringify(state), before, "reflection does not canonicalize or mutate historical saves");
  }
});

await suite("Hub branches: unknown and conflicting histories get neutral reflections and safe default realms", () => {
  for (const sample of [
    { realm: "sunken-bell", satchel: [], id: "hub_desk_sunken_unrecorded" },
    { realm: "sunken-bell", satchel: ["trident-token", "bells-tongue"], id: "hub_desk_sunken_unrecorded" },
    { realm: "clockwork-forge", satchel: [], id: "hub_desk_forge_unrecorded" },
    { realm: "clockwork-forge", satchel: ["bellows-hammer", "sabotage-wrench"], id: "hub_desk_forge_unrecorded" },
    { realm: "sky-island", satchel: [], id: "hub_desk_sky" },
    { realm: "sky-island", satchel: ["wind-phrase", "tether-cord"], id: "hub_desk_sky" },
    { realm: "winter-mountain", satchel: [], id: "hub_desk_winter" },
    { realm: "haunted-wood", satchel: [], id: "hub_desk_wood" },
    { realm: "none", satchel: [], id: "hub_desk_none" },
    { realm: "future-realm", satchel: [], id: "hub_desk_none" },
  ]) {
    const state = frozenStory(sample.realm, {}, sample.satchel);
    const scene = new Hub();
    Object.assign(scene, { store: { get: () => state } });
    const id = scene.deskReflectionLineId(sample.realm);
    assertEqual(id, sample.id, "absent or ambiguous branch history does not invent a path");
    assert(getRunaLine(id) !== undefined, "every selected reflection is an authored catalog entry");
    if (sample.id.endsWith("unrecorded")) {
      assert(!/Aurland|apprentices|Forn/.test(getRunaLine(id)!.text), "neutral reflection makes no unrecorded ally claim");
    }
  }
});

await suite("Hub branches: entering the actual desk zone uses its latest completed realm's saved consequence", () => {
  const state = Object.freeze({
    realms: Object.freeze({
      "winter-mountain": Object.freeze({ cleared: true, choices: Object.freeze({ fork2: "pelt" }) }),
      "sunken-bell": Object.freeze({ cleared: true, choices: Object.freeze({ fork2: "free-king" }) }),
      "clockwork-forge": Object.freeze({ cleared: true, choices: Object.freeze({ fork1: "cabal" }) }),
      "sky-island": Object.freeze({ cleared: false, choices: Object.freeze({ fork2: "answer-kindly" }) }),
    }),
    satchel: Object.freeze(["bellows-hammer"]),
  });
  const before = JSON.stringify(state);
  const scene = new Hub();
  const spoken: string[] = [];
  const cards: string[] = [];
  const actions: string[] = [];
  Object.assign(scene, {
    store: { get: () => state }, narration: { say: (id: string) => spoken.push(id) },
    drawDeskReflectionCard: (realm: string) => cards.push(realm),
    playDeskReflectionWake: () => actions.push("wake"), playRunaAttention: () => actions.push("runa"),
    registerDeskAlmanacTarget: () => actions.push("book"), registerPortalReturnTarget: () => actions.push("return"),
  });
  scene.registerDeskZoneTargets();
  assertEqual(spoken, ["hub_desk_forge_cabal"], "actual desk registration selects the saved apprentice consequence");
  assertEqual(cards, ["clockwork-forge"], "reflection card and narration describe the same completed realm");
  assertEqual(actions, ["wake", "runa", "book", "return"], "reflection does not alter the desk's existing interactions");
  assertEqual(JSON.stringify(state), before, "visiting the desk preserves progress and inventory");
});
