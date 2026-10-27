import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import ts from "typescript";
import { assert, assertClose, assertEqual, suite } from "./_assert";

// Read the actual visible PNG silhouette independently of its placement code.
function painting(file: string) {
  const png = readFileSync(new URL(file, import.meta.url));
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert(png[24] === 8 && png[25] === 6, "painted beacon sources retain true 8-bit RGBA transparency");
  const chunks: Buffer[] = [];
  for (let p = 8; p < png.length;) {
    const length = png.readUInt32BE(p), name = png.toString("ascii", p + 4, p + 8);
    if (name === "IDAT") chunks.push(png.subarray(p + 8, p + 8 + length));
    p += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4;
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
    // Ignore the nearly transparent matte fringe when measuring real contact.
    for (let x = 0; x < width; x++) if (row[x * 4 + 3]! > 25) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    previous = row;
  }
  return { width, height, bounds: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } };
}
const paintings = {
  "sky-beacon-brazier": painting("../art/sky/beacon-brazier.png"),
  "sky-beacon-flame": painting("../art/sky/beacon-flame.png"),
};
const url = new URL("../src/scenes/SkyIslandScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const methods = ["createBeaconFlameCue", "fitBeaconPainting", "dimBeaconFlameVisual", "takeBeaconSparkVisual", "showHeldBeaconSpark", "clearHeldBeaconSpark", "clearSkyForkCues", "startFork1StealFlame", "runPassageChain", "skyOwnedWordPosition", "makeSkyForkWord", "fadeOutForkCue"];
const code = ts.transpileModule(`class Sky { ${methods.map(name => owner.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")} }`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const noop = () => {};

function fixture(reduced = false) {
  const images: any[] = [], tweens: any[] = [], wakes: any[] = [], attentions: any[] = [], targets: any[] = [], anchors: any[] = [], captions: string[] = [];
  const state = { satchel: [] as string[] };
  let next: (() => void) | undefined, acts = 0;
  function prop(x: number, y: number, key = "") {
    const dimensions = paintings[key as keyof typeof paintings] ?? { width: 1, height: 1 };
    const data = new Map<string, unknown>(), destroyCallbacks: Array<() => void> = [];
    return { x, y, key, ...dimensions, alpha: 1, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5,
      depth: 0, angle: 0, active: true, scene: true, name: "", children: [] as any[],
      setDepth(v: number) { this.depth = v; return this; }, setAlpha(v: number) { this.alpha = v; return this; },
      setScale(v: number) { this.scaleX = this.scaleY = v; return this; }, setOrigin(x: number, y = x) { this.originX = x; this.originY = y; return this; },
      setName(v: string) { this.name = v; return this; }, setActive(v: boolean) { this.active = v; return this; },
      setData(k: string, v: unknown) { data.set(k, v); return this; }, getData(k: string) { return data.get(k); },
      add(child: any) { this.children.push(child); return this; }, getByName(name: string) { return this.children.find(child => child.name === name && child.scene) ?? null; },
      once(_event: string, callback: () => void) { destroyCallbacks.push(callback); return this; },
      destroy() { if (!this.scene) return; this.scene = false; for (const callback of destroyCallbacks) callback(); for (const child of this.children) child.destroy?.(); },
    };
  }
  const globals = {
    Phaser: { Math: { Clamp: (n: number, min: number, max: number) => Math.max(min, Math.min(max, n)) }, GameObjects: { Events: { DESTROY: "destroy" } } },
    PALETTE_HEX: { brass: 0 }, reducedMotion: () => reduced,
    addLocalGroundShadow: () => prop(0, 0), addLivingLight: () => prop(0, -190),
    addContainerWake: (_s: unknown, body: any, options: any) => wakes.push({ body, ...options }),
    attachWordBodyAnchor: (_scene: unknown, body: any, _point: any, options: any) => {
      const anchor = { body, options, destroyed: false, destroy() { this.destroyed = true; } };
      anchors.push(anchor); return anchor;
    },
    playWrenAction: noop, playWrenFocus: noop, playBodyImpact: noop, playBodyTypePulse: noop, playClaimLine: noop,
    playActorAttention: (_s: unknown, body: any) => attentions.push(body),
  };
  const Sky = new Function(...Object.keys(globals), code + "; return Sky;")(...Object.values(globals));
  const s = new Sky();
  Object.assign(s, {
    scale: { width: 1920, height: 1080 }, wrenContainer: { scene: true, x: 960, y: 826 }, wrenSprite: {},
    heldBeaconSpark: null, forkChoiceWordAnchors: [], kindAnswerCue: null, tetherThreadCue: null,
    add: { container: prop, image(x: number, y: number, key: string) { const image = prop(x, y, key); images.push(image); return image; } },
    tweens: { add(options: any) { tweens.push(options); return options; }, killTweensOf(body: any) { for (const tween of tweens) if (tween.targets === body) tween.killed = true; } },
    band: { setObjective: noop }, hideEtta: noop, commitFork: (_key: string, value: string) => value,
    readThen(callback: () => void) { assert(!next, "an unread result cannot be overwritten"); next = callback; },
    setNarrator(text: string) {
      if (text.includes("in your palm")) {
        assert(!s.beaconFlameCue.getByName("beacon-spark"), "the source flame is absent before the truthful in-palm response");
        assert(s.heldBeaconSpark?.scene, "a visible painted curl is held before the in-palm response");
      }
      captions.push(text);
    },
    makeWord(options: any) { return { ...options, getAnchorX: () => options.x, getAnchorY: () => options.y }; },
    registerActiveTarget(target: any) { targets.push(target); }, clearActiveTargets: noop,
    clearForkChoiceWordAnchors: noop, store: { get: () => state }, startAct3() { acts++; },
  });
  s.beaconFlameCue = s.createBeaconFlameCue();
  const settle = (tween: any) => {
    for (const key of ["x", "y", "alpha"]) if (typeof tween[key] === "number") tween.targets[key] = tween[key];
    tween.onComplete?.();
  };
  return { s, images, tweens, wakes, attentions, targets, anchors, captions, state, acts: () => acts, settle,
    next() { assert(next, "the original Continue is available"); const callback = next!; next = undefined; callback(); } };
}

function paintedBounds(image: any, parent: any = { x: 0, y: 0 }) {
  const p = paintings[image.key as keyof typeof paintings], b = p.bounds;
  return {
    left: parent.x + image.x + (b.x - p.width * image.originX) * image.scaleX,
    right: parent.x + image.x + (b.x + b.width - p.width * image.originX) * image.scaleX,
    top: parent.y + image.y + (b.y - p.height * image.originY) * image.scaleY,
    bottom: parent.y + image.y + (b.y + b.height - p.height * image.originY) * image.scaleY,
  };
}

await suite("Sky painted beacon: true-alpha silhouettes meet the fixed terrace contact and keep labels clear of the source flame", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced), cue = f.s.beaconFlameCue;
    const brazier = cue.getByName("beacon-brazier"), flame = cue.getByName("beacon-spark");
    const base = paintedBounds(brazier, cue), fire = paintedBounds(flame, cue);
    assertEqual([cue.x, cue.y], [1320, 792], "the fixture starts at its final terrace contact with no hover offset");
    assertClose(base.bottom, 792, 0.1, "actual painted stone touches the floor despite transparent canvas padding");
    assertClose(base.bottom - base.top, 180, 0.1, "the physical fixture uses its silhouette height");
    assertClose(fire.bottom - fire.top, 70, 0.1, "the flame fits its own silhouette rather than the padded canvas");
    const entrance = f.tweens.find(tween => tween.targets === cue);
    assertEqual(Object.keys(entrance).filter(key => ["x", "y", "scaleX", "scaleY", "repeat"].includes(key)), [], "the stone has only an alpha entrance, never travel or idle growth");
    f.settle(entrance);
    f.s.startFork1StealFlame(); f.next();
    const target = f.targets.at(-1);
    assert(target.y + 34 < fire.top, "the complete live phrase stays above the painted source");
    assert(target.x > cue.x && target.y > 320, "the source retains its right-side phrase lane below the reading card");
    assertEqual(f.anchors.at(-1).options.sourceOffsetY, cue.getData("sky-source-offset-y"), "the real tether connects to the same authored flame source");
    target.onClaim({}); target.onAdvance(1, target.word.length);
    assertEqual(f.attentions.at(-1), f.s.wrenContainer, "claim feedback does not scale or tint the physical masonry");
    assertEqual([cue.x, cue.y, cue.scaleX, cue.scaleY, cue.angle], [1320, 792, 1, 1, 0], "claim and typing preserve the fixture's floor geometry");
  }
});

await suite("Sky stolen spark: original four phrases dim, take and hold painted fire synchronously before their existing responses", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced), cue = f.s.beaconFlameCue;
    const source = cue.getByName("beacon-spark"), light = cue.getByName("beacon-light");
    f.s.startFork1StealFlame(); f.next();
    for (const [index, word] of ["reach for the flame", "the beacon dims slightly", "the spark is yours", "the island notices"].entries()) {
      const target = f.targets.at(-1);
      assertEqual(target.word, word, "the exact authored phrase and sequence are unchanged");
      target.onComplete();
      if (index === 0) assert(source.scene && source.alpha === 1, "reaching alone leaves the waiting flame unchanged");
      if (index === 1) assert(source.scene && source.alpha < 1 && light.alpha < 0.12, "the dimming response visibly reduces the source and its light");
      if (index === 2) {
        assert(!source.scene && !light.scene && !cue.active, "taking removes the source and stops its stand wake before the held result");
        const held = f.s.heldBeaconSpark, bounds = paintedBounds(held);
        assertClose(bounds.bottom - bounds.top, 56, 0.1, "Wren holds a readable curl of the same painted fire");
        assertEqual([held.x, held.y], [1024, 730], "the curl sits beside the hand area below the hood");
        const reviewScale = 1250 / f.s.scale.width;
        assert((bounds.bottom - bounds.top) * reviewScale >= 34 && (bounds.right - bounds.left) * reviewScale >= 15,
          "the actual painted silhouette remains distinguishable at the native review width");
        assert(bounds.left > f.s.wrenContainer.x + 50 && bounds.top > f.s.wrenContainer.y - 160,
          "the visible curl clears the cloak edge and stays below the hood");
        assert(held.depth > 0 && held.alpha === 1, "the received flame draws above Wren at full opacity, independently of the dimmed source");
        f.s.takeBeaconSparkVisual();
        assertEqual(f.s.heldBeaconSpark, held, "repeating the presentation cannot duplicate the received spark");
      }
      assertEqual(f.state.satchel, [], "the source interaction does not award the later realm-clear relic early");
      assertEqual(f.acts(), 0, "each original held response still waits for Continue");
      f.next();
    }
    assertEqual(f.targets.length, 4, "no new typing action or timing gate was introduced");
    assertEqual([f.s.beaconFlameCue, f.s.heldBeaconSpark, f.acts()], [null, null, 1], "the original last Continue stows fire and reaches the same next act");
    const exit = f.tweens.findLast(tween => tween.targets === cue);
    assertEqual([exit.y, exit.duration], [792, 540], "the physical stand fades in place over the original departure duration");
    f.settle(exit);
    assert(!cue.scene, "the empty fixture leaves with its original cleanup");
  }
});

await suite("Sky beacon cleanup: leaving removes source light and received fire without retaining callbacks or duplicate props", () => {
  const f = fixture(), cue = f.s.beaconFlameCue;
  f.s.takeBeaconSparkVisual();
  const held = f.s.heldBeaconSpark;
  f.s.clearSkyForkCues();
  assert(!cue.scene && !held.scene, "the actual realm cleanup destroys both the physical fixture and held spark");
  assertEqual([f.s.beaconFlameCue, f.s.heldBeaconSpark], [null, null], "no stale prop references survive chapter reuse");
  f.s.clearSkyForkCues();
  f.s.beaconFlameCue = f.s.createBeaconFlameCue();
  assert(f.s.beaconFlameCue.getByName("beacon-spark")?.scene && f.s.beaconFlameCue.active, "a fresh entry reconstructs the original lit fixture");
});
