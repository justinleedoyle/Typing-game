import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";

const url = new URL("../src/scenes/HauntedWoodScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const sceneClass = source.statements.find(ts.isClassDeclaration)!;
const names = ["startFork1Offering", "startFork1BoneFlute", "startFork2Bargain", "startFork2Force", "runPassageChain", "ownerPassageWordPosition"];
const lane = source.statements.filter(ts.isVariableStatement).flatMap(statement =>
  statement.declarationList.declarations.filter(declaration => declaration.name.getText(source) === "WOOD_BRANCH_WORD_Y")
    .map(declaration => `const ${declaration.getText(source)};`)).join("\n");
const code = ts.transpileModule(`${lane}\nclass Wood {
  ${names.map(name => sceneClass.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const noop = () => {};
const Wood = new Function("playChime", "playWrenAction", "playWrenFocus", "playBodyImpact", "reducedFlashes", "PALETTE_HEX", code + "; return Wood;")(
  noop, noop, noop, noop, () => true, { moss: 0 },
);

function fixture(dy = 0) {
  const scene = new Wood();
  const state = { satchel: [] as string[] };
  const targets: any[] = [];
  const entered: string[] = [];
  let gate: (() => void) | undefined;
  let ignited = 0;
  Object.assign(scene, {
    scale: { width: 1920, height: 1080 },
    offeringCue: { scene: true, x: 690, y: 792 + dy },
    boneFluteCue: { scene: true, x: 1230, y: 790 + dy },
    ghostKingBody: { scene: true, x: 1400, y: 604 + dy },
    groveLightCue: { scene: true, x: 1210, y: 770 + dy },
    commitFork: (_fork: string, requested: string) => requested,
    fadeOutForkCue: noop, setNarrator: noop, band: { setObjective: noop },
    clearActiveTargets: noop, registerActiveTarget: noop,
    makeWoodForkWord(body: any, options: any) { targets.push({ ...options, body }); return options; },
    makeGhostKingWord(options: any) { targets.push({ ...options, body: scene.ghostKingBody }); return options; },
    makeWord(options: any) { targets.push(options); return options; },
    readThen(next: () => void) { assert(!gate, "an unread response cannot be replaced by another gate"); gate = next; },
    store: { update(edit: (save: typeof state) => void) { edit(state); } },
    pulseShrine: noop, returnIngaToForeground: noop, attendGhostKing: noop,
    startIngaNameReveal() { entered.push("name"); },
    startAct3() { entered.push("king"); },
    startBossFight() { entered.push("boss"); },
    igniteGroveLightCue() { ignited += 1; },
  });
  return { scene, state, targets, entered, ignited: () => ignited,
    continue() { assert(gate, "the actual scene holds a reading gate"); const next = gate!; gate = undefined; next(); } };
}

await suite("Wood shrine phrases: real offering and flute actions clear Wren while retaining original rewards and reading gates", () => {
  for (const dy of [-4, 0, 22]) {
    for (const [method, words, item, destination] of [
      ["startFork1Offering", ["i remember you."], "shrine-token", "name"],
      ["startFork1BoneFlute", ["reach in", "take it"], "bone-flute", "king"],
    ] as const) {
      const f = fixture(dy);
      const owner = method === "startFork1Offering" ? f.scene.offeringCue : f.scene.boneFluteCue;
      f.scene[method]();
      assertEqual(f.targets.length, 0, "the original branch introduction remains held");
      f.continue();
      for (let index = 0; index < words.length; index += 1) {
        const target = f.targets[index]!;
        assertEqual(target.word, words[index], "the native phrase and punctuation are unchanged");
        assertEqual(target.body, owner, "the target remains attached to its original ground prop");
        assertEqual(target.x, method === "startFork1Offering" ? 505 : 1045, "the existing owner-specific horizontal lane is preserved");
        assert(target.y + 30 < 826 - 240 - 5, "the whole 36px phrase and idle float clear Wren's highest hood position");
        assert(target.y - 30 > 360, "the phrase remains below the reading-card lane");
        target.onComplete();
        assertEqual(f.state.satchel, [], "the held phrase result does not award its item early");
        assertEqual(f.targets.length, index + 1, "no later phrase overwrites an unread response");
        f.continue();
      }
      assertEqual(f.state.satchel, [item], "the original branch item is awarded only after its last response");
      assertEqual(f.entered, [], "the reward acknowledgment still waits for Continue");
      f.continue();
      assertEqual(f.entered, [destination], "the original next story stage is preserved");
    }
  }
});

await suite("Wood higher-owner and fire branches: the clearance cap preserves their authored staging and outcomes", () => {
  const f = fixture();
  const king = f.scene.ghostKingBody;
  f.scene.startFork2Bargain();
  f.continue();
  for (const [index, word] of ["you are the keeper of what is lost.", "you are not gone.", "you are remembered."].entries()) {
    const target = f.targets[index]!;
    assertEqual([target.word, target.x, target.y], [word, 1215, 482], "already-higher king phrases retain their original anchor and exact text");
    assertEqual(target.body, king, "the king remains the real phrase owner");
    target.onComplete();
    assertEqual(f.state.satchel, [], "the promise still waits until the final response is read");
    f.continue();
  }
  assertEqual(f.state.satchel, ["ghost-kings-promise"], "the bargain still earns its original promise");
  f.continue();
  assertEqual(f.entered, ["boss"], "the bargain leads to the original boss challenge");
  const fire = fixture();
  fire.scene.startFork2Force();
  assertEqual(fire.targets, [], "fire still has no extra phrase chain or typing gate");
  assertEqual(fire.ignited(), 1, "the existing fire consequence remains visible before the held response");
  assertEqual(fire.state.satchel, ["ash-vial"], "fire keeps its original reward timing");
  fire.continue();
  assertEqual(fire.entered, ["boss"], "fire reaches the original boss challenge without new mechanics");
});
