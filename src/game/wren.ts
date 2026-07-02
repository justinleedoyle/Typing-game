import Phaser from "phaser";
import wrenFront from "../../art/wren/wren-front.png";
import wrenWalk from "../../art/wren/wren-walk-right.png";
import wrenCast from "../../art/wren/wren-cast.png";
import wrenHurt from "../../art/wren/wren-hurt.png";

export type WrenPose = "front" | "walk" | "cast" | "hurt";

/** On-screen height of the Wren sprite at the 1920x1080 design resolution. */
const WREN_DISPLAY_HEIGHT = 240;

const TEXTURE: Record<WrenPose, string> = {
  front: "wren-front",
  walk: "wren-walk",
  cast: "wren-cast",
  hurt: "wren-hurt",
};
const SOURCE: Record<string, string> = {
  "wren-front": wrenFront,
  "wren-walk": wrenWalk,
  "wren-cast": wrenCast,
  "wren-hurt": wrenHurt,
};
const HURT_TIMER_KEY = "wrenHurtTimer";

/** Loads every Wren pose texture. Call from a scene's preload(). */
export function preloadWren(scene: Phaser.Scene): void {
  for (const [key, src] of Object.entries(SOURCE)) {
    scene.load.image(key, src);
  }
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
  img.setTexture(TEXTURE[pose]);
  const scale = WREN_DISPLAY_HEIGHT / img.height;
  img.setScale(scale);
  img.scaleX = faceLeft ? -scale : scale;
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
  const baseScale = WREN_DISPLAY_HEIGHT / img.height;
  const facingLeft = img.scaleX < 0;
  const baseScaleX = facingLeft ? -baseScale : baseScale;
  img.scene.tweens.killTweensOf(img);
  img.scene.tweens.add({
    targets: img,
    scaleY: baseScale * 0.95,
    scaleX: baseScaleX * 1.02,
    duration: 60,
    yoyo: true,
    ease: "Sine.out",
    onComplete: () => {
      img.scaleY = baseScale;
      img.scaleX = baseScaleX;
    },
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
  const originalKey = img.texture.key;
  const originalScaleX = img.scaleX;
  const originalScaleY = img.scaleY;
  const originalY = img.y;
  const scene = img.scene;
  scene.tweens.killTweensOf(img);
  setWrenPose(img, "cast", opts.faceLeft ?? originalScaleX < 0);
  scene.tweens.add({
    targets: img,
    y: originalY - 8,
    duration: opts.durationMs ?? 180,
    yoyo: true,
    ease: "Sine.easeOut",
    onComplete: () => {
      if (!img.scene) return;
      img.setTexture(originalKey);
      img.scaleX = originalScaleX;
      img.scaleY = originalScaleY;
      img.y = originalY;
    },
  });
}

/** A smaller "attention" reaction for claiming an authored choice. It is less
 *  forceful than playWrenAction(), which remains the completion flourish. */
export function playWrenFocus(
  img: Phaser.GameObjects.Image,
  opts: { faceLeft?: boolean; durationMs?: number } = {},
): void {
  if (img.getData(HURT_TIMER_KEY)) return;
  const originalKey = img.texture.key;
  const originalScaleX = img.scaleX;
  const originalScaleY = img.scaleY;
  const originalX = img.x;
  const originalY = img.y;
  const scene = img.scene;
  scene.tweens.killTweensOf(img);
  const faceLeft = opts.faceLeft ?? originalScaleX < 0;
  setWrenPose(img, "walk", faceLeft);
  scene.tweens.add({
    targets: img,
    x: originalX + (faceLeft ? -5 : 5),
    y: originalY - 3,
    duration: opts.durationMs ?? 120,
    yoyo: true,
    ease: "Sine.easeOut",
    onComplete: () => {
      if (!img.scene) return;
      img.setTexture(originalKey);
      img.scaleX = originalScaleX;
      img.scaleY = originalScaleY;
      img.x = originalX;
      img.y = originalY;
    },
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

  const priorTimer = img.getData(HURT_TIMER_KEY) as
    | Phaser.Time.TimerEvent
    | undefined;
  priorTimer?.remove();

  const originalKey = img.texture.key;
  const originalScaleX = img.scaleX;
  const originalScaleY = img.scaleY;
  const originalX = img.x;
  const originalY = img.y;
  const facingLeft = opts.faceLeft ?? originalScaleX < 0;

  scene.tweens.killTweensOf(img);
  setWrenPose(img, "hurt", facingLeft);
  img.setTintFill(0x8a3a2a);

  scene.tweens.add({
    targets: img,
    x: originalX + (opts.knockX ?? (facingLeft ? -10 : 10)),
    y: originalY + (opts.knockY ?? 6),
    duration: 95,
    yoyo: true,
    ease: "Sine.easeOut",
  });

  const timer = scene.time.delayedCall(opts.durationMs ?? 420, () => {
    if (!img.scene) return;
    img.clearTint();
    img.setTexture(originalKey);
    img.scaleX = originalScaleX;
    img.scaleY = originalScaleY;
    img.x = originalX;
    img.y = originalY;
    img.setData(HURT_TIMER_KEY, undefined);
    opts.onComplete?.();
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
  img.scene.time.delayedCall(80, () => img.clearTint());
}
