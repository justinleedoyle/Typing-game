import { readFileSync } from "node:fs";
import ts from "typescript";
import { checkpointIndex, committedWinterChoices } from "../src/game/chapterFlow";
import { assert, assertClose, assertEqual, suite } from "./_assert";

const url = new URL("../src/scenes/WinterMountainScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["preload", "checkpoint", "savedStageData", "hasSavedPassage", "startHuntressBranch",
  "runPassageChain", "winterPassageOwnerBinding", "winterPassageWordPosition", "fadeOutHuntress",
  "clearHuntressHorn", "transferHuntressHorn", "presentWinterPassageReaction", "clearWinterForkCues", "onKeyDown", "makeWinterForkWord"];
const methods = names.map(name => owner.members.find(member => member.name?.getText(source) === name)!.getText(source));
const passages = source.statements.filter(ts.isVariableStatement).flatMap(statement =>
  statement.declarationList.declarations.filter(declaration => declaration.name.getText(source) === "HUNTRESS_PASSAGES")
    .map(declaration => `const ${declaration.getText(source)};`)).join("\n");
const code = ts.transpileModule(`${passages}\nclass Winter { ${methods.join("\n")} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const noop = () => {};
const bodyPulses: unknown[] = [];
const globals = {
  checkpointIndex, committedWinterChoices,
  reducedMotion: (scene: any) => scene.motionReduced,
  satchelIconFor: () => ({ key: "almanac-icon-hunters-horn", url: "fixture-only" }),
  applySceneActorLighting: (_scene: any, item: any) => { item.lit = true; },
  preloadSatchelIcons: (scene: any, ids: string[]) => { scene.preloadedIds.push(...ids); },
  preloadWren: noop, preloadWolves: noop, preloadWinterNpcs: noop,
  winterBackdrop: "fixture-backdrop", runaPortrait: "fixture-runa", snowFoxSprite: "fixture-fox",
  playWrenAction: noop, playWrenFocus: noop, playActorAttention: noop, playBodyImpact: noop,
  playClaimLine: noop, playBodyTypePulse: (_scene: unknown, body: unknown) => bodyPulses.push(body),
  attachWordBodyAnchor: () => ({ destroy: noop }),
  isPuristToggleKey: () => false,
  fadeOutStagedSprite: (_scene: any, sprite: any) => { sprite.scene = false; },
  PALETTE_HEX: { frost: 0xa4c0d2, brass: 0xb69d5c },
  Phaser: { Math: { Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)) },
    GameObjects: { Events: { DESTROY: "destroy" } } },
};
const Winter = new Function(...Object.keys(globals), `${code}; return Winter;`)(...Object.values(globals));
const hornBytes = readFileSync(new URL("../art/relics/hunters-horn.png", import.meta.url));
const hornWidth = hornBytes.readUInt32BE(16), hornHeight = hornBytes.readUInt32BE(20);
const wordUrl = new URL("../src/game/wordTarget.ts", import.meta.url);
const wordSource = ts.createSourceFile(wordUrl.pathname, readFileSync(wordUrl, "utf8"), ts.ScriptTarget.Latest, true);
const wordClass = wordSource.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === "TextWordTarget") as ts.ClassDeclaration;
const exitCode = ts.transpileModule(`class WordExit { ${["advance", "onComplete"].map(name =>
  wordClass.members.find(member => member.name?.getText(wordSource) === name)!.getText(wordSource)).join("\n")} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const WordExit = new Function("playWordCompleteBurst", "PALETTE_HEX", `${exitCode}; return WordExit;`)(noop, { brass: 0 });

function fixture(options: { reduced?: boolean; restored?: boolean; missingArt?: boolean } = {}) {
  const s = new Winter();
  const images: any[] = [], tweens: any[] = [], killed: any[] = [], gates: Array<() => void> = [];
  const targets: any[] = [], captions: string[] = [], checkpoints: any[] = [], timers: any[] = [], waves: number[] = [];
  const state: any = { realms: { "winter-mountain": { cleared: false, choices: {} } }, satchel: [], almanacLore: [] };
  const huntress = { x: 560, y: 842, scene: true, once: noop };
  Object.assign(s, {
    motionReduced: options.reduced === true,
    huntressSprite: huntress, huntressHornSprite: null, huntressHornTransferToken: 0, huntressHornTransferPending: false,
    wrenContainer: { x: 960, y: 842, scene: true }, scale: { width: 1920, height: 1080 },
    wrenSprite: {}, activeTargets: [], forkChoiceWordAnchors: [],
    fireflyCue: null, cairnCue: null, peltCue: null,
    fork1Choice: null, fork2Choice: null, foxDecided: true, foxSpared: true, candles: 3,
    resumeCheckpoint: options.restored
      ? { scene: "WinterMountainScene", step: "huntress", data: { index: 1, reading: true } } : null,
    preloadedIds: [], load: { image: noop },
    textures: { exists: () => !options.missingArt },
    typingInput: { getStats: () => ({ getSoul: () => 0 }) },
    store: {
      update: (change: (value: typeof state) => void) => change(state),
      setCheckpoint: (checkpoint: any) => { state.checkpoint = structuredClone(checkpoint); checkpoints.push(state.checkpoint); },
    },
    narration: { say: (line: string) => captions.push(line) },
    setNarrator: (text: string) => captions.push(text),
    readThen: (next: () => void) => gates.push(next),
    band: { setObjective: noop },
    fadeInHuntress: noop, dismissFireflyCue: noop, clearForkChoiceWordAnchors: noop,
    makeWinterForkWord: (_body: unknown, word: any) => word,
    makeWord: (word: any) => word,
    registerActiveTarget: (target: any) => { targets.push(target); s.activeTargets.push(target); },
    clearActiveTargets: () => { s.activeTargets = []; },
    startWave: (index: number) => waves.push(index),
    time: { delayedCall: (ms: number, next: () => void) => { timers.push({ ms, next }); } },
    tweens: { add: (tween: any) => { tweens.push(tween); }, killTweensOf: (item: any) => killed.push(item) },
    add: { image(x: number, y: number, key: string) {
      const image = {
        x, y, key, scene: true, width: hornWidth, height: hornHeight, scale: 1, depth: 0,
        origin: [] as number[], destroyed: 0, lit: false,
        setOrigin(...origin: number[]) { this.origin = origin; return this; },
        setDepth(depth: number) { this.depth = depth; return this; },
        setScale(scale: number) { this.scale = scale; return this; },
        destroy() { this.scene = false; this.destroyed += 1; },
      };
      images.push(image); return image;
    } },
  });
  return { s, images, tweens, killed, gates, targets, captions, checkpoints, timers, waves, state, huntress,
    continue() { const next = gates.shift(); assert(next, "an actual held Continue is available"); next!(); },
    settle() { const tween = tweens.at(-1); assert(tween, "the actual horn movement was scheduled");
      tween.targets.x = tween.x; tween.targets.y = tween.y; tween.onComplete(); return tween; },
  };
}

await suite("Winter horn: the actual two phrases transfer painted art before the held acknowledgment", () => {
  const f = fixture();
  f.s.preload();
  assertEqual(f.s.preloadedIds, ["hunters-horn"], "Winter preloads the accepted horn even before it enters the satchel");
  f.s.startHuntressBranch(2);
  assertEqual(f.images.length, 0, "the branch introduction does not give the horn early");
  assertEqual(f.targets.length, 0, "the intro keeps its existing Continue gate");
  f.continue();
  assertEqual(f.targets[0].word, "free her hands", "the first authored phrase is preserved");
  f.targets[0].onComplete();
  assertEqual(f.images.length, 0, "freeing her hands does not start the reward handoff");
  f.continue();
  assertEqual(f.targets[1].word, "she gives you her horn", "the handoff phrase remains unchanged");
  const captionsBeforeHandoff = f.captions.length;
  f.targets[1].onComplete();
  const horn = f.images[0];
  assertEqual([horn.key, horn.x, horn.y, horn.depth], ["almanac-icon-hunters-horn", 602, 736, 61],
    "the existing painted horn begins at the actual Huntress hand above actors");
  assert(horn.lit, "the prop uses the realm's existing actor lighting");
  assertClose(Math.max(horn.width, horn.height) * horn.scale, 76, 0.00001, "the painted prop is legible at its intended size");
  assertEqual(f.captions.length, captionsBeforeHandoff, "the received-horn caption waits for the transfer to settle");
  assertEqual(f.gates.length, 0, "Continue cannot skip the moving handoff before its acknowledgment exists");
  assertEqual(f.s.huntressHornTransferPending, true, "the visual wait owns early story keys until it settles");
  assertEqual([f.state.checkpoint.step, f.state.checkpoint.data.index, f.state.checkpoint.data.reading],
    ["huntress", 1, true], "the existing response checkpoint is saved before the visual wait");
  assertEqual(f.state.satchel, [], "visual receipt does not move the existing realm-ending inventory award");
  const tween = f.settle();
  assertEqual([tween.duration, horn.x, horn.y], [650, 918, 720], "the same horn settles into Wren's near hand");
  assertEqual(f.s.huntressHornTransferPending, false, "the held response replaces the visual-wait input guard");
  assertEqual(f.captions.at(-1), "She presses a spiral horn into your hand and gestures uphill.", "the exact canon acknowledgment follows settling");
  assertEqual(f.gates.length, 1, "the acknowledgment keeps one deliberate Continue gate");
  tween.onComplete();
  assertEqual(f.gates.length, 1, "a repeated completion cannot create a second reading gate");
  assert(horn.scene, "the received horn remains visible throughout the held acknowledgment");
  f.continue();
  assertEqual([horn.destroyed, f.s.huntressHornSprite], [1, null], "Continue releases the received prop");
  assertEqual([f.state.checkpoint.step, f.state.checkpoint.data.index], ["wave", 2], "the next checkpoint still follows the acknowledgment");
  assertEqual(f.timers.map(timer => timer.ms), [900], "the existing post-passage delay remains unchanged");
  f.timers.shift().next();
  assertEqual(f.timers.map(timer => timer.ms), [600], "the existing Huntress departure delay remains unchanged");
  f.timers.shift().next();
  assertEqual(f.waves, [2], "the original next wave starts exactly once");
  assertEqual(f.state.satchel, [], "the next wave still precedes the original ending award");
});

await suite("Winter horn: final-letter input owns the actual320ms word exit before the handoff callback", () => {
  for (const reduced of [false, true]) {
    const f = fixture({ reduced });
    f.s.makeWinterForkWord = Winter.prototype.makeWinterForkWord;
    f.s.startHuntressBranch(2); f.continue();
    const first = f.targets[0];
    first.onAdvance(first.word.length, first.word.length);
    assertEqual(f.s.huntressHornTransferPending, false, "the first Huntress phrase does not arm the horn-only guard");
    first.onComplete(); f.continue();
    const opts = f.targets[1];
    const target = new WordExit();
    Object.assign(target, { opts, word: opts.word, cursor: 0, complete: false,
      container: { x: opts.x, y: opts.y }, relayout: noop, playBannerWake: noop, destroy: noop });
    for (let index = 0; index < opts.word.length - 1; index += 1) target.advance();
    assertEqual(f.s.huntressHornTransferPending, false, "partial typing never swallows required remaining letters");
    const pulseCount = bodyPulses.length;
    target.advance();
    assertEqual(bodyPulses.length, pulseCount + 1, "the existing owner body pulse still runs on the final letter");
    assertEqual(f.s.huntressHornTransferPending, true, "actual final advance closes the input gap immediately");
    assertEqual([f.images.length, f.gates.length, f.state.checkpoint.data.reading], [0, 0, false],
      "no semantic completion, horn or response gate has happened yet");
    target.onComplete();
    const fade = f.tweens.at(-1);
    assertEqual(fade.duration, 320, "the real target's exit delay remains unchanged");
    let prevented = 0;
    f.s.chapterMenu = { handleKey: () => false };
    f.s.reading = { handleKey: () => false };
    f.s.typingInput.handleChar = () => { throw new Error("Early Space reached the miss-recording controller during word exit"); };
    f.s.onKeyDown({ key: " ", ctrlKey: false, metaKey: false, preventDefault: () => { prevented += 1; } });
    assertEqual(prevented, 1, "actual scene input consumes early Space before the semantic onComplete callback");
    fade.onComplete();
    assertEqual(f.state.checkpoint.data.reading, true, "the original semantic callback still saves its response checkpoint");
    if (!reduced) {
      assertEqual(f.s.huntressHornTransferPending, true, "normal handoff retains ownership after word fade");
      f.settle();
    }
    assertEqual([f.s.huntressHornTransferPending, f.gates.length], [false, 1],
      "settled or reduced handoff releases ownership to the one held response");
  }
});

await suite("Winter horn: final-letter guard leaves other passage owners and true-name body pulses unchanged", () => {
  for (const owner of ["firefly", "cairn", "pelt", "none"]) {
    const f = fixture();
    f.s.runPassageChain(["first", "last"], ["", ""], noop, owner);
    f.targets[0].onComplete();
    f.targets[1].onAdvance(4, 4);
    assertEqual(f.s.huntressHornTransferPending, false, `${owner}'s last word does not acquire horn ownership`);
  }
  const f = fixture();
  const seal = { x: 960, y: 620, scene: true, once: noop };
  f.s.runPassageChain(["the winter mountain"], [""], noop, "none", seal);
  const before = bodyPulses.length;
  f.targets[0].onAdvance(19, 19);
  assertEqual(bodyPulses.length, before + 1, "the original true-name body pulse remains active");
  assertEqual(bodyPulses.at(-1), seal, "the same seal still receives that pulse");
  assertEqual(f.s.huntressHornTransferPending, false, "true-name completion never enters the horn-only wait");
});

await suite("Winter horn: reduced motion and restored acknowledgment settle immediately without replaying phrases", () => {
  for (const options of [{ reduced: true }, { restored: true }, { restored: true, reduced: true }]) {
    const f = fixture(options);
    f.s.startHuntressBranch(2);
    if (!options.restored) {
      f.continue(); f.targets[0].onComplete(); f.continue(); f.targets[1].onComplete();
    }
    const horn = f.images[0];
    assertEqual([horn.x, horn.y], [918, 720], "the received horn is already in Wren's hand");
    assertEqual(f.tweens.length, 0, "neither reduced motion nor checkpoint restore starts a transfer tween");
    assertEqual(f.s.huntressHornTransferPending, false, "immediate handoffs leave no invisible input wait");
    assertEqual(f.targets.length, options.restored ? 0 : 2, "checkpoint restoration does not ask for completed words again");
    assertEqual(f.gates.length, 1, "the existing response remains held for one Continue");
    assertEqual(f.captions.at(-1), "She presses a spiral horn into your hand and gestures uphill.", "the restored pose agrees with the canon response");
    assertEqual(f.state.satchel, [], "restoration cannot grant an early or duplicate inventory reward");
    f.continue();
    assertEqual(horn.destroyed, 1, "continuing the restored/reduced response releases the prop once");
    assertEqual(f.state.checkpoint.step, "wave", "restoration advances to the original wave checkpoint");
  }
});

await suite("Winter horn: canceled, replaced and shutdown transfers cannot reveal a stale response", () => {
  for (const cancel of ["clearWinterForkCues", "fadeOutHuntress", "clearHuntressHorn"]) {
    const f = fixture(); let done = 0;
    f.s.transferHuntressHorn(() => { done += 1; });
    const horn = f.images[0], tween = f.tweens[0];
    f.s[cancel]();
    tween.onComplete();
    assertEqual(done, 0, `${cancel} invalidates the in-flight response callback`);
    assertEqual([horn.destroyed, f.s.huntressHornSprite], [1, null], `${cancel} removes the image and stale reference`);
    assertEqual(f.s.huntressHornTransferPending, false, `${cancel} releases the temporary input wait`);
    assert(f.killed.includes(horn), `${cancel} cancels the image's tween`);
  }
  const f = fixture(); let oldDone = 0, newDone = 0;
  f.s.transferHuntressHorn(() => { oldDone += 1; });
  const oldHorn = f.images[0], oldTween = f.tweens[0];
  f.s.transferHuntressHorn(() => { newDone += 1; });
  oldTween.onComplete();
  assertEqual([oldDone, oldHorn.destroyed], [0, 1], "a replacement invalidates and destroys the previous transfer");
  f.settle();
  assertEqual(newDone, 1, "the replacement can still complete normally");
  assertEqual(f.s.huntressHornSprite, f.images[1], "late old callbacks never clear the newer received prop");
});

await suite("Winter horn: the actual input handler absorbs early Continue without blocking pause or browser shortcuts", () => {
  const f = fixture();
  f.s.transferHuntressHorn(noop);
  let menuCalls = 0, readingCalls = 0, prevents = 0;
  f.s.chapterMenu = { handleKey: (event: KeyboardEvent) => { menuCalls += 1; return event.key === "Escape"; } };
  f.s.reading = { handleKey: () => { readingCalls += 1; return false; } };
  f.s.typingInput = { handleChar: () => { throw new Error("No failed keystroke may enter the controller during handoff"); } };
  const key = (value: string, ctrl = false, meta = false) => ({ key: value, ctrlKey: ctrl, metaKey: meta,
    preventDefault: () => { prevents += 1; } });
  for (const value of ["Enter", " ", "x"]) f.s.onKeyDown(key(value));
  assertEqual([menuCalls, readingCalls, prevents], [3, 3, 3], "early Continue and printable keys are safely consumed after normal menu/reading ownership");
  f.s.onKeyDown(key("Escape"));
  assertEqual([menuCalls, readingCalls, prevents], [4, 3, 3], "Escape still reaches the real pause-menu ownership point first");
  f.s.onKeyDown(key("l", true)); f.s.onKeyDown(key("l", false, true));
  assertEqual([menuCalls, readingCalls, prevents], [4, 3, 3], "browser Ctrl/Meta shortcuts stay untouched");
});

await suite("Winter horn: missing art cannot trap Continue and unrelated reactions keep their original flow", () => {
  const missing = fixture({ missingArt: true }); let continued = 0;
  missing.s.presentWinterPassageReaction("huntress", 1, "The original response.", () => { continued += 1; });
  assertEqual(missing.images.length, 0, "missing texture does not create an invalid image");
  assertEqual(missing.gates.length, 1, "the fallback keeps the response available immediately");
  missing.continue();
  assertEqual(continued, 1, "the fallback can continue normally");
  for (const owner of ["firefly", "cairn", "pelt", "none"]) {
    const f = fixture();
    f.s.presentWinterPassageReaction(owner, 1, "Unchanged reaction.", noop);
    assertEqual([f.images.length, f.tweens.length, f.gates.length], [0, 0, 1], `${owner} has no horn handoff or extra wait`);
    assertEqual(f.captions.at(-1), "Unchanged reaction.", `${owner} preserves its existing caption`);
  }
});
