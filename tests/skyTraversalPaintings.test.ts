import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { EventEmitter } from "node:events";
import ts from "typescript";
import { decorativeTween, PRESENTATION_CHANGED } from "../src/game/presentation";
import { assert, assertClose, assertEqual, suite } from "./_assert";

// Independently measure the actual alpha silhouettes, then run the production
// prop constructors, anchored words, traversal gates and lifecycle cleanup.
function painting(file: string) {
  const png = readFileSync(new URL(file, import.meta.url));
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert(png[24] === 8 && png[25] === 6, "Sky traversal paintings retain true 8-bit RGBA transparency");
  const chunks: Buffer[] = [];
  for (let p = 8; p < png.length;) {
    const length = png.readUInt32BE(p), name = png.toString("ascii", p + 4, p + 8);
    if (name === "IDAT") chunks.push(png.subarray(p + 8, p + 8 + length));
    p += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4;
  const alpha = new Uint8Array(width * height);
  let previous = new Uint8Array(stride), at = 0, left = width, right = -1, top = height, bottom = -1;
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
    for (let x = 0; x < width; x++) alpha[y * width + x] = row[x * 4 + 3]!;
    // Ignore the nearly transparent matte fringe when measuring real contact.
    for (let x = 0; x < width; x++) if (row[x * 4 + 3]! > 25) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    previous = row;
  }
  return { width, height, alpha, bounds: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } };
}

const paintings = {
  "sky-traversal-stones": painting("../art/sky/traversal-stones.png"),
  "sky-traversal-lantern": painting("../art/sky/traversal-lantern.png"),
};
const url = new URL("../src/scenes/SkyIslandScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["init", "preload", "startAct1", "runPathBeats", "showPathCue", "pathWordPosition", "pathWrenPosition", "stageWrenAtPathEntrance", "walkWrenToPathBeat", "resetWrenToSkyStage", "moveWrenTo", "drawPathStonePainting", "drawBalanceBridgeCue", "drawPathLanternCue", "drawSteppingStonesCue", "pulsePathCue", "liftPathLanternAside", "dismissPathCue", "makePathWord", "pathCueSourceOffset", "clearPathWordAnchors"];
const constants = source.statements.filter(ts.isVariableStatement).flatMap(statement => statement.declarationList.declarations
  .filter(declaration => ["PATH_BEATS", "SKY_WREN_STAGE_X", "SKY_WREN_STAGE_Y", "SKY_BALANCE_CUE_Y", "SKY_LANTERN_CUE_Y", "SKY_STEPPING_CUE_Y", "SKY_PATH_PAINTINGS"].includes(declaration.name.getText(source)))
  .map(declaration => `const ${declaration.getText(source)};`)).join("\n");
let shutdown: ts.ArrowFunction | undefined;
function findShutdown(node: ts.Node): void {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "this.events.once" &&
      node.arguments[0]?.getText(source).endsWith(".SHUTDOWN") && ts.isArrowFunction(node.arguments[1])) shutdown = node.arguments[1];
  ts.forEachChild(node, findShutdown);
}
findShutdown(owner.members.find(member => member.name?.getText(source) === "create")!);
assert(shutdown, "the production Sky scene owns explicit shutdown cleanup");
const code = ts.transpileModule(`${constants}\nclass Sky {
 ${names.map(name => owner.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")}
 shutdownFixture() ${shutdown!.body.getText(source)}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const noop = () => {};

function fixture(reduced = false) {
  const images: any[] = [], bodies: any[] = [], tweens: any[] = [], targets: any[] = [], anchors: any[] = [], attentions: any[] = [], loaded: string[] = [];
  const captions: string[] = [], tasks: string[] = [], timers: Array<{ at: number; callback: () => void }> = [];
  const save = { satchel: [] as string[], almanacLore: [] as string[], realms: {}, reducedMotion: reduced };
  let gate: (() => void) | undefined, lighter = 0;
  function node(x: number, y: number, key = ""): any {
    const art = paintings[key as keyof typeof paintings] ?? { width: 1, height: 1 };
    const destroyCallbacks: Array<() => void> = [];
    return { x, y, key, ...art, alpha: 1, scaleX: 1, scaleY: 1, originX: .5, originY: .5,
      angle: 0, scene: true, active: true, children: [] as any[], lines: [] as number[][],
      setDepth(value: number) { this.depth = value; return this; }, setAlpha(value: number) { this.alpha = value; return this; },
      setScale(value: number) { this.scaleX = this.scaleY = value; return this; },
      setOrigin(x: number, y: number) { this.originX = x; this.originY = y; return this; },
      setAngle(value: number) { this.angle = value; return this; },
      setName(value: string) { this.name = value; return this; },
      getByName(name: string) { return this.children.find((child: any) => child.name === name) ?? null; },
      add(child: any) { this.children.push(child); child.parent = this; return this; },
      once(_event: string, callback: () => void) { destroyCallbacks.push(callback); return this; },
      destroy() { if (!this.scene) return; this.scene = false; for (const callback of destroyCallbacks.splice(0)) callback(); for (const child of this.children) child.destroy?.(); },
      fillStyle() { return this; }, lineStyle() { return this; }, fillEllipse() { return this; },
      lineBetween(...points: number[]) { this.lines.push(points); return this; },
    };
  }
  const globals: Record<string, unknown> = {
    Phaser: { GameObjects: { Events: { DESTROY: "destroy" } } },
    reducedMotion: () => save.reducedMotion, decorativeTween,
    resolveRealmFork: () => null, resolveCompanionDecision: () => null,
    PALETTE_HEX: { brass: 0xbaa463 }, preloadSatchelIcons: noop, preloadWren: noop,
    applySceneActorLighting: (_scene: unknown, image: any) => { image.lit = true; },
    playPortalArrivalWake: noop, playWrenAction: noop, playWrenFocus: noop, playChime: noop,
    playSceneEventPulse: noop, addIdleBreath: noop, playClaimLine: noop, playBodyTypePulse: noop, playBodyImpact: noop,
    playActorAttention: (_scene: unknown, body: any) => attentions.push(body),
    attachWordBodyAnchor(_scene: unknown, body: any, _target: unknown, options: any) {
      const anchor = { body, ...options, destroyed: false, destroy() { this.destroyed = true; } }; anchors.push(anchor); return anchor;
    },
  };
  for (const name of ["skyIslandBackdrop", "lanternSpiritSprite", "scholarSpiritSprite", "ettaSprite", "ettaEmptySprite", "ettaVolumeSprite", "ettaShelfSprite", "beaconBrazierSprite", "beaconFlameSprite", "traversalStonesSprite", "traversalLanternSprite", "lanternMothSprite", "runaPortrait"]) globals[name] = name;
  const Sky = new Function(...Object.keys(globals), `${code};return Sky;`)(...Object.values(globals));
  const scene = new Sky();
  Object.assign(scene, {
    checkpoint() {}, savedStageData() { return {}; },
    scale: { width: 1920, height: 1080 }, pathWordAnchors: [], activeTargets: [], templeLanterns: [],
    store: { get: () => save }, events: new EventEmitter(), data: { get: () => scene.store },
    load: { image: (key: string) => loaded.push(key) },
    add: { container(x: number, y: number) { const body = node(x, y); bodies.push(body); return body; },
      graphics: () => node(0, 0), image(x: number, y: number, key: string) { const image = node(x, y, key); images.push(image); return image; } },
    tweens: { add(options: any) { const tween = { ...options, paused: false, cancelled: false, pause() { this.paused = true; }, resume() { this.paused = false; } }; tweens.push(tween); return tween; },
      killTweensOf(body: any) { for (const tween of tweens) if (tween.targets === body) tween.cancelled = true; } },
    wrenContainer: node(960, 826), wrenSprite: {},
    time: { now: 0, delayedCall(delay: number, callback: () => void) { timers.push({ at: scene.time.now + delay, callback }); } },
    band: { setObjective: (text: string) => tasks.push(text) }, narration: { say: (text: string) => captions.push(text) },
    setNarrator: (text: string) => captions.push(text),
    readThen(next: () => void) { assert(!gate, "a held traversal response cannot be overwritten"); gate = next; },
    setAmbientLanternFieldAlpha: noop,
    makeWord(options: any) { const target = { ...options, destroyed: false, destroy() { this.destroyed = true; }, getAnchorX: () => options.x, getAnchorY: () => options.y }; targets.push(target); return target; },
    registerActiveTarget(target: any) { scene.activeTargets.push(target); },
    clearActiveTargets() { scene.clearPathWordAnchors(); for (const target of scene.activeTargets) target.destroy(); scene.activeTargets = []; },
    startLanternLighter() { lighter++; },
    reading: { destroy() { gate = undefined; } }, typingInput: { reset: noop }, input: {},
    clearAmbientLanterns: noop, clearSkyForkCues: noop, dismissRevisitMemoryCue: noop,
    clearLighterReplyAnchors: noop, clearEttaWordAnchors: noop, clearEttaBookCue: noop,
  });
  scene.init({ store: scene.store });
  function finish(tween: any) {
    if (tween.cancelled || tween.paused) return;
    for (const key of ["x", "y", "alpha", "angle"]) if (typeof tween[key] === "number") tween.targets[key] = tween[key];
    tween.onComplete?.();
  }
  return { scene, images, bodies, tweens, targets, anchors, attentions, loaded, save, captions, tasks, timers,
    lighter: () => lighter, gate: () => gate, finish,
    continue() { assert(gate, "the production reading gate waits for native Continue"); const next = gate!; gate = undefined; next(); },
    advanceTo(now: number) { scene.time.now = now; for (const timer of timers.filter(timer => timer.at <= now)) { timers.splice(timers.indexOf(timer), 1); timer.callback(); } },
  };
}
function paintedFoot(image: any, body: any, x: number, y: number): number {
  const art = paintings[image.key as keyof typeof paintings];
  const px = Math.round((x - body.x - image.x) / image.scaleX + image.originX * image.width);
  const py = Math.round((y - body.y - image.y) / image.scaleY + image.originY * image.height);
  return art.alpha[py * art.width + px] ?? 0;
}

await suite("Sky traversal paintings: actual alpha fitting supports unchanged Wren feet with one stone asset", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced); f.scene.preload();
    assert(f.loaded.includes("sky-traversal-stones") && f.loaded.includes("sky-traversal-lantern"), "fresh Sky preload owns both accepted cutouts");
    for (const [beat, width, centerX] of [["balance", 320, 728], ["stepping", 440, 1038]] as const) {
      f.scene.showPathCue(beat);
      const body = f.scene.pathCue, image = body.children[0], bounds = paintings["sky-traversal-stones"].bounds;
      assertEqual(image.key, "sky-traversal-stones", "both traversal actions reuse the one accepted shallow stone group");
      assertClose(bounds.width * image.scaleX, width, .001, "visible stone determines width rather than export padding");
      assertClose(body.x + image.x + (bounds.x + bounds.width / 2 - image.originX * image.width) * image.scaleX, centerX, .001, "the painting retains its original action column");
      assertEqual(image.scaleX, image.scaleY, "the painted slabs preserve their proportions");
      const foot = f.scene.pathWrenPosition(beat);
      assert(paintedFoot(image, body, foot.x, foot.y) > 25, "Wren's unchanged action feet touch real painted stone rather than transparent padding");
      if (beat === "balance") assert(paintedFoot(image, body, 832, 836) > 25, "the original path entrance also meets the accepted stone silhouette");
      assert(image.lit && body.depth < 0, "physical stone receives island lighting behind the unchanged character lane");
      const position = [body.x, body.y, image.x, image.y];
      f.scene.pulsePathCue(false); f.scene.pulsePathCue(true);
      assertEqual([body.x, body.y, image.x, image.y], position, "typing feedback cannot move the physical slab group");
      assert(f.tweens.filter(tween => tween.targets === body || tween.targets === image).every(tween => !["x", "y", "scale", "scaleX", "scaleY", "repeat"].some(key => key in tween)), "stone entrances and feedback never bob, scale or slide");
    }
  }
});

await suite("Sky hanging lantern: the real painted eye stays attached to the old rope without prop scaling", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced); f.scene.showPathCue("lantern");
    const cue = f.scene.pathCue, image = cue.children.find((child: any) => child.key === "sky-traversal-lantern");
    const bounds = paintings["sky-traversal-lantern"].bounds;
    assertClose(bounds.height * image.scaleY, 136, .001, "the full eye, paper and rim retain a bounded familiar height");
    assertClose((image.originX * image.width), bounds.x + bounds.width / 2, .001, "the eye's true horizontal center owns the hanging pivot");
    assertClose(image.originY * image.height, bounds.y, .001, "transparent top padding never becomes a gap beneath the rope");
    assertEqual([cue.x + image.x, cue.y + image.y], [982, 585], "the real hanging eye meets the unchanged rope endpoint");
    assert(cue.children[0].lines.some((line: number[]) => JSON.stringify(line) === JSON.stringify([0, -250, 0, -55])), "the existing rope still reaches that same physical pivot");
    const target = f.scene.makePathWord({ word: "lantern", ...f.scene.pathWordPosition("lantern"), onComplete: noop });
    target.onClaim({}); target.onAdvance(1, 7); f.scene.pulsePathCue(false);
    assert(!f.attentions.includes(cue), "neither claim nor completion swells the lantern or its attached rope");
    const swing = f.tweens.find(tween => tween.targets === image);
    assertEqual([swing.angle, swing.duration, swing.yoyo, swing.repeat], [1.2, 2100, true, -1], "only the existing gentle hanging sway remains");
    assert(!["x", "y", "scale", "scaleX", "scaleY"].some(key => key in swing), "the hanging attachment cannot translate or stretch");
    assertEqual(swing.paused, reduced, "actual presentation preferences pause decorative sway in reduced motion");
    f.save.reducedMotion = !reduced; f.scene.events.emit(PRESENTATION_CHANGED);
    assertEqual(swing.paused, !reduced, "the native motion preference also takes effect during the scene");
    f.scene.dismissPathCue(false);
    assert(!cue.scene && !image.scene && swing.cancelled, "leaving the cue destroys its painting and cancels the owned hanging loop");
    assert(f.anchors.every(anchor => anchor.destroyed), "the old lantern target cannot retain a detached tether");
  }
});

await suite("Sky lantern action: native completion tilts only the painted body about its fixed eye without delaying Continue", () => {
  for (const reduced of [false, true]) {
    for (const leaveEarly of [false, true]) {
      const f = fixture(reduced); f.scene.runPathBeats(1);
      const cue = f.scene.pathCue, image = cue.getByName("path-lantern-body"), target = f.targets[0];
      const swing = f.tweens.find(tween => tween.targets === image);
      const rope = cue.children[0], ropeLines = JSON.stringify(rope.lines);
      const before = [cue.x, cue.y, image.x, image.y, image.originX, image.originY, target.x, target.y];
      target.onClaim({});
      assert(!swing.cancelled, "claiming the word preserves the original gentle hanging state");
      target.onComplete();
      assert(swing.cancelled, "the completed action retires the old sway before taking ownership of the body");
      assert(f.gate() && f.captions.at(-1)!.startsWith("You lift the lantern aside."), "the unchanged response and Continue remain immediately available");
      const tilt = f.tweens.find(tween => tween.targets === image && tween.angle === -22);
      if (reduced) {
        assert(!tilt && image.angle === -22, "reduced motion shows the settled aside pose immediately");
      } else {
        assertEqual([tilt.duration, tilt.ease], [420, "Sine.easeOut"], "normal motion uses one brief nonblocking tilt");
        assert(!["x", "y", "scale", "scaleX", "scaleY"].some(key => key in tilt), "the action rotates only the body about its attached eye");
        if (!leaveEarly) f.finish(tilt);
      }
      assertEqual([cue.x, cue.y, image.x, image.y, image.originX, image.originY, target.x, target.y], before, "the rope, hanging eye and word anchors never translate or rotate with the body");
      assertEqual(JSON.stringify(rope.lines), ropeLines, "the original rope geometry is unchanged by lifting");
      if (!leaveEarly || reduced) assertEqual(image.angle, -22, "the held response visibly retains the completed aside pose");
      assertEqual(f.save.satchel, [], "the physical action introduces no reward or branch change");
      f.continue();
      assertEqual(f.targets.at(-1)!.word, "stepping", "immediate Continue still reveals the next original action");
      assert(!cue.scene && !image.scene, "changing traversal beats destroys the old tilted body");
      if (tilt) {
        assert(tilt.cancelled, "leaving early cancels the owned tilt before its target is destroyed");
        f.finish(tilt);
        assert(!image.scene, "the cancelled action cannot restore a stale lantern");
      }
    }
  }
});

await suite("Sky traversal: actual arrival and all native beats retain words, movement durations and held success gates", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced); f.scene.startAct1();
    assertEqual(f.targets.length, 0, "the original arrival stays held before its first word");
    f.advanceTo(780); f.continue(); f.advanceTo(780);
    assertEqual(f.tweens.find(tween => tween.targets === f.scene.wrenContainer).duration, 840, "the original entrance movement duration remains unchanged");
    for (const [index, beat] of ["balance", "lantern", "stepping"].entries()) {
      const target = f.targets[index];
      assertEqual(target.word, beat, "the exact original traversal action remains native typing");
      const before = f.captions.at(-1);
      target.onClaim({});
      assertEqual(f.captions.at(-1), before, "claiming the action cannot prematurely display its success");
      const movement = f.tweens.filter(tween => tween.targets === f.scene.wrenContainer).at(-1);
      assertEqual(movement.duration, beat === "lantern" ? 620 : 560, "each action keeps its existing Wren movement duration");
      target.onComplete();
      assert(f.gate() && f.captions.at(-1) !== before, "only completion installs the original held success response");
      assert(f.tasks.at(-1)!.includes("Enter or Space"), "the completed action still explains its native Continue");
      assertEqual(f.targets.length, index + 1, "no next action can overwrite the unread response");
      f.continue();
    }
    assertEqual(f.lighter(), 0, "the original780ms transition still separates traversal from the next encounter");
    f.advanceTo(1560);
    assertEqual(f.lighter(), 1, "the original Lantern-Lighter follows the third deliberate Continue");
    assertEqual(f.save.satchel, [], "painted traversal grants no relic or companion");
    assertEqual(f.save.almanacLore, [], "painted traversal pre-awards no lore");
  }
});

await suite("Sky traversal lifecycle: fixed prop fades, scene reuse and actual shutdown release paintings and tethers", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced); f.scene.showPathCue("stepping");
    const stone = f.scene.pathCue;
    f.scene.dismissPathCue();
    const fade = f.tweens.find(tween => tween.targets === stone && tween.alpha === 0);
    if (!reduced) {
      assertEqual(fade.duration, 260, "the original exit fade retains its duration");
      assert(!["x", "y", "scale", "scaleX", "scaleY"].some(key => key in fade), "dismissing physical stones never pulls their feet off the route");
      f.finish(fade);
    }
    assert(!stone.scene, "completed dismissal destroys the owned physical support");
    f.scene.showPathCue("lantern");
    const first = f.scene.pathCue;
    f.scene.init({ store: f.scene.store });
    assert(!first.scene && !f.scene.pathCue, "actual init clears a former lantern and its cord");
    f.scene.showPathCue("lantern");
    const leaving = f.scene.pathCue;
    f.scene.makePathWord({ word: "lantern", x: 1100, y: 610, onComplete: noop });
    f.scene.shutdownFixture();
    assert(!leaving.scene && !f.scene.pathCue, "actual shutdown releases the current prop before scene reuse");
    assert(f.anchors.every(anchor => anchor.destroyed), "no traversal word tether survives the scene");
    assert(f.tweens.filter(tween => leaving.children.includes(tween.targets)).every(tween => tween.cancelled), "repeat glow and sway loops cannot keep running after their prop leaves");
  }
});
