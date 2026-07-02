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
import {
  attachWordBodyAnchor,
  playBodyImpact,
  playBodyTypePulse,
  playClaimLine,
  type AmbientKind,
  type WordBodyAnchorHandle,
} from "./livingScene";
import {
  advanceDurationMs,
  dangerRamp,
  type SplitChildPlacement,
  type SplitChildSpec,
  splitChildPositions,
} from "./movingWordMath";
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
  /** Delay before the entrance sweep starts — staggers a wave's arrivals. Default 0. */
  entranceDelayMs?: number;
  /** Body alpha at rest. Default 1 (the Bell/Wood ghosts rest semi-transparent). */
  restAlpha?: number;
  /** When true the entrance does NOT attach a word — the body advances mute until
   *  the realm calls attachWord() (the Winter boss's ward, released when the pack
   *  falls). A knock-back still re-attaches, matching the inline behaviour. */
  manualAttach?: boolean;
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
  /** Living-scene impact at the body when the word resolves. Defaults to a
   *  brass/mote pulse; realms can tint it as snow, bubbles, embers, or mist. */
  defeatImpactKind?: AmbientKind;
  defeatImpactColor?: number;
  defeatImpactOffsetY?: number;
  /** Living-scene impact when the body finishes its entrance. Defaults to the
   *  defeat-impact kind when present; pass null to suppress. */
  arrivalImpactKind?: AmbientKind | null;
  arrivalImpactColor?: number;
  arrivalImpactOffsetY?: number;
  /** Subtle squash/stretch while the body is alive. Default keeps shared
   *  advancing enemies from reading as static cutouts. */
  bodyBreathScale?: number;
  /** Short body-first beat after the entrance lands, before the word attaches
   *  and the advance begins. This lets the painted figure register as the
   *  source of the threat instead of appearing simultaneously with its label.
   *  Default 140ms; set 0 to keep the old immediate attach. */
  wordAttachDelayMs?: number;
  /** Scale settle on arrival before the idle breath starts. Default 0.026. */
  arrivalSettleScale?: number;

  // ── TextWordTarget passthrough ─────────────────────────────────────────────
  fontSize?: number;
  burstColor?: number | null;
  caseSensitive?: boolean;
  maskMarks?: boolean;
  /** UI-cohesion: a dark legibility stroke around the enemy's word. */
  outline?: boolean;
  /** Optional origin for the claim-line flourish that visually connects Wren
   *  to the threat when its word is first claimed. */
  claimLineFrom?: () => { x: number; y: number };
  claimLineColor?: number;

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
  /** Fired when a mid-claim word is released without completing (backspaced out).
   *  Realms use it to undo an onClaim reaction (Wren returning to rest). */
  onRelease?: () => void;
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

  /** On a player-completion defeat, shed child enemies where this one died — the
   *  Sunken Bell's splitting ghost (→ ebb/drift). The enemy resolves each child's
   *  placement with the tested splitChildPositions geometry; the realm's `spawn`
   *  builds the body and registers the child as its own MovingWordEnemy. Children
   *  are non-recursive unless themselves given a split. NOT fired by a programmatic
   *  defeat (a chain-spark / dismiss) — only when the player typed the word. */
  split?: {
    children: readonly SplitChildSpec[];
    spawn: (placement: SplitChildPlacement) => void;
  };
}

export class MovingWordEnemy {
  private readonly cfg: MovingWordEnemyConfig;
  private wordTarget: TextWordTarget | null = null;
  private advanceTween: Phaser.Tweens.Tween | null = null;
  private wordAnchor: WordBodyAnchorHandle | null = null;
  private defeated = false;
  private completedByPlayer = false;
  // Tier 4 freeze (jam-foe / bind-beat): advance halted, word kept typeable.
  private frozen = false;
  private freezeTimer: Phaser.Time.TimerEvent | null = null;
  private frostOverlay: Phaser.GameObjects.Graphics | null = null;

  // resolved feel constants
  private readonly entranceMs: number;
  private readonly entranceDelayMs: number;
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
  private readonly baseScaleX: number;
  private readonly baseScaleY: number;
  private readonly bodyBreathScale: number;
  private readonly wordAttachDelayMs: number;
  private readonly arrivalSettleScale: number;
  private arrivalTimer: Phaser.Time.TimerEvent | null = null;

  constructor(config: MovingWordEnemyConfig) {
    this.cfg = config;
    this.entranceMs = config.entranceMs ?? 800;
    this.entranceDelayMs = config.entranceDelayMs ?? 0;
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
    this.baseScaleX = config.container.scaleX;
    this.baseScaleY = config.container.scaleY;
    this.bodyBreathScale = config.bodyBreathScale ?? 0.018;
    this.wordAttachDelayMs = config.wordAttachDelayMs ?? 140;
    this.arrivalSettleScale = config.arrivalSettleScale ?? 0.026;

    // Entrance: sweep in from off-screen, fade to rest alpha, then come alive.
    config.scene.tweens.add({
      targets: config.container,
      x: config.restX,
      alpha: this.restAlpha,
      duration: this.entranceMs,
      delay: this.entranceDelayMs,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (this.defeated || !this.waveActive()) return;
        this.beginArrivalBeat();
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

  /** How far this enemy has closed on Wren, 0..1 (1 = arrived) — Euclidean when
   *  the advance is diagonal (wrenY set), else horizontal. The shared "how
   *  dangerous is this foe" signal the offensive one-shots rank by and the
   *  snow-fox trip targets. Mirrors the startAdvance geometry. */
  advanceProgress(): number {
    const c = this.cfg.container;
    const { wrenX, wrenY } = this.cfg;
    const remaining =
      wrenY !== undefined
        ? Math.hypot(wrenX - c.x, wrenY - c.y)
        : Math.abs(wrenX - c.x);
    const total =
      wrenY !== undefined
        ? Math.hypot(wrenX - this.cfg.restX, wrenY - this.cfg.restY)
        : Math.abs(wrenX - this.cfg.restX);
    if (total <= 0) return 0;
    return Math.min(1, Math.max(0, 1 - remaining / total));
  }

  /** Attach the word to a `manualAttach` enemy (the Winter boss's ward release).
   *  No-op if already attached or defeated, so it composes with the knock-back
   *  re-attach that can beat the ward. */
  attachWord(): void {
    if (this.defeated || this.wordTarget) return;
    this.attachTarget();
  }

  /** Shove the body back to its rest point and re-advance after a pause, KEEPING
   *  the word — the Winter thunderclap's pack-wide knock-back (breathing room, not
   *  a kill, no candle cost, unlike reaching Wren). No-op once defeated. */
  knockBack(retreatMs: number, pauseMs: number): void {
    if (this.defeated) return;
    this.advanceTween?.stop();
    this.advanceTween = null;
    const c = this.cfg.container;
    this.cfg.scene.tweens.killTweensOf(c);
    this.cfg.scene.tweens.add({
      targets: c,
      x: this.knockbackToX,
      duration: retreatMs,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.wordTarget?.setAnchorX(c.x);
        this.cfg.scene.time.delayedCall(pauseMs, () => {
          if (this.defeated || !this.waveActive()) return;
          this.idleBob();
          this.startAdvance();
        });
      },
    });
  }

  /** Quiet teardown for a wave wipe (the Winter candle loss) — no chime, no
   *  defeat flourish: drop the word, stop the advance, and fade the body out.
   *  Distinct from defeat(), which is the "you felled it" kill. */
  dismiss(fadeMs = 350): void {
    if (this.defeated) return;
    this.defeated = true;
    this.clearFreeze();
    this.clearArrivalTimer();
    this.dropTarget(true);
    this.advanceTween?.stop();
    this.advanceTween = null;
    const c = this.cfg.container;
    this.cfg.scene.tweens.killTweensOf(c);
    playBodyImpact(this.cfg.scene, c, {
      kind: this.cfg.defeatImpactKind,
      color:
        this.cfg.defeatImpactColor ??
        (this.cfg.burstColor === null ? undefined : this.cfg.burstColor),
      offsetY: this.cfg.defeatImpactOffsetY ?? this.anchorOffsetY * 0.62,
    });
    this.cfg.scene.tweens.add({
      targets: c,
      alpha: 0,
      duration: fadeMs,
      onComplete: () => c.destroy(),
    });
  }

  /** True while jam/bind-frozen (advance halted, word still typeable). The
   *  one-shot threat list drops these so a second one-shot isn't wasted on an
   *  already-seized foe. */
  isFrozen(): boolean {
    return this.frozen;
  }

  /** Tier 4 jam-foe / bind-beat — halt the advance so the enemy can't reach Wren,
   *  but KEEP the word typeable so the player can fell it at leisure. A frost halo
   *  reads the held state. With `durationMs` it thaws and re-advances from where it
   *  stopped (bind-beat's brief room-wide hold); without, it stays frozen until
   *  defeated or the wave ends (jam-foe's single-foe seize). No-op once defeated;
   *  re-freezing refreshes the hold. */
  freeze(durationMs?: number): void {
    if (this.defeated) return;
    this.frozen = true;
    this.clearArrivalTimer();
    this.advanceTween?.stop();
    this.advanceTween = null;
    const c = this.cfg.container;
    this.cfg.scene.tweens.killTweensOf(c);
    if (!this.frostOverlay) {
      const frost = this.cfg.scene.add.graphics();
      frost.fillStyle(PALETTE_HEX.frost, 0.16);
      frost.fillEllipse(0, 0, 130, 160);
      frost.lineStyle(2, PALETTE_HEX.frost, 0.7);
      frost.strokeEllipse(0, 0, 130, 160);
      c.addAt(frost, 0);
      this.frostOverlay = frost;
    }
    this.freezeTimer?.remove();
    this.freezeTimer = null;
    if (durationMs !== undefined) {
      this.freezeTimer = this.cfg.scene.time.delayedCall(durationMs, () =>
        this.thaw(),
      );
    }
  }

  private thaw(): void {
    if (this.defeated || !this.frozen) return;
    this.frozen = false;
    this.clearFreeze();
    // startAdvance recomputes its duration from the body's CURRENT position, so
    // the enemy resumes from where it froze (it's guarded against a dead wave).
    if (!this.cfg.manualAttach && !this.wordTarget) this.attachTarget();
    this.startAdvance();
  }

  /** Drop the freeze timer + frost halo (on thaw, defeat, or dismiss). */
  private clearFreeze(): void {
    this.freezeTimer?.remove();
    this.freezeTimer = null;
    this.frostOverlay?.destroy();
    this.frostOverlay = null;
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
      outline: this.cfg.outline,
      onClaim: (mods) => {
        this.cfg.onClaim?.(mods);
        this.playClaimLine();
      },
      onRelease: () => this.cfg.onRelease?.(),
      onAdvance: () => this.playTypedBodyPulse(),
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
    this.wordAnchor?.destroy();
    this.wordAnchor = attachWordBodyAnchor(
      this.cfg.scene,
      this.cfg.container,
      () =>
        this.wordTarget
          ? { x: this.wordTarget.getAnchorX(), y: this.wordTarget.getAnchorY() }
          : null,
      {
        color:
          this.cfg.claimLineColor ??
          this.cfg.defeatImpactColor ??
          PALETTE_HEX.brass,
        alpha: 0.2,
        depth: 44,
        sourceOffsetY: Math.min(-26, this.anchorOffsetY * 0.42),
        targetOffsetY: 24,
      },
    );
  }

  private playClaimLine(): void {
    const from = this.cfg.claimLineFrom?.();
    if (!from) return;
    playClaimLine(
      this.cfg.scene,
      from.x,
      from.y,
      this.cfg.container.x,
      this.cfg.container.y + this.anchorOffsetY,
      { color: this.cfg.claimLineColor },
    );
  }

  private playTypedBodyPulse(): void {
    playBodyTypePulse(this.cfg.scene, this.cfg.container, {
      kind: this.cfg.defeatImpactKind ?? "mote",
      color:
        this.cfg.defeatImpactColor ??
        this.cfg.claimLineColor ??
        PALETTE_HEX.brass,
      offsetY: this.cfg.defeatImpactOffsetY ?? Math.min(-34, this.anchorOffsetY / 2),
      depth: 49,
      ringRadius: 24,
    });
  }

  private playArrivalImpact(): void {
    if (this.cfg.arrivalImpactKind === null) return;
    playBodyImpact(this.cfg.scene, this.cfg.container, {
      kind: this.cfg.arrivalImpactKind ?? this.cfg.defeatImpactKind ?? "mote",
      color:
        this.cfg.arrivalImpactColor ??
        this.cfg.defeatImpactColor ??
        this.cfg.claimLineColor,
      offsetY:
        this.cfg.arrivalImpactOffsetY ??
        this.cfg.defeatImpactOffsetY ??
        Math.min(-34, this.anchorOffsetY / 2),
      depth: 47,
      ringRadius: 34,
      count: 8,
      durationMs: 360,
    });
  }

  private beginArrivalBeat(): void {
    this.playArrivalImpact();
    this.playArrivalSettle();

    if (this.wordAttachDelayMs <= 0) {
      this.beginLiveAdvance();
      return;
    }

    this.clearArrivalTimer();
    this.arrivalTimer = this.cfg.scene.time.delayedCall(
      this.wordAttachDelayMs,
      () => {
        this.arrivalTimer = null;
        this.beginLiveAdvance();
      },
    );
  }

  private beginLiveAdvance(): void {
    if (this.defeated || this.frozen || !this.waveActive()) return;
    // A ward-gated enemy (the Winter boss) advances mute until attachWord().
    if (!this.cfg.manualAttach) this.attachTarget();
    this.idleBob();
    this.startAdvance();
  }

  private playArrivalSettle(): void {
    if (this.arrivalSettleScale <= 0 || this.wordAttachDelayMs <= 0) return;
    const c = this.cfg.container;
    const halfSettleMs = Math.max(
      45,
      Math.min(85, Math.round(this.wordAttachDelayMs / 2)),
    );
    c.setScale(this.baseScaleX, this.baseScaleY);
    this.cfg.scene.tweens.add({
      targets: c,
      scaleX: this.baseScaleX * (1 + this.arrivalSettleScale),
      scaleY: this.baseScaleY * (1 - this.arrivalSettleScale * 0.46),
      duration: halfSettleMs,
      yoyo: true,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (!c.scene || this.defeated || this.frozen) return;
        c.setScale(this.baseScaleX, this.baseScaleY);
      },
    });
  }

  private idleBob(): void {
    const c = this.cfg.container;
    c.setScale(this.baseScaleX, this.baseScaleY);
    this.cfg.scene.tweens.add({
      targets: c,
      y: { from: c.y, to: c.y - this.idleBobDy },
      duration: this.idleBobMs,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    if (this.bodyBreathScale > 0) {
      this.cfg.scene.tweens.add({
        targets: c,
        scaleX: this.baseScaleX * (1 - this.bodyBreathScale * 0.42),
        scaleY: this.baseScaleY * (1 + this.bodyBreathScale),
        duration: Math.round(this.idleBobMs * 1.25),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  private startAdvance(): void {
    // Frozen enemies hold position — every re-advance path (entrance/knock-back/
    // reach-Wren resume, and thaw) funnels through here, so one guard covers them.
    if (this.defeated || this.frozen || !this.waveActive()) return;
    const { container, wrenX } = this.cfg;
    const wrenY = this.cfg.wrenY;
    // A diagonal close (Wood) scales duration by Euclidean distance; a straight or
    // weaving close uses horizontal distance (the body's x-progress). Both reduce
    // to the same fraction during a from-rest advance, but differ after a knock-back
    // that only retreats x — there a diagonal ghost re-advances along its short axis.
    const remaining =
      wrenY !== undefined
        ? Math.hypot(wrenX - container.x, wrenY - container.y)
        : Math.abs(container.x - wrenX);
    const totalRange =
      wrenY !== undefined
        ? Math.hypot(wrenX - this.cfg.restX, wrenY - this.cfg.restY)
        : Math.abs(this.cfg.restX - wrenX);
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
    // A weave owns the body's y, so clear the idle-bob y-tween first — otherwise
    // the two fight over container.y (the Winter circler did this inline).
    if (this.cfg.verticalOffset) {
      this.cfg.scene.tweens.killTweensOf(container);
    }
    this.advanceTween = this.cfg.scene.tweens.add(props);
  }

  /** Programmatic kill (player completion OR a sibling's chain-spark). Stops the
   *  advance, tears down the word, and fades the body up and out. */
  defeat(): void {
    if (this.defeated) return;
    this.defeated = true;
    this.clearFreeze();
    this.clearArrivalTimer();
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
    // A splitter sheds children where it died — only on a real player completion,
    // not a programmatic kill. The body's current x (not its rest) anchors them,
    // matching the inline behaviour; geometry via the tested splitChildPositions.
    if (this.completedByPlayer && this.cfg.split) {
      const placements = splitChildPositions(
        c.x,
        this.cfg.restY,
        this.cfg.split.children,
        this.cfg.wrenX,
      );
      for (const p of placements) this.cfg.split.spawn(p);
    }
  }

  private handleComplete(mods: ClaimMods): void {
    if (this.defeated) return;
    this.completedByPlayer = true;
    this.defeat();
    this.cfg.onComplete?.(mods, this);
  }

  private reachWren(): void {
    // The hit feel runs FIRST — it may end the wave (a Winter candle loss tears
    // every enemy down via dismiss()). If it did, stop here: the scene owns
    // teardown and there's nothing to knock back. Otherwise drop the timed-out
    // word, knock the body back, and come again.
    this.cfg.onReachWren?.(this);
    if (this.defeated || !this.waveActive()) return;
    this.dropTarget(true);
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
    this.wordAnchor?.destroy();
    this.wordAnchor = null;
    const target = this.wordTarget;
    if (!target) return;
    this.cfg.typingInput.unregister(target);
    this.cfg.onTargetDetached?.(target);
    if (destroy) target.destroy();
    this.wordTarget = null;
  }

  private clearArrivalTimer(): void {
    this.arrivalTimer?.remove(false);
    this.arrivalTimer = null;
  }

  private waveActive(): boolean {
    return this.cfg.isWaveActive?.() ?? true;
  }
}
