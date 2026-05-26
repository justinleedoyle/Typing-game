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

/** Crackling brass-colored arc between two points — the Alt-spell chain
 *  effect in the Clockwork Forge. Renders a jagged polyline that briefly
 *  jitters then fades. The arc is ~6 segments with random midpoint
 *  perpendicular offsets, redrawn twice during its lifetime to feel like
 *  active electricity rather than a static line. */
export function playChainSpark(
  scene: Phaser.Scene,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: number = 0xc9a14a,
): void {
  const segments = 6;
  const lifetime = 360;

  const arc = scene.add.graphics().setDepth(60);

  const draw = (): void => {
    arc.clear();
    arc.lineStyle(3, color, 1);
    const dx = toX - fromX;
    const dy = toY - fromY;
    const length = Math.hypot(dx, dy) || 1;
    // Unit perpendicular to (dx, dy) — used to offset midpoints sideways
    // by a random jitter, producing the lightning crackle.
    const perpX = -dy / length;
    const perpY = dx / length;
    const points: Array<{ x: number; y: number }> = [{ x: fromX, y: fromY }];
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const baseX = fromX + dx * t;
      const baseY = fromY + dy * t;
      const jitter = (Math.random() - 0.5) * 28;
      points.push({ x: baseX + perpX * jitter, y: baseY + perpY * jitter });
    }
    points.push({ x: toX, y: toY });
    arc.beginPath();
    arc.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      arc.lineTo(points[i].x, points[i].y);
    }
    arc.strokePath();
  };

  draw();
  // Redraw once mid-life so the bolt visibly flickers.
  scene.time.delayedCall(lifetime / 3, draw);

  scene.tweens.add({
    targets: arc,
    alpha: 0,
    duration: lifetime,
    ease: "Cubic.easeOut",
    onComplete: () => arc.destroy(),
  });
}
