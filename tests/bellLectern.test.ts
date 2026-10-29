import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import ts from "typescript";
import { assert, assertClose, assertEqual, suite } from "./_assert";

// Measure the real alpha silhouette, then execute the production placement,
// reading/reward callbacks and scene lifecycle with inert renderer objects.
function painting(file: string) {
  const png = readFileSync(new URL(file, import.meta.url));
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert(png[24] === 8 && png[25] === 6, "painted lectern source retain true 8-bit RGBA transparency");
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

const art = painting("../art/bell/reading-lectern.png");
const url = new URL("../src/scenes/SunkenBellScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["init", "preload", "startBellKeepersChamber", "showBellKeeperRead", "drawBellKeeperLectern", "clearBellKeeperLectern", "clearHeldLockBar", "setStoryObjective"];
const create = owner.members.find(member => member.name?.getText(source) === "create")!;
let shutdown: ts.ArrowFunction | undefined;
function findShutdown(node: ts.Node): void {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "this.events.once" &&
      node.arguments[0]?.getText(source).endsWith(".SHUTDOWN") && ts.isArrowFunction(node.arguments[1])) shutdown = node.arguments[1];
  ts.forEachChild(node, findShutdown);
}
findShutdown(create);
assert(shutdown, "the production scene owns explicit shutdown cleanup");
const code = ts.transpileModule(`class Bell {
  ${names.map(name => owner.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")}
  shutdownFixture() ${shutdown!.body.getText(source)}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const noop = () => {};

function fixture(reduced = false) {
  const images: any[] = [], targets: any[] = [], tweens: any[] = [], anchors: any[] = [], loaded: string[] = [];
  const captions: string[] = [], tasks: string[] = [], attention: any[] = [];
  const save = { satchel: [] as string[], almanacLore: [] as string[], realms: {} };
  let next: (() => void) | undefined, doors = 0, rewards = 0;
  function prop(x: number, y: number, key = ""): any {
    const callbacks: Array<() => void> = [];
    return { x, y, key, width: art.width, height: art.height, scene: true, active: true,
      scaleX: 1, scaleY: 1, alpha: 1, originX: .5, originY: .5, children: [] as any[],
      setDepth(value: number) { this.depth = value; return this; },
      setAlpha(value: number) { this.alpha = value; return this; },
      setScale(value: number) { this.scaleX = this.scaleY = value; return this; },
      setOrigin(x: number, y: number) { this.originX = x; this.originY = y; return this; },
      add(child: any) { this.children.push(child); child.parent = this; return this; },
      once(_event: string, callback: () => void) { callbacks.push(callback); return this; },
      destroy() { if (!this.scene) return; this.scene = false; for (const child of this.children) child.destroy?.(); for (const callback of callbacks.splice(0)) callback(); },
    };
  }
  const globals: Record<string, unknown> = {
    Phaser: { GameObjects: { Events: { DESTROY: "destroy" } } },
    BELL_BURST_COLOR: 0x4ab8d6, reducedMotion: () => reduced,
    resolveRealmFork: () => null, preloadSatchelIcons: noop, preloadWren: noop,
    addLocalGroundShadow: () => prop(0, 68), addContainerWake: noop,
    applySceneActorLighting: (_scene: unknown, image: any) => { image.lit = true; },
    attachWordBodyAnchor: (_scene: unknown, body: any, _target: unknown, options: any) => {
      const anchor = { body, options, destroyed: false, destroy() { this.destroyed = true; } }; anchors.push(anchor); return anchor;
    },
    playWrenFocus: noop, playClaimLine: noop, playBodyTypePulse: noop, playBodyImpact: noop,
    playActorAttention: (_scene: unknown, body: any) => attention.push(body),
    playChime: () => { rewards += 1; },
  };
  for (const name of ["sunkenBellBackdrop", "naveDoorway", "naveDoorLeaves", "readingLecternSprite", "bellGhostSprite", "bellWardenSprite", "olinSprite", "aurlandSprite", "tridentTokenSprite", "glassFishSprite", "snowFoxSprite", "runaPortrait"]) globals[name] = name;
  const Bell = new Function(...Object.keys(globals), `${code}; return Bell;`)(...Object.values(globals));
  const scene = new Bell();
  Object.assign(scene, {
    checkpoint() {},
    store: { get: () => save, update: (edit: (state: typeof save) => void) => edit(save) },
    scale: { width: 1920, height: 1080 }, breath: { reset: noop },
    beatRing: prop(0, 0), offbeatRing: prop(0, 0), rhythmLabel: prop(0, 0),
    load: { image: (key: string) => loaded.push(key) },
    add: { container: prop, image(x: number, y: number, key: string) { const image = prop(x, y, key); images.push(image); return image; } },
    tweens: { add(options: any) { tweens.push(options); }, killTweensOf(body: any) { for (const tween of tweens) if (tween.targets === body) tween.cancelled = true; } },
    wrenContainer: { x: 960, y: 820 }, wrenSprite: {},
    setNarrator: (text: string) => captions.push(text), band: { setObjective: (text: string) => tasks.push(text) },
    setBreathActive: noop, makeWord: (options: any) => ({ ...options, getAnchorX: () => options.x, getAnchorY: () => options.y }),
    registerActiveTarget: (target: any) => targets.push(target), clearActiveTargets: noop,
    readThen(callback: () => void) { assert(!next, "reading cannot overwrite an unread reward"); next = callback; },
    startFork1() { assert(!scene.bellKeeperLectern, "the stone is cleared before the original door scene"); doors += 1; },
    reading: { destroy() { next = undefined; } }, typingInput: { reset: noop }, beatClock: { stop: noop },
    input: { keyboard: { off: noop } }, clearRhythmPractice: noop, clearBellForkCues: noop,
    clearAurlandWordAnchors: noop, clearAurlandToken: noop, dismissRevisitMemoryCue: noop,
  });
  scene.init({ store: scene.store });
  return { scene, images, targets, tweens, anchors, loaded, save, captions, tasks, attention,
    doors: () => doors, rewards: () => rewards, gate: () => next,
    continue() { assert(next, "the earned memory remains held for native Continue"); const callback = next!; next = undefined; callback(); },
  };
}

await suite("Bell lectern: actual alpha fit plants the accepted stone and keeps read it clear", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced);
    f.scene.preload();
    assert(f.loaded.includes("bell-reading-lectern"), "fresh scene preload owns the accepted painting");
    f.scene.startBellKeepersChamber();
    const cue = f.scene.bellKeeperLectern, image = f.images[0], target = f.targets[0];
    assertEqual(image.key, "bell-reading-lectern", "the actual stand uses painted stone and book");
    const bounds = art.bounds;
    const left = cue.x + image.x + (bounds.x - image.originX * image.width) * image.scaleX;
    const top = cue.y + image.y + (bounds.y - image.originY * image.height) * image.scaleY;
    const bottom = top + bounds.height * image.scaleY;
    const width = bounds.width * image.scaleX;
    assert(width >= 150 && width <= 180, "visible stone width remains within the reviewed prop footprint");
    assertClose(left + width / 2, 700, .01, "transparent padding cannot pull the stone off its original owner column");
    assertClose(bottom, 822, .01, "the visible stone base retains the original world floor contact");
    assertEqual(image.scaleX, image.scaleY, "the painted book and stand retain their original proportions");
    assert(image.lit, "the stone receives the same cathedral lighting as physical scene art");
    assertEqual(target.word, "read it", "the exact native action remains unchanged");
    assert(target.y + 32 < top, "the target plate clears the actual painted pages");
    assert(target.x + 130 < f.scene.wrenContainer.x - 90, "the complete readable target clears Wren's hood");
    assertEqual(f.anchors[0].body, cue, "the existing readable tether still belongs to the physical stand");
    target.onClaim(); target.onAdvance();
    assert(!f.attention.includes(cue), "reading never scales the solid stone");
    assert(f.tweens.filter(tween => tween.targets === cue).every(tween => !["x", "y", "scaleX", "scaleY", "repeat"].some(key => key in tween)), "appearance and feedback cannot bob, slide or breathe the planted lectern");
    assertEqual([cue.x, cue.y, image.x, image.y], [700, 750, 0, 72], "interaction feedback preserves the floor position");
    assertEqual(f.save.almanacLore, [], "viewing and claiming the book pre-awards no memory");
  }
});

await suite("Bell lectern: native read grants the same memory once and Continue clears before doors", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced); f.scene.startBellKeepersChamber();
    const cue = f.scene.bellKeeperLectern, target = f.targets[0];
    target.onComplete(); target.onComplete();
    assertEqual(f.save.almanacLore, ["old-olins-memory"], "reading grants exactly the existing saved lore ID");
    assertEqual(f.save.satchel, [], "reading changes no relic or companion reward");
    assertEqual(f.rewards(), 1, "a repeated completed target cannot duplicate the reward presentation");
    assert(f.captions.at(-1)!.includes("Almanac page") && f.gate(), "the exact earned-lore response remains held");
    assert(cue.scene && f.images[0].scene, "the physical stand remains planted while its memory is read");
    assert(f.anchors[0].destroyed, "completed reading releases its word tether immediately");
    assertEqual(f.doors(), 0, "no automatic timer replaces the held response");
    f.continue();
    assert(!cue.scene && !f.images[0].scene && !f.scene.bellKeeperLectern, "Continue removes the owned stand and painting");
    assertEqual(f.doors(), 1, "the original next chapter entry runs once");
  }
});

await suite("Bell lectern: scene reuse, shutdown and stale callbacks cannot retain props or grant lore", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced); f.scene.startBellKeepersChamber();
    const old = f.scene.bellKeeperLectern, stale = f.targets[0];
    f.scene.startBellKeepersChamber();
    assert(!old.scene && f.anchors[0].destroyed, "re-entering the chamber destroys the previous stand and tether");
    stale.onComplete();
    assertEqual(f.save.almanacLore, [], "a replaced target cannot grant the memory to a later scene state");
    const replacement = f.scene.bellKeeperLectern;
    f.scene.init({ store: f.scene.store });
    assert(!replacement.scene && !f.scene.bellKeeperLectern, "actual init clears the former planted prop");
    f.scene.startBellKeepersChamber();
    const leaving = f.scene.bellKeeperLectern, lateTarget = f.targets.at(-1);
    f.scene.shutdownFixture();
    assert(!leaving.scene && !f.scene.bellKeeperLectern && f.anchors.every(anchor => anchor.destroyed), "actual shutdown clears all owned paintings and tethers");
    lateTarget.onComplete();
    assertEqual(f.save.almanacLore, [], "a late completion after shutdown cannot mutate saved lore");
    f.scene.startBellKeepersChamber();
    f.targets.at(-1).onComplete();
    const lateContinue = f.gate()!;
    f.scene.shutdownFixture(); lateContinue();
    assertEqual(f.doors(), 0, "an old Continue cannot route after the scene has left");
  }
});
