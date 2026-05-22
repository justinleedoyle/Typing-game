import Phaser from "phaser";
import heldurSrc from "../../art/winter/heldur.png";
import huntressSrc from "../../art/winter/huntress.png";

/** On-screen heights at the 1920x1080 design resolution. */
const HELDUR_DISPLAY_HEIGHT = 320;
const HUNTRESS_DISPLAY_HEIGHT = 220;

export function preloadWinterNpcs(scene: Phaser.Scene): void {
  scene.load.image("heldur", heldurSrc);
  scene.load.image("huntress", huntressSrc);
}

/** Builds the frozen Wayshrine Knight sprite, feet-anchored. */
export function makeHeldurSprite(scene: Phaser.Scene): Phaser.GameObjects.Image {
  const img = scene.add.image(0, 0, "heldur").setOrigin(0.5, 1);
  img.setScale(HELDUR_DISPLAY_HEIGHT / img.height);
  return img;
}

/** Builds the snow-trapped huntress sprite, feet-anchored. */
export function makeHuntressSprite(scene: Phaser.Scene): Phaser.GameObjects.Image {
  const img = scene.add.image(0, 0, "huntress").setOrigin(0.5, 1);
  img.setScale(HUNTRESS_DISPLAY_HEIGHT / img.height);
  return img;
}
