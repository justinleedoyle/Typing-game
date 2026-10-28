import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertClose, assertEqual, suite } from "./_assert";

// Execute the production passage/reward/transfer and lifecycle methods. Only
// drawing, word presentation and the decorative tween clock are inert.
const url = new URL("../src/scenes/ClockworkForgeScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["init", "startFornBranch", "startCabalBranch", "runPassageChain", "showForgeKeepsake", "clearForgeKeepsake", "afterFork1", "startAct3"];
const constants = source.statements.filter(ts.isVariableStatement).flatMap(statement => statement.declarationList.declarations
  .filter(declaration => ["FORN_PASSAGES", "CABAL_PASSAGES", "FLOOR_Y", "GOLEM_SPRITE_HEIGHT", "FOUNDRY_GROUND_Y"].includes(declaration.name.getText(source)))
  .map(declaration => `const ${declaration.getText(source)};`)).join("\n");
let shutdown: ts.ArrowFunction | undefined;
function findShutdown(node: ts.Node): void {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "this.events.once" &&
      node.arguments[0]?.getText(source).endsWith(".SHUTDOWN") && ts.isArrowFunction(node.arguments[1])) shutdown = node.arguments[1];
  ts.forEachChild(node, findShutdown);
}
findShutdown(owner.members.find(member => member.name?.getText(source) === "create")!);
assert(shutdown, "the actual Forge scene installs lifecycle cleanup");
const code = ts.transpileModule(`${constants}\nclass Forge {
  ${names.map(name => owner.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")}
  shutdownFixture() ${shutdown!.body.getText(source)}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const noop = () => {};
const hammer = readFileSync(new URL("../art/relics/bellows-hammer.png", import.meta.url));
const dimensions = { width: hammer.readUInt32BE(16), height: hammer.readUInt32BE(20) };

function fixture(reduced = false) {
  const images: any[] = [], tweens: any[] = [], targets: any[] = [], captions: string[] = [];
  const save = { satchel: [] as string[], almanacLore: [] as string[], realms: {} as Record<string, any> };
  let gate: (() => void) | undefined, word: any, boss = 0;
  const Forge = new Function("reducedMotion", "satchelIconFor", "applySceneActorLighting", "playWrenAction", "playWrenFocus", "playBodyImpact", "playActorAttention", "PALETTE_HEX", "resolveRealmFork", "resolveCompanionDecision", code + "; return Forge;")(
    () => reduced, (id: string) => ({ key: `almanac-icon-${id}` }), (_scene: unknown, image: any) => { image.lit = true; },
    noop, noop, noop, noop, { ember: 0xcd7445 }, () => null, () => null,
  );
  const scene = new Forge();
  const makeWord = (options: any) => { word = options; targets.push(options); return options; };
  Object.assign(scene, {
    store: { get: () => save, update: (edit: (state: typeof save) => void) => edit(save) },
    scale: { width: 1920, height: 1080 }, wrenContainer: { x: 665, y: 866, scene: true }, wrenSprite: {},
    fornSprite: { x: 400, y: 866, scene: true, destroy() { this.scene = false; } }, textures: { exists: () => true },
    add: { image(x: number, y: number, key: string) {
      const image = { x, y, texture: { key }, ...dimensions, scene: true, scale: 1,
        setDepth(value: number) { this.depth = value; return this; }, setScale(value: number) { this.scale = value; return this; },
        destroy() { this.scene = false; },
      } as any;
      images.push(image); return image;
    } },
    tweens: { add(options: any) { tweens.push(options); return options; }, killTweensOf(item: any) { for (const tween of tweens) if (tween.targets === item) tween.cancelled = true; } },
    commitFork: (_fork: string, choice: string) => choice,
    clearActiveTargets: noop, dismissForgeChoiceCue: noop, dismissBellowsWorkstation: noop, pulseForgeChoiceCue: noop,
    showApprenticeSprite: noop, hideApprenticeSprite: noop, hideFornSprite: noop, approachForgeWork: noop,
    band: { setObjective: noop }, setNarrator: (text: string) => captions.push(text),
    readThen(next: () => void) { assert(!gate, "a native response never overwrites an unread card"); gate = next; },
    forgePassageWordPosition: () => ({ x: 600, y: 440 }), makeFornWord: makeWord,
    makeForgeChoiceWord: (_body: any, options: any) => makeWord(options), registerActiveTarget: noop,
    playCommandGolemRiseCue: noop, cameras: { main: { shake: noop } }, narration: { say: noop },
    startBossPhase1() { boss++; },
    reading: { destroy() { gate = undefined; } }, typingInput: { reset: noop }, input: {},
    releaseCatwalkCueWordAnchor: noop, dismissRevisitMemoryCue: noop, clearFornWordAnchors: noop,
    clearForkChoiceWordAnchors: noop, clearForgeChoiceCues: noop, clearPeacefulGuards: noop,
  });
  scene.init({ store: scene.store });
  function continueReading() { assert(gate, "native Continue has a held card"); const next = gate!; gate = undefined; next(); }
  function finishTween(tween: any) { if (tween.cancelled || !tween.targets.scene) return; for (const key of ["x", "y"]) if (typeof tween[key] === "number") tween.targets[key] = tween[key]; tween.onComplete?.(); }
  function reachHandoff() {
    scene.startFornBranch(); continueReading();
    assertEqual(word.word, "work the bellows", "the first repair phrase stays exact"); word.onComplete(); continueReading();
    assertEqual(word.word, "seal the seam", "the seam phrase stays exact"); word.onComplete(); continueReading();
    assertEqual(word.word, "forn gives you his hammer", "the existing gift phrase owns the visual handoff");
  }
  return { scene, save, images, tweens, captions, targets, word: () => word, gate: () => gate, boss: () => boss,
    continue: continueReading, finishTween, reachHandoff };
}

await suite("Forge Hammer: the existing gift phrase visibly transfers the preloaded painting before its held acknowledgment", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced); f.reachHandoff();
    assertEqual(f.images.length, 0, "earlier repair phrases cannot prematurely hand over the Hammer");
    f.word().onComplete();
    assertEqual(f.images.length, 1, "the completed gift phrase creates the same existing Hammer painting");
    const image = f.images[0], transfer = f.tweens[0];
    assertEqual(image.texture.key, "almanac-icon-bellows-hammer", "world transfer reuses the actual satchel asset");
    assert(image.lit, "the handoff retains its accepted Forge lighting");
    assertClose(Math.max(image.width, image.height) * image.scale, 66, .001, "the accepted visible reward size is preserved");
    assertEqual([image.x, image.y], reduced ? [703, 748] : [475, 676], "normal transfer begins at Forn; reduced motion places it in Wren's hand immediately");
    assertEqual([transfer.x, transfer.y, transfer.duration], [703, 748, reduced ? 0 : 650], "the exact existing decorative destination and duration are preserved");
    assert(f.captions.at(-1)!.includes("presses the hammer into your hands") && f.gate(), "the unchanged handoff acknowledgment and Continue are available immediately");
    assertEqual(f.save.satchel, [], "showing the Hammer does not move its actual reward earlier");
    f.finishTween(transfer);
    assertEqual([image.x, image.y], [703, 748], "the settled Hammer occupies the accepted hand position");
    f.continue();
    assertEqual(f.word().word, "the forge breathes again", "native Continue still reveals the original fourth phrase");
    assertEqual(f.scene.keepsakeSprite, image, "the same Hammer remains visible while the final repair phrase is typed");
    f.word().onComplete();
    assertEqual(f.save.satchel, [], "the fourth held response still precedes the original reward callback");
    f.continue();
    assertEqual(f.save.satchel, ["bellows-hammer"], "the original afterFork1 callback grants its one reward");
    assertEqual(f.save.almanacLore, ["forn-bellows-song"], "the original saved lore ID remains unchanged");
    assertEqual([f.images.length, f.tweens.length], [1, 1], "the reward card retains the same Hammer without a duplicate handoff");
    assert(f.gate(), "the reward card remains held for native Continue");
    f.continue();
    assert(!image.scene && !f.scene.keepsakeSprite && transfer.cancelled, "original boss entry stows the Hammer and cancels its owned tween");
  }
});

await suite("Forge Hammer: fast Continue stays immediate and lifecycle cleanup cancels an unfinished transfer", () => {
  for (const reduced of [false, true]) {
    for (const exit of ["init", "shutdown", "boss"]) {
      const f = fixture(reduced); f.reachHandoff(); f.word().onComplete();
      const image = f.images[0], transfer = f.tweens[0];
      if (exit === "boss") {
        f.continue(); f.word().onComplete(); f.continue();
        assertEqual(f.images.length, 1, "fast input cannot replace the in-flight Hammer at the reward card");
        f.continue();
      } else if (exit === "init") f.scene.init({ store: f.scene.store });
      else f.scene.shutdownFixture();
      assert(!image.scene && !f.scene.keepsakeSprite && transfer.cancelled, `${exit} clears the moving prop before the scene leaves`);
      f.finishTween(transfer);
      assert(!image.scene && !f.scene.keepsakeSprite, "a cancelled decorative transfer cannot restore a stale prop");
      f.scene.clearForgeKeepsake();
      assert(!f.scene.keepsakeSprite, "repeated cleanup is safe");
    }
  }
});

await suite("Forge Hammer: other passages and relic replacements retain their original presentation", () => {
  const f = fixture(true);
  f.scene.startCabalBranch(); f.continue();
  for (let index = 0; index < 3; index++) { f.word().onComplete(); f.continue(); }
  assertEqual(f.images, [], "the Hammer repair cannot introduce a gift into the apprentices' passages");
  assertEqual(f.word().word, "the forge chokes and slows", "the unmodified opposite branch reaches its original fourth phrase");
  f.scene.showForgeKeepsake("bellows-hammer", 475);
  const first = f.images[0];
  f.scene.showForgeKeepsake("master-key", 960);
  assert(!first.scene && f.tweens[0].cancelled, "a later different relic safely replaces the former hand prop");
  assertEqual(f.scene.keepsakeSprite.texture.key, "almanac-icon-master-key", "the second fork can still show its own original keepsake");
});
