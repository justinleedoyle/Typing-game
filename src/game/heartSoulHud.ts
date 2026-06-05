// Heart/Soul meters — painterly cream-on-ink pips in the top-right corner.
//
// Heart (ember) reads accuracy. Soul (brass) reads speed. Both lerp toward
// their target each frame so values don't pop on every keystroke. Optional
// `onSustainedLowHeart` callback fires when Heart sits below LOW_HEART_THRESHOLD
// for LOW_HEART_HOLD_MS continuously — useful for triggering a tender Runa
// line. The watcher rate-limits itself with LOW_HEART_COOLDOWN_MS so it never
// spams during a rough patch.

import Phaser from "phaser";
import { PALETTE, PALETTE_HEX, SERIF } from "./palette";

const PIP_COUNT = 8;
const PIP_W = 16;
const PIP_H = 12;
const PIP_GAP = 6;
const ROW_GAP = 22;
const LABEL_GAP = 14;
const HUD_PADDING = 56;

const LERP_RATE = 0.08;

const LOW_HEART_THRESHOLD = 30;
const LOW_HEART_HOLD_MS = 3_000;
const LOW_HEART_COOLDOWN_MS = 30_000;

const PIP_EMPTY = 0x2a221d;
const PIP_OUTLINE = 0x0b0a0f;

interface HudOptions {
  getHeart: () => number;
  getSoul: () => number;
  /** Current clean-streak combo. When provided, an "×N" flourish appears
   *  below the meters once the streak clears COMBO_SHOW_MIN. */
  getCombo?: () => number;
  /** True when the player has enough Soul banked to cast a spell. When
   *  provided, the "soul" label pulses brass to signal a cast is armed —
   *  the only ready-cue in realms (e.g. Forge) that have no charge pips. */
  getCastReady?: () => boolean;
  onSustainedLowHeart?: () => void;
}

/** Streak length at which the combo flourish first appears. */
const COMBO_SHOW_MIN = 5;
/** Combo at which the flourish shifts brass → ember (matches the ×2 tier). */
const COMBO_HOT = 20;

export class HeartSoulHud {
  private readonly container: Phaser.GameObjects.Container;
  private readonly heartPips: Phaser.GameObjects.Rectangle[] = [];
  private readonly soulPips: Phaser.GameObjects.Rectangle[] = [];
  private currentHeart = 100;
  private currentSoul = 0;
  private lowHeartSinceMs: number | null = null;
  private lowHeartLastFiredMs = -Infinity;
  private soulLabel!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private comboTier = 0;
  private pulseMs = 0;
  private readonly updateHandler: (time: number, delta: number) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly opts: HudOptions,
  ) {
    const rowW = PIP_COUNT * PIP_W + (PIP_COUNT - 1) * PIP_GAP;
    const labelW = 56;
    const padX = 14;
    const padY = 10;
    const plateW = rowW + LABEL_GAP + labelW + padX * 2;
    const plateH = ROW_GAP + PIP_H + padY * 2;
    const x = scene.scale.width - HUD_PADDING;
    const y = HUD_PADDING;
    this.container = scene.add
      .container(x, y)
      .setScrollFactor(0)
      .setDepth(2000)
      .setAlpha(0);

    // Ink-tinted plate so the HUD reads against warm backdrops (Forge, Sky-Island).
    // Plate spans from the left edge of the labels to slightly past the right edge
    // of the pip rows, centered on the HUD content.
    const plateCenterX = padX - plateW / 2;
    const plate = scene.add
      .rectangle(
        plateCenterX,
        ROW_GAP / 2,
        plateW,
        plateH,
        PALETTE_HEX.ink,
        0.55,
      )
      .setStrokeStyle(1, PALETTE_HEX.dim, 0.4);
    this.container.add(plate);

    const heartLabel = scene.add
      .text(-rowW - LABEL_GAP, 0, "heart", {
        fontFamily: SERIF,
        fontStyle: "italic",
        fontSize: "16px",
        color: PALETTE.cream,
      })
      .setOrigin(1, 0.5);
    this.soulLabel = scene.add
      .text(-rowW - LABEL_GAP, ROW_GAP, "soul", {
        fontFamily: SERIF,
        fontStyle: "italic",
        fontSize: "16px",
        color: PALETTE.cream,
      })
      .setOrigin(1, 0.5);
    this.container.add([heartLabel, this.soulLabel]);

    // Combo flourish — sits just below the soul pips, right-aligned to their
    // edge. Hidden until the streak clears COMBO_SHOW_MIN.
    this.comboText = scene.add
      .text(0, ROW_GAP + 20, "", {
        fontFamily: SERIF,
        fontStyle: "italic",
        fontSize: "18px",
        color: PALETTE.brass,
      })
      .setOrigin(1, 0.5)
      .setAlpha(0);
    this.container.add(this.comboText);

    for (let i = 0; i < PIP_COUNT; i++) {
      const px = -rowW + i * (PIP_W + PIP_GAP) + PIP_W / 2;
      const heart = scene.add
        .rectangle(px, 0, PIP_W, PIP_H, PIP_EMPTY)
        .setStrokeStyle(1, PIP_OUTLINE, 0.8);
      const soul = scene.add
        .rectangle(px, ROW_GAP, PIP_W, PIP_H, PIP_EMPTY)
        .setStrokeStyle(1, PIP_OUTLINE, 0.8);
      this.heartPips.push(heart);
      this.soulPips.push(soul);
      this.container.add([heart, soul]);
    }

    scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: 600,
      delay: 200,
      ease: "Sine.easeOut",
    });

    this.updateHandler = (_t: number, delta: number) => this.tick(delta);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.updateHandler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.destroy());
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.updateHandler);
    this.container.destroy();
  }

  private tick(deltaMs: number): void {
    this.pulseMs += deltaMs;
    const heart = this.opts.getHeart();
    const soul = this.opts.getSoul();
    const t = 1 - Math.pow(1 - LERP_RATE, deltaMs / 16.67);
    this.currentHeart += (heart - this.currentHeart) * t;
    this.currentSoul += (soul - this.currentSoul) * t;
    this.renderRow(this.heartPips, this.currentHeart, PALETTE_HEX.ember);
    this.renderRow(this.soulPips, this.currentSoul, PALETTE_HEX.brass);
    this.tickCombo();
    this.tickCastReady();
    this.tickLowHeartWatcher(heart);
  }

  private tickCombo(): void {
    const combo = this.opts.getCombo?.() ?? 0;
    if (combo < COMBO_SHOW_MIN) {
      if (this.comboText.alpha > 0) this.comboText.setAlpha(0);
      this.comboTier = -1;
      return;
    }
    this.comboText.setText(`×${combo}`);
    this.comboText.setColor(combo >= COMBO_HOT ? PALETTE.ember : PALETTE.brass);
    this.comboText.setAlpha(1);
    // Pop the flourish when the streak first appears or climbs a fill tier.
    const tier = comboTierOf(combo);
    if (tier > this.comboTier) {
      this.comboTier = tier;
      this.scene.tweens.killTweensOf(this.comboText);
      this.comboText.setScale(1.35);
      this.scene.tweens.add({
        targets: this.comboText,
        scale: 1,
        duration: 220,
        ease: "Back.easeOut",
      });
    }
  }

  private tickCastReady(): void {
    if (!this.opts.getCastReady) return;
    if (this.opts.getCastReady()) {
      const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(this.pulseMs / 320));
      this.soulLabel.setColor(PALETTE.brass).setAlpha(pulse);
    } else {
      this.soulLabel.setColor(PALETTE.cream).setAlpha(1);
    }
  }

  private renderRow(
    pips: Phaser.GameObjects.Rectangle[],
    value: number,
    fill: number,
  ): void {
    const filled = (value / 100) * PIP_COUNT;
    for (let i = 0; i < pips.length; i++) {
      const fillness = Math.max(0, Math.min(1, filled - i));
      if (fillness <= 0) {
        pips[i].setFillStyle(PIP_EMPTY, 1);
      } else if (fillness >= 1) {
        pips[i].setFillStyle(fill, 1);
      } else {
        pips[i].setFillStyle(fill, fillness);
      }
    }
  }

  private tickLowHeartWatcher(heartTarget: number): void {
    if (!this.opts.onSustainedLowHeart) return;
    const now = performance.now();
    if (heartTarget >= LOW_HEART_THRESHOLD) {
      this.lowHeartSinceMs = null;
      return;
    }
    if (this.lowHeartSinceMs === null) {
      this.lowHeartSinceMs = now;
      return;
    }
    if (
      now - this.lowHeartSinceMs >= LOW_HEART_HOLD_MS &&
      now - this.lowHeartLastFiredMs >= LOW_HEART_COOLDOWN_MS
    ) {
      this.lowHeartLastFiredMs = now;
      this.lowHeartSinceMs = null;
      this.opts.onSustainedLowHeart();
    }
  }
}

/** Display tier for the combo flourish, aligned to the Soul-fill multiplier
 *  steps (8 / 20 / 40). Used only to decide when to pop the "×N" scale tween. */
function comboTierOf(combo: number): number {
  if (combo >= 40) return 3;
  if (combo >= 20) return 2;
  if (combo >= 8) return 1;
  return 0;
}
