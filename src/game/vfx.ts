// Small visual effects shared across scenes.
//
// playWordCompleteBurst spawns a brief radial burst of small dots from a
// point. Used when a typed word completes — turns the word's fade-out from
// "text dissolves" into "you hit the thing." Color is themable per call so
// wolves can burst frost, portals can burst brass, etc.

import Phaser from "phaser";

export interface WordCompleteBurstOptions {
  /** Hex color for the dots. Defaults to brass. */
  color?: number;
  /** Number of dots. Default 10. */
  count?: number;
  /** Distance dots travel from origin (px). Default 35. */
  radius?: number;
  /** Tween duration (ms). Default 380. */
  duration?: number;
  /** Per-dot radius (px). Default 3. */
  dotRadius?: number;
}

export function playWordCompleteBurst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: WordCompleteBurstOptions = {},
): void {
  const color = opts.color ?? 0xc9a14a; // brass
  const count = opts.count ?? 10;
  const radius = opts.radius ?? 35;
  const duration = opts.duration ?? 380;
  const dotRadius = opts.dotRadius ?? 3;

  for (let i = 0; i < count; i++) {
    const baseAngle = (Math.PI * 2 * i) / count;
    const jitter = (Math.random() - 0.5) * 0.6;
    const angle = baseAngle + jitter;
    const distance = radius * (0.7 + Math.random() * 0.6);
    const targetX = x + Math.cos(angle) * distance;
    const targetY = y + Math.sin(angle) * distance;
    const lifetime = duration * (0.7 + Math.random() * 0.5);

    const dot = scene.add.circle(x, y, dotRadius, color);
    dot.setAlpha(0.9);
    dot.setDepth(50);

    scene.tweens.add({
      targets: dot,
      x: targetX,
      y: targetY,
      alpha: 0,
      duration: lifetime,
      ease: "Cubic.easeOut",
      onComplete: () => dot.destroy(),
    });
  }
}
