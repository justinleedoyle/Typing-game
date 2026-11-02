import { readFileSync } from "node:fs";
import ts from "typescript";
import { EventEmitter } from "node:events";
import { assert, assertClose, assertEqual, suite } from "./_assert";
import * as actorLighting from "../src/game/actorLighting";
import { installPresentation, reducedMotion, reducedFlashes } from "../src/game/presentation";

// Run the complete, actual helper module. Only image imports and Phaser's
// display/tween surfaces are inert; reaction and restoration code is unchanged.
const source = readFileSync(new URL("../src/game/wren.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
interface WrenHelpers {
  preloadWren(scene: unknown, opts?: { carry?: boolean }): void;
  makeWrenCarryHands(scene: unknown, sprite: unknown): GripContainer;
  attachWrenHeldProp(scene: unknown, owner: unknown, sprite: unknown, prop: unknown, point: { x: number; y: number }): void;
  bobWrenSprite(image: Image): void;
  playWrenFocus(image: Image): void;
  playWrenAction(image: Image): void;
  setWrenPose(image: Image, pose: string, faceLeft?: boolean): void;
  playWrenHurt(image: Image, options: { faceLeft?: boolean; onComplete: () => void }): void;
  flashWrenMiss(image: Image): void;
}
const exports = {} as WrenHelpers;
new Function("exports", "require", code)(exports, (name: string) =>
  name.endsWith("actorLighting") ? actorLighting : name === "phaser"
    ? { default: { Scenes: { Events: { POST_UPDATE: "postupdate", SHUTDOWN: "shutdown" } },
      GameObjects: { Events: { DESTROY: "destroy" } } } } : { default: "inert-image-asset" });

interface Tween { targets: Image; onComplete?: () => void }
interface Timer { removed: boolean; callback: () => void; remove(): void }
function fixture(sceneKey = "ClockworkForgeScene", reduced = false) {
  const active: Tween[] = [];
  const timers: Timer[] = [];
  const data = new Map<string, unknown>();
  const scene = {
    sys: { settings: { key: sceneKey } },
    data: { set(key: string, value: unknown) { data.set(key, value); }, get: (key: string) => data.get(key) },
    tweens: {
      killTweensOf(image: Image) {
        for (let index = active.length - 1; index >= 0; index -= 1) {
          if (active[index].targets === image) active.splice(index, 1);
        }
      },
      add(tween: Tween) { active.push(tween); return tween; },
    },
    time: {
      delayedCall(_delay: number, callback: () => void) {
        const timer = { removed: false, callback, remove() { this.removed = true; } };
        timers.push(timer);
        return timer;
      },
    },
  };
  installPresentation(scene as never, { get: () => ({ reducedMotion: reduced, reducedFlashes: reduced }) } as never);
  const image = new Image(scene);
  return { scene, image, active, timers,
    finish: () => { const tween = active.shift(); assert(tween, "a visual tween is active"); tween.onComplete?.(); },
  };
}

class Image {
  texture = { key: "wren-front" };
  height = 100;
  x = 0;
  y = 0;
  scaleX = -2.4;
  scaleY = 2.4;
  alpha = 0.83;
  originX = 0.5;
  originY = 1;
  tinted = false;
  tintFill = false;
  tintTopLeft = 0xffffff;
  tintTopRight = 0xffffff;
  tintBottomLeft = 0xffffff;
  tintBottomRight = 0xffffff;
  cornerLight: number[] = [];
  data = new Map<string, unknown>();
  constructor(readonly scene: { tweens: unknown; time: unknown }) {}
  setTexture(key: string) { this.texture.key = key; this.height = key === "wren-front" ? 100 : 150; return this; }
  setScale(scale: number) { this.scaleX = scale; this.scaleY = scale; return this; }
  getData(key: string) { return this.data.get(key); }
  setData(key: string, value: unknown) { this.data.set(key, value); return this; }
  setTintFill(...light: number[]) { this.setTint(...light); this.tinted = this.tintFill = true; return this; }
  setTint(...light: number[]) {
    if (light.length === 1) light = Array(4).fill(light[0]);
    this.cornerLight = light;
    [this.tintTopLeft, this.tintTopRight, this.tintBottomLeft, this.tintBottomRight] = light;
    this.tinted = this.tintFill = false;
    return this;
  }
  clearTint() { return this.setTint(0xffffff); }
}

const resting = (image: Image) => ({ key: image.texture.key, x: image.x, y: image.y,
  scaleX: image.scaleX, scaleY: image.scaleY, alpha: image.alpha, originX: image.originX, originY: image.originY });

await suite("Wren reactions: damage restores painted scene light after its feedback", () => {
  for (const key of ["ClockworkForgeScene", "SunkenBellScene", "HauntedWoodScene", "SkyIslandScene"]) for (const reduced of [false, true]) {
    const { scene, image, timers } = fixture(key, reduced);
    actorLighting.applySceneActorLighting(scene as never, image);
    const expected = [...image.cornerLight], initial = resting(image);
    assertEqual([reducedMotion(scene as never), reducedFlashes(scene as never)], [reduced, reduced], "both actual comfort preferences are bound before lighting");
    assert(expected.length === 4, "world figures carry corner light from the scene");
    exports.playWrenHurt(image, { onComplete() {} });
    assert(image.tinted && image.cornerLight.every(color => color === 0x8a3a2a), "the actual hurt fill temporarily replaces all ambient corners");
    timers.at(-1)!.callback();
    assertEqual(image.cornerLight, expected, "hurt completion cannot leave an unlit white cutout in either comfort setting");
    assertEqual(resting(image), initial, "ambient restoration preserves the original painted feet, scale and facing");
    assert(!image.tinted, "the damage fill itself is cleared");
  }
});
await suite("Sky scene light: turning and interrupted reactions keep the sunset on the same world side", () => {
  for (const reduced of [false, true]) {
    const { scene, image, timers, finish } = fixture("SkyIslandScene", reduced);
    actorLighting.applySceneActorLighting(scene as never, image);
    exports.setWrenPose(image, "front", false);
    const rightFacing = [...image.cornerLight];
    assert((rightFacing[0] >> 16) > (rightFacing[1] >> 16), "the sunset-facing left edge keeps the stronger warm red channel");
    exports.setWrenPose(image, "walk", true);
    assertEqual(image.cornerLight, [rightFacing[1], rightFacing[0], rightFacing[3], rightFacing[2]], "mirrored artwork keeps the light fixed in the world");
    exports.playWrenFocus(image);
    image.y -= 2;
    exports.flashWrenMiss(image);
    exports.setWrenPose(image, "front", false);
    assert(image.tintFill, "a pose change does not end the existing typo fill early");
    timers.at(-1)!.callback();
    assertEqual(image.cornerLight, rightFacing, "typo completion restores the current facing, rather than its old pose");
    exports.playWrenFocus(image);
    exports.bobWrenSprite(image);
    finish();
    assertEqual(image.cornerLight, rightFacing, "interrupting and restoring focus retains the resting light");
    exports.playWrenHurt(image, { faceLeft: true, onComplete() {} });
    assert(image.tintFill, "hurt keeps ownership of the fill during its normal hold");
    timers.at(-1)!.callback();
    assertEqual(image.cornerLight, rightFacing, "hurt restores the original facing before choosing its ambient corners");
  }
});

await suite("Painted overlays: crop light follows Phaser's source triangle, including fill effects", () => {
  const { image: source } = fixture("SkyIslandScene"), { image: crop } = fixture("SkyIslandScene");
  source.setTint(0xfc0000, 0x00fc00, 0x0000fc, 0xfcfcfc);
  actorLighting.matchActorCropLighting(source, crop, { x: .25, y: .5, width: .125, height: .125 });
  assertEqual(crop.cornerLight, [0xbd3f7e, 0xdd5f7e, 0x9e3f9e, 0xbd5f9e], "a lower-triangle crop samples original-image colors instead of starting a new gradient");
  actorLighting.matchActorCropLighting(source, crop, { x: .5, y: .125, width: .25, height: .125 });
  assertEqual(crop.cornerLight, [0x9e7e20, 0x5fbd20, 0xbd7e3f, 0x7ebd3f], "upper-triangle samples retain the shader's different corner weights");
  source.setTintFill(0x8a3a2a);
  actorLighting.matchActorCropLighting(source, crop, { x: .5, y: .125, width: .25, height: .125 });
  assert(crop.tintFill && crop.cornerLight.every(color => color === 0x8a3a2a), "a red fill covers the same painted fingers as their supporting body");
});
await suite("Scene light direction: parent mirrors and texture flips preserve ambient restoration after attention", () => {
  const { scene, image } = fixture("SkyIslandScene");
  image.scaleX = 2.4;
  const actor = Object.assign(image, { flipX: false, getWorldTransformMatrix: () => ({ a: 2.4 }) });
  actorLighting.applySceneActorLighting(scene as never, actor);
  const original = [...image.cornerLight];
  actor.getWorldTransformMatrix = () => ({ a: -2.4 });
  actorLighting.refreshSceneActorLighting(actor);
  const mirrored = [original[1], original[0], original[3], original[2]];
  assertEqual(image.cornerLight, mirrored, "a mirrored parent is included in the light direction");
  actor.flipX = true; actorLighting.refreshSceneActorLighting(actor);
  assertEqual(image.cornerLight, original, "a texture flip and parent mirror cancel each other");
  actor.setTintFill(0xf5c842); actor.flipX = false;
  actorLighting.refreshSceneActorLighting(actor);
  assert(image.tintFill && image.cornerLight.every(color => color === 0xf5c842), "ambient refresh preserves an in-flight speaker fill");
  actorLighting.restoreSceneActorLighting(actor);
  assertEqual(image.cornerLight, mirrored, "attention completion restores light for the actor's current world facing");
});
await suite("Wren scene lighting: miss and interrupted hurt feedback retain the Bell and Wood ambient gradient", () => {
  for (const key of ["SunkenBellScene", "HauntedWoodScene"]) for (const reduced of [false, true]) {
    const { scene, image, timers } = fixture(key, reduced);
    actorLighting.applySceneActorLighting(scene as never, image);
    const expected = [...image.cornerLight], initial = resting(image);
    const channel = (color: number, shift: number) => (color >> shift) & 255;
    assert(expected.slice(2).every(color => channel(color, key === "SunkenBellScene" ? 0 : 8) > channel(color, 16)), "lower corners retain teal-water or moss-floor color");
    assert(expected.slice(2).every((color, index) => [0, 8, 16].every(shift => channel(color, shift) <= channel(expected[index]!, shift))), "the floor-facing corners remain shaded without flattening the upper silhouette");
    exports.flashWrenMiss(image); timers.at(-1)!.callback();
    assertEqual(image.cornerLight, expected, "a short typo flash restores the same per-corner light");
    exports.playWrenHurt(image, { onComplete() {} });
    const hurt = timers.at(-1)!;
    exports.setWrenPose(image, "front", true);
    assert(hurt.removed, "an explicit scene pose removes the old hurt timer");
    assertEqual(image.cornerLight, expected, "a scene interrupting damage restores the same light immediately");
    hurt.callback();
    assertEqual(image.cornerLight, expected, "a late callback cannot overwrite the restored ambient light");
    assertEqual(resting(image), initial, "lighting and interruption do not move the original contact geometry");
  }
});

await suite("Wren reactions: a keystroke interrupting focus cannot strand a raised walk frame", () => {
  const { image, finish } = fixture();
  const initial = resting(image);
  exports.playWrenFocus(image);
  image.x = -3; image.y = -2; // focus is halfway through its visual lift
  exports.bobWrenSprite(image);
  assertEqual(resting(image), initial, "typing restores the resting frame before starting its squash");
  image.scaleX *= 1.01; image.scaleY *= .97;
  exports.playWrenAction(image);
  image.y = -6;
  finish();
  assertEqual(resting(image), initial, "completion returns to the original pose, feet and facing");
});

await suite("Wren reactions: rapid repeated feedback never accumulates position or scale drift", () => {
  const { image, finish } = fixture();
  image.y = 12; image.scaleX = -3.2; image.scaleY = 3.2;
  const initial = resting(image);
  for (let press = 0; press < 20; press += 1) {
    exports.playWrenFocus(image);
    image.x -= 2; image.y -= 2;
    exports.bobWrenSprite(image);
    image.scaleX *= 1.01; image.scaleY *= .98;
  }
  finish();
  assertEqual(resting(image), initial, "all interrupted reactions share the scene's actual resting scale and offset");
});

await suite("Wren reactions: an intentional scene pose supersedes an old flourish", () => {
  const { image, active } = fixture();
  exports.playWrenFocus(image);
  const oldCompletion = active[0].onComplete!;
  image.x = -3; image.y = -2;
  exports.setWrenPose(image, "cast");
  const commanded = resting(image);
  oldCompletion();
  assertEqual(resting(image), commanded, "an old cancelled callback cannot restore over the commanded pose");
  assertEqual(image.y, 0, "the scene pose begins at the stable foot position");
  assertEqual(image.texture.key, "wren-cast", "the explicit cast pose remains selected");
});

await suite("Wren reactions: repeated damage restores the stable pose and guards its hurt window", () => {
  const { image, timers, active } = fixture();
  const initial = resting(image);
  let restored = 0;
  exports.playWrenHurt(image, { onComplete: () => { restored += 1; } });
  image.y = 5;
  const hurtTweenCount = active.length;
  exports.bobWrenSprite(image);
  exports.playWrenFocus(image);
  exports.playWrenAction(image);
  assertEqual(active.length, hurtTweenCount, "gentle typing feedback cannot cancel the hurt reaction");
  assertEqual(image.texture.key, "wren-hurt", "hurt pose stays visible during its timer");
  exports.playWrenHurt(image, { onComplete: () => { restored += 1; } });
  assert(timers[0].removed, "new damage cancels the previous recovery timer");
  timers[0].callback();
  assertEqual(restored, 0, "a stale recovery does not run scene hooks");
  image.y = 4;
  timers[1].callback();
  assertEqual(resting(image), initial, "the second damage reaction does not inherit the first knockback");
  assertEqual(restored, 1, "the current recovery runs its scene hook once");
  assert(!image.tinted && !image.getData("wrenHurtTimer"), "recovery clears tint and timer state");
});

await suite("Wren carrying: rapid typing keeps the painted supporting arms and explicit release defeats stale reactions", () => {
  const { image, active } = fixture("SkyIslandScene");
  exports.setWrenPose(image, "carry");
  const initial = resting(image);
  for (let key = 0; key < 8; key++) {
    exports.playWrenFocus(image);
    assertEqual(image.texture.key, "wren-carry", "claiming a book word cannot swap its supporting arms for a walk frame");
    image.x -= 2; image.y -= 1;
    exports.bobWrenSprite(image);
    exports.playWrenAction(image);
    assertEqual(image.texture.key, "wren-carry", "completed book words cannot introduce the cast pose and its staff");
    image.y -= 3;
  }
  const oldCallbacks = active.map(tween => tween.onComplete);
  exports.setWrenPose(image, "front");
  const released = resting(image);
  for (const callback of oldCallbacks) callback?.();
  assertEqual(resting(image), released, "putting down the book removes the carry pose even if a prior reaction completes late");
  assertEqual([released.key, released.x, released.y], ["wren-front", initial.x, initial.y], "release retains Wren's original foot position");
});

await suite("Wren carrying: only a scene requesting the pose expands its required artwork gate", () => {
  const ordinary: string[] = [], carrying: string[] = [];
  exports.preloadWren({ load: { image: (key: string) => ordinary.push(key) } });
  exports.preloadWren({ load: { image: (key: string) => carrying.push(key) } }, { carry: true });
  assertEqual(ordinary, ["wren-front", "wren-walk", "wren-cast", "wren-hurt"], "all other scenes retain their original required pose set");
  assertEqual(carrying, [...ordinary, "wren-carry"], "the carrying scene preloads its new pose through the existing asset recovery gate");
});


// Exercise the real shared grip code, including its scene and prop lifetime.
// The display surfaces model Phaser's transform and destroy event contracts.
class GripImage extends EventEmitter {
  texture = { key: "wren-front" };
  width = 449; height = 789; x = 0; y = 0; scaleX = 1; scaleY = 1;
  rotation = 0; alpha = 1; crop: number[] = []; parentContainer: any;
  data = new Map<string, unknown>();
  tintFill = false;
  tintTopLeft = 0xffffff; tintTopRight = 0xffffff;
  tintBottomLeft = 0xffffff; tintBottomRight = 0xffffff;
  constructor(public scene: any) { super(); }
  setTexture(key: string) { this.texture.key = key; return this; }
  setOrigin() { return this; }
  setCrop(...crop: number[]) { this.crop = crop; return this; }
  setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setRotation(rotation: number) { this.rotation = rotation; return this; }
  setAlpha(alpha: number) { this.alpha = alpha; return this; }
  setTint(tl: number, tr = tl, bl = tl, br = tl) {
    this.tintTopLeft = tl; this.tintTopRight = tr; this.tintBottomLeft = bl; this.tintBottomRight = br;
    this.tintFill = false; return this;
  }
  setTintFill(tl: number, tr = tl, bl = tl, br = tl) { this.setTint(tl, tr, bl, br); this.tintFill = true; return this; }
  clearTint() { return this.setTint(0xffffff); }
  getData(key: string) { return this.data.get(key); }
  setData(key: string, value: unknown) { this.data.set(key, value); return this; }
  getLocalTransformMatrix() {
    const c = Math.cos(this.rotation), s = Math.sin(this.rotation);
    return { a: c * this.scaleX, b: s * this.scaleX, c: -s * this.scaleY, d: c * this.scaleY, tx: this.x, ty: this.y };
  }
  destroy() {
    if (!this.scene) return;
    this.emit("destroy"); this.scene = undefined;
    const siblings = this.parentContainer?.children;
    if (siblings) siblings.splice(siblings.indexOf(this), 1);
  }
}
class GripContainer extends EventEmitter {
  children: GripImage[] = [];
  destroyCalls = 0;
  constructor(public scene: any) { super(); }
  add(image: GripImage) { this.children.push(image); image.parentContainer = this; return this; }
  destroy() {
    if (!this.scene) return;
    this.destroyCalls++;
    this.emit("destroy"); this.scene = undefined;
    for (const image of [...this.children]) image.destroy();
  }
}
function gripFixture() {
  const active: any[] = [];
  const timers: { callback: () => void; remove: () => void }[] = [];
  const scene: any = { sys: { settings: { key: "SkyIslandScene" } }, events: new EventEmitter(),
    tweens: { killTweensOf: () => { active.length = 0; }, add: (t: any) => active.push(t) },
    time: { delayedCall: (_delay: number, callback: () => void) => { const timer = { callback, remove() {} }; timers.push(timer); return timer; } },
    add: { image: () => new GripImage(scene), container: () => new GripContainer(scene) } };
  const sprite = new GripImage(scene).setScale(240 / 789);
  actorLighting.applySceneActorLighting(scene, sprite);
  const owner = { x: 960, y: 826, children: [sprite] as GripImage[],
    getIndex(child: GripImage) { return this.children.indexOf(child); },
    addAt(child: GripImage, index: number) { const old = this.children.indexOf(child); if (old >= 0) this.children.splice(old, 1);
      this.children.splice(index, 0, child); child.parentContainer = this; } };
  const prop = new GripImage(scene).setScale(.08); prop.width = 499; prop.height = 1136;
  return { scene, sprite, owner, prop, active, timers, update: () => scene.events.emit("postupdate") };
}

const corners = (image: GripImage) => [image.tintTopLeft, image.tintTopRight, image.tintBottomLeft, image.tintBottomRight];
// Sky is an affine color plane, so a source point has this independent planar
// expectation on either side of the renderer's triangle diagonal.
const skyPlanePoint = (image: GripImage, x: number, y: number): number => {
  let result = 0;
  for (const shift of [16, 8, 0]) {
    const tl = (image.tintTopLeft >> shift) & 255;
    const horizontal = ((image.tintTopRight >> shift) & 255) - tl;
    const vertical = ((image.tintBottomLeft >> shift) & 255) - tl;
    result |= Math.round(tl + horizontal * x + vertical * y) << shift;
  }
  return result;
};

await suite("Wren hand lighting: held fingers match body source positions through mirrors, damage and release", () => {
  const f = gripFixture();
  exports.attachWrenHeldProp(f.scene, f.owner, f.sprite, f.prop, { x: 46, y: -65 });
  const hand = f.owner.children[2];
  const expectFingers = () => assertEqual(corners(hand), [
    skyPlanePoint(f.sprite, 350 / 449, 565 / 789), skyPlanePoint(f.sprite, 375 / 449, 565 / 789),
    skyPlanePoint(f.sprite, 350 / 449, 595 / 789), skyPlanePoint(f.sprite, 375 / 449, 595 / 789),
  ], "small finger crops use the full body's source-image positions");
  expectFingers();
  f.sprite.scaleX *= -1; f.update(); expectFingers();
  exports.flashWrenMiss(f.sprite as never);
  assert(hand.tintFill && corners(hand).every(color => color === 0x8a3a2a), "the original miss fill reaches fingers synchronously");
  f.timers.at(-1)!.callback(); expectFingers();
  assert(!hand.tintFill, "miss completion restores painted fingers with the body");
  exports.playWrenHurt(f.sprite as never, { onComplete() {} });
  assert(hand.tintFill, "hurt does not leave a normal-color hand over a red body");
  f.timers.at(-1)!.callback(); expectFingers();
  f.prop.destroy();
  const released = corners(hand); exports.flashWrenMiss(f.sprite as never);
  assertEqual(corners(hand), released, "destroyed fingers are no longer followed by body-light updates");
});

await suite("Wren carrying light: both palm crops share the body gradient without new frame subscriptions", () => {
  const f = gripFixture();
  exports.setWrenPose(f.sprite as never, "carry");
  const hands = exports.makeWrenCarryHands(f.scene, f.sprite);
  const left = hands.children[0], right = hands.children[1];
  assertEqual([left.tintTopLeft, right.tintTopLeft], [skyPlanePoint(f.sprite, .318, .493), skyPlanePoint(f.sprite, .529, .493)],
    "each painted palm starts at its own original source position");
  assertEqual(f.scene.events.listenerCount("postupdate"), 0, "carrying light uses existing reaction updates instead of another frame listener");
  exports.flashWrenMiss(f.sprite as never);
  assert(left.tintFill && right.tintFill, "both crops share an active fill immediately");
  f.timers.at(-1)!.callback();
  assert(!left.tintFill && !right.tintFill, "both palms return to their original painted light after the flash");
  const before = corners(left); hands.destroy();
  assertEqual(hands.destroyCalls, 1, "direct stowing cannot re-enter the container's destroy event");
  exports.flashWrenMiss(f.sprite as never);
  assertEqual(corners(left), before, "stowed palms no longer receive lighting callbacks");
  assertEqual([f.scene.events.listenerCount("shutdown"), f.sprite.listenerCount("destroy")], [0, 0], "stowing removes both lifecycle hooks");
  const next = exports.makeWrenCarryHands(f.scene, f.sprite);
  f.scene.events.emit("shutdown");
  assert(!next.scene && !next.children[0]?.scene, "scene shutdown destroys the remaining foreground crops");
  assertEqual([f.scene.events.listenerCount("shutdown"), f.sprite.listenerCount("destroy")], [0, 0], "shutdown leaves no hand-light owner behind");
});

await suite("Wren received props: readable silhouette sits above cloak with only original fingers in front", () => {
  for (const x of [-42, 46]) {
    const f = gripFixture();
    exports.attachWrenHeldProp(f.scene, f.owner, f.sprite, f.prop, { x, y: -65 });
    const [body, prop, hand] = f.owner.children;
    assertEqual([body, prop], [f.sprite, f.prop], "the opaque body cannot cover the received object");
    assertClose(prop.x, x, .0001, "the original horizontal palm contact is retained");
    assertClose(prop.y, -65, .0001, "the original vertical palm contact is retained");
    assertEqual(hand.crop, [x < 0 ? 75 : 350, 565, 25, 30], "the uppermost crop contains only the painted fingers for the receiving side");
    assert(hand.crop[2] * hand.scaleX < 8 && hand.crop[3] * hand.scaleY < 10,
      "the foreground grip cannot hide a 44-56 pixel keepsake with an opaque full sleeve");
    assertEqual([hand.x, hand.y, hand.scaleX, hand.scaleY], [f.sprite.x, f.sprite.y, f.sprite.scaleX, f.sprite.scaleY],
      "the cropped fingers exactly match the existing body, without a detached duplicate hand");
    f.prop.destroy();
  }
});

await suite("Wren received props: breathing, squash, attention and mirrored transforms keep the same physical grip", () => {
  const f = gripFixture();
  exports.attachWrenHeldProp(f.scene, f.owner, f.sprite, f.prop, { x: 46, y: -65 });
  const hand = f.owner.children[2], baseline = f.sprite.scaleY;
  f.sprite.setPosition(5, -3).setScale(-baseline * 1.02, baseline * .95); f.update();
  assertClose(f.prop.x, 5 - 46 * 1.02, .0001, "the complete grip follows the same mirrored squash and horizontal attention translation");
  assertClose(f.prop.y, -3 - 65 * .95, .0001, "the complete grip follows the same vertical squash and attention translation");
  assertClose(f.prop.scaleX, -.08 * 1.02, .0001, "the object's horizontal fit stays proportional to the mirrored supporting fingers");
  assertClose(f.prop.scaleY, .08 * .95, .0001, "the object's vertical fit stays proportional to the supporting fingers");
  assertEqual([hand.x, hand.y, hand.scaleX, hand.scaleY], [5, -3, f.sprite.scaleX, f.sprite.scaleY], "the foreground crop follows the same frame transform");
  const local = [f.prop.x, f.prop.y]; f.owner.y -= 5; f.update();
  assertEqual([f.prop.x, f.prop.y], local, "owner breathing moves all layers once without world-space double translation");
  f.prop.destroy();
});

await suite("Wren received props: typing preserves the receiving palm until the final held item is released", () => {
  const f = gripFixture();
  exports.attachWrenHeldProp(f.scene, f.owner, f.sprite, f.prop, { x: 46, y: -65 });
  const other = new GripImage(f.scene).setScale(.1);
  exports.attachWrenHeldProp(f.scene, f.owner, f.sprite, other, { x: -42, y: -65 });
  for (let i = 0; i < 8; i++) {
    exports.playWrenFocus(f.sprite as never); exports.bobWrenSprite(f.sprite as never); exports.playWrenAction(f.sprite as never);
    assertEqual(f.sprite.texture.key, "wren-front", "walk or staff poses cannot break a held palm during rapid input");
  }
  f.prop.destroy();
  exports.playWrenFocus(f.sprite as never);
  assertEqual(f.sprite.texture.key, "wren-front", "releasing one item cannot release another item's palm");
  other.destroy(); exports.playWrenFocus(f.sprite as never);
  assertEqual(f.sprite.texture.key, "wren-walk", "ordinary feedback returns after the last received item is stowed");
});

await suite("Wren received props: repeat attachment, destruction and scene shutdown remove every extra layer and update listener", () => {
  const f = gripFixture();
  exports.attachWrenHeldProp(f.scene, f.owner, f.sprite, f.prop, { x: 46, y: -65 });
  const oldHand = f.owner.children[2];
  f.sprite.scaleX *= 1.02; f.sprite.scaleY *= .95; f.update();
  exports.attachWrenHeldProp(f.scene, f.owner, f.sprite, f.prop, { x: 46, y: -65 });
  assert(!oldHand.scene, "re-attaching the same actual prop destroys its stale foreground grip");
  assertClose(f.prop.scaleX, .08, .0001, "re-attachment during a squash retains the original horizontal artwork fit");
  assertClose(f.prop.scaleY, .08, .0001, "re-attachment during a squash retains the original vertical artwork fit");
  assertEqual([f.owner.children.length, f.scene.events.listenerCount("postupdate"), f.scene.events.listenerCount("shutdown")],
    [3, 1, 1], "an idempotent handoff retains exactly one prop, crop and update owner");
  f.prop.destroy();
  assertEqual([f.owner.children.length, f.scene.events.listenerCount("postupdate"), f.scene.events.listenerCount("shutdown")],
    [1, 0, 0], "destroying the received prop removes its fingers and both lifecycle subscriptions immediately");
  const next = new GripImage(f.scene).setScale(.1);
  exports.attachWrenHeldProp(f.scene, f.owner, f.sprite, next, { x: 46, y: -65 });
  const hand = f.owner.children[2]; f.scene.events.emit("shutdown");
  assert(!hand.scene, "chapter shutdown releases its remaining cropped hand");
  assertEqual([f.scene.events.listenerCount("postupdate"), next.listenerCount("destroy")], [0, 0], "no old scene tick or stale prop callback survives restart");
  next.destroy();
});
