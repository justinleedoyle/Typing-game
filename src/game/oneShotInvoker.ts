// Tier 4 — the Phaser widget that fires the OFFENSIVE one-shots (toll-strike /
// bind-beat / jam-foe) by the keyboard-native route the user signed off on: a
// Soul-charged, TYPED invocation word. No modifier, no new key handling — the
// charged word is just another WordTarget the existing prefix-match controller
// claims.
//
// One invoker per realm scene owns a small charge widget per available offensive
// one-shot (the relics earned in earlier realms). Each widget:
//   • shows the relic + a charge bar that fills with Soul (the same clean-typing
//     economy that fuels spells) while a combat wave is live;
//   • at full charge, surfaces the bright invocation word as a live typing target;
//   • on completion, spends the Soul, fires ONCE per realm, and goes spent.
//
// The PURE pieces — vocabulary, "strongest foe" pick, charge gate — live in
// oneShotInvocation.ts (unit-tested). This file is the Phaser shell. The realm
// stays in charge of WHAT an effect does (toll kills, jam seizes, bind freezes)
// and WHICH enemies are eligible (e.g. excluding a boss), via two callbacks —
// so the consequence + balance live at the consumer, mirroring MovingWordEnemy.

import Phaser from "phaser";
import {
  INVOCATIONS,
  isSingleTargetOneShot,
  pickHardestEnemy,
  type EnemyThreat,
  type OffensiveOneShot,
} from "./oneShotInvocation";
import { PALETTE, PALETTE_HEX, SERIF } from "./palette";
import type { TypingInputController } from "./typingInput";
import { cornerTicks, framedPlate, UI_HEX } from "./ui/uiTheme";
import { TextWordTarget } from "./wordTarget";

/** A live enemy as the realm sees it, plus the threat summary the pick needs. The
 *  realm computes `progress` from its OWN geometry (Forge straight, Wood diagonal)
 *  and `enemy` is whatever the realm hands back to its applyEffect. */
export interface OneShotThreat<E> extends EnemyThreat {
  readonly enemy: E;
}

export interface OneShotInvokerConfig<E> {
  scene: Phaser.Scene;
  typingInput: TypingInputController;
  /** The offensive one-shots owned for THIS realm (loadout.oneShots filtered to
   *  the offensive subset). Empty ⇒ the invoker is inert (no widgets, no polling). */
  available: readonly OffensiveOneShot[];
  /** Soul needed to charge + spent on fire (ONESHOT_SOUL_COST). */
  cost: number;
  getSoul: () => number;
  /** Spend on fire; returns false if unaffordable (the fire is then aborted). */
  spendSoul: (cost: number) => boolean;
  /** The live, ELIGIBLE enemies right now (the realm excludes anything a one-shot
   *  shouldn't hit, e.g. a boss whose designed challenge must stand). */
  getThreats: () => readonly OneShotThreat<E>[];
  /** Run the consequence: `targets` is the single strongest foe for toll/jam, or
   *  every live enemy for bind. The realm applies the kill / seize / freeze + VFX. */
  applyEffect: (effect: OffensiveOneShot, targets: readonly E[]) => void;
  /** True only while a combat wave is live — widgets hide between waves/dialogue. */
  isActive: () => boolean;
  /** Optional one-line cue on charge / spend (the realm's narrator). */
  announce?: (text: string) => void;
  /** Widget baseline Y (default: 150px up from the bottom). Words sit above it. */
  baseY?: number;
  /** Absolute screen slots for each widget (the console band's card positions).
   *  When set, widget i sits at slots[i] instead of the centered vertical stack. */
  slots?: readonly { x: number; y: number }[];
  /** Compact card styling for the console band (smaller text + a card plate). */
  compact?: boolean;
}

type WidgetState = "charging" | "ready" | "spent";
type CardWakeKind = "enter" | "charge" | "ready" | "spent" | "claim" | "typing";

interface Widget {
  readonly effect: OffensiveOneShot;
  readonly container: Phaser.GameObjects.Container;
  readonly titleText: Phaser.GameObjects.Text;
  readonly placeholder: Phaser.GameObjects.Text;
  readonly barBg: Phaser.GameObjects.Graphics;
  readonly barFill: Phaser.GameObjects.Graphics;
  readonly readyRail: Phaser.GameObjects.Graphics | null;
  readonly cardW: number;
  readonly cardH: number;
  /** Absolute screen position for the live word target (container x,y + offset). */
  readonly wordX: number;
  readonly wordY: number;
  state: WidgetState;
  /** The live typable word while ready; null otherwise. */
  target: TextWordTarget | null;
  announcedReady: boolean;
  pulse: Phaser.Tweens.Tween | null;
  lastCardPulseAt: number;
  lastChargeTier: number;
  wasVisible: boolean;
}

const BAR_W = 150;
const BAR_H = 7;
const WIDGET_GAP = 78;
const POLL_MS = 200;

export class OneShotInvoker<E> {
  private readonly cfg: OneShotInvokerConfig<E>;
  private readonly widgets: Widget[] = [];
  private timer: Phaser.Time.TimerEvent | null = null;
  private readonly compact: boolean;
  private readonly barW: number;
  private readonly barY: number;
  private readonly wordSize: number;

  constructor(config: OneShotInvokerConfig<E>) {
    this.cfg = config;
    this.compact = config.compact === true;
    this.barW = this.compact ? 112 : BAR_W;
    this.barY = this.compact ? 21 : 18;
    this.wordSize = this.compact ? 22 : 30;
    if (config.available.length === 0) return; // inert — no relics

    const { scene } = config;
    const baseY = config.baseY ?? scene.scale.height - 150;
    const cx = scene.scale.width / 2;

    // Console-band card slots override the centered vertical stack (one realm
    // rarely has >1 floating widget, but Wood can hold all three).
    config.available.forEach((effect, i) => {
      const slot = config.slots?.[i];
      const wx = slot?.x ?? cx;
      const wy = slot?.y ?? baseY - i * WIDGET_GAP;
      this.widgets.push(this.buildWidget(effect, wx, wy));
    });

    this.timer = scene.time.addEvent({
      delay: POLL_MS,
      loop: true,
      callback: this.poll,
      callbackScope: this,
    });
    this.poll();
  }

  /** Tear down widgets, the live word, and the poll. Call on scene shutdown. */
  destroy(): void {
    this.timer?.remove();
    this.timer = null;
    for (const w of this.widgets) {
      w.pulse?.stop();
      if (w.target) {
        this.cfg.typingInput.unregister(w.target);
        w.target.destroy();
        w.target = null;
      }
      w.container.destroy();
    }
    this.widgets.length = 0;
  }

  // ── build ──────────────────────────────────────────────────────────────────

  private buildWidget(effect: OffensiveOneShot, cx: number, y: number): Widget {
    const { scene } = this.cfg;
    const container = scene.add
      .container(cx, y)
      .setScrollFactor(0)
      .setDepth(1500)
      .setAlpha(0); // hidden until a wave is live

    const titleY = this.compact ? -23 : -34;
    const wordOffsetY = this.compact ? 1 : -8;

    // Compact (console band): a card plate behind the title/word/bar so each
    // one-shot reads as a distinct, pickable card sitting in the band.
    if (this.compact) {
      const cw = this.barW + 30;
      const ch = 70;
      const card = framedPlate(scene, cw, ch, {
        fill: UI_HEX.panel,
        fillAlpha: 0.92,
        border: UI_HEX.frame,
        borderWidth: 1,
        radius: 7,
      });
      const ticks = cornerTicks(scene, cw, ch, { inset: 5, size: 7, width: 1 });
      const readyRail = scene.add.graphics().setAlpha(0);
      readyRail.fillStyle(UI_HEX.ember, 0.74);
      readyRail.fillRoundedRect(-cw / 2 + 12, -ch / 2 + 7, cw - 24, 3, 2);
      container.add(card);
      container.add(ticks);
      container.add(readyRail);
      return this.finishWidget(effect, container, titleY, wordOffsetY, cx, y, readyRail);
    }

    return this.finishWidget(effect, container, titleY, wordOffsetY, cx, y, null);
  }

  private finishWidget(
    effect: OffensiveOneShot,
    container: Phaser.GameObjects.Container,
    titleY: number,
    wordOffsetY: number,
    cx: number,
    y: number,
    readyRail: Phaser.GameObjects.Graphics | null,
  ): Widget {
    const inv = INVOCATIONS[effect];
    const { scene } = this.cfg;
    const cardW = this.compact ? this.barW + 30 : this.barW + 90;
    const cardH = this.compact ? 70 : 92;
    const titleText = scene.add
      .text(0, titleY, inv.title, {
        fontFamily: SERIF,
        fontSize: this.compact ? "12px" : "16px",
        fontStyle: "italic",
        color: PALETTE.dim,
      })
      .setOrigin(0.5);
    // The dim word preview while charging — swapped for the bright live target
    // when ready, set to a "spent" line once fired.
    const placeholder = scene.add
      .text(0, wordOffsetY, inv.word, {
        fontFamily: SERIF,
        fontSize: `${this.wordSize}px`,
        color: PALETTE.dim,
      })
      .setOrigin(0.5);

    const barBg = scene.add.graphics();
    barBg.fillStyle(0x000000, 0.45);
    barBg.fillRoundedRect(-this.barW / 2, this.barY, this.barW, BAR_H, BAR_H / 2);
    const barFill = scene.add.graphics();

    container.add([titleText, placeholder, barBg, barFill]);

    return {
      effect,
      container,
      titleText,
      placeholder,
      barBg,
      barFill,
      readyRail,
      cardW,
      cardH,
      wordX: cx,
      wordY: y + wordOffsetY,
      state: "charging",
      target: null,
      announcedReady: false,
      pulse: null,
      lastCardPulseAt: -Infinity,
      lastChargeTier: -1,
      wasVisible: false,
    };
  }

  // ── poll loop ────────────────────────────────────────────────────────────────

  private poll(): void {
    const active = this.cfg.isActive();
    const soul = this.cfg.getSoul();
    const threats = this.cfg.getThreats();
    const hasTarget = threats.length > 0;

    for (const w of this.widgets) {
      if (w.state === "spent") {
        // Spent widgets only show while a wave is live (a quiet "spent" trophy).
        this.setWidgetVisible(w, active);
        continue;
      }

      // Hidden entirely between waves / during dialogue.
      this.setWidgetVisible(w, active);
      if (!active) continue;

      const chargeFrac = Math.min(1, soul / this.cfg.cost);
      this.drawBar(w, chargeFrac);
      this.updateChargeWake(w, chargeFrac);

      const ready = soul >= this.cfg.cost && hasTarget;
      if (ready && w.state === "charging") {
        this.becomeReady(w);
      } else if (!ready && w.state === "ready") {
        // Drop back to charging when the charge lapses (Soul spent elsewhere) or
        // the room empties — but never yank a word the player is mid-typing.
        if (!this.cfg.typingInput.hasClaim()) this.becomeCharging(w);
      }
    }
  }

  private drawBar(w: Widget, frac: number): void {
    const color = frac >= 1 ? PALETTE_HEX.ember : PALETTE_HEX.brass;
    w.barFill.clear();
    w.barFill.fillStyle(color, 0.95);
    w.barFill.fillRoundedRect(
      -this.barW / 2,
      this.barY,
      Math.max(1, this.barW * frac),
      BAR_H,
      BAR_H / 2,
    );
  }

  private setWidgetVisible(w: Widget, visible: boolean): void {
    w.container.setAlpha(visible ? 1 : 0);
    if (visible) {
      if (!w.wasVisible && w.state !== "spent") this.pulseCard(w, "enter");
      w.wasVisible = true;
    } else {
      w.wasVisible = false;
      w.lastChargeTier = -1;
    }
  }

  private updateChargeWake(w: Widget, frac: number): void {
    if (w.state !== "charging") return;
    const tier = Math.floor(frac * 4);
    if (w.lastChargeTier < 0) {
      w.lastChargeTier = tier;
      return;
    }
    if (tier > w.lastChargeTier && tier < 4) {
      this.pulseCard(w, "charge");
    }
    w.lastChargeTier = tier;
  }

  // ── state transitions ────────────────────────────────────────────────────────

  private becomeReady(w: Widget): void {
    w.state = "ready";
    w.placeholder.setAlpha(0); // the live bright word overlays it
    const inv = INVOCATIONS[w.effect];
    w.target = new TextWordTarget({
      scene: this.cfg.scene,
      word: inv.word,
      x: w.wordX,
      y: w.wordY,
      fontSize: this.wordSize,
      // Above gameplay targets so an idle "t" claims the toll, not a stray.
      priority: 100,
      // The card itself lives in the console band at depth 1500; the live word
      // has to sit above that card, not behind it.
      depth: 1502,
      outline: true,
      burstColor: PALETTE_HEX.ember,
      onClaim: () => this.pulseCard(w, "claim"),
      onAdvance: () => this.pulseCard(w, "typing"),
      onComplete: () => this.fire(w),
    });
    this.cfg.typingInput.register(w.target);
    this.pulseCard(w, "ready");

    // A soft pulse on the title so "it's ready" reads at a glance.
    w.pulse?.stop();
    w.readyRail?.setAlpha(0.45);
    const pulseTargets: Phaser.GameObjects.GameObject[] = [w.titleText];
    if (w.readyRail) pulseTargets.push(w.readyRail);
    w.pulse = this.cfg.scene.tweens.add({
      targets: pulseTargets,
      alpha: { from: 0.55, to: 1 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    w.titleText.setColor(PALETTE.brass);

    if (!w.announcedReady) {
      w.announcedReady = true;
      this.cfg.announce?.(inv.readyCue);
    }
  }

  private becomeCharging(w: Widget): void {
    w.state = "charging";
    if (w.target) {
      this.cfg.typingInput.unregister(w.target);
      w.target.destroy();
      w.target = null;
    }
    w.pulse?.stop();
    w.pulse = null;
    w.readyRail?.setAlpha(0);
    w.titleText.setColor(PALETTE.dim).setAlpha(1);
    w.placeholder.setAlpha(1);
  }

  private pulseCard(w: Widget, kind: CardWakeKind): void {
    const now = this.cfg.scene.time.now;
    if (kind === "typing" && now - w.lastCardPulseAt < 90) return;
    w.lastCardPulseAt = now;

    const strong = kind === "claim" || kind === "ready" || kind === "spent";
    const color =
      kind === "enter" || kind === "charge" ? UI_HEX.brass : PALETTE_HEX.ember;
    const pulse = this.cfg.scene.add.graphics().setAlpha(strong ? 0.62 : 0.42);
    pulse.fillStyle(color, strong ? 0.055 : 0.035);
    pulse.fillRoundedRect(-w.cardW / 2, -w.cardH / 2, w.cardW, w.cardH, 8);
    pulse.lineStyle(strong ? 2 : 1, color, strong ? 0.58 : 0.36);
    pulse.strokeRoundedRect(-w.cardW / 2, -w.cardH / 2, w.cardW, w.cardH, 8);
    if (kind === "charge" || kind === "ready" || kind === "spent") {
      const railY = this.barY + BAR_H / 2;
      pulse.lineStyle(strong ? 2 : 1, color, strong ? 0.62 : 0.4);
      pulse.beginPath();
      pulse.moveTo(-this.barW / 2, railY);
      pulse.lineTo(this.barW / 2, railY);
      pulse.strokePath();
    }
    w.container.addAt(pulse, this.compact ? 1 : 0);

    this.cfg.scene.tweens.add({
      targets: pulse,
      alpha: 0,
      scaleX: strong ? 1.045 : 1.025,
      scaleY: strong ? 1.085 : 1.05,
      duration: strong ? 260 : 180,
      ease: "Sine.easeOut",
      onComplete: () => pulse.destroy(),
    });
  }

  // ── firing ───────────────────────────────────────────────────────────────────

  private fire(w: Widget): void {
    // The controller has already unregistered + is destroying the word target; we
    // own the consequence. Re-evaluate targets NOW (foes moved while typing).
    w.target = null;
    if (w.state === "spent") return;

    const threats = this.cfg.getThreats();
    if (threats.length === 0) {
      // The room emptied between charge and completion — nothing to hit. Refund
      // (don't spend, don't consume) and let it re-arm.
      this.becomeCharging(w);
      return;
    }

    let targets: E[];
    if (isSingleTargetOneShot(w.effect)) {
      const idx = pickHardestEnemy(threats);
      if (idx === null) {
        this.becomeCharging(w);
        return;
      }
      targets = [threats[idx]!.enemy];
    } else {
      targets = threats.map((t) => t.enemy);
    }

    if (!this.cfg.spendSoul(this.cfg.cost)) {
      // Soul lapsed in the completion window (defensive) — abort cleanly.
      this.becomeCharging(w);
      return;
    }

    this.cfg.applyEffect(w.effect, targets);
    this.markSpent(w);
  }

  private markSpent(w: Widget): void {
    w.state = "spent";
    w.pulse?.stop();
    w.pulse = null;
    w.readyRail?.setAlpha(0);
    if (w.target) {
      this.cfg.typingInput.unregister(w.target);
      w.target.destroy();
      w.target = null;
    }
    const inv = INVOCATIONS[w.effect];
    w.placeholder.setText("— spent —").setColor(PALETTE.dim).setAlpha(0.7);
    w.titleText.setColor(PALETTE.dim).setAlpha(0.7);
    w.barFill.clear();
    w.barBg.clear();
    this.pulseCard(w, "spent");
    this.cfg.announce?.(inv.spentCue);
  }
}
