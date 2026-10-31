import { readFileSync } from "node:fs";
import ts from "typescript";
import { woodStep, woodIndex } from "../src/game/woodCheckpoint";
import { assert, assertClose, assertEqual, suite } from "./_assert";

const url = new URL("../src/scenes/HauntedWoodScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const sceneClass = source.statements.find(ts.isClassDeclaration)!;
const methods = ["finishFlute","init", "preload", "createRootedWoodProp", "addRootedWoodPainting", "createOfferingCue", "createBoneFluteCue", "createGroveLightCue", "showFork1Cues", "showFork2Cues", "startFork1", "startFork2", "makeWoodForkWord", "fadeOutForkCue", "drawShrine", "pulseShrine", "settleBoneFluteInHand", "showGatheredAshVial", "clearHeldWoodRelic", "clearWoodForkCues", "startFork1BoneFlute", "startFork2Force", "runPassageChain", "ownerPassageWordPosition", "drawGhostKingRootThrone", "drawGhostKing", "fadeGhostKingBody", "onKeyDown"];
const constants = source.statements.filter(ts.isVariableStatement).flatMap(statement =>
  statement.declarationList.declarations.filter(declaration => ["WOOD_BRANCH_WORD_Y", "GHOST_KING_SPRITE_HEIGHT"].includes(declaration.name.getText(source)))
    .map(declaration => `const ${declaration.getText(source)};`)).join("\n");
const code = ts.transpileModule(`${constants}\nclass Wood { ${methods.map(name => sceneClass.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")} }`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const textures = Object.fromEntries([
  ["wood-bone-flute", "../art/relics/bone-flute.png"], ["wood-ash-vial", "../art/relics/ash-vial.png"],
  ["wood-root-throne", "../art/wood/root-throne.png"], ["ghost-king", "../art/wood/ghost-king.png"],
  ["wood-offering-shrine", "../art/wood/offering-shrine.png"], ["wood-flute-hollow", "../art/wood/flute-hollow.png"],
].map(([key, path]) => {
  const png = readFileSync(new URL(path!, import.meta.url));
  return [key, { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }];
}));
const noop = () => {};

function fixture(reduced = false) {
  const images: any[] = [];
  const tweens: any[] = [];
  const captions: string[] = [];
  const entered: string[] = [];
  const breaths: any[] = [];
  const loaded: string[] = [];
  const tasks: string[] = [];
  const targets: any[] = [], attentions: any[] = [];
  const save = { satchel: [] as string[], realms: {} };
  let gate: (() => void) | undefined;
  let target: any;
  const assets = ["hauntedWoodBackdrop", "woodGhostSprite", "ghostKingSprite", "rootThroneSprite", "wispCatSprite", "snowFoxSprite", "groveFireSprite", "runaPortrait", "boneFluteSprite", "ashVialSprite", "offeringShrineSprite", "fluteHollowSprite"];
  const Wood = new Function("beginAssetLoad", "assetLoadBlocked", "woodStep", "woodIndex", ...assets, "preloadSatchelIcons", "preloadWren", "reducedMotion", "addLocalGroundShadow", "addContainerWake", "addIdleBreath", "playChime", "playWrenAction", "playWrenFocus", "playBodyImpact", "PALETTE_HEX", "isPuristToggleKey", "togglePuristMode", "playClack", "resolveRealmFork", "resolveCompanionDecision", "applySceneActorLighting", "attachWordBodyAnchor", "playClaimLine", "playActorAttention", "playBodyTypePulse", "Phaser", code + ";return Wood;")(
    // Artwork failure lifecycle is covered separately; this fixture isolates prop actions.
    noop, () => false,
    woodStep, woodIndex, ...assets, noop, noop, () => reduced, () => ({}), noop, (_scene: unknown, body: any) => breaths.push(body), noop, noop, noop, noop, { moss: 0 }, () => false, noop, noop, () => null, () => null,
    (_scene: unknown, image: any) => { image.lit = true; }, () => ({ destroy: noop }), noop,
    (_scene: unknown, body: any) => attentions.push(body), noop, { GameObjects: { Events: { DESTROY: "destroy" } } },
  );
  const scene = new Wood();
  const graphics = () => new Proxy({ scene: true }, { get: (value, key) => key in value ? value[key as keyof typeof value] : () => drawing });
  let drawing: any;
  const container = (x: number, y: number) => ({ x, y, scene: true, depth: 0, alpha: 1, children: [] as any[],
    data: new Map<string, unknown>(), listeners: [] as Array<() => void>,
    setData(key: string, value: unknown) { this.data.set(key, value); return this; },
    getData(key: string) { return this.data.get(key); },
    once(_event: string, callback: () => void) { this.listeners.push(callback); return this; },
    setDepth(value: number) { this.depth = value; return this; }, setAlpha(value: number) { this.alpha = value; return this; },
    add(child: any) { this.children.push(child); child.parent = this; return this; },
    remove(child: any) { this.children = this.children.filter(value => value !== child); child.parent = null; return this; },
    destroy() { this.scene = false; for (const child of this.children) child.destroy?.(); this.children = []; for (const listener of this.listeners.splice(0)) listener(); },
  });
  Object.assign(scene, {
    checkpoint() {},
    scale: { width: 1920, height: 1080 },
    wrenContainer: { x: 960, y: 826 }, wrenSprite: {},
    heldWoodRelic: null, boneFluteProp: null, fluteHandoffPending: false, offeringCue: null, groveLightCue: null, forkChoiceWordAnchors: [],
    store: { get: () => save, update: (edit: (state: typeof save) => void) => edit(save) },
    load: { image: (key: string) => loaded.push(key) },
    add: {
      container,
      graphics: () => { drawing = graphics(); return drawing; },
      image(x: number, y: number, key: string) {
        const dimensions = textures[key];
        assert(dimensions, "world prop uses a real existing painted texture");
        const image = { x, y, key, scene: true, parent: null as any, ...dimensions, scale: 1, depth: 0, alpha: 1, originX: 0.5, originY: 0.5,
          setScale(value: number) { this.scale = value; return this; }, setDepth(value: number) { this.depth = value; return this; },
          setAlpha(value: number) { this.alpha = value; return this; }, setOrigin(x: number, y: number) { this.originX = x; this.originY = y; return this; },
          setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
          getWorldTransformMatrix() { return { tx: this.x + (this.parent?.x ?? 0), ty: this.y + (this.parent?.y ?? 0) }; },
          destroy() { this.scene = false; },
        };
        images.push(image); return image;
      },
      existing(image: any) { assertEqual(image.parent, null, "the moved flute has left the hollow container before joining the scene"); },
    },
    tweens: {
      add(options: any) { tweens.push(options); return options; },
      killTweensOf(body: any) { for (const tween of tweens) if (tween.targets === body) tween.cancelled = true; },
    },
    band: { setObjective(text: string) { tasks.push(text); } },
    narration: { say(text: string) { captions.push(text); } },
    setNarrator(text: string) { captions.push(text); },
    readThen(next: () => void) { assert(!gate, "an unread result is not overwritten"); gate = next; },
    commitFork: (_fork: string, requested: string) => requested,
    fadeOutForkCue: noop, clearForkChoiceWordAnchors: noop, clearActiveTargets: noop,
    makeWord: (options: any) => options, makeWoodForkWord: (_body: any, options: any) => options,
    makeGhostKingWord: (options: any) => options,
    registerActiveTarget(...values: any[]) { targets.push(...values); target = values.at(-1); },
    attendGhostKing: noop, igniteGroveLightCue: noop,
    startAct3() { entered.push("king"); }, startBossFight() { entered.push("boss"); },
    makeGhostKingRootBase: container, playGhostKingStagePulse: noop,
  });
  const finish = (tween: any) => {
    for (const object of Array.isArray(tween.targets) ? tween.targets : [tween.targets]) {
      for (const key of ["x", "y", "alpha"]) if (typeof tween[key] === "number") object[key] = tween[key];
    }
    tween.onComplete?.();
  };
  return { scene, images, tweens, captions, save, entered, loaded, breaths, tasks, targets, attentions, target: () => target, gate: () => gate,
    continue() { assert(gate, "the actual reading gate is available"); const next = gate!; gate = undefined; next(); }, finish };
}

await suite("Wood rooted props: accepted stone and hollow stay planted through creation, feedback and dismissal", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced);
    f.scene.preload();
    assert(f.loaded.includes("wood-offering-shrine") && f.loaded.includes("wood-flute-hollow"), "a fresh chapter preloads both physical supports before a choice is earned");
    f.scene.showFork1Cues(); f.scene.showFork2Cues();
    const offering = f.scene.offeringCue, hollow = f.scene.boneFluteCue, grove = f.scene.groveLightCue;
    for (const [body, x, texture] of [[offering, 690, "wood-offering-shrine"], [hollow, 1230, "wood-flute-hollow"], [grove, 560, "wood-offering-shrine"]] as const) {
      assertEqual([body.x, body.y, body.getData("rooted-wood-prop")], [x, 812, true], "the physical support starts on its final ground anchor");
      const painting = body.children.find((child: any) => child.key === texture);
      assert(painting?.lit, "the stone and roots receive the scene's woodland lighting");
      assertEqual(painting.y, 0, "the painted feet belong to the owning ground container");
      // Accepted-image alpha measurements, independent of the production fit.
      const [left, right, bottom, width] = texture === "wood-offering-shrine"
        ? [20, 1428, 907, 230] : [27, 1516, 991, 260];
      assertClose((right - left) * painting.scale, width, 0.001, "the visible painting fits its intended world width rather than the PNG's transparent export width");
      assertClose(((left + right) / 2 - painting.originX * painting.width) * painting.scale, 0, 0.001, "the visible roots remain centered on their actual ground owner");
      assertClose((bottom - painting.originY * painting.height) * painting.scale, 0, 0.001, "the solid painted feet meet the ground even with transparent bottom padding");
      const movements = f.tweens.filter(tween => tween.targets === body);
      assertEqual(movements.length, reduced ? 0 : 1, "reduced motion needs no entrance wait; ordinary arrival only fades the same solid prop");
      assert(movements.every(tween => !["x", "y", "scaleX", "scaleY", "repeat", "yoyo"].some(key => key in tween)), "solid roots/stone never slide, breathe or scale on arrival");
      if (movements[0]) f.finish(movements[0]);
      assertEqual([body.x, body.y, body.alpha], [x, 812, 1], "the settled prop is fully opaque and still grounded");
    }
    assertEqual(f.breaths, [], "no physical choice owner gets an idle bob");
    const count = f.images.length;
    f.scene.showFork1Cues(); f.scene.showFork2Cues();
    assertEqual(f.images.length, count, "repeated choice setup reuses its existing supports and single flute");
    const actual = Object.getPrototypeOf(f.scene);
    const word = actual.makeWoodForkWord.call(f.scene, offering, { word: "leave an offering", x: 505, y: 500, onComplete: noop }, -42);
    word.onClaim({ spell: false, alt: false }); word.onAdvance(1, 17);
    assertEqual(f.attentions, [], "claiming a rooted prop keeps its physical scale still while word/particle feedback remains available");
    actual.fadeOutForkCue.call(f.scene, offering);
    const fade = f.tweens.at(-1);
    assert(!("y" in fade) && fade.alpha === 0 && fade.duration === 540, "dismissal retains its original duration without making stone float off the floor");
    f.finish(fade);
    assert(!offering.scene, "the same cleanup callback releases the finished physical support");
    f.scene.clearWoodForkCues();
    assert(!hollow.scene && !grove.scene, "leaving releases the remaining rooted props and their owned images");
    assertEqual([f.scene.offeringCue, f.scene.boneFluteCue, f.scene.groveLightCue, f.scene.boneFluteProp], [null, null, null, null], "no physical prop reference survives scene cleanup");
  }
});

await suite("Wood choices: actual fork entries leave the new world art and Ghost-King silhouette clear", () => {
  const shrine = fixture();
  shrine.scene.startFork1();
  assertEqual(shrine.targets.map(target => [target.word, target.x, target.y]), [
    ["leave an offering", 690, 612], ["take the bone-flute", 1230, 612],
  ], "both original native choices sit above the rooted paintings without changing their words or sides");
  for (const target of shrine.targets) {
    const halfWidth = target.word.length * 18 / 2 + 24;
    assert(target.x + halfWidth < 890 || target.x - halfWidth > 1030, "each complete banner clears Wren horizontally while staying near its low prop");
    assert(target.y - 44 > 360 && target.y + 44 < 690, "banners clear the caption lane and the top of the rooted silhouettes");
  }
  const centerShrine = shrine.scene.shrineFigure;
  assert(centerShrine.children.some((child: any) => child.key === "wood-offering-shrine"), "the central shrine uses the same painted stone and roots as its offering support");
  shrine.scene.pulseShrine();
  assert(!shrine.attentions.includes(centerShrine), "the shrine's glow does not swell its physical stone");
  assert(shrine.tweens.filter(tween => tween.targets === centerShrine).every(tween => !["x", "y", "scaleX", "scaleY", "repeat"].some(key => key in tween)), "central stone shares the same stationary world frame");
  const king = fixture();
  king.scene.ghostKingBody = { scene: true, x: 1400, y: 604 };
  king.scene.startFork2();
  const fireChoice = king.targets.find(target => target.word === "light the grove");
  assertEqual([fireChoice.x, fireChoice.y], [520, 500], "the unchanged fire choice sits in clear left space instead of across the King's torso");
  const halfLargePlateWidth = fireChoice.word.length * 20 / 2 + 26;
  assert(fireChoice.x + halfLargePlateWidth < 880 && fireChoice.y + 46 < 586, "even a conservative large-text plate clears Wren's hood and the King's entire right column");
  assert(fireChoice.x - halfLargePlateWidth > 180 && fireChoice.y - 46 > 360, "the complete large plate also clears screen edges and the held-caption lane");
  assertEqual(king.save.satchel, [], "changing the choice presentation pre-awards no relic or branch outcome");
});

await suite("Wood flute: native taking empties the hollow and shows the existing painting in Wren's hand before its held result", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced);
    f.scene.boneFluteCue = f.scene.createBoneFluteCue();
    const hollow = f.scene.boneFluteCue;
    const flute = f.scene.boneFluteProp;
    assert(hollow.children.includes(flute), "the original choice displays its actual painted flute");
    f.scene.startFork1BoneFlute();
    f.continue();
    assertEqual(f.target().word, "reach in", "the first native action is unchanged");
    f.target().onComplete();
    assert(hollow.children.includes(flute), "reaching alone does not take the flute or grant a reward");
    f.continue();
    assertEqual(f.target().word, "take it", "the original final native action is unchanged");
    f.scene.wrenContainer = { x: 1010, y: 810 };
    f.target().onComplete();
    assert(!hollow.children.includes(flute), "the same flute leaves the hollow before the held result");
    assertEqual(f.scene.heldWoodRelic, flute, "the actual painted source moves, with no second flute created");
    assertEqual(f.images.filter(image => image.key === "wood-bone-flute").length, 1, "one world flute exists throughout the action");
    assertEqual(f.save.satchel, [], "taking still precedes the original reward Continue");
    const movement = f.tweens.find(tween => tween.targets === flute);
    if (!reduced) {
      assert(!f.gate(), "the held cold-flute response waits until the visible movement settles");
      assert(!f.captions.some(text => text.startsWith("The flute is cold.")), "the result is not described while the flute remains in transit");
      assertEqual(movement.duration, 520, "the bounded handoff has no gameplay deadline");
      assert(f.scene.fluteHandoffPending && f.tasks.at(-1) === "Taking the flute…", "the temporary wait describes movement while holding typing input");
      f.finish(movement);
    } else {
      assert(!movement, "reduced motion settles directly without a travel tween");
    }
    assertEqual(f.scene.fluteHandoffPending, false, "a settled or reduced-motion handoff releases input before the response gate");
    assertEqual([flute.x, flute.y], [1062, 714], "the hand follows actual Wren coordinates, not a fixed scene point");
    assertEqual([flute.depth, flute.alpha], [43, 1], "the held flute remains visible above the world actor");
    assertEqual(flute.height * flute.scale, 86, "the hand-held flute has a physical, readable size");
    assert(f.captions.at(-1)?.startsWith("The flute is cold."), "the original truthful result appears after the handoff");
    f.continue();
    assertEqual(f.save.satchel, ["bone-flute"], "the original response Continue earns the single relic");
    assert(flute.scene && f.entered.length === 0, "the reward acknowledgment stays held with the physical item");
    f.continue();
    assertEqual(f.entered, ["king"], "the reward Continue reaches the original next act");
    assert(!flute.scene && f.scene.heldWoodRelic === null, "the item is stowed before the next act");
  }
});

await suite("Wood gathered ash: the existing vial is visible before the consequence card and stowed before the original boss gate", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced);
    f.scene.startFork2Force();
    const vial = f.images.find(image => image.key === "wood-ash-vial");
    assert(vial?.scene, "the gathered result has a real painted vial in the world");
    assertEqual([vial.x, vial.y, vial.height * vial.scale], [1012, 730, 62], "the compact vial sits at Wren's hand below the hood");
    assertEqual(f.save.satchel, ["ash-vial"], "the original force reward remains immediate");
    assert(f.captions.at(-1)?.includes("vial of ash"), "the unchanged consequence agrees with the visible prop");
    assertEqual(f.entered, [], "combat still waits for the original held Continue");
    f.continue();
    assert(!vial.scene && f.scene.heldWoodRelic === null, "Continue stows the vial before the king's challenge");
    assertEqual(f.entered, ["boss"], "the original combat stage follows without another input or timer");
  }
});

await suite("Wood prop cleanup: leaving during a normal handoff cannot reveal a stale result or retain a held item", () => {
  const f = fixture();
  f.scene.boneFluteCue = f.scene.createBoneFluteCue();
  const flute = f.scene.boneFluteProp;
  let called = 0;
  f.scene.settleBoneFluteInHand(() => called++);
  const movement = f.tweens.find(tween => tween.targets === flute);
  f.scene.clearWoodForkCues();
  assert(!flute.scene && movement.cancelled, "real scene cleanup destroys the detached prop and cancels its tween");
  assertEqual(f.scene.fluteHandoffPending, false, "leaving cancels the input wait as well as the visual tween");
  f.finish(movement);
  assertEqual(called, 0, "a late movement completion cannot create a stale reading gate after shutdown");
  f.scene.clearWoodForkCues();
  f.scene.showGatheredAshVial();
  const vial = f.scene.heldWoodRelic;
  f.scene.clearWoodForkCues();
  assert(!vial.scene && f.scene.heldWoodRelic === null, "the same cleanup also removes a held ash vial");
  f.scene.fluteHandoffPending = true;
  f.scene.init({ store: f.scene.store });
  assertEqual(f.scene.fluteHandoffPending, false, "actual scene initialization resets any stale handoff wait");
  f.scene.boneFluteCue = f.scene.createBoneFluteCue();
  f.scene.settleBoneFluteInHand(() => called++);
  f.finish(f.tweens.at(-1));
  assertEqual([called, f.scene.fluteHandoffPending], [1, false], "a fresh re-entry completes normally after the earlier action was cancelled");
});

await suite("Wood flute handoff: early Continue and typing cannot enter the miss-counting controller while pause and browser shortcuts retain ownership", () => {
  const f = fixture();
  f.scene.boneFluteCue = f.scene.createBoneFluteCue();
  f.scene.settleBoneFluteInHand(noop);
  let menu = 0;
  let reading = 0;
  let prevented = 0;
  f.scene.chapterMenu = { handleKey(event: KeyboardEvent) { menu += 1; return event.key === "Escape"; } };
  f.scene.reading = { handleKey() { reading += 1; return false; } };
  f.scene.typingInput = { handleChar() { throw new Error("Handoff input reached the miss-counting controller"); } };
  const key = (value: string, ctrl = false, meta = false) => ({ key: value, ctrlKey: ctrl, metaKey: meta, preventDefault() { prevented += 1; } });
  for (const value of ["Enter", " ", "x", "Backspace"]) f.scene.onKeyDown(key(value));
  assertEqual([menu, reading, prevented], [4, 4, 4], "early keys are consumed after the existing menu and reading routing points");
  f.scene.onKeyDown(key("Escape"));
  assertEqual([menu, reading, prevented], [5, 4, 4], "Escape can still pause the scene during movement");
  f.scene.onKeyDown(key("l", true));
  f.scene.onKeyDown(key("l", false, true));
  assertEqual([menu, reading, prevented], [5, 4, 4], "Ctrl and Meta shortcuts are not consumed or forwarded");
  f.scene.clearWoodForkCues();
  let forwarded = "";
  f.scene.typingInput = { handleChar(value: string) { forwarded += value; } };
  f.scene.onKeyDown(key("a"));
  assertEqual(forwarded, "a", "normal typing resumes after cancelled handoff cleanup");
});

await suite("Wood flute completion: the final native letter protects both the target exit fade and handoff before normal reading resumes", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced);
    f.scene.boneFluteCue = f.scene.createBoneFluteCue();
    f.scene.startFork1BoneFlute();
    f.continue();
    const reach = f.target();
    reach.onAdvance(reach.word.length, reach.word.length);
    assertEqual(f.scene.fluteHandoffPending, false, "the unrelated first phrase retains its normal completion behavior");
    reach.onComplete();
    f.continue();
    const take = f.target();
    take.onAdvance(take.word.length - 1, take.word.length);
    assertEqual(f.scene.fluteHandoffPending, false, "partial typing still permits the final native letter");
    let forwarded = "";
    let prevented = 0;
    let readingKeys = 0;
    f.scene.chapterMenu = { handleKey: () => false };
    f.scene.reading = { handleKey(event: KeyboardEvent) {
      if (f.gate() && (event.key === "Enter" || event.key === " ")) {
        readingKeys += 1;
        f.continue();
        return true;
      }
      return false;
    } };
    f.scene.typingInput = { handleChar(value: string) { forwarded += value; } };
    const key = (value: string) => ({ key: value, ctrlKey: false, metaKey: false, preventDefault() { prevented += 1; } });
    take.onAdvance(take.word.length, take.word.length);
    assert(f.scene.fluteHandoffPending && !f.gate(), "the final letter locks input before the target's delayed completion callback");
    for (const value of [" ", "a", "Enter"]) f.scene.onKeyDown(key(value));
    assertEqual([forwarded, prevented], ["", 3], "keys during the original 320ms exit fade cannot reach the miss-counting controller");
    take.onComplete();
    if (!reduced) {
      assert(f.scene.fluteHandoffPending && !f.gate(), "the same guard continues through normal hand movement");
      for (const value of [" ", "a"]) f.scene.onKeyDown(key(value));
      assertEqual([forwarded, prevented], ["", 5], "the following 520ms handoff remains protected");
      f.finish(f.tweens.find(tween => tween.targets === f.scene.heldWoodRelic));
    }
    assert(!f.scene.fluteHandoffPending && f.gate(), "settling releases the guard into the original held reading gate");
    f.scene.onKeyDown(key(" "));
    assertEqual([readingKeys, forwarded, f.save.satchel], [1, "", ["bone-flute"]], "the next normal Space is owned by reading and earns the original reward");
    f.scene.onKeyDown(key("Enter"));
    assertEqual([readingKeys, f.entered], [2, ["king"]], "normal reward Continue still stows the flute and advances");
    f.scene.onKeyDown(key("z"));
    assertEqual(forwarded, "z", "ordinary typing resumes after the handoff and reading gates");
  }
  const missing = fixture();
  missing.scene.fluteHandoffPending = true;
  let settled = false;
  missing.scene.settleBoneFluteInHand(() => { settled = true; });
  assert(settled && !missing.scene.fluteHandoffPending, "missing art also clears the final-letter wait before presenting its fallback response");
});

await suite("Wood painted throne: original king staging, arrival and dissolution retain a grounded empty seat", () => {
  const f = fixture();
  f.scene.preload();
  assert(f.loaded.includes("wood-root-throne") && f.loaded.includes("wood-bone-flute") && f.loaded.includes("wood-ash-vial"), "fresh chapter preloads every physical action asset before any reward exists");
  f.scene.drawGhostKing();
  const throne = f.images.find(image => image.key === "wood-root-throne");
  const king = f.scene.ghostKingBody;
  assertEqual([throne.x, throne.originX, throne.originY], [1400, 0.5, 1], "the painted roots retain the original centered ground anchor");
  assertEqual(throne.width * throne.scale, 360, "the complete painting fits the original horizontal root envelope");
  assert(throne.y - throne.height * throne.scale > 580 && throne.y <= 850, "the throne stays inside its former branch-top and ground band");
  assertEqual([king.x, king.y, king.height * king.scale], [1400, 604, 232], "the accepted king body/input owner does not move or rescale");
  assert(f.images.indexOf(throne) < f.images.indexOf(king), "the transparent throne stays behind the king");
  const arrival = f.tweens.find(tween => tween.duration === 1200);
  assert(arrival.targets.includes(throne) && arrival.targets.includes(king), "the painted roots use the original shared entrance fade");
  assertEqual([throne.alpha, king.alpha], [0, 0], "neither painting pops in before the shared entrance");
  f.finish(arrival);
  assertEqual([throne.alpha, king.alpha], [1, 1], "both settle through the same original fade");
  assertEqual(f.breaths, [king], "only the ghost breathes; the physical throne remains still");
  f.scene.fadeGhostKingBody();
  f.finish(f.tweens.at(-1));
  assert(!king.scene && throne.scene, "king dissolution retains the empty root-throne for the existing wisp-cat scene");
  assertEqual(f.scene.ghostKingBody, null, "the original king input-owner cleanup is preserved");
  assertClose(throne.y, 850, 0.01, "the throne never follows the king's upward dissolution");
});
