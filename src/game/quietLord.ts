import Phaser from "phaser";
import quietLordSrc from "../../art/quiet-lord/quiet-lord.png";

/** On-screen height at the 1920x1080 design resolution.
 *  Taller than Runa (360px) to read as an unusually tall, gaunt figure. */
const QUIET_LORD_DISPLAY_HEIGHT = 480;

export function preloadQuietLord(scene: Phaser.Scene): void {
  scene.load.image("quiet-lord", quietLordSrc);
}

/** Builds the Quiet Lord silhouette, feet-anchored. */
export function makeQuietLordSprite(scene: Phaser.Scene): Phaser.GameObjects.Image {
  const img = scene.add.image(0, 0, "quiet-lord").setOrigin(0.5, 1);
  img.setScale(QUIET_LORD_DISPLAY_HEIGHT / img.height);
  return img;
}
