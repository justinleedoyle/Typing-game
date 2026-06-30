// The console band — the crafted bottom zone that gives the game's chrome a home
// instead of floating it on the painting (the TTT two-zone composition: world up
// top, a dark-wood-and-brass console along the bottom). It draws the band surface
// + the static furniture (speaker portrait nook, "satchel" label, dividers,
// passive relic icon tiles) and exposes anchors for the live bits the scene owns:
//   • metersAnchor — where to mount the HeartSoulHud (plate off; the band IS the plate)
//   • oneShotSlots — where the OneShotInvoker drops its charge cards
//
// Everything is screen-space (scrollFactor 0). All positions are named constants
// so the near-completion feel-tuning pass can nudge them from one place.

import Phaser from "phaser";
import { SERIF } from "../palette";
import { satchelIconFor } from "./satchelIcons";
import { UI_HEX } from "./uiTheme";

/** Band height in design px (game is 1080 tall) — the bottom ~20%. */
export const BAND_H = 220;
const DEPTH = 1400;

// ── layout (band-local: x = 0..width, y = 0..BAND_H) ──────────────────────────
const MID_Y = BAND_H / 2;
const PAD = 26;
// Portrait nook
const PORTRAIT_W = 72;
const PORTRAIT_H = 104;
const PORTRAIT_CX = PAD + PORTRAIT_W / 2;
// Meters slot (HeartSoulHud mounts right-aligned to METERS_RIGHT)
const METERS_RIGHT = 470;
const METERS_CY = MID_Y - 10;
// Satchel zone
const DIVIDER_X = 506;
const SATCHEL_X = 532;
const SATCHEL_LABEL_Y = 34;
const TILE = 36;
const TILE_GAP = 8;
const TILE_Y = MID_Y + 6;
// One-shot card slots
const ONESHOT_X0 = 1010;
const ONESHOT_DX = 250;
const ONESHOT_Y = MID_Y;
// Objective readout: low in the band, below satchel icons / one-shot cards.
const OBJECTIVE_X = SATCHEL_X;
const OBJECTIVE_Y = BAND_H - 38;
const OBJECTIVE_H = 38;
const OBJECTIVE_LABEL_W = 68;

export interface ConsoleBandOptions {
  /** Texture key for the speaker portrait shown in the nook (optional). */
  portraitKey?: string;
  /** Name shown under the portrait. */
  portraitName?: string;
  /** Relic/companion ids drawn as "always on" satchel icon tiles. */
  passiveIconIds?: readonly string[];
  /** How many one-shot card slots to reserve (default 3). */
  maxOneShots?: number;
  /** Label over the satchel zone (default "satchel"). A realm with no satchel but
   *  its own bottom meter (Winter's candles, Bell's breath) docks that meter at
   *  `satchelAnchor` and relabels the zone. */
  satchelLabel?: string;
}

export class ConsoleBand {
  /** World Y of the band's top edge — scenes keep the action above this. */
  readonly bandTopY: number;
  /** Absolute screen anchor for the HeartSoulHud (right-aligned, plate off). */
  readonly metersAnchor: { x: number; y: number };
  /** Absolute screen slots for one-shot charge cards, left → right. */
  readonly oneShotSlots: { x: number; y: number }[] = [];
  /** Absolute screen anchor for the satchel zone's content row — where a realm
   *  with no satchel docks its own meter (Winter candles, Bell breath). */
  readonly satchelAnchor: { x: number; y: number };
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private objectiveContainer!: Phaser.GameObjects.Container;
  private objectiveText!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, opts: ConsoleBandOptions = {}) {
    this.scene = scene;
    const W = scene.scale.width;
    const top = scene.scale.height - BAND_H;
    this.bandTopY = top;

    this.container = scene.add
      .container(0, top)
      .setScrollFactor(0)
      .setDepth(DEPTH);

    this.drawSurface(scene, W);
    this.drawPortrait(scene, opts);
    this.drawSatchel(scene, opts.passiveIconIds ?? [], opts.satchelLabel ?? "satchel");
    this.drawObjectiveReadout(scene, W);

    this.satchelAnchor = { x: SATCHEL_X, y: top + TILE_Y };
    this.metersAnchor = { x: METERS_RIGHT, y: top + METERS_CY };
    const n = opts.maxOneShots ?? 3;
    for (let i = 0; i < n; i++) {
      this.oneShotSlots.push({ x: ONESHOT_X0 + i * ONESHOT_DX, y: top + ONESHOT_Y });
    }

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.container.destroy());
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.container.destroy());
  }

  /** Small persistent "what now" line inside the console band. It keeps wave,
   *  fork, and boss instructions in UI chrome instead of relying entirely on
   *  fast narration cards. */
  setObjective(text: string): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      this.objectiveContainer.setVisible(false);
      return;
    }
    this.objectiveText.setText(trimmed);
    this.objectiveContainer.setVisible(true);
    this.scene.tweens.killTweensOf(this.objectiveContainer);
    this.objectiveContainer.setAlpha(0.78);
    this.scene.tweens.add({
      targets: this.objectiveContainer,
      alpha: 1,
      duration: 220,
      ease: "Sine.easeOut",
    });
  }

  private drawSurface(scene: Phaser.Scene, W: number): void {
    const g = scene.add.graphics();
    // Soft cast shadow rising onto the world, so the band reads as foreground.
    g.fillStyle(0x000000, 0.32);
    g.fillRect(0, -14, W, 14);
    // Wood body (a touch darker toward the bottom).
    g.fillStyle(0x2c2218, 1);
    g.fillRect(0, 0, W, BAND_H);
    g.fillStyle(0x241b12, 1);
    g.fillRect(0, MID_Y, W, MID_Y);
    // Brass top molding + its shadow.
    g.fillStyle(UI_HEX.brass, 1);
    g.fillRect(0, 0, W, 3);
    g.fillStyle(0x5a4a2c, 0.7);
    g.fillRect(0, 3, W, 2);
    this.container.add(g);

    // Brass corner brackets at the band's top corners.
    const b = scene.add.graphics();
    b.lineStyle(2, UI_HEX.brass, 0.9);
    const s = 12, m = 10;
    b.beginPath(); b.moveTo(m, m + s); b.lineTo(m, m); b.lineTo(m + s, m); b.strokePath();
    b.beginPath(); b.moveTo(W - m - s, m); b.lineTo(W - m, m); b.lineTo(W - m, m + s); b.strokePath();
    this.container.add(b);
  }

  private drawPortrait(scene: Phaser.Scene, opts: ConsoleBandOptions): void {
    const x = PORTRAIT_CX, y = MID_Y;
    const frame = scene.add.graphics();
    frame.fillStyle(0x0f0c08, 1);
    frame.fillRoundedRect(x - PORTRAIT_W / 2, y - PORTRAIT_H / 2, PORTRAIT_W, PORTRAIT_H, 7);
    frame.lineStyle(2, UI_HEX.brass, 0.9);
    frame.strokeRoundedRect(x - PORTRAIT_W / 2, y - PORTRAIT_H / 2, PORTRAIT_W, PORTRAIT_H, 7);
    this.container.add(frame);

    if (opts.portraitKey && scene.textures.exists(opts.portraitKey)) {
      const img = scene.add.image(x, y, opts.portraitKey);
      const fit = Math.min(
        (PORTRAIT_W - 8) / img.width,
        (PORTRAIT_H - 8) / img.height,
      );
      img.setScale(fit);
      this.container.add(img);
    }
    if (opts.portraitName) {
      const label = scene.add
        .text(x, y + PORTRAIT_H / 2 + 11, opts.portraitName, {
          fontFamily: SERIF,
          fontStyle: "italic",
          fontSize: "13px",
          color: "#a59b89",
        })
        .setOrigin(0.5);
      this.container.add(label);
    }
  }

  private drawSatchel(
    scene: Phaser.Scene,
    iconIds: readonly string[],
    labelText: string,
  ): void {
    const divider = scene.add.graphics();
    divider.fillStyle(0x6e5a36, 0.45);
    divider.fillRect(DIVIDER_X, PAD, 1, BAND_H - PAD * 2);
    this.container.add(divider);

    const label = scene.add
      .text(SATCHEL_X, SATCHEL_LABEL_Y, labelText, {
        fontFamily: SERIF,
        fontStyle: "italic",
        fontSize: "15px",
        color: "#a59b89",
      })
      .setOrigin(0, 0.5);
    this.container.add(label);

    // Only relics with a loadable icon get a tile — no empty boxes for an id
    // whose art is missing or not yet preloaded; the row stays contiguous.
    const drawable = iconIds.filter((id) => {
      const icon = satchelIconFor(id);
      return icon !== null && scene.textures.exists(icon.key);
    });
    drawable.forEach((id, i) => {
      const x = SATCHEL_X + i * (TILE + TILE_GAP);
      const tile = scene.add.graphics();
      tile.fillStyle(0x0f0c08, 1);
      tile.fillRoundedRect(x, TILE_Y - TILE / 2, TILE, TILE, 5);
      tile.lineStyle(1, UI_HEX.frame, 0.9);
      tile.strokeRoundedRect(x, TILE_Y - TILE / 2, TILE, TILE, 5);
      this.container.add(tile);

      const icon = satchelIconFor(id)!;
      const img = scene.add.image(x + TILE / 2, TILE_Y, icon.key);
      img.setScale(Math.min((TILE - 6) / img.width, (TILE - 6) / img.height));
      this.container.add(img);
    });
  }

  private drawObjectiveReadout(scene: Phaser.Scene, W: number): void {
    const width = Math.max(620, W - OBJECTIVE_X - 34);
    this.objectiveContainer = scene.add
      .container(OBJECTIVE_X, OBJECTIVE_Y)
      .setVisible(false);

    const bg = scene.add.graphics();
    bg.fillStyle(0x0f0c08, 0.52);
    bg.fillRoundedRect(0, -OBJECTIVE_H / 2, width, OBJECTIVE_H, 7);
    bg.lineStyle(1, UI_HEX.frame, 0.72);
    bg.strokeRoundedRect(0, -OBJECTIVE_H / 2, width, OBJECTIVE_H, 7);
    this.objectiveContainer.add(bg);

    const label = scene.add
      .text(16, 0, "task", {
        fontFamily: SERIF,
        fontSize: "13px",
        fontStyle: "italic",
        color: "#a59b89",
      })
      .setOrigin(0, 0.5);
    this.objectiveContainer.add(label);

    this.objectiveText = scene.add
      .text(OBJECTIVE_LABEL_W, 0, "", {
        fontFamily: SERIF,
        fontSize: "17px",
        color: "#f3ead2",
        wordWrap: { width: width - OBJECTIVE_LABEL_W - 18 },
      })
      .setOrigin(0, 0.5);
    this.objectiveContainer.add(this.objectiveText);
    this.container.add(this.objectiveContainer);
  }
}
