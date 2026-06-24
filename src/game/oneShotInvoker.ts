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
import { UI_HEX } from "./ui/uiTheme";
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

interface Widget {
  readonly effect: OffensiveOneShot;
  readonly container: Phaser.GameObjects.Container;
  readonly titleText: Phaser.GameObjects.Text;
  readonly placeholder: Phaser.GameObjects.Text;
  readonly barBg: Phaser.GameObjects.Graphics;
  readonly barFill: Phaser.GameObjects.Graphics;
  /** Absolute screen position for the live word target (container x,y + offset). */
  readonly wordX: number;
  readonly wordY: number;
  state: WidgetState;
  /** The live typable word while ready; null otherwise. */
  target: TextWordTarget | null;
  announcedReady: boolean;
  pulse: Phaser.Tweens.Tween | null;
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
    const inv = INVOCATIONS[effect];
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
      const card = scene.add.graphics();
      card.fillStyle(UI_HEX.panel, 0.92);
      card.fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 7);
      card.lineStyle(1, UI_HEX.frame, 0.9);
      card.strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 7);
      container.add(card);
    }

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
      wordX: cx,
      wordY: y + wordOffsetY,
      state: "charging",
      target: null,
      announcedReady: false,
      pulse: null,
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
        w.container.setAlpha(active ? 1 : 0);
        continue;
      }

      // Hidden entirely between waves / during dialogue.
      w.container.setAlpha(active ? 1 : 0);
      if (!active) continue;

      this.drawBar(w, Math.min(1, soul / this.cfg.cost));

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
      burstColor: PALETTE_HEX.ember,
      onComplete: () => this.fire(w),
    });
    this.cfg.typingInput.register(w.target);

    // A soft pulse on the title so "it's ready" reads at a glance.
    w.pulse?.stop();
    w.pulse = this.cfg.scene.tweens.add({
      targets: w.titleText,
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
    w.titleText.setColor(PALETTE.dim).setAlpha(1);
    w.placeholder.setAlpha(1);
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
    this.cfg.announce?.(inv.spentCue);
  }
}
