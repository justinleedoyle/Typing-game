import Phaser from "phaser";
import wrenFront from "../../art/wren/wren-front.png";
import wrenWalk from "../../art/wren/wren-walk-right.png";
import wrenCast from "../../art/wren/wren-cast.png";
import wrenHurt from "../../art/wren/wren-hurt.png";
import wrenCarry from "../../art/wren/wren-carry.png";
import { applySceneActorLighting, matchActorCropLighting, refreshSceneActorLighting, restoreSceneActorLighting } from "./actorLighting";

export type WrenPose = "front" | "walk" | "cast" | "hurt" | "carry";

/** On-screen height of the Wren sprite at the 1920x1080 design resolution. */
const WREN_DISPLAY_HEIGHT = 240;

const TEXTURE: Record<WrenPose, string> = {
  front: "wren-front",
  walk: "wren-walk",
  cast: "wren-cast",
  hurt: "wren-hurt",
  carry: "wren-carry",
};
const SOURCE: Record<string, string> = {
  "wren-front": wrenFront,
  "wren-walk": wrenWalk,
  "wren-cast": wrenCast,
  "wren-hurt": wrenHurt,
  "wren-carry": wrenCarry,
};
const HURT_TIMER_KEY = "wrenHurtTimer";
const pendingReactions = new WeakMap<Phaser.GameObjects.Image, () => boolean>();
const heldProps = new WeakMap<Phaser.GameObjects.Image, Set<Phaser.GameObjects.Image>>();
const heldPropCleanup = new WeakMap<Phaser.GameObjects.Image, () => void>();
const handLightUpdates = new WeakMap<Phaser.GameObjects.Image, Set<() => void>>();

function syncWrenLighting(sprite: Phaser.GameObjects.Image): void {
  refreshSceneActorLighting(sprite);
  handLightUpdates.get(sprite)?.forEach(update => update());
}

function trackHandLighting(sprite: Phaser.GameObjects.Image, update: () => void): () => void {
  const updates = handLightUpdates.get(sprite) ?? new Set<() => void>();
  updates.add(update);
  handLightUpdates.set(sprite, updates);
  update();
  return () => {
    updates.delete(update);
    if (!updates.size) handLightUpdates.delete(sprite);
  };
}

/** Keystrokes can interrupt a flourish before its tween completes. Restore its
 * resting pose first so the next reaction cannot inherit a raised walk frame. */
function finishPendingReaction(img: Phaser.GameObjects.Image): void {
  const restore = pendingReactions.get(img);
  if (!restore) return;
  img.scene?.tweens.killTweensOf(img);
  restore();
}

function beginReaction(img: Phaser.GameObjects.Image): () => boolean {
  finishPendingReaction(img);
  img.scene.tweens.killTweensOf(img);
  const resting = {
    key: img.texture.key, x: img.x, y: img.y,
    scaleX: img.scaleX, scaleY: img.scaleY,
  };
  const restore = (): boolean => {
    if (pendingReactions.get(img) !== restore) return false;
    pendingReactions.delete(img);
    if (!img.scene) return false;
    const hurtTimer = img.getData(HURT_TIMER_KEY) as Phaser.Time.TimerEvent | undefined;
    if (hurtTimer) {
      hurtTimer.remove();
      img.setData(HURT_TIMER_KEY, undefined);
    }
    img.setTexture(resting.key);
    img.x = resting.x;
    img.y = resting.y;
    img.scaleX = resting.scaleX;
    img.scaleY = resting.scaleY;
    if (hurtTimer) restoreSceneActorLighting(img);
    syncWrenLighting(img);
    return true;
  };
  pendingReactions.set(img, restore);
  return restore;
}

/** Load the regular poses; a carrying scene opts into its extra artwork. */
export function preloadWren(scene: Phaser.Scene, opts: { carry?: boolean } = {}): void {
  for (const [key, src] of Object.entries(SOURCE)) {
    if (key === "wren-carry" && !opts.carry) continue;
    scene.load.image(key, src);
  }
}

/** Foreground fingers from the same painted carrying pose. Keeping the book
 * between the body and these small crops gives it a real supported grip. The
 * caller keeps this layer on the sprite's exact transform while carrying. */
export function makeWrenCarryHands(scene: Phaser.Scene, sprite: Phaser.GameObjects.Image): Phaser.GameObjects.Container {
  const hands = scene.add.container(0, 0);
  const lightUpdates: (() => void)[] = [];
  for (const region of [
    { x: 0.318, y: 0.493, width: 0.161, height: 0.055 },
    { x: 0.529, y: 0.493, width: 0.155, height: 0.055 },
  ]) {
    const hand = scene.add.image(0, 0, "wren-carry").setOrigin(0.5, 1);
    hand.setCrop(region.x * hand.width, region.y * hand.height,
      region.width * hand.width, region.height * hand.height);
    lightUpdates.push(() => matchActorCropLighting(sprite, hand, region));
    hands.add(hand);
  }
  const untrack = trackHandLighting(sprite, () => {
    if (sprite.scene && hands.scene) lightUpdates.forEach(update => update());
  });
  let released = false;
  const release = (destroyHands: boolean): void => {
    if (released) return;
    released = true;
    untrack();
    sprite.off(Phaser.GameObjects.Events.DESTROY, onOwnerEnd);
    hands.off(Phaser.GameObjects.Events.DESTROY, onHandsDestroy);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onOwnerEnd);
    if (destroyHands && hands.scene) hands.destroy();
  };
  const onOwnerEnd = (): void => release(true);
  const onHandsDestroy = (): void => release(false);
  sprite.once(Phaser.GameObjects.Events.DESTROY, onOwnerEnd);
  hands.once(Phaser.GameObjects.Events.DESTROY, onHandsDestroy);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onOwnerEnd);
  return hands;
}

/** A received small prop sits in front of the cloak, with only the original
 * painted fingers over its grip. Cropping the full opaque sleeve would hide
 * small keepsakes completely. All three layers share the sprite's transform. */
export function attachWrenHeldProp(
  scene: Phaser.Scene,
  owner: Phaser.GameObjects.Container,
  sprite: Phaser.GameObjects.Image,
  prop: Phaser.GameObjects.Image,
  point: { x: number; y: number },
): void {
  heldPropCleanup.get(prop)?.();
  setWrenPose(sprite, "front");
  const props = heldProps.get(sprite) ?? new Set<Phaser.GameObjects.Image>();
  props.add(prop);
  heldProps.set(sprite, props);
  const hand = scene.add.image(0, 0, TEXTURE.front).setOrigin(0.5, 1);
  // Source artwork is 449 x 789. These narrow regions contain the fingers,
  // leaving the object silhouette readable above and below the contact.
  const left = point.x < 0;
  const region = { x: (left ? 75 : 350) / 449, y: 565 / 789, width: 25 / 449, height: 30 / 789 };
  hand.setCrop(region.x * hand.width, region.y * hand.height,
    region.width * hand.width, region.height * hand.height);
  const untrackLight = trackHandLighting(sprite, () => {
    if (sprite.scene && hand.scene) matchActorCropLighting(sprite, hand, region);
  });
  owner.addAt(prop, owner.getIndex(sprite) + 1);
  owner.addAt(hand, owner.getIndex(prop) + 1);
  const restingScale = WREN_DISPLAY_HEIGHT / sprite.height;
  const baseScaleX = prop.scaleX, baseScaleY = prop.scaleY, baseRotation = prop.rotation;
  const sync = (): void => {
    if (!sprite.scene || !prop.scene || !hand.scene) return;
    const matrix = sprite.getLocalTransformMatrix();
    const x = point.x / restingScale, y = point.y / restingScale;
    prop.setPosition(matrix.a * x + matrix.c * y + matrix.tx,
      matrix.b * x + matrix.d * y + matrix.ty);
    prop.setScale(baseScaleX * sprite.scaleX / restingScale,
      baseScaleY * sprite.scaleY / restingScale);
    prop.setRotation(baseRotation + sprite.rotation);
    hand.setPosition(sprite.x, sprite.y).setScale(sprite.scaleX, sprite.scaleY)
      .setRotation(sprite.rotation);
    hand.setAlpha(sprite.alpha);
    syncWrenLighting(sprite);
  };
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    untrackLight();
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, sync);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, release);
    prop.off(Phaser.GameObjects.Events.DESTROY, release);
    props.delete(prop);
    if (!props.size) heldProps.delete(sprite);
    heldPropCleanup.delete(prop);
    // Re-attaching during a typing squash must use the original art fit,
    // rather than accumulating the previous frame's scaled prop dimensions.
    if (prop.scene) prop.setScale(baseScaleX, baseScaleY).setRotation(baseRotation);
    if (hand.scene) hand.destroy();
  };
  heldPropCleanup.set(prop, release);
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, sync);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, release);
  prop.once(Phaser.GameObjects.Events.DESTROY, release);
  sync();
}

/**
 * Builds the Wren sprite anchored by the feet at (0, 0), so it drops into the
 * feet-origin containers the scenes already position.
 */
export function makeWrenSprite(
  scene: Phaser.Scene,
  pose: WrenPose = "front",
): Phaser.GameObjects.Image {
  const img = scene.add.image(0, 0, TEXTURE[pose]).setOrigin(0.5, 1);
  img.setScale(WREN_DISPLAY_HEIGHT / img.height);
  applySceneActorLighting(scene, img);
  return img;
}

/**
 * Switches an existing Wren sprite to another pose, optionally mirrored to
 * face left. Re-fits the height since each pose texture has its own size.
 */
export function setWrenPose(
  img: Phaser.GameObjects.Image,
  pose: WrenPose,
  faceLeft = false,
): void {
  finishPendingReaction(img);
  applyWrenPose(img, pose, faceLeft);
}

function applyWrenPose(img: Phaser.GameObjects.Image, pose: WrenPose, faceLeft: boolean): void {
  img.setTexture(TEXTURE[pose]);
  const scale = WREN_DISPLAY_HEIGHT / img.height;
  img.setScale(scale);
  img.scaleX = faceLeft ? -scale : scale;
  syncWrenLighting(img);
}

/**
 * Per-keystroke feedback on the Wren sprite — a 5% Y squat paired with a
 * 2% X widen (classic squash-stretch), 60ms each way against the feet
 * anchor (origin 0.5, 1) so the sprite doesn't shift position. Big enough
 * to read at a glance while typing; small enough that rapid keystrokes
 * read as a *cadence* rather than a distracting bounce.
 *
 * Preserves the sign of scaleX so left-facing Wren stays left-facing
 * through the bob.
 */
export function bobWrenSprite(img: Phaser.GameObjects.Image): void {
  if (img.getData(HURT_TIMER_KEY)) return;
  const restore = beginReaction(img);
  img.scene.tweens.add({
    targets: img,
    scaleY: img.scaleY * 0.95,
    scaleX: img.scaleX * 1.02,
    duration: 60,
    yoyo: true,
    ease: "Sine.out",
    onComplete: restore,
  });
}

/**
 * A readable completion flourish for non-combat typed actions. Keystrokes already
 * bob Wren; this switches to the cast/action pose for the completed verb, lifts
 * slightly from the feet anchor, then restores the exact previous texture/scale.
 */
export function playWrenAction(
  img: Phaser.GameObjects.Image,
  opts: { faceLeft?: boolean; durationMs?: number } = {},
): void {
  if (img.getData(HURT_TIMER_KEY)) return;
  const restore = beginReaction(img);
  const originalScaleX = img.scaleX;
  const originalY = img.y;
  const scene = img.scene;
  if (img.texture.key !== TEXTURE.carry && !heldProps.has(img)) applyWrenPose(img, "cast", opts.faceLeft ?? originalScaleX < 0);
  scene.tweens.add({
    targets: img,
    y: originalY - 8,
    duration: opts.durationMs ?? 180,
    yoyo: true,
    ease: "Sine.easeOut",
    onComplete: restore,
  });
}

/** A smaller "attention" reaction for claiming an authored choice. It is less
 *  forceful than playWrenAction(), which remains the completion flourish. */
export function playWrenFocus(
  img: Phaser.GameObjects.Image,
  opts: { faceLeft?: boolean; durationMs?: number } = {},
): void {
  if (img.getData(HURT_TIMER_KEY)) return;
  const restore = beginReaction(img);
  const originalScaleX = img.scaleX;
  const originalX = img.x;
  const originalY = img.y;
  const scene = img.scene;
  const faceLeft = opts.faceLeft ?? originalScaleX < 0;
  if (img.texture.key !== TEXTURE.carry && !heldProps.has(img)) applyWrenPose(img, "walk", faceLeft);
  scene.tweens.add({
    targets: img,
    x: originalX + (faceLeft ? -5 : 5),
    y: originalY - 3,
    duration: opts.durationMs ?? 120,
    yoyo: true,
    ease: "Sine.easeOut",
    onComplete: restore,
  });
}

/** True while the heavier hurt-pose reaction is holding the sprite. */
export function isWrenHurtPlaying(img: Phaser.GameObjects.Image): boolean {
  return Boolean(img.getData(HURT_TIMER_KEY));
}

/**
 * A readable enemy-hit reaction for combat stakes: switch into the painted hurt
 * pose, tint briefly, and jolt from the feet anchor before restoring whatever
 * pose/scale the scene had before. Distinct from flashWrenMiss(), which is only
 * per-keystroke typo feedback.
 */
export function playWrenHurt(
  img: Phaser.GameObjects.Image,
  opts: {
    faceLeft?: boolean;
    durationMs?: number;
    knockX?: number;
    knockY?: number;
    onComplete?: () => void;
  } = {},
): void {
  const scene = img.scene;
  if (!scene) return;

  const restore = beginReaction(img);
  const originalScaleX = img.scaleX;
  const originalX = img.x;
  const originalY = img.y;
  const facingLeft = opts.faceLeft ?? originalScaleX < 0;

  applyWrenPose(img, "hurt", facingLeft);
  img.setTintFill(0x8a3a2a);
  syncWrenLighting(img);

  scene.tweens.add({
    targets: img,
    x: originalX + (opts.knockX ?? (facingLeft ? -10 : 10)),
    y: originalY + (opts.knockY ?? 6),
    duration: 95,
    yoyo: true,
    ease: "Sine.easeOut",
  });

  const timer = scene.time.delayedCall(opts.durationMs ?? 420, () => {
    if (restore()) opts.onComplete?.();
  });
  img.setData(HURT_TIMER_KEY, timer);
}

/**
 * Per-mistyped-keystroke feedback. A brief red-ember tint flash on Wren
 * (80ms) — visible enough that the player feels the typo land without
 * being punishing. Composes safely with the hurt-pose system; the tint
 * clears on its own timer and doesn't disturb the underlying texture.
 */
export function flashWrenMiss(img: Phaser.GameObjects.Image): void {
  img.setTintFill(0x8a3a2a);
  syncWrenLighting(img);
  img.scene.time.delayedCall(80, () => {
    restoreSceneActorLighting(img);
    syncWrenLighting(img);
  });
}
