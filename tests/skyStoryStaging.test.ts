import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";

const url = new URL("../src/scenes/SkyIslandScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const sceneClass = source.statements.find(ts.isClassDeclaration)!;
const names = ["skyOwnedWordPosition", "startEttaEncounter", "startEttaHelp", "startFork1", "startSealedScrollTemple", "onFirstEncounterCleared"];
const constantNames = ["ETTA_SPRITE_HEIGHT", "ETTA_CHOICE_WORD_LIFT", "ETTA_BOOK_WORD_Y", "SEALED_SCROLL_Y", "ETTA_HELP_TRIGGER", "ETTA_CHAIN_1", "ETTA_CHAIN_2", "ETTA_LINE", "SEALED_SCROLL_PHRASE"];
const constants = source.statements.filter(ts.isVariableStatement).flatMap(statement =>
  statement.declarationList.declarations.filter(declaration => constantNames.includes(declaration.name.getText(source)))
    .map(declaration => `const ${declaration.getText(source)};`)).join("\n");
const code = ts.transpileModule(`${constants}\nclass Sky {
  ${names.map(name => sceneClass.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const Sky = new Function("Phaser", "playActorAttention", "playChime", "PALETTE_HEX", code + "; return Sky;")(
  { Math: { Clamp: (value: number, min: number, max: number) => Math.min(max, Math.max(min, value)) } },
  () => {}, () => {}, { brass: 0 },
);

function fixture() {
  const s = new Sky();
  let next: (() => void) | undefined;
  let task = "old combat task";
  const targets: any[] = [];
  const state = { realms: {} as Record<string, { cleared: boolean; choices: Record<string, string> }>, almanacLore: [] as string[] };
  const entered: number[] = [];
  const book = { scene: true, x: 760, y: 806 };
  Object.assign(s, {
    scale: { width: 1920, height: 1080 },
    ettaSprite: { scene: true, x: 520, y: 760 },
    beaconFlameCue: { scene: true, x: 1320, y: 792 },
    band: { setObjective(text: string) { task = text; } },
    narration: { say() {} }, setNarrator() {}, setTempleBeamsActive() {}, showEtta() {}, hideEtta() {},
    showFork1Cues() {}, clearActiveTargets() {}, registerActiveTarget() {}, clearEttaBookCue() {},
    makeEttaWord: (opts: any) => { targets.push(opts); return opts; },
    makeEttaBookWord: (opts: any) => { targets.push(opts); return opts; },
    makeSkyForkWord: (_body: unknown, opts: any) => { targets.push(opts); return opts; },
    showEttaBookCue: () => book,
    readThen(callback: () => void) { assert(!next, "a new story gate cannot overwrite an unread one"); next = callback; },
    store: { update(edit: (save: typeof state) => void) { edit(state); } },
    startTemple(index: number) { entered.push(index); },
  });
  return { s, targets, book, state, entered, task: () => task,
    continue() { assert(next, "the actual scene is holding a Continue gate"); const fn = next!; next = undefined; fn(); } };
}

await suite("Sky Etta choices: actual side and major-fork plates stay above her painted hood", () => {
  for (const bodyY of [757, 760, 774]) {
    const f = fixture();
    f.s.ettaSprite.y = bodyY;
    f.s.startEttaEncounter(3);
    f.continue();
    f.continue();
    assertEqual(f.targets.map(target => target.word), ["help her", "keep moving"], "both original side-encounter alternatives remain available");
    for (const target of f.targets) {
      assert(target.y + 48 < bodyY - 280, "the complete plate has a clear gap above Etta even during entrance/breathing");
      assert(target.y - 48 > 300, "choices stay below the held narrator card's lane");
    }
    assert(f.targets[0]!.x < f.targets[1]!.x, "the original left/right choice order is preserved");
    f.targets.length = 0;
    f.s.startFork1();
    assertEqual(f.targets.map(target => target.word), ["help scholar etta", "steal the flame"], "the major fork keeps both original targets");
    assert(f.targets[0]!.y + 48 < bodyY - 280, "the long help-Etta plate also clears her hood");
    assert(f.targets[1]!.x > 1320, "the flame choice stays in its separate original right-hand lane");
  }
});

await suite("Sky Etta book: both real actions clear Wren and retain the two reading gates and original reward", () => {
  const f = fixture();
  f.s.startEttaHelp(3);
  assertEqual(f.targets.length, 0, "the held approach still precedes typing");
  f.continue();
  const lift = f.targets[0]!;
  assertEqual(lift.word, "lift the book", "the first native action is unchanged");
  assert(lift.y + 38 < 826 - 240 - 5, "the first phrase clears the top of Wren's breathing hood");
  assertEqual(lift.x, f.book.x + 110, "the book keeps its original readable horizontal relationship");
  lift.onComplete();
  assertEqual(f.state.almanacLore, [], "lifting does not prematurely earn the placement memory");
  assert(f.task().includes("Book lifted") && f.task().includes("Enter"), "the lifted response truthfully asks for Continue");
  f.continue();
  const place = f.targets[1]!;
  assertEqual(place.word, "place it gently", "the second native action is unchanged");
  assertEqual([place.x, place.y], [lift.x, lift.y], "the second phrase uses the same clear word lane");
  place.onComplete();
  assertEqual(f.state.almanacLore, ["scholar-ettas-last-volume"], "only the original placement memory is earned");
  assertEqual(f.state.realms["sky-island"]!.choices.ettaHelped, "yes", "the original durable help flag is preserved");
  assertEqual(f.entered, [], "the reward remains readable before returning to the temples");
  f.continue();
  assertEqual(f.entered, [3], "Continue returns to the original next temple");
});

await suite("Sky precision scroll and first-wave outcomes: visible staging and tasks match their actual gates", () => {
  for (const gracePool of [0, 2]) {
    const f = fixture();
    let seal: any;
    let target: any;
    let forgiven = -1;
    let temples = 0;
    Object.assign(f.s, {
      combat: { gracePool },
      drawSealedScroll(x: number, y: number) { seal = { x, y, destroy() {} }; return seal; },
      makeWord(opts: any) { target = opts; return { setForgiveResets(count: number) { forgiven = count; } }; },
      flashScrollReseal() {}, flashSealForgiven() {}, tweens: { add() {} },
      onTempleCleared() { temples += 1; },
    });
    f.s.startSealedScrollTemple();
    assert(!target, "the precision teaching remains held before its target appears");
    f.continue();
    assertEqual([target.x, target.y], [seal.x, seal.y], "the full backing and target move together");
    assert(seal.y + 76 < 826 - 240 - 5, "parchment, shadow and wax all stay above Wren's hood");
    assert(seal.y - 118 > 340 + 16, "the hanging pins leave room below the long narration card");
    assertEqual([target.word, target.resetOnMiss, forgiven], ["every book is a window to the sky", true, gracePool], "the exact phrase, reset rule and original grace tokens are preserved");
    target.onComplete();
    assert(f.task().includes("Scroll unsealed") && f.task().includes("Enter"), "the held success no longer asks to copy a vanished scroll");
    assertEqual(temples, 0, "success reading still waits for Continue");
    f.continue();
    assertEqual(temples, 1, "the original temple progression follows Continue");
  }
  const f = fixture();
  let acts = 0;
  f.s.startAct2 = () => { acts += 1; };
  f.s.onFirstEncounterCleared();
  assert(f.task().includes("cleared") && f.task().includes("Enter"), "first-wave success no longer retains its combat task");
  assertEqual(acts, 0, "the first-wave story stays held");
  f.continue();
  assertEqual(acts, 1, "the first-wave Continue preserves normal act progression");
});
