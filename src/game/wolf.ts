import Phaser from "phaser";
import wolfLeader from "../../art/wolf/wolf-leader.png";
import wolfPack from "../../art/wolf/wolf-pack.png";

/** On-screen heights at the 1920x1080 design resolution. */
const PACK_DISPLAY_HEIGHT = 150;
const LEADER_DISPLAY_HEIGHT = 215;

export function preloadWolves(scene: Phaser.Scene): void {
  scene.load.image("wolf-pack", wolfPack);
  scene.load.image("wolf-leader", wolfLeader);
}

/**
 * Builds the painted wolf sprite anchored by the feet at (0, 0). Sprites are
 * authored facing right; pass facingLeft=true to mirror horizontally.
 */
export function makeWolfSprite(
  scene: Phaser.Scene,
  isBoss: boolean,
  facingLeft: boolean,
): Phaser.GameObjects.Image {
  const key = isBoss ? "wolf-leader" : "wolf-pack";
  const targetH = isBoss ? LEADER_DISPLAY_HEIGHT : PACK_DISPLAY_HEIGHT;
  const img = scene.add.image(0, 0, key).setOrigin(0.5, 1);
  const scale = targetH / img.height;
  img.setScale(scale);
  img.scaleX = facingLeft ? -scale : scale;
  return img;
}
