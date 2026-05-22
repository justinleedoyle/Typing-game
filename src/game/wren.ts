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
 * Subtle per-keystroke feedback on the Wren sprite — a 2% scaleY squat,
 * 50ms each way, against the feet anchor (origin 0.5, 1) so the sprite
 * doesn't shift position. Tuned to barely show on a still frame; a rapid
 * type still produces a noticeable cadence without making Wren visibly
 * shrink and grow.
 */
export function bobWrenSprite(img: Phaser.GameObjects.Image): void {
  const baseScale = WREN_DISPLAY_HEIGHT / img.height;
  img.scene.tweens.killTweensOf(img);
  img.scene.tweens.add({
    targets: img,
    scaleY: baseScale * 0.98,
    duration: 50,
    yoyo: true,
    ease: "Sine.out",
    onComplete: () => {
      img.scaleY = baseScale;
    },
  });
}
