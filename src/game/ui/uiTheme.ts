// Shared UI kit theme — the one "dialect" every framed chrome element speaks, so
// the game stops feeling like loose overlays on a painting (the cohesion pass,
// matched to Touch Type Tale: everything that isn't the world is a crafted,
// parchment-and-brass frame). Colors are the Almanac's, promoted to a shared kit.
//
// Phaser needs hex NUMBERS for fills/strokes and CSS STRINGS for Text colors, so
// both forms live here.

import Phaser from "phaser";

export const UI_HEX = {
  parchment: 0xe8dcc0,
  parchmentDark: 0xd8c8a3,
  frame: 0x6e5a36, // warm brown border on parchment
  ink: 0x2a1f12, // dark text on parchment
  panel: 0x1a1610, // dark console fill (chrome over the world)
  brass: 0xc9a14a,
  ember: 0xd6754a,
} as const;

export const UI_CSS = {
  parchment: "#e8dcc0",
  ink: "#2a1f12",
  inkSoft: "#4a3a1e",
  brass: "#c9a14a",
  ember: "#d6754a",
  cream: "#f3ead2",
} as const;

/** A filled, brass-bordered rounded plate centered on (0,0), for adding into a
 *  container. The unifying frame behind every chrome element. */
export function framedPlate(
  scene: Phaser.Scene,
  w: number,
  h: number,
  opts: {
    fill?: number;
    fillAlpha?: number;
    border?: number;
    borderWidth?: number;
    radius?: number;
  } = {},
): Phaser.GameObjects.Graphics {
  const fill = opts.fill ?? UI_HEX.panel;
  const fillAlpha = opts.fillAlpha ?? 0.82;
  const border = opts.border ?? UI_HEX.brass;
  const borderWidth = opts.borderWidth ?? 2;
  const r = opts.radius ?? 8;
  const g = scene.add.graphics();
  g.fillStyle(fill, fillAlpha);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
  g.lineStyle(borderWidth, border, 0.9);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  return g;
}

/** Four small brass corner brackets framing a w×h area centered on (0,0) — the
 *  "crafted object" tell borrowed from TTT's console + the Almanac's page corners. */
export function cornerTicks(
  scene: Phaser.Scene,
  w: number,
  h: number,
  opts: { color?: number; size?: number; inset?: number; width?: number } = {},
): Phaser.GameObjects.Graphics {
  const color = opts.color ?? UI_HEX.brass;
  const size = opts.size ?? 9;
  const inset = opts.inset ?? 6;
  const lw = opts.width ?? 2;
  const x = w / 2 - inset;
  const y = h / 2 - inset;
  const g = scene.add.graphics();
  g.lineStyle(lw, color, 0.9);
  // top-left
  g.beginPath(); g.moveTo(-x, -y + size); g.lineTo(-x, -y); g.lineTo(-x + size, -y); g.strokePath();
  // top-right
  g.beginPath(); g.moveTo(x - size, -y); g.lineTo(x, -y); g.lineTo(x, -y + size); g.strokePath();
  // bottom-left
  g.beginPath(); g.moveTo(-x, y - size); g.lineTo(-x, y); g.lineTo(-x + size, y); g.strokePath();
  // bottom-right
  g.beginPath(); g.moveTo(x - size, y); g.lineTo(x, y); g.lineTo(x, y - size); g.strokePath();
  return g;
}
