import Phaser from "phaser";
import wrenFront from "../../art/wren/wren-front.png";

/** Shared texture key for the Wren sprite. */
export const WREN_TEXTURE = "wren";

/** On-screen height of the Wren sprite at the 1920x1080 design resolution. */
const WREN_DISPLAY_HEIGHT = 160;

/** Loads the Wren sprite texture. Call from a scene's preload(). */
export function preloadWren(scene: Phaser.Scene): void {
  scene.load.image(WREN_TEXTURE, wrenFront);
}

/**
 * Builds the Wren sprite anchored by the feet at (0, 0), so it drops into the
 * feet-origin containers the scenes already position.
 */
export function makeWrenSprite(scene: Phaser.Scene): Phaser.GameObjects.Image {
  const img = scene.add.image(0, 0, WREN_TEXTURE).setOrigin(0.5, 1);
  img.setScale(WREN_DISPLAY_HEIGHT / img.height);
  return img;
}
