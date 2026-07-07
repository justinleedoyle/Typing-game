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
const PORTRAIT_LABEL_Y = MID_Y + PORTRAIT_H / 2 + 13;
const PORTRAIT_LABEL_WRAP = 104;
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
const MAX_VISIBLE_SATCHEL_TILES = 8;
const SATCHEL_SHELF_FULL_W = 414;
const SATCHEL_SHELF_MIN_W = 138;
const SATCHEL_SHELF_CONTENT_PAD_W = 26;
const SATCHEL_WAKE_DELAY_MS = 180;
const BAND_ENTRY_WAKE_DELAY_MS = 90;
// One-shot card slots
const ONESHOT_X0 = 1010;
const ONESHOT_DX = 250;
const ONESHOT_Y = MID_Y;
// Objective readout: low in the band, below satchel icons / one-shot cards.
const OBJECTIVE_X = SATCHEL_X;
const OBJECTIVE_Y = BAND_H - 38;
const OBJECTIVE_H = 38;
const OBJECTIVE_LABEL_X = 16;
const OBJECTIVE_TEXT_X = 124;
const OBJECTIVE_FONT_SIZE = 17;
const OBJECTIVE_MIN_FONT_SIZE = 13;
const OBJECTIVE_MAX_TEXT_H = 24;

export interface ConsoleBandNoticeOptions {
  /** Small label at the left of the strip, e.g. "satchel" or "relic". */
  label?: string;
  /** Relic/companion id to pulse when its visible satchel tile is present. */
  itemId?: string;
  /** How long the notice owns the strip before the task line returns. */
  durationMs?: number;
}

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
  /** Draw the left meter shelf. Disable only for scenes with no meter HUD. */
  showMeterShelf?: boolean;
}

interface NoticeColors {
  labelColor: string;
  textColor: string;
  wakeColor: number;
}

function noticeColorsFor(label: string): NoticeColors {
  switch (label) {
    case "heart":
      return {
        labelColor: "#d6754a",
        textColor: "#ffe0cf",
        wakeColor: UI_HEX.ember,
      };
    case "spell":
    case "one-shot":
      return {
        labelColor: "#d7b965",
        textColor: "#fff1c9",
        wakeColor: UI_HEX.brass,
      };
    case "difficulty":
      return {
        labelColor: "#d8c8a3",
        textColor: "#f3ead2",
        wakeColor: UI_HEX.parchment,
      };
    case "task":
      return {
        labelColor: "#a59b89",
        textColor: "#f3ead2",
        wakeColor: UI_HEX.brass,
      };
    default:
      return {
        labelColor: "#d7b965",
        textColor: "#fff1c9",
        wakeColor: UI_HEX.parchment,
      };
  }
}

function displayedSatchelTileCount(
  scene: Phaser.Scene,
  iconIds: readonly string[],
): number {
  const drawableCount = iconIds.filter((id) => {
    const icon = satchelIconFor(id);
    return icon !== null && scene.textures.exists(icon.key);
  }).length;
  const visibleCount = Math.min(drawableCount, MAX_VISIBLE_SATCHEL_TILES);
  const overflowCount = drawableCount - visibleCount;
  return visibleCount + (overflowCount > 0 ? 1 : 0);
}

function satchelShelfWidthFor(displayedCount: number, labelText: string): number {
  if (labelText.trim() === "") return SATCHEL_SHELF_FULL_W;
  const rowW =
    displayedCount > 0
      ? displayedCount * TILE + Math.max(0, displayedCount - 1) * TILE_GAP
      : 0;
  return Math.min(
    SATCHEL_SHELF_FULL_W,
    Math.max(SATCHEL_SHELF_MIN_W, rowW + SATCHEL_SHELF_CONTENT_PAD_W),
  );
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
  private objectiveLabel!: Phaser.GameObjects.Text;
  private objectiveText!: Phaser.GameObjects.Text;
  private bandWidth = 0;
  private objectiveWidth = 0;
  private objectiveTextMaxWidth = 0;
  private objectiveValue = "";
  private renderedReadoutKey = "";
  private noticeActive = false;
  private noticeTimer: Phaser.Time.TimerEvent | null = null;
  private portraitImage?: Phaser.GameObjects.Image;
  private portraitFallback?: Phaser.GameObjects.Text;
  private portraitLabel?: Phaser.GameObjects.Text;
  private renderedPortraitKey = "";
  private portraitInitialized = false;
  private satchelTileCount = 0;
  private satchelShelfWidth = SATCHEL_SHELF_FULL_W;
  private readonly satchelIconTiles = new Map<string, Phaser.GameObjects.Container>();

  constructor(scene: Phaser.Scene, opts: ConsoleBandOptions = {}) {
    this.scene = scene;
    const W = scene.scale.width;
    const top = scene.scale.height - BAND_H;
    this.bandTopY = top;

    this.container = scene.add
      .container(0, top)
      .setScrollFactor(0)
      .setDepth(DEPTH);

    const maxOneShots = Math.max(0, opts.maxOneShots ?? 3);
    const passiveIconIds = opts.passiveIconIds ?? [];
    const satchelLabel = opts.satchelLabel ?? "satchel";
    this.satchelShelfWidth = satchelShelfWidthFor(
      displayedSatchelTileCount(scene, passiveIconIds),
      satchelLabel,
    );

    this.drawSurface(scene, W, opts.showMeterShelf ?? true, this.satchelShelfWidth);
    this.drawPortraitFrame(scene);
    this.setPortrait(opts.portraitKey, opts.portraitName);
    this.drawSatchel(scene, passiveIconIds, satchelLabel);
    this.drawObjectiveReadout(scene, W);
    this.playBandEntryWake();

    this.satchelAnchor = { x: SATCHEL_X, y: top + TILE_Y };
    this.metersAnchor = { x: METERS_RIGHT, y: top + METERS_CY };
    for (let i = 0; i < maxOneShots; i++) {
      this.oneShotSlots.push({ x: ONESHOT_X0 + i * ONESHOT_DX, y: top + ONESHOT_Y });
    }

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.destroy());
  }

  /** Small persistent "what now" line inside the console band. It keeps wave,
   *  fork, and boss instructions in UI chrome instead of relying entirely on
   *  fast narration cards. */
  setObjective(text: string): void {
    const trimmed = text.trim();
    this.objectiveValue = trimmed;
    if (this.noticeActive) return;
    this.renderObjective("task", trimmed);
  }

  /** Temporary system/readout line in the same bottom strip as the task. This is
   *  for satchel/relic feedback that should not interrupt the narration card:
   *  loadout wakeups, one-shot ready/spent cues, and similar game-state notices.
   *  When it expires, the previous persistent task line is restored. */
  showNotice(text: string, opts: ConsoleBandNoticeOptions = {}): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    const label = opts.label ?? "satchel";
    const colors = noticeColorsFor(label);
    this.noticeTimer?.remove(false);
    this.noticeActive = true;
    this.renderObjective(label, trimmed, colors);
    this.playNoticeSatchelWake(label, opts.itemId);
    this.noticeTimer = this.scene.time.delayedCall(opts.durationMs ?? 1900, () => {
      this.noticeActive = false;
      this.noticeTimer = null;
      this.renderObjective("task", this.objectiveValue);
    });
  }

  private renderObjective(
    label: string,
    text: string,
    colors: { labelColor?: string; textColor?: string } = {},
  ): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      this.objectiveContainer.setVisible(false);
      this.renderedReadoutKey = "";
      return;
    }
    const readoutKey = [
      label,
      trimmed,
      colors.labelColor ?? "",
      colors.textColor ?? "",
    ].join("\n");
    const changed = readoutKey !== this.renderedReadoutKey;
    if (!changed && this.objectiveContainer.visible) return;
    this.objectiveLabel.setText(label);
    this.objectiveLabel.setColor(colors.labelColor ?? "#a59b89");
    this.objectiveText.setColor(colors.textColor ?? "#f3ead2");
    this.fitObjectiveText(trimmed);
    this.objectiveContainer.setVisible(true);
    this.scene.tweens.killTweensOf(this.objectiveContainer);
    this.objectiveContainer.setAlpha(0.78);
    this.scene.tweens.add({
      targets: this.objectiveContainer,
      alpha: 1,
      duration: 220,
      ease: "Sine.easeOut",
    });
    if (changed) this.playReadoutWake(label);
    this.renderedReadoutKey = readoutKey;
  }

  private fitObjectiveText(text: string): void {
    this.objectiveText.setFontSize(OBJECTIVE_FONT_SIZE);
    this.objectiveText.setText(text);
    for (
      let fontSize = OBJECTIVE_FONT_SIZE;
      fontSize > OBJECTIVE_MIN_FONT_SIZE && !this.objectiveTextFits();
      fontSize -= 1
    ) {
      this.objectiveText.setFontSize(fontSize - 1);
    }
    if (this.objectiveTextFits()) return;

    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      this.objectiveText.setText(`${text.slice(0, mid).trimEnd()}...`);
      if (this.objectiveTextFits()) lo = mid;
      else hi = mid - 1;
    }
    this.objectiveText.setText(`${text.slice(0, lo).trimEnd()}...`);
  }

  private objectiveTextFits(): boolean {
    return (
      this.objectiveText.height <= OBJECTIVE_MAX_TEXT_H &&
      this.objectiveText.width <= this.objectiveTextMaxWidth
    );
  }

  private destroy(): void {
    this.noticeTimer?.remove(false);
    this.noticeTimer = null;
    if (this.container.active) this.container.destroy();
  }

  /** Swap the speaker portrait in the left nook. Scenes call this from the
   *  narration speaker hook so the band does not keep showing Runa while an
   *  in-world NPC is speaking. Passing no key (or an unloaded key) falls back
   *  to an intentional monogram inside the frame instead of an empty box. */
  setPortrait(textureKey?: string, name?: string): void {
    const trimmedName = name?.trim() ?? "";
    const resolvedTextureKey =
      textureKey && this.scene.textures.exists(textureKey) ? textureKey : "";
    const portraitKey = `${resolvedTextureKey}\n${trimmedName}`;
    if (this.portraitInitialized && portraitKey === this.renderedPortraitKey) {
      return;
    }

    this.portraitImage?.destroy();
    this.portraitImage = undefined;
    this.portraitFallback?.destroy();
    this.portraitFallback = undefined;

    if (resolvedTextureKey) {
      const img = this.scene.add.image(PORTRAIT_CX, MID_Y, resolvedTextureKey);
      const fit = Math.min(
        (PORTRAIT_W - 8) / img.width,
        (PORTRAIT_H - 8) / img.height,
      );
      img.setScale(fit * 0.96);
      this.container.add(img);
      this.portraitImage = img;
      img.setAlpha(0.84);
      this.scene.tweens.add({
        targets: img,
        alpha: 1,
        scaleX: fit,
        scaleY: fit,
        duration: 160,
        ease: "Sine.easeOut",
      });
    } else if (trimmedName.length > 0) {
      const fallbackText = this.fallbackPortraitText(trimmedName);
      const fallback = this.scene.add
        .text(PORTRAIT_CX, MID_Y - 2, fallbackText, {
          fontFamily: SERIF,
          fontSize: this.fallbackPortraitFontSize(trimmedName),
          fontStyle: "italic",
          color: this.fallbackPortraitColor(trimmedName),
          align: "center",
          wordWrap: { width: PORTRAIT_W - 10 },
        })
        .setOrigin(0.5)
        .setAlpha(0.68);
      fallback.setScale(0.94);
      this.container.add(fallback);
      this.portraitFallback = fallback;
      this.scene.tweens.add({
        targets: fallback,
        alpha: 0.9,
        scaleX: 1,
        scaleY: 1,
        duration: 160,
        ease: "Sine.easeOut",
      });
    }

    if (!this.portraitLabel) {
      this.portraitLabel = this.scene.add
        .text(PORTRAIT_CX, PORTRAIT_LABEL_Y, "", {
          fontFamily: SERIF,
          fontStyle: "italic",
          fontSize: "13px",
          color: "#a59b89",
          align: "center",
          wordWrap: { width: PORTRAIT_LABEL_WRAP },
        })
        .setOrigin(0.5);
      this.container.add(this.portraitLabel);
    }
    this.portraitLabel.setText(this.formatPortraitName(trimmedName));
    if (this.portraitFallback) this.container.bringToTop(this.portraitFallback);
    this.container.bringToTop(this.portraitLabel);
    if (this.portraitInitialized) this.playPortraitWake();
    this.portraitInitialized = true;
    this.renderedPortraitKey = portraitKey;
  }

  private formatPortraitName(name: string): string {
    if (name.length <= 12) return name;
    if (name.includes("-")) return name.replace("-", "-\n");
    const words = name.split(/\s+/);
    if (words.length > 1) return `${words[0]}\n${words.slice(1).join(" ")}`;
    return name;
  }

  private initialsForName(name: string): string {
    const parts = name.split(/[\s-]+/).filter(Boolean);
    const initials = parts.map((part) => part[0]).join("").slice(0, 2);
    return initials.toUpperCase();
  }

  private fallbackPortraitText(name: string): string {
    if (name === "Again") return "Again";
    return this.initialsForName(name);
  }

  private fallbackPortraitFontSize(name: string): string {
    if (name === "Again") return "22px";
    return "28px";
  }

  private fallbackPortraitColor(name: string): string {
    if (name === "Again") return "#d4b8ff";
    return "#e8dcc0";
  }

  private drawSurface(
    scene: Phaser.Scene,
    W: number,
    showMeterShelf: boolean,
    satchelShelfW: number,
  ): void {
    this.bandWidth = W;
    const g = scene.add.graphics();
    // Soft cast shadow rising onto the world, so the band reads as foreground.
    g.fillStyle(0x000000, 0.32);
    g.fillRect(0, -14, W, 14);
    // Wood body (a touch darker toward the bottom).
    g.fillStyle(0x2c2218, 1);
    g.fillRect(0, 0, W, BAND_H);
    g.fillStyle(0x241b12, 1);
    g.fillRect(0, MID_Y, W, MID_Y);
    // Quiet carved furniture. These low-contrast shelves keep sparse early
    // scenes from reading as a flat empty HUD slab while staying behind meters,
    // relic icons, one-shot cards, and the objective strip.
    g.fillStyle(0x0f0c08, 0.14);
    if (showMeterShelf) {
      g.fillRoundedRect(142, 42, 336, 104, 10);
    }
    g.fillRoundedRect(SATCHEL_X - 22, 42, satchelShelfW, 104, 10);
    g.lineStyle(1, UI_HEX.frame, 0.2);
    if (showMeterShelf) {
      g.strokeRoundedRect(142, 42, 336, 104, 10);
    }
    g.strokeRoundedRect(SATCHEL_X - 22, 42, satchelShelfW, 104, 10);
    g.lineStyle(1, UI_HEX.brass, 0.12);
    g.beginPath();
    if (showMeterShelf) {
      g.moveTo(164, 63);
      g.lineTo(454, 63);
    }
    g.moveTo(SATCHEL_X, 63);
    g.lineTo(SATCHEL_X + Math.max(0, satchelShelfW - 44), 63);
    g.strokePath();
    g.lineStyle(1, 0x6e5a36, 0.12);
    for (let y = 24; y < BAND_H - 18; y += 31) {
      const inset = y % 62 === 24 ? 34 : 58;
      g.beginPath();
      g.moveTo(inset, y);
      g.lineTo(W - inset, y + 3);
      g.strokePath();
    }
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

  private playBandEntryWake(): void {
    const rail = this.scene.add.graphics().setAlpha(0);
    rail.fillStyle(UI_HEX.brass, 0.3);
    rail.fillRect(0, 0, this.bandWidth, 3);
    rail.fillStyle(UI_HEX.brass, 0.08);
    rail.fillRect(0, 3, this.bandWidth, 18);
    rail.lineStyle(1, UI_HEX.parchment, 0.2);
    rail.beginPath();
    rail.moveTo(PAD, MID_Y + 14);
    rail.lineTo(this.bandWidth - PAD, MID_Y + 14);
    rail.strokePath();
    this.container.add(rail);

    const brackets = this.scene.add.graphics().setAlpha(0);
    brackets.lineStyle(2, UI_HEX.brass, 0.56);
    const size = 18;
    const inset = 10;
    brackets.beginPath();
    brackets.moveTo(inset, inset + size);
    brackets.lineTo(inset, inset);
    brackets.lineTo(inset + size, inset);
    brackets.strokePath();
    brackets.beginPath();
    brackets.moveTo(this.bandWidth - inset - size, inset);
    brackets.lineTo(this.bandWidth - inset, inset);
    brackets.lineTo(this.bandWidth - inset, inset + size);
    brackets.strokePath();
    this.container.add(brackets);

    this.scene.tweens.add({
      targets: [rail, brackets],
      alpha: { from: 0.72, to: 0 },
      delay: BAND_ENTRY_WAKE_DELAY_MS,
      duration: 680,
      ease: "Sine.easeOut",
      onComplete: () => {
        rail.destroy();
        brackets.destroy();
      },
    });
  }

  private drawPortraitFrame(scene: Phaser.Scene): void {
    const x = PORTRAIT_CX, y = MID_Y;
    const frame = scene.add.graphics();
    frame.fillStyle(0x0f0c08, 1);
    frame.fillRoundedRect(x - PORTRAIT_W / 2, y - PORTRAIT_H / 2, PORTRAIT_W, PORTRAIT_H, 7);
    frame.lineStyle(2, UI_HEX.brass, 0.9);
    frame.strokeRoundedRect(x - PORTRAIT_W / 2, y - PORTRAIT_H / 2, PORTRAIT_W, PORTRAIT_H, 7);
    this.container.add(frame);
  }

  private playPortraitWake(): void {
    const x = PORTRAIT_CX;
    const y = MID_Y;
    const frame = this.scene.add.graphics().setAlpha(0.68);
    frame.lineStyle(2, UI_HEX.brass, 0.64);
    frame.strokeRoundedRect(
      x - PORTRAIT_W / 2 - 4,
      y - PORTRAIT_H / 2 - 4,
      PORTRAIT_W + 8,
      PORTRAIT_H + 8,
      9,
    );
    frame.lineStyle(1, UI_HEX.parchment, 0.28);
    frame.strokeRoundedRect(
      x - PORTRAIT_W / 2 + 5,
      y - PORTRAIT_H / 2 + 5,
      PORTRAIT_W - 10,
      PORTRAIT_H - 10,
      5,
    );
    frame.fillStyle(UI_HEX.brass, 0.08);
    frame.fillRoundedRect(
      x - PORTRAIT_W / 2 - 2,
      y - PORTRAIT_H / 2 - 2,
      PORTRAIT_W + 4,
      PORTRAIT_H + 4,
      8,
    );
    this.container.add(frame);
    if (this.portraitImage) this.container.bringToTop(this.portraitImage);
    if (this.portraitFallback) this.container.bringToTop(this.portraitFallback);
    if (this.portraitLabel) this.container.bringToTop(this.portraitLabel);

    this.scene.tweens.add({
      targets: frame,
      alpha: 0,
      scaleX: 1.04,
      scaleY: 1.035,
      duration: 320,
      ease: "Sine.easeOut",
      onComplete: () => frame.destroy(),
    });
  }

  private drawSatchel(
    scene: Phaser.Scene,
    iconIds: readonly string[],
    labelText: string,
  ): void {
    this.satchelIconTiles.clear();
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
    const visibleDrawable = drawable.slice(0, MAX_VISIBLE_SATCHEL_TILES);
    const overflowCount = drawable.length - visibleDrawable.length;
    const displayedCount = visibleDrawable.length + (overflowCount > 0 ? 1 : 0);
    this.satchelTileCount = displayedCount;
    if (displayedCount > 0) {
      this.playSatchelRowWake(displayedCount);
    }
    visibleDrawable.forEach((id, i) => {
      const x = SATCHEL_X + i * (TILE + TILE_GAP);
      const iconContainer = scene.add
        .container(x + TILE / 2, TILE_Y)
        .setAlpha(0)
        .setScale(0.92);
      const tile = scene.add.graphics();
      tile.fillStyle(0x0f0c08, 1);
      tile.fillRoundedRect(-TILE / 2, -TILE / 2, TILE, TILE, 5);
      tile.lineStyle(1, UI_HEX.frame, 0.9);
      tile.strokeRoundedRect(-TILE / 2, -TILE / 2, TILE, TILE, 5);
      iconContainer.add(tile);

      const icon = satchelIconFor(id)!;
      const img = scene.add.image(0, 0, icon.key);
      img.setScale(Math.min((TILE - 6) / img.width, (TILE - 6) / img.height));
      iconContainer.add(img);
      this.container.add(iconContainer);
      this.satchelIconTiles.set(id, iconContainer);

      scene.tweens.add({
        targets: iconContainer,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        delay: SATCHEL_WAKE_DELAY_MS + i * 65,
        duration: 220,
        ease: "Back.easeOut",
      });
    });
    if (overflowCount > 0) {
      const i = visibleDrawable.length;
      const x = SATCHEL_X + i * (TILE + TILE_GAP);
      const overflowContainer = scene.add
        .container(x + TILE / 2, TILE_Y)
        .setAlpha(0)
        .setScale(0.92);
      const tile = scene.add.graphics();
      tile.fillStyle(0x0f0c08, 1);
      tile.fillRoundedRect(-TILE / 2, -TILE / 2, TILE, TILE, 5);
      tile.lineStyle(1, UI_HEX.brass, 0.95);
      tile.strokeRoundedRect(-TILE / 2, -TILE / 2, TILE, TILE, 5);
      tile.fillStyle(UI_HEX.brass, 0.1);
      tile.fillRoundedRect(-TILE / 2 + 3, -TILE / 2 + 3, TILE - 6, TILE - 6, 4);
      overflowContainer.add(tile);

      const count = scene.add
        .text(0, 0, `+${overflowCount}`, {
          fontFamily: SERIF,
          fontStyle: "italic",
          fontSize: "17px",
          color: "#f3ead2",
          align: "center",
        })
        .setOrigin(0.5);
      overflowContainer.add(count);
      this.container.add(overflowContainer);

      scene.tweens.add({
        targets: overflowContainer,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        delay: SATCHEL_WAKE_DELAY_MS + i * 65,
        duration: 220,
        ease: "Back.easeOut",
      });
    }
  }

  private playSatchelRowWake(count: number): void {
    const rowW = count * TILE + Math.max(0, count - 1) * TILE_GAP;
    const wake = this.scene.add.graphics().setAlpha(0);
    wake.fillStyle(UI_HEX.brass, 0.08);
    wake.fillRoundedRect(
      SATCHEL_X - 8,
      TILE_Y - TILE / 2 - 8,
      rowW + 16,
      TILE + 16,
      8,
    );
    wake.lineStyle(1, UI_HEX.brass, 0.36);
    wake.strokeRoundedRect(
      SATCHEL_X - 8,
      TILE_Y - TILE / 2 - 8,
      rowW + 16,
      TILE + 16,
      8,
    );
    wake.lineStyle(1, UI_HEX.parchment, 0.22);
    wake.beginPath();
    wake.moveTo(SATCHEL_X, TILE_Y + TILE / 2 + 10);
    wake.lineTo(SATCHEL_X + rowW, TILE_Y + TILE / 2 + 10);
    wake.strokePath();
    this.container.add(wake);

    this.scene.tweens.add({
      targets: wake,
      alpha: { from: 0.54, to: 0 },
      scaleX: 1.02,
      duration: 640,
      delay: SATCHEL_WAKE_DELAY_MS,
      ease: "Sine.easeOut",
      onComplete: () => wake.destroy(),
    });
  }

  private playNoticeSatchelWake(label: string, itemId?: string): void {
    const tile = itemId ? this.satchelIconTiles.get(itemId) : undefined;
    if (tile) {
      this.playSatchelTileWake(tile);
      return;
    }
    if (!itemId && !["satchel", "relic", "companion", "ally"].includes(label)) return;
    const hasTiles = this.satchelTileCount > 0;
    const rowW = hasTiles
      ? this.satchelTileCount * TILE + Math.max(0, this.satchelTileCount - 1) * TILE_GAP
      : Math.max(TILE, this.satchelShelfWidth - 20);
    const x = SATCHEL_X - 10;
    const y = TILE_Y - TILE / 2 - 10;
    const wake = this.scene.add.graphics().setAlpha(0);
    wake.fillStyle(UI_HEX.brass, hasTiles ? 0.075 : 0.045);
    wake.fillRoundedRect(x, y, rowW + 20, TILE + 20, 8);
    wake.lineStyle(1, UI_HEX.brass, hasTiles ? 0.4 : 0.24);
    wake.strokeRoundedRect(x, y, rowW + 20, TILE + 20, 8);
    wake.lineStyle(1, UI_HEX.parchment, hasTiles ? 0.2 : 0.12);
    wake.beginPath();
    wake.moveTo(x + 10, y + TILE + 26);
    wake.lineTo(x + rowW + 10, y + TILE + 26);
    wake.strokePath();
    this.container.add(wake);

    this.scene.tweens.add({
      targets: wake,
      alpha: { from: 0.64, to: 0 },
      scaleX: 1.018,
      scaleY: 1.05,
      duration: 540,
      ease: "Sine.easeOut",
      onComplete: () => wake.destroy(),
    });
  }

  private playSatchelTileWake(tile: Phaser.GameObjects.Container): void {
    const x = tile.x;
    const y = tile.y;
    const wake = this.scene.add.graphics().setAlpha(0);
    wake.fillStyle(UI_HEX.brass, 0.12);
    wake.fillRoundedRect(
      x - TILE / 2 - 8,
      y - TILE / 2 - 8,
      TILE + 16,
      TILE + 16,
      8,
    );
    wake.lineStyle(2, UI_HEX.brass, 0.58);
    wake.strokeRoundedRect(
      x - TILE / 2 - 8,
      y - TILE / 2 - 8,
      TILE + 16,
      TILE + 16,
      8,
    );
    wake.lineStyle(1, UI_HEX.parchment, 0.24);
    wake.strokeRoundedRect(
      x - TILE / 2 + 4,
      y - TILE / 2 + 4,
      TILE - 8,
      TILE - 8,
      4,
    );
    this.container.add(wake);
    this.container.bringToTop(tile);

    this.scene.tweens.add({
      targets: wake,
      alpha: { from: 0.72, to: 0 },
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 420,
      ease: "Sine.easeOut",
      onComplete: () => wake.destroy(),
    });
    this.scene.tweens.add({
      targets: tile,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 120,
      yoyo: true,
      ease: "Sine.easeOut",
    });
  }

  private drawObjectiveReadout(scene: Phaser.Scene, W: number): void {
    const width = Math.max(620, W - OBJECTIVE_X - 34);
    this.objectiveWidth = width;
    this.objectiveTextMaxWidth = width - OBJECTIVE_TEXT_X - 18;
    this.objectiveContainer = scene.add
      .container(OBJECTIVE_X, OBJECTIVE_Y)
      .setVisible(false);

    const bg = scene.add.graphics();
    bg.fillStyle(0x0f0c08, 0.52);
    bg.fillRoundedRect(0, -OBJECTIVE_H / 2, width, OBJECTIVE_H, 7);
    bg.lineStyle(1, UI_HEX.frame, 0.72);
    bg.strokeRoundedRect(0, -OBJECTIVE_H / 2, width, OBJECTIVE_H, 7);
    this.objectiveContainer.add(bg);

    this.objectiveLabel = scene.add
      .text(OBJECTIVE_LABEL_X, 0, "task", {
        fontFamily: SERIF,
        fontSize: "13px",
        fontStyle: "italic",
        color: "#a59b89",
      })
      .setOrigin(0, 0.5);
    this.objectiveContainer.add(this.objectiveLabel);

    this.objectiveText = scene.add
      .text(OBJECTIVE_TEXT_X, 0, "", {
        fontFamily: SERIF,
        fontSize: `${OBJECTIVE_FONT_SIZE}px`,
        color: "#f3ead2",
        wordWrap: { width: this.objectiveTextMaxWidth },
      })
      .setOrigin(0, 0.5);
    this.objectiveContainer.add(this.objectiveText);
    this.container.add(this.objectiveContainer);
  }

  private playReadoutWake(label: string): void {
    const notice = label !== "task";
    const color = noticeColorsFor(label).wakeColor;
    const rail = this.scene.add.graphics().setAlpha(0.78);
    rail.fillStyle(color, notice ? 0.34 : 0.26);
    rail.fillRect(0, 0, this.bandWidth, 3);
    rail.fillStyle(color, notice ? 0.11 : 0.08);
    rail.fillRect(0, 3, this.bandWidth, 14);
    this.container.add(rail);

    this.scene.tweens.add({
      targets: rail,
      alpha: 0,
      duration: notice ? 520 : 420,
      ease: "Sine.easeOut",
      onComplete: () => rail.destroy(),
    });

    const strip = this.scene.add
      .graphics()
      .setPosition(OBJECTIVE_X, OBJECTIVE_Y)
      .setAlpha(0.62);
    strip.fillStyle(color, notice ? 0.12 : 0.08);
    strip.fillRoundedRect(
      -10,
      -OBJECTIVE_H / 2 - 3,
      this.objectiveWidth + 20,
      OBJECTIVE_H + 6,
      8,
    );
    strip.lineStyle(1, color, notice ? 0.42 : 0.28);
    strip.strokeRoundedRect(
      -10,
      -OBJECTIVE_H / 2 - 3,
      this.objectiveWidth + 20,
      OBJECTIVE_H + 6,
      8,
    );
    this.container.add(strip);
    this.container.bringToTop(this.objectiveContainer);

    this.scene.tweens.add({
      targets: strip,
      alpha: 0,
      scaleX: 1.015,
      duration: notice ? 540 : 430,
      ease: "Sine.easeOut",
      onComplete: () => strip.destroy(),
    });
  }
}
