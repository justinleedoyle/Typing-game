import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import ts from "typescript";
import { checkpointIndex, committedWinterChoices } from "../src/game/chapterFlow";
import { SessionStats } from "../src/game/sessionStats";
import { assert, assertClose, assertEqual, suite } from "./_assert";

const url = new URL("../src/scenes/WinterMountainScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["init", "preload", "checkpoint", "savedStageData", "hasSavedPassage", "startHuntressBranch",
  "runPassageChain", "winterPassageOwnerBinding", "winterPassageWordPosition", "fadeOutHuntress",
  "clearHuntressHorn", "transferHuntressHorn", "presentWinterPassageReaction", "clearWinterForkCues", "onKeyDown", "makeWinterForkWord",
  "addWinterAftermathPainting", "fitWinterAftermathPainting", "showCairnCue", "showPeltCue", "receivePeltVisual", "clearHeldPelt", "winterForkChoiceWordPosition", "startFork1", "fadeInHuntress", "showFireflyCue", "startFork2", "startAftermathPassage", "startFoxGate", "showFoxRefusalDeparture", "dismissFoxCompanion", "startTrueNamePassage"];
const methods = names.map(name => owner.members.find(member => member.name?.getText(source) === name)!.getText(source));
const passages = source.statements.filter(ts.isVariableStatement).flatMap(statement =>
    statement.declarationList.declarations.filter(declaration => ["WAVE_CANDLES", "WINTER_WREN_STAGE_Y", "HUNTRESS_PASSAGES", "BURY_PASSAGES", "PELT_PASSAGES"].includes(declaration.name.getText(source)))
    .map(declaration => `const ${declaration.getText(source)};`)).join("\n");
const code = ts.transpileModule(`${passages}\nclass Winter { ${methods.join("\n")} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const noop = () => {};
const bodyPulses: unknown[] = [];
const livingSource = ts.createSourceFile("livingScene.ts", readFileSync(new URL("../src/game/livingScene.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const departure = livingSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "dismissCompanionCameo")!;
const dismissCameoCode = ts.transpileModule(departure.getText(livingSource).replace(/^export /, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const dismissCameo = new Function(dismissCameoCode + "; return dismissCompanionCameo;")();
const npcSource = ts.createSourceFile("winterNpcs.ts", readFileSync(new URL("../src/game/winterNpcs.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const huntressHeight = npcSource.statements.filter(ts.isVariableStatement).flatMap(statement => statement.declarationList.declarations)
  .find(declaration => declaration.name.getText(npcSource) === "HUNTRESS_DISPLAY_HEIGHT")!;
const huntressFactory = npcSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "makeHuntressSprite")!;
const npcCode = ts.transpileModule(`const ${huntressHeight.getText(npcSource)};\n${huntressFactory.getText(npcSource).replace(/^export /, "")}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const makeHuntressSprite = new Function(npcCode + ";return makeHuntressSprite;")();
const globals = {
  checkpointIndex, committedWinterChoices,
  reducedMotion: (scene: any) => scene.motionReduced,
  satchelIconFor: () => ({ key: "almanac-icon-hunters-horn", url: "fixture-only" }),
  applySceneActorLighting: (_scene: any, item: any) => { item.lit = true; },
  preloadSatchelIcons: (scene: any, ids: string[]) => { scene.preloadedIds.push(...ids); },
  preloadWren: noop, preloadWolves: noop, preloadWinterNpcs: noop,
  addLocalGroundShadow: () => ({}),
  makeHuntressSprite, stageAnchoredSprite: noop, addContainerWake: noop, decorativeTween: noop,
  addIdleBreath: (scene: any, body: any, options: any) => scene.testBreaths?.push({ body, ...options }),
  winterBackdrop: "fixture-backdrop", runaPortrait: "fixture-runa", snowFoxSprite: "fixture-fox",
  winterTrailBackdrop: "fixture-trail", fallenPineSprite: "fixture-pine",
  winterAftermathCairn: "fixture-cairn", winterAftermathPelt: "fixture-pelt",
  playWrenAction: noop, playWrenFocus: noop, playActorAttention: noop, playBodyImpact: noop,
  playClaimLine: noop, playBodyTypePulse: (_scene: unknown, body: unknown) => bodyPulses.push(body),
  attachWordBodyAnchor: () => ({ destroy: noop }),
  isPuristToggleKey: () => false,
  fadeOutStagedSprite: (_scene: any, sprite: any) => { sprite.scene = false; },
  dismissCompanionCameo: dismissCameo,
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
  const stats = new SessionStats();
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
    typingInput: { getStats: () => stats },
    store: {
      update: (change: (value: typeof state) => void) => change(state),
      setCheckpoint: (checkpoint: any) => { state.checkpoint = structuredClone(checkpoint); checkpoints.push(state.checkpoint); },
    },
    narration: { say: (line: string) => captions.push(line), bottom: () => 300 },
    setNarrator: (text: string) => captions.push(text),
    readThen: (next: () => void) => gates.push(next),
    band: { setObjective: noop },
    fadeInHuntress: noop, dismissFireflyCue: noop, clearForkChoiceWordAnchors: noop,
    showFireflyHollow: noop, receiveFireflyLanternVisual: noop, clearFireflyLantern: noop,
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
  assertEqual(f.s.preloadedIds, ["hunters-horn", "firefly-lantern"], "Winter preloads both accepted fork keepsakes before either enters the satchel");
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

await suite("Winter Huntress passages: both actual words stay with her and the complete Horn phrase clears Wren", () => {
  for (const captionBottom of [300, 430]) {
    const f = fixture();
    f.s.narration.bottom = () => captionBottom;
    f.s.startHuntressBranch(2); f.continue();
    f.targets[0].onComplete(); f.continue();
    for (const target of f.targets) {
      assertEqual([target.x, target.y], [f.s.huntressSprite.x, 576], "the live Huntress owns each unchanged passage rather than the generic center lane");
      const halfWidth = target.word.length * target.fontSize * 0.6 / 2 + 24;
      assert(target.x + halfWidth < f.s.wrenContainer.x - 90, "even the full Horn phrase stays outside Wren's hood lane");
      assert(target.x - halfWidth > 180, "the entire phrase remains comfortably on screen");
      assert(target.y - 36 > captionBottom + 24 && target.y + 36 < 622, "the complete phrase clears narration and the Huntress silhouette");
    }
    assertEqual(f.targets.map(target => target.word), ["free her hands", "she gives you her horn"], "physical alignment changes neither authored phrase");
  }
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
    f.s.presentWinterPassageReaction(owner, owner === "pelt" ? 0 : 1, "Unchanged reaction.", noop);
    assertEqual([f.images.length, f.tweens.length, f.gates.length], [0, 0, 1], `${owner} has no horn handoff or extra wait`);
    assertEqual(f.captions.at(-1), "Unchanged reaction.", `${owner} preserves its existing caption`);
  }
});

// Independently measure generated RGBA pixels rather than trusting the source
// placement constants; transparent margins must not become a floating base.
function aftermathPainting(file: string) {
  const png = readFileSync(new URL(file, import.meta.url));
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert(png[24] === 8 && png[25] === 6 && png[28] === 0, "aftermath cutouts retain non-interlaced RGBA8 transparency");
  const chunks: Buffer[] = [];
  for (let p = 8; p < png.length;) {
    const length = png.readUInt32BE(p);
    if (png.toString("ascii", p + 4, p + 8) === "IDAT") chunks.push(png.subarray(p + 8, p + 8 + length));
    p += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4;
  let previous = new Uint8Array(stride), at = 0, left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    const filter = raw[at++]!, row = new Uint8Array(stride);
    for (let b = 0; b < stride; b++) {
      const a = b >= 4 ? row[b - 4]! : 0, up = previous[b]!, c = b >= 4 ? previous[b - 4]! : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((a + up) / 2);
      else if (filter === 4) {
        const p = a + up - c, da = Math.abs(p - a), db = Math.abs(p - up), dc = Math.abs(p - c);
        predictor = da <= db && da <= dc ? a : db <= dc ? up : c;
      }
      row[b] = (raw[at++]! + predictor) & 255;
    }
    for (let x = 0; x < width; x++) if (row[x * 4 + 3]! > 25) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    previous = row;
  }
  return { width, height, left, top, right: right + 1, bottom: bottom + 1 };
}
const aftermathPaintings = {
  "winter-aftermath-cairn": aftermathPainting("../art/winter/aftermath-cairn.png"),
  "winter-aftermath-pelt": aftermathPainting("../art/winter/aftermath-pelt.png"),
};
const huntressBytes = readFileSync(new URL("../art/winter/huntress.png", import.meta.url));
const huntressDimensions = { width: huntressBytes.readUInt32BE(16), height: huntressBytes.readUInt32BE(20) };

function aftermathFixture(reduced = false) {
  const s = new Winter();
  const stats = new SessionStats();
  stats.bankSoulFraction(0.3);
  const bodies: any[] = [], images: any[] = [], tweens: any[] = [], gates: Array<() => void> = [], targets: any[] = [], timers: any[] = [], tasks: string[] = [];
  const state: any = { realms: { "winter-mountain": { cleared: false, choices: {} } }, satchel: [], almanacLore: [] };
  let foxEntries = 0;
  Object.assign(s, {
    motionReduced: reduced, fireflyCue: null, cairnCue: null, peltCue: null, huntressHornSprite: null, heldPeltSprite: null,
    testBreaths: [],
    clearFireflyLantern: noop,
    huntressHornTransferToken: 0, huntressHornTransferPending: false, forkChoiceWordAnchors: [],
    fork1Choice: "huntress", fork2Choice: null, foxDecided: true, foxSpared: true, candles: 3,
    resumeCheckpoint: null, activeTargets: [], scale: { width: 1920, height: 1080 },
    wrenContainer: { x: 960, y: 842, scene: true }, wrenSprite: {},
    typingInput: { getStats: () => stats },
    store: { get: () => state, update: (fn: (state: any) => void) => fn(state), setCheckpoint: (value: any) => { state.checkpoint = structuredClone(value); } },
    narration: { say: noop, bottom: () => 300 }, setNarrator: noop, band: { setObjective: (text: string) => tasks.push(text) },
    readThen(next: () => void) { assertEqual(gates.length, 0, "each aftermath result retains exactly its existing single Continue"); gates.push(next); },
    makeWord(options: any) { return { ...options, getAnchorX: () => options.x, getAnchorY: () => options.y }; },
    registerActiveTarget(...words: any[]) { targets.push(...words); }, clearActiveTargets: noop, clearForkChoiceWordAnchors: noop,
    startFoxGate() { foxEntries++; }, showFoxCompanion: noop, dismissFoxCompanion: noop,
    time: { delayedCall(ms: number, next: () => void) { timers.push({ ms, next }); } },
    tweens: {
      killTweensOf(body: any) { for (const tween of tweens) if (tween.targets === body) tween.cancelled = true; },
      add(options: any) { tweens.push(options); return options; },
    },
    add: {
      container(x: number, y: number) {
        const body: any = { x, y, scene: true, alpha: 1, children: [], destroyed: 0,
          setDepth(depth: number) { this.depth = depth; return this; },
          setAlpha(alpha: number) { this.alpha = alpha; return this; },
          add(child: any) { this.children.push(child); return this; }, once: noop,
          getByName(name: string) { return this.children.find((child: any) => child.name === name) ?? null; },
          remove(child: any) { this.children = this.children.filter((item: any) => item !== child); return this; },
          removeAll(destroy: boolean) { if (destroy) for (const child of this.children) child.destroy?.(); this.children = []; return this; },
          destroy() { this.destroyed++; this.scene = false; for (const child of this.children) child.destroy?.(); },
        };
        bodies.push(body); return body;
      },
      image(x: number, y: number, key: keyof typeof aftermathPaintings | "huntress") {
        const dimensions = key === "huntress" ? huntressDimensions : aftermathPaintings[key];
        const picture: any = { x, y, key, ...dimensions, scene: true, scale: 1, destroyed: 0, once: noop,
          setOrigin(x: number, y: number) { this.originX = x; this.originY = y; return this; },
          setScale(scale: number) { this.scale = scale; return this; },
          setName(name: string) { this.name = name; return this; },
          setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
          setDepth(depth: number) { this.depth = depth; return this; },
          setAlpha(alpha: number) { this.alpha = alpha; return this; },
          destroy() { this.destroyed++; this.scene = false; },
        };
        images.push(picture); return picture;
      },
      graphics() {
        return { circles: [] as Array<{ x: number; y: number; radius: number }>,
          fillStyle() { return this; },
          fillCircle(x: number, y: number, radius: number) { this.circles.push({ x, y, radius }); return this; },
        };
      },
      existing: noop,
    },
  });
  return { s, bodies, images, tweens, gates, targets, state, timers, tasks, foxEntries: () => foxEntries,
    next() { const next = gates.shift(); assert(next, "the original aftermath response is held"); next!(); } };
}

function assertNearbyWinterChoice(target: any, top: number, captionBottom: number): void {
  // A generous full-banner envelope: the live words use30/32px serif type.
  const halfWidth = target.word.length * target.fontSize * 0.6 / 2 + 24;
  assert(target.y + 36 < top, "the complete choice banner clears its actual subject silhouette");
  assert(top - target.y - 36 < 60, "the choice no longer leaves a detached stretch of empty world above its subject");
  assert(target.y - 36 > captionBottom + 24, "the complete choice banner also clears the narration card");
  assert(target.x + halfWidth < 870 || target.x - halfWidth > 1050,
    "even a conservative full-width banner clears Wren's central hood lane");
}

await suite("Winter fork labels: original choices sit close to their own Huntress and actual firefly glow", () => {
  for (const reduced of [false, true]) for (const captionBottom of [300, 430]) {
    const f = aftermathFixture(reduced);
    const entered: Array<[string, number]> = [];
    Object.assign(f.s, {
      fork1Choice: null, narration: { say: noop, bottom: () => captionBottom },
      startHuntressBranch: (wave: number) => entered.push(["huntress", wave]),
      startFireflyBranch: (wave: number) => entered.push(["firefly", wave]),
    });
    f.s.startFork1(2);
    const huntress = f.s.huntressSprite, fireflies = f.s.fireflyCue;
    const entrance = f.tweens.find(tween => tween.targets === fireflies && typeof tween.y === "number");
    fireflies.y = entrance.y; entrance.onComplete?.();
    assertEqual(f.targets.map(target => target.word), ["save the huntress", "follow the fireflies"], "the original native alternatives and order stay exact");
    const huntressTop = huntress.y - huntress.height * huntress.scale;
    const glow = fireflies.children.find((child: any) => child.circles);
    const breath = f.s.testBreaths.find((item: any) => item.body === fireflies);
    const glowTop = fireflies.y + Math.min(...glow.circles.map((circle: any) => circle.y - circle.radius)) + Math.min(0, breath.dy);
    for (const [target, body, top] of [[f.targets[0], huntress, huntressTop], [f.targets[1], fireflies, glowTop]]) {
      assertEqual(target.x, body.x, "each choice uses its own physical subject's actual column");
      assertNearbyWinterChoice(target, top, captionBottom);
      target.onAdvance(1, target.word.length);
      assertEqual(bodyPulses.at(-1), body, "typing feedback remains attached to that same subject rather than Wren or another cue");
    }
    assertEqual([huntress.x, huntress.y, fireflies.x, fireflies.y], [560, 842, 1330, 774], "closer labels move no physical subject or its settled footing");
    assertEqual([f.state.checkpoint.step, f.state.satchel], ["fork1", []], "the existing checkpoint and unrewarded choice state are unchanged");
    f.targets[0].onComplete();
    assertEqual(entered, [["huntress", 2]], "the original Huntress action still enters the same next-wave branch");
  }
  const f = aftermathFixture();
  let resumedWave = -1;
  Object.assign(f.s, { fork1Choice: null, startFireflyBranch: (wave: number) => { resumedWave = wave; } });
  f.s.startFork1(2); f.targets[1].onComplete();
  assertEqual([f.s.fork1Choice, resumedWave], ["firefly", 2], "the opposite native choice retains its original consequence too");
});

await suite("Winter aftermath labels: original banners clear real painted bounds and keep narration protection", () => {
  for (const reduced of [false, true]) for (const captionBottom of [300, 430]) {
    const f = aftermathFixture(reduced);
    f.s.narration.bottom = () => captionBottom;
    f.s.startFork2();
    for (const [target, body] of [[f.targets[0], f.s.cairnCue], [f.targets[1], f.s.peltCue]]) {
      const image = body.children.find((child: any) => child.key);
      const top = body.y + image.y + (image.top - image.height * image.originY) * image.scale;
      assertEqual(target.x, body.x, "cairn and pelt choices align to their own painted footprint rather than the former generic columns");
      assertNearbyWinterChoice(target, top, captionBottom);
      assertEqual(target.frame, "banner", "the existing readable word presentation stays intact");
    }
    assertEqual([f.s.cairnCue.x, f.s.cairnCue.y, f.s.peltCue.x, f.s.peltCue.y], [650, 792, 1270, 790], "the aftermath props retain their original snow contact and geometry");
    assertEqual(f.state.checkpoint.step, "fork2", "only the existing unanswered aftermath checkpoint is written");
    f.s.narration.bottom = () => 650;
    for (const kind of ["huntress", "firefly", "cairn", "pelt"]) {
      assert(f.s.winterForkChoiceWordPosition(kind).y >= 728, "the previous narration-bottom plus78px protection remains available for taller copy");
    }
    f.s.cairnCue.x += 24; f.s.peltCue.x -= 24;
    assertEqual(f.s.winterForkChoiceWordPosition("cairn").x, f.s.cairnCue.x, "cairn identity resolves the actual live cue");
    assertEqual(f.s.winterForkChoiceWordPosition("pelt").x, f.s.peltCue.x, "pelt identity cannot accidentally resolve another sprite");
  }
});

await suite("Winter painted aftermath: actual alpha footprints stay planted at the existing floor and label origins", () => {
  for (const reduced of [false, true]) {
    const f = aftermathFixture(reduced);
    const cairn = f.s.showCairnCue(), pelt = f.s.showPeltCue();
    for (const [body, x, y, floor] of [[cairn, 650, 792, 812], [pelt, 1270, 790, 808]] as const) {
      const image = body.children.find((item: any) => item.key);
      assertEqual([body.x, body.y], [x, y], "the original settled word-owner/tether origin is preserved");
      assertClose(body.y + image.y + (image.bottom - image.height * image.originY) * image.scale,
        floor, 0.01, "the real painted alpha base meets the original snow contact, independent of export padding");
      assertClose((image.right - image.left) * image.scale, 180, 0.01, "the natural visible footprint remains180px wide");
      assertClose((image.left + image.right - 2 * image.width * image.originX) * image.scale / 2,
        0, 0.01, "the real silhouette is centered on its existing owner");
      assertEqual(body.alpha, reduced ? 1 : 0, "reduced motion presents the settled prop immediately");
    }
    assertEqual(f.s.showCairnCue(), cairn, "repeated presentation reuses the same cairn");
    assertEqual(f.s.showPeltCue(), pelt, "repeated presentation reuses the same pelt");
    for (const tween of f.tweens) {
      assertEqual(Object.keys(tween).filter(key => ["x", "y", "scaleX", "scaleY", "repeat"].includes(key)), [], "solid props only fade, with no lift, bob or scaling");
      assertEqual(tween.duration, 560, "the original entrance duration is retained");
    }
    f.s.clearWinterForkCues(); f.s.clearWinterForkCues();
    assert(f.bodies.every(body => body.destroyed === 1) && f.images.every(image => image.destroyed === 1), "actual repeated cleanup destroys each physical object exactly once");
    assert(f.tweens.every(tween => tween.cancelled), "leaving cancels unfinished alpha entrances");
    assertEqual([f.s.cairnCue, f.s.peltCue], [null, null], "no reference can contaminate a fresh chapter entry");
  }
});

await suite("Winter painted aftermath: both exact choices, passage responses and checkpoints preserve their existing flow", () => {
  for (const reduced of [false, true]) for (const choice of ["bury", "pelt"]) {
    const f = aftermathFixture(reduced);
    f.s.startFork2();
    assertEqual(f.targets.map(target => target.word), ["bury the pack leader", "take the pelt"], "the two native choice words retain their original order");
    const chosen = choice === "bury" ? f.s.cairnCue : f.s.peltCue;
    const unused = choice === "bury" ? f.s.peltCue : f.s.cairnCue;
    f.targets[choice === "bury" ? 0 : 1].onComplete();
    assertEqual(unused.destroyed, 1, "selecting releases the unchosen physical object");
    const phrases = choice === "bury" ? ["carry the stones", "let him rest here"] : ["claim the pelt", "carry it home"];
    for (const [index, word] of phrases.entries()) {
      const target = f.targets.at(-1);
      assertEqual(target.word, word, "each authored passage remains exact");
      assertEqual([target.x, target.y], [chosen.x, 660], "each live aftermath phrase stays above its actual selected painted prop");
      target.onClaim({ spell: false, alt: false }); target.onAdvance(word.length, word.length);
      target.onComplete();
      assert(chosen.scene, "the selected painted subject stays for the existing held response");
      assertEqual([f.state.checkpoint.step, f.state.checkpoint.data.index, f.state.checkpoint.data.reading], [choice, index, true], "the original saved response contract is unchanged");
      assertEqual(f.state.satchel, [], "art presentation does not move the final realm reward earlier");
      assertEqual(f.foxEntries(), 0, "the original response cannot auto-skip into the companion gate");
      f.next();
    }
    assertEqual([f.state.realms["winter-mountain"].choices.fork2, f.state.checkpoint.step], [choice, "fox-gate"], "durable choice and next stable checkpoint are unchanged");
    assertEqual([chosen.destroyed, f.foxEntries(), f.timers.map(timer => timer.ms)], [0, 0, [900]], "the last Continue retains the original900ms passage-to-gate interval");
    f.timers[0].next();
    assertEqual([chosen.destroyed, f.foxEntries()], [1, 1], "the last existing Continue releases the selected prop and enters the original gate once");
  }
});

await suite("Winter painted aftermath: saved held responses reconstruct the correct physical subject without replaying completed words", () => {
  for (const choice of ["bury", "pelt"]) {
    const f = aftermathFixture(true);
    f.s.resumeCheckpoint = { step: choice, data: { index: 0, reading: true } };
    f.s.startAftermathPassage(choice);
    assertEqual(f.targets.length, 0, "restoring an acknowledged phrase does not replay its target");
    const body = choice === "bury" ? f.s.cairnCue : f.s.peltCue;
    assert(body?.scene && body.children.some((child: any) => child.key === `winter-aftermath-${choice === "bury" ? "cairn" : "pelt"}`), "the saved response reconstructs its painted owner immediately");
    f.next();
    assertEqual(f.targets.at(-1).word, choice === "bury" ? "let him rest here" : "carry it home", "Continue asks for only the original pending second phrase");
  }
});

await suite("Winter carried pelt: the same source empties before its held response and stays visible until the fox refusal Continue", () => {
  for (const reduced of [false, true]) {
    const f = aftermathFixture(reduced);
    f.s.startAftermathPassage("pelt");
    const cue = f.s.peltCue;
    const source = cue.getByName("winter-aftermath-pelt");
    f.targets.at(-1).onComplete();
    assertEqual(f.s.heldPeltSprite, null, "claiming alone does not take the pelt before the authored carry phrase");
    assertEqual(f.tasks.at(-1), "Type the pelt passage to carry the winter home.", "the first response retains the original passage instruction");
    assertEqual(cue.getByName("winter-aftermath-pelt"), source, "the original painting remains on the ground during the first response");
    f.next();
    assertEqual(f.targets.at(-1).word, "carry it home", "the original final phrase performs the handoff");
    let receivedResponse = 0, foxResponse = 0;
    f.s.setNarrator = (text: string) => {
      if (text.includes("frost and old forests")) {
        assertEqual([f.s.heldPeltSprite, cue.children.length], [source, 0], "the actual source and its ground shadow are gone before the received response appears");
        receivedResponse++;
      }
      if (text.includes("pelt in your hands")) {
        assertEqual(f.s.heldPeltSprite, source, "the fox's actual refusal sees the same received painting still held");
        assert(source.scene, "the received pelt cannot vanish before the refusal reading");
        foxResponse++;
      }
    };
    f.targets.at(-1).onComplete();
    assertEqual(f.tasks.at(-1), "The pelt is in your hands. Press Enter or Space to continue.", "the final held response acknowledges the visible item instead of asking for finished typing");
    assertEqual([receivedResponse, f.gates.length, f.timers.length], [1, 1, 0], "the synchronous transfer adds no wait, timer or Continue");
    assertEqual([source.x, source.y, source.depth, source.alpha], [1024, 746, 61, 1], "the folded fur rests beside Wren's hand at fixed opacity");
    assertClose((source.right - source.left) * source.scale, 104, 0.01, "the received pelt has a modest104px true-alpha width");
    assert(!f.tweens.some(tween => tween.targets === source), "the held solid has no bob or transfer animation gate");
    f.next();
    assertEqual(f.timers.map(timer => timer.ms), [900], "the final response retains the original passage interval");
    f.timers[0].next();
    assertEqual([cue.destroyed, source.destroyed, f.s.heldPeltSprite], [1, 0, source], "ordinary branch cleanup removes the empty source while keeping received fur");
    Winter.prototype.startFoxGate.call(f.s);
    assertEqual([foxResponse, f.images.length, f.gates.length], [1, 1, 1], "the unchanged fox refusal reuses the held item and its original single Continue");
    f.next();
    assertEqual([source.destroyed, f.s.heldPeltSprite, f.state.checkpoint.step, f.gates.length], [1, null, "true-name", 1], "that existing Continue stows the pelt before the original true-name introduction");
    assertEqual([f.targets.length, f.state.satchel], [2, []], "presentation adds no typed action or early realm reward");
  }
});

await suite("Winter carried pelt: existing response and fox-gate checkpoints restore the truthful received state", () => {
  for (const checkpoint of ["pelt", "fox-gate"]) {
    const f = aftermathFixture(true);
    if (checkpoint === "pelt") {
      f.s.resumeCheckpoint = { step: "pelt", data: { index: 1, reading: true } };
      f.s.startAftermathPassage("pelt");
      assertEqual(f.s.peltCue.children.length, 0, "a restored received response leaves the reconstructed ground source empty");
      assertEqual(f.tasks.at(-1), "The pelt is in your hands. Press Enter or Space to continue.", "the existing saved final response restores its truthful held objective too");
    } else {
      f.s.fork2Choice = "pelt";
      Winter.prototype.startFoxGate.call(f.s);
      assertEqual(f.s.peltCue, null, "the later checkpoint reconstructs only the received item, without inventing a ground copy");
    }
    const pelt = f.s.heldPeltSprite;
    assert(pelt?.scene, "the existing checkpoint recreates the pelt before its held reading");
    assertEqual([f.targets.length, f.gates.length], [0, 1], "restoration replays no completed words and retains only the original reading gate");
    f.s.receivePeltVisual();
    assertEqual([f.s.heldPeltSprite, f.images.length], [pelt, 1], "reconstructing received state is idempotent");
    f.s.clearWinterForkCues();
    assertEqual([pelt.destroyed, f.s.heldPeltSprite], [1, null], "leaving either restored state releases its received prop");
  }
});

await suite("Winter carried pelt: full cleanup and actual scene init cannot retain a received item across reuse", () => {
  const f = aftermathFixture();
  f.s.showPeltCue();
  const source = f.s.peltCue.getByName("winter-aftermath-pelt");
  f.s.receivePeltVisual();
  f.s.clearWinterForkCues(); f.s.clearWinterForkCues();
  assertEqual([source.destroyed, f.s.heldPeltSprite], [1, null], "shutdown cleanup destroys the detached received painting once");
  f.s.receivePeltVisual();
  const fresh = f.s.heldPeltSprite;
  assert(fresh !== source && fresh.scene, "a subsequent entry can reconstruct a fresh received state");
  f.s.init({ store: f.s.store });
  assertEqual([fresh.destroyed, f.s.heldPeltSprite], [1, null], "actual init clears the old received object as well as its reference");
});

await suite("Winter fox refusal: normal departure is finite during the same reading; reduced motion is already absent", () => {
  for (const reduced of [false, true]) for (const missing of ["huntress", "burial"]) {
    const f = aftermathFixture(reduced);
    f.s.fork1Choice = missing === "huntress" ? "firefly" : "huntress";
    f.s.fork2Choice = missing === "burial" ? "pelt" : "bury";
    let fox: any;
    let captions = 0;
    f.s.clearFoxWordAnchors = noop;
    f.s.dismissFoxCompanion = Winter.prototype.dismissFoxCompanion;
    f.s.showFoxCompanion = () => {
      fox = { x: 610, y: 830, alpha: 0, scale: 1, scene: true, destroyed: 0,
        setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
        setScale(scale: number) { this.scale = scale; return this; },
        setAlpha(alpha: number) { this.alpha = alpha; return this; },
        destroy() { this.scene = false; this.destroyed++; },
      };
      f.s.foxCompanion = fox;
      f.s.tweens.add({ targets: fox, x: 700, y: 830, alpha: 1, duration: 720 });
    };
    f.s.setNarrator = (text: string) => {
      assert(missing === "burial" ? text.includes("pelt in your hands") : text.includes("turns back into the pines"), "the exact refusal still describes the same unearned condition");
      if (reduced) assertEqual([fox.scene, fox.destroyed], [false, 1], "reduced motion has no lingering fox when the departure card appears");
      else {
        const outgoing = f.tweens.at(-1);
        assertEqual([fox.x, fox.y, fox.alpha, outgoing.x, outgoing.y, outgoing.alpha, outgoing.duration], [700, 830, 1, 620, 820, 0, 760], "normal motion visibly steps back and fades from the existing clearing contact without a delayed wait");
      }
      captions++;
    };
    Winter.prototype.startFoxGate.call(f.s);
    assertEqual([captions, f.gates.length, f.timers.length, f.targets.length], [1, 1, 0, 0], "the same refusal reading has one existing Continue and no delayed departure or extra typed action");
    assertEqual(f.s.foxCompanion, null, "a departed fox is released synchronously from the chapter's active companion reference");
    assert(f.tweens[0].cancelled, "departure cancels the original arrival instead of letting it bring the fox back");
    if (missing === "burial") assert(f.s.heldPeltSprite?.scene, "the received pelt remains visible through the fox's refusal");
    if (!reduced) {
      const outgoing = f.tweens.at(-1);
      Object.assign(fox, { x: outgoing.x, y: outgoing.y, alpha: outgoing.alpha });
      outgoing.onComplete();
      assertEqual([fox.scene, fox.destroyed], [false, 1], "the normal departure actually removes the old body while the reading remains held");
      assertEqual(f.gates.length, 1, "settling departure cannot advance or replace the held card");
      const replacement = { scene: true };
      f.s.foxCompanion = replacement;
      outgoing.onComplete();
      assertEqual([replacement.scene, f.s.foxCompanion], [true, replacement], "a late old callback cannot remove a new fox or re-read scene state");
    }
    f.next();
    assertEqual([f.state.checkpoint.step, f.gates.length, f.state.satchel], ["true-name", 1, []], "the same Continue keeps the original true-name gate and rewards");
    assertEqual(f.s.heldPeltSprite, null, "the existing Continue still stows any received pelt");
  }
});
