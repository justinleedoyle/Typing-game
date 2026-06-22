// The shared "advancing word-bearing enemy" — Tier 2.
//
// Winter's Wolf, the Sunken Bell's Ghost, the Clockwork Forge's Golem and the
// Haunted Wood's HauntedGhost were four near-identical structs running the SAME
// six-step lifecycle inline:
//
//   spawn off-screen → entrance tween to a rest point → attach a TextWordTarget
//   → idle-bob while waiting → advance on Wren (pin the word + ramp its danger
//   colour) → on completion: defeat (fade the body) | on timeout: reach Wren
//   (a non-terminal knock-back, then come again).
//
// This class owns that lifecycle on a realm-supplied container; the realm keeps
// what's genuinely its own — the body art, the word/wave composition, and the
// `onComplete(mods)` consequence (a Forge command flourish, a Winter candle
// snuff, a Bell split). Per-realm feel constants are options whose DEFAULTS are
// the values most realms already used, so a migration changes no numbers. The
// two formulas (advance duration, danger ramp) live in the pure, unit-tested
// movingWordMath.ts.
//
// Phaser-coupled by nature (like TextWordTarget / ScrollingPhrase); the testable
// part is movingWordMath.ts. Sky's ScrollingPhrase stays a sibling — it's the
// scroll-across-and-miss flavour, not advance-and-retry.

import Phaser from "phaser";
import { advanceDurationMs, dangerRamp } from "./movingWordMath";
import { PALETTE_HEX } from "./palette";
import type { ClaimMods, TypingInputController } from "./typingInput";
import { TextWordTarget } from "./wordTarget";

export interface MovingWordEnemyConfig {
  scene: Phaser.Scene;
  typingInput: TypingInputController;
  /** The body, drawn by the realm and positioned at its OFF-SCREEN spawn point.
   *  The enemy owns this container's motion from construction onward (entrance,
   *  idle-bob, advance, knock-back, defeat-fade). Its starting x is captured as
   *  the entrance origin. */
  container: Phaser.GameObjects.Container;
  word: string;

  /** Where the body comes to rest after the entrance tween, and the home it
   *  returns to after a knock-back. */
  restX: number;
  restY: number;
  /** The x the body advances toward (Wren). */
  wrenX: number;
  /** The y the body advances toward. Omit for a straight horizontal advance
   *  (y stays at restY); set it for a diagonal close (the Haunted Wood). Ignored
   *  when `verticalOffset` is supplied (the weave drives y instead). */
  wrenY?: number;

  /** Base advance deadline in ms (before distance-scaling and the relic mult). */
  advanceMs: number;
  /** Tier-4 quiet-advance multiplier; 1 (default) without the relic. */
  advanceMult?: number;

  // ── feel constants (defaults = the shared values; override per realm) ──────
  /** Entrance sweep duration. Default 800 (Forge uses 700). */
  entranceMs?: number;
  /** Body alpha at rest. Default 1 (the Bell/Wood ghosts rest semi-transparent). */
  restAlpha?: number;
  /** Knock-back retreat duration. Default 600 (Wood uses 700). */
  knockbackMs?: number;
  /** Pause at the rest point after a knock-back before re-advancing. Default
   *  1500 (Forge 1200, Wood 1800, Bell 2000). */
  knockbackPauseMs?: number;
  /** The x the knock-back retreats to. Default `restX`. */
  knockbackToX?: number;
  /** Progress at which the danger colour starts ramping in. Default 0.4 (Wood 0.5). */
  dangerRampStart?: number;
  /** Idle-bob amplitude (px, upward) and period (ms). Defaults 5 / 1100. */
  idleBobDy?: number;
  idleBobMs?: number;
  /** The word floats this far above the body's y. Default −90 (Forge −100, Wood −80). */
  anchorOffsetY?: number;
  /** Body fade-up distance and duration on defeat. Defaults −50 / 480. */
  defeatRiseY?: number;
  defeatMs?: number;

  // ── TextWordTarget passthrough ─────────────────────────────────────────────
  fontSize?: number;
  burstColor?: number | null;
  caseSensitive?: boolean;
  maskMarks?: boolean;

  /** Optional vertical weave during the advance: given (restY, progress 0..1) →
   *  the body's y that frame. The Winter circler passes `circlerY`. When set, the
   *  advance tween animates only x and this drives y. */
  verticalOffset?: (restY: number, progress: number) => number;

  /** True while the enemy's wave is live. The enemy only reaches Wren / re-advances
   *  while this holds, so a realm that ends the wave (e.g. a Winter candle loss)
   *  halts the enemy by flipping it. Default always-true. */
  isWaveActive?: () => boolean;

  // ── hooks ──────────────────────────────────────────────────────────────────
  /** Fired when the word is claimed (Shift/Alt captured). Realms use it for a
   *  character reaction (Wren leaning in). */
  onClaim?: (mods: ClaimMods) => void;
  /** Fired the moment this enemy is defeated (player completion OR a programmatic
   *  `defeat()` such as a chain-spark), before the body fade — for the realm's
   *  defeat audio (the completion chime). */
  onDefeated?: (self: MovingWordEnemy) => void;
  /** Fired after a player completes the word (and the body has begun its defeat).
   *  `mods` tells the realm whether Shift/Alt were held so it can run the right
   *  consequence (command flourish, chain-spark, a kindness beat). NOT fired for
   *  programmatic `defeat()`. */
  onComplete?: (mods: ClaimMods, self: MovingWordEnemy) => void;
  /** Fired when the body reaches Wren (the word timed out) — the realm's hit feel
   *  (camera shake / dark flash, damage thud, vignette, a Winter candle snuff).
   *  The enemy then knocks the body back and comes again (non-terminal). */
  onReachWren?: (self: MovingWordEnemy) => void;
  /** Lets the scene mirror the enemy's word into its bulk-cleanup list so a hard
   *  scene transition still tears down a live word. Called on every (re-)attach
   *  and the matching detach. */
  onTargetAttached?: (target: TextWordTarget) => void;
  onTargetDetached?: (target: TextWordTarget) => void;
}

export class MovingWordEnemy {
  private readonly cfg: MovingWordEnemyConfig;
  private wordTarget: TextWordTarget | null = null;
  private advanceTween: Phaser.Tweens.Tween | null = null;
  private defeated = false;
  private completedByPlayer = false;

  // resolved feel constants
  private readonly entranceMs: number;
  private readonly restAlpha: number;
  private readonly knockbackMs: number;
  private readonly knockbackPauseMs: number;
  private readonly knockbackToX: number;
  private readonly rampStart: number;
  private readonly idleBobDy: number;
  private readonly idleBobMs: number;
  private readonly anchorOffsetY: number;
  private readonly defeatRiseY: number;
  private readonly defeatMs: number;
  private readonly advanceMult: number;

  constructor(config: MovingWordEnemyConfig) {
    this.cfg = config;
    this.entranceMs = config.entranceMs ?? 800;
    this.restAlpha = config.restAlpha ?? 1;
    this.knockbackMs = config.knockbackMs ?? 600;
    this.knockbackPauseMs = config.knockbackPauseMs ?? 1500;
    this.knockbackToX = config.knockbackToX ?? config.restX;
    this.rampStart = config.dangerRampStart ?? 0.4;
    this.idleBobDy = config.idleBobDy ?? 5;
    this.idleBobMs = config.idleBobMs ?? 1100;
    this.anchorOffsetY = config.anchorOffsetY ?? -90;
    this.defeatRiseY = config.defeatRiseY ?? -50;
    this.defeatMs = config.defeatMs ?? 480;
    this.advanceMult = config.advanceMult ?? 1;

    // Entrance: sweep in from off-screen, fade to rest alpha, then come alive.
    config.scene.tweens.add({
      targets: config.container,
      x: config.restX,
      alpha: this.restAlpha,
      duration: this.entranceMs,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (this.defeated) return;
        this.attachTarget();
        this.idleBob();
        this.startAdvance();
      },
    });
  }

  // ── accessors the realm needs (position / identity / target passthrough) ────
  get container(): Phaser.GameObjects.Container {
    return this.cfg.container;
  }
  get word(): string {
    return this.cfg.word;
  }
  get restX(): number {
    return this.cfg.restX;
  }
  get restY(): number {
    return this.cfg.restY;
  }
  /** The live word target, or null between waves / after defeat. Realms reach
   *  through it for per-frame passthrough (e.g. the Wood mist's `setHidden`). */
  get target(): TextWordTarget | null {
    return this.wordTarget;
  }
  isDefeated(): boolean {
    return this.defeated;
  }

  // ── lifecycle ───────────────────────────────────────────────────────────────

  private attachTarget(): void {
    const target = new TextWordTarget({
      scene: this.cfg.scene,
      word: this.cfg.word,
      x: this.cfg.container.x,
      y: this.cfg.restY + this.anchorOffsetY,
      fontSize: this.cfg.fontSize ?? 32,
      burstColor: this.cfg.burstColor ?? PALETTE_HEX.brass,
      caseSensitive: this.cfg.caseSensitive,
      maskMarks: this.cfg.maskMarks,
      onClaim: (mods) => this.cfg.onClaim?.(mods),
      // All three variants route to one handler so the realm's onComplete always
      // learns whether Shift/Alt were held. Identical to omitting the variants
      // when the realm ignores mods (TextWordTarget falls back to onComplete),
      // but lets case-sensitive / spell / chain realms branch.
      onComplete: () => this.handleComplete({ spell: false, alt: false }),
      onSpellComplete: () => this.handleComplete({ spell: true, alt: false }),
      onAltSpellComplete: () => this.handleComplete({ spell: false, alt: true }),
    });
    this.wordTarget = target;
    this.cfg.typingInput.register(target);
    this.cfg.onTargetAttached?.(target);
  }

  private idleBob(): void {
    const c = this.cfg.container;
    this.cfg.scene.tweens.add({
      targets: c,
      y: { from: c.y, to: c.y - this.idleBobDy },
      duration: this.idleBobMs,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private startAdvance(): void {
    const { container, wrenX } = this.cfg;
    const remaining = Math.abs(container.x - wrenX);
    const totalRange = Math.abs(this.cfg.restX - wrenX);
    const duration = advanceDurationMs(
      this.cfg.advanceMs,
      remaining,
      totalRange,
      this.advanceMult,
    );

    const props: Phaser.Types.Tweens.TweenBuilderConfig = {
      targets: container,
      x: wrenX,
      duration,
      ease: "Linear",
      onUpdate: (tween) => {
        if (!this.wordTarget) return;
        if (this.cfg.verticalOffset) {
          container.y = this.cfg.verticalOffset(this.cfg.restY, tween.progress);
        }
        this.wordTarget.setAnchorX(container.x);
        // Track the body's y ONLY when the advance itself drives it — a weave
        // (Winter circler) or a diagonal close (Wood). For a straight horizontal
        // advance the word holds its attach-time y, so it doesn't ride the idle
        // bob's jitter. This matches what every realm did inline (setAnchorX only).
        if (this.cfg.verticalOffset || this.cfg.wrenY !== undefined) {
          this.wordTarget.setAnchorY(container.y + this.anchorOffsetY);
        }
        this.wordTarget.setDanger(dangerRamp(tween.progress, this.rampStart));
      },
      onComplete: () => {
        this.advanceTween = null;
        if (!this.defeated && this.waveActive()) {
          this.reachWren();
        }
      },
    };
    // A diagonal close (Wood) animates y too; a weave drives y manually instead.
    if (!this.cfg.verticalOffset && this.cfg.wrenY !== undefined) {
      props.y = this.cfg.wrenY;
    }
    this.advanceTween = this.cfg.scene.tweens.add(props);
  }

  /** Programmatic kill (player completion OR a sibling's chain-spark). Stops the
   *  advance, tears down the word, and fades the body up and out. */
  defeat(): void {
    if (this.defeated) return;
    this.defeated = true;
    this.cfg.onDefeated?.(this);
    // On a player completion the TextWordTarget animates and destroys ITSELF, so
    // we only drop the reference; a programmatic defeat (the word was never
    // completed) destroys it here — without this the word would linger on screen.
    this.dropTarget(!this.completedByPlayer);
    this.advanceTween?.stop();
    this.advanceTween = null;
    const c = this.cfg.container;
    this.cfg.scene.tweens.killTweensOf(c);
    this.cfg.scene.tweens.add({
      targets: c,
      alpha: 0,
      y: c.y + this.defeatRiseY,
      duration: this.defeatMs,
      ease: "Sine.easeOut",
      onComplete: () => c.destroy(),
    });
  }

  private handleComplete(mods: ClaimMods): void {
    if (this.defeated) return;
    this.completedByPlayer = true;
    this.defeat();
    this.cfg.onComplete?.(mods, this);
  }

  private reachWren(): void {
    // Drop the timed-out word (it never completed → destroy it), then let the
    // realm play its hit feel, then knock the body back and come again.
    this.dropTarget(true);
    this.cfg.onReachWren?.(this);
    const c = this.cfg.container;
    this.cfg.scene.tweens.killTweensOf(c);
    this.cfg.scene.tweens.add({
      targets: c,
      x: this.knockbackToX,
      duration: this.knockbackMs,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (this.defeated || !this.waveActive()) return;
        this.cfg.scene.time.delayedCall(this.knockbackPauseMs, () => {
          if (this.defeated || !this.waveActive()) return;
          this.idleBob();
          this.attachTarget();
          this.startAdvance();
        });
      },
    });
  }

  private dropTarget(destroy: boolean): void {
    const target = this.wordTarget;
    if (!target) return;
    this.cfg.typingInput.unregister(target);
    this.cfg.onTargetDetached?.(target);
    if (destroy) target.destroy();
    this.wordTarget = null;
  }

  private waveActive(): boolean {
    return this.cfg.isWaveActive?.() ?? true;
  }
}
