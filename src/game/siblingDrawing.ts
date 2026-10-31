import type Phaser from "phaser";

/** Saga's small parchment and three sketch strokes, as given in the opening. */
export function makeSiblingDrawing(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const drawing = scene.add.graphics().setAlpha(0.92);
  drawing.fillStyle(0xf0dfbd, 0.92);
  drawing.fillRoundedRect(-22, -24, 44, 36, 4);
  drawing.lineStyle(2, 0xb98f49, 0.72);
  drawing.strokeRoundedRect(-22, -24, 44, 36, 4);
  drawing.lineStyle(1, 0x7b623d, 0.44);
  drawing.lineBetween(-14, -5, -3, -14);
  drawing.lineBetween(-3, -14, 10, 3);
  drawing.lineBetween(-10, 6, 14, 6);
  return drawing;
}
