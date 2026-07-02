// Scrolling phrase banner — the Sky-Island typing target shape.
// A sentence rides on a parchment-style strip that drifts across the
// screen at configurable speed. The player must finish typing the
// phrase before the banner exits the far side — otherwise it counts
// as a miss and Wren takes a knock (Heart drop + camera shake).
//
// Built as a thin wrapper around TextWordTarget: the target tracks the
// typing state, this module owns the moving visuals and the timeout.

import Phaser from "phaser";
import { playBodyImpact, playBodyTypePulse, playClaimLine } from "./livingScene";
import { PALETTE, PALETTE_HEX, SERIF } from "./palette";
import { blurAlphaFor, bannerDangerAt, shouldEatSuffix } from "./skyBlur";
import { playWordCompleteBurst } from "./vfx";
import { TextWordTarget } from "./wordTarget";
import type { TypingInputController } from "./typingInput";

export interface ScrollingPhraseOptions {
  scene: Phaser.Scene;
  typingInput: TypingInputController;
  phrase: string;
  /** Side the banner enters from. The opposite side is its exit. */
  fromSide: "left" | "right";
  /** Vertical position of the banner center. */
  y: number;
  /** Total scroll duration in ms — banner takes this long to cross the
   *  screen. Shorter = harder. */
  durationMs: number;
  /** Optional delay before the banner appears. */
  delayMs?: number;
  /** Called when the phrase is fully typed before the banner exits. */
  onComplete?: () => void;
  /** Called when the banner exits the far side without being typed. */
  onMiss?: () => void;
  /** Optional origin for a brief claim-line flourish when the banner is targeted. */
  claimLineFrom?: () => { x: number; y: number };
  claimLineColor?: number;
}

const BANNER_PADDING_X = 32;
const BANNER_PADDING_Y = 18;
const BANNER_FONT_SIZE = 30;
const BANNER_ENTRY_MS = 420;
const BANNER_WORD_ATTACH_DELAY_MS = 140;
const BANNER_ENTRY_MARGIN_X = 70;

export class ScrollingPhrase {
  private readonly container: Phaser.GameObjects.Container;
  private readonly bannerGfx: Phaser.GameObjects.Graphics;
  private target: TextWordTarget | null = null;
  private entryTween: Phaser.Tweens.Tween | null = null;
  private scrollTween: Phaser.Tweens.Tween | null = null;
  private flutterTween: Phaser.Tweens.Tween | null = null;
  private wordAttachTimer: Phaser.Time.TimerEvent | null = null;
  private resolved = false;
  /** Latest scroll progress 0..1 (1 = at the exit edge). Stored each frame so
   *  the offensive one-shots can rank banners by urgency even after a freeze. */
  private progress = 0;
  /** Tier 4 jam-foe — true while the banner is frozen (scroll halted, but the
   *  word stays typeable). bind-beat is Wood-only (MovingWordEnemy), so a
   *  scrolling banner's freeze is always the permanent single-foe seize. */
  private frozen = false;
  private frozenOverlay: Phaser.GameObjects.Graphics | null = null;
  private readonly bannerW: number;
  private readonly bannerH: number;

  constructor(private readonly opts: ScrollingPhraseOptions) {
    const screenW = opts.scene.scale.width;

    // Measure the phrase's display width so the banner can size to fit.
    // Use a throwaway text object — Phaser doesn't expose font metrics
    // independently of a real GameObject.
    const measure = opts.scene.add.text(0, 0, opts.phrase, {
      fontFamily: SERIF,
      fontSize: `${BANNER_FONT_SIZE}px`,
    });
    const phraseW = measure.width;
    const phraseH = measure.height;
    measure.destroy();

    const bannerW = phraseW + BANNER_PADDING_X * 2;
    const bannerH = phraseH + BANNER_PADDING_Y * 2;
    this.bannerW = bannerW;
    this.bannerH = bannerH;

    const startX =
      opts.fromSide === "left" ? -bannerW / 2 - 40 : screenW + bannerW / 2 + 40;
    const entryX =
      opts.fromSide === "left"
        ? bannerW / 2 + BANNER_ENTRY_MARGIN_X
        : screenW - bannerW / 2 - BANNER_ENTRY_MARGIN_X;
    const endX =
      opts.fromSide === "left" ? screenW + bannerW / 2 + 40 : -bannerW / 2 - 40;

    this.container = opts.scene.add
      .container(startX, opts.y)
      .setDepth(20)
      .setAlpha(0);

    // Parchment-style banner — cream with a thin brass border plus small
    // pennant tails, so it reads as a scroll caught in wind rather than a flat
    // UI rectangle.
    this.bannerGfx = opts.scene.add.graphics();
    this.bannerGfx.fillStyle(PALETTE_HEX.cream, 0.82);
    this.bannerGfx.fillTriangle(
      -bannerW / 2 - 22,
      0,
      -bannerW / 2 + 6,
      -bannerH / 2 + 8,
      -bannerW / 2 + 6,
      bannerH / 2 - 8,
    );
    this.bannerGfx.fillTriangle(
      bannerW / 2 + 22,
      0,
      bannerW / 2 - 6,
      -bannerH / 2 + 8,
      bannerW / 2 - 6,
      bannerH / 2 - 8,
    );
    this.bannerGfx.lineStyle(2, PALETTE_HEX.brass, 0.7);
    this.bannerGfx.lineBetween(-bannerW / 2 - 22, 0, -bannerW / 2 + 6, -bannerH / 2 + 8);
    this.bannerGfx.lineBetween(-bannerW / 2 - 22, 0, -bannerW / 2 + 6, bannerH / 2 - 8);
    this.bannerGfx.lineBetween(bannerW / 2 + 22, 0, bannerW / 2 - 6, -bannerH / 2 + 8);
    this.bannerGfx.lineBetween(bannerW / 2 + 22, 0, bannerW / 2 - 6, bannerH / 2 - 8);
    this.bannerGfx.fillStyle(PALETTE_HEX.cream, 0.92);
    this.bannerGfx.fillRoundedRect(
      -bannerW / 2,
      -bannerH / 2,
      bannerW,
      bannerH,
      10,
    );
    this.bannerGfx.lineStyle(2, PALETTE_HEX.brass, 0.85);
    this.bannerGfx.strokeRoundedRect(
      -bannerW / 2,
      -bannerH / 2,
      bannerW,
      bannerH,
      10,
    );
    this.container.add(this.bannerGfx);

    // Body-first arrival: the parchment slides into view, lands, and only then
    // becomes a registered typing target. This keeps the word from floating in
    // before the physical scroll exists on screen.
    this.entryTween = opts.scene.tweens.add({
      targets: this.container,
      x: entryX,
      alpha: 1,
      duration: BANNER_ENTRY_MS,
      delay: opts.delayMs ?? 0,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.entryTween = null;
        this.playArrivalPulse();
        this.wordAttachTimer = opts.scene.time.delayedCall(
          BANNER_WORD_ATTACH_DELAY_MS,
          () => {
            this.wordAttachTimer = null;
            this.attachTarget(endX);
          },
        );
      },
    });
    this.flutterTween = opts.scene.tweens.add({
      targets: this.container,
      scaleX: { from: 0.988, to: 1.012 },
      scaleY: { from: 1.012, to: 0.992 },
      duration: 1400 + Math.round(bannerW * 0.7),
      delay: opts.delayMs ?? 0,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private attachTarget(endX: number): void {
    if (this.resolved || this.target) return;
    // The target wraps its own text rendering. Place its anchor at the
    // banner center; the target's container is independent — we move it
    // each frame via setAnchorX to track the banner.
    this.target = new TextWordTarget({
      scene: this.opts.scene,
      word: this.opts.phrase,
      x: this.container.x,
      y: this.container.y,
      fontSize: BANNER_FONT_SIZE,
      burstColor: PALETTE_HEX.brass,
      // UI-cohesion: the same legibility outline every other word target carries,
      // so the scrolling banners read consistently with the rest of the realm.
      outline: true,
      onClaim: () => this.playClaimLine(),
      onAdvance: () => this.playTypedBodyPulse(),
      onComplete: () => this.handleComplete(),
    });
    this.opts.typingInput.register(this.target);
    this.startScroll(endX);
  }

  private startScroll(endX: number): void {
    this.scrollTween = this.opts.scene.tweens.add({
      targets: this.container,
      x: endX,
      duration: this.opts.durationMs,
      ease: "Linear",
      onUpdate: (tween) => {
        this.progress = tween.progress;
        this.syncTargetToBanner();
        // Triage urgency cue — the banner's text tints cream → ember as it
        // nears the exit edge, so the player can prioritise among several.
        this.target?.setDanger(bannerDangerAt(tween.progress));
      },
      onComplete: () => this.handleMiss(),
    });
  }

  private syncTargetToBanner(): void {
    if (!this.target) return;
    this.target.setAnchorX(this.container.x);
    this.target.setAnchorY(this.container.y);
  }

  private clearWordAttachTimer(): void {
    this.wordAttachTimer?.remove(false);
    this.wordAttachTimer = null;
  }

  private playClaimLine(): void {
    const from = this.opts.claimLineFrom?.();
    if (!from) return;
    playClaimLine(
      this.opts.scene,
      from.x,
      from.y,
      this.container.x,
      this.opts.y,
      { color: this.opts.claimLineColor ?? PALETTE_HEX.brass },
    );
  }

  private playTypedBodyPulse(): void {
    playBodyTypePulse(this.opts.scene, this.container, {
      kind: "mote",
      color: PALETTE_HEX.brass,
      offsetY: 0,
      depth: 22,
      ringRadius: Math.min(38, this.bannerW / 6),
    });
  }

  private playArrivalPulse(): void {
    if (this.resolved) return;
    playBodyImpact(this.opts.scene, this.container, {
      kind: "mote",
      color: PALETTE_HEX.brass,
      offsetY: 0,
      depth: 21,
      ringRadius: Math.min(44, this.bannerW / 5),
      count: 8,
      durationMs: 320,
    });
  }

  private handleComplete(): void {
    if (this.resolved) return;
    this.resolved = true;
    this.clearWordAttachTimer();
    this.entryTween?.stop();
    this.entryTween = null;
    this.scrollTween?.stop();
    this.scrollTween = null;
    this.flutterTween?.stop();
    this.flutterTween = null;
    this.target = null;
    playBodyImpact(this.opts.scene, this.container, {
      kind: "mote",
      color: PALETTE_HEX.brass,
      offsetY: 0,
      ringRadius: Math.min(72, this.bannerW / 4),
      count: 14,
    });
    // Banner glows + dissolves.
    this.opts.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      scale: 1.15,
      duration: 320,
      ease: "Sine.easeOut",
      onComplete: () => this.container.destroy(),
    });
    this.opts.onComplete?.();
  }

  private handleMiss(): void {
    if (this.resolved) return;
    this.resolved = true;
    this.clearWordAttachTimer();
    this.entryTween?.stop();
    this.entryTween = null;
    this.scrollTween?.stop();
    this.scrollTween = null;
    this.flutterTween?.stop();
    this.flutterTween = null;
    this.dropTarget();
    // Banner has already drifted off-screen. Tear it down.
    this.container.destroy();
    // Knock feedback at the scene level — caller's onMiss handles Heart
    // drop, camera shake, etc.
    this.opts.onMiss?.();
    void PALETTE; // keep import live for future tinting work
  }

  destroy(): void {
    this.clearWordAttachTimer();
    this.entryTween?.stop();
    this.entryTween = null;
    this.scrollTween?.stop();
    this.scrollTween = null;
    this.flutterTween?.stop();
    this.flutterTween = null;
    if (!this.resolved) this.dropTarget();
    this.container.destroy();
  }

  /** Current horizontal screen position of the banner center. Owners use this
   *  to compute proximity to scene-level features (e.g. Sky-Island lanterns). */
  getX(): number {
    return this.container.x;
  }

  /** Scroll progress 0..1 (1 = at the exit edge). The offensive one-shots rank
   *  banners by this — the nearest-to-exit is the "strongest" (most urgent). */
  getProgress(): number {
    return this.progress;
  }

  /** The phrase's character count — the one-shots' tiebreak among banners at
   *  equal scroll progress (the longer sentence is the "stronger" foe). */
  getPhraseLength(): number {
    return this.opts.phrase.length;
  }

  /** True once typed, missed, or struck — i.e. no longer a live threat. */
  isResolved(): boolean {
    return this.resolved;
  }

  /** True while jam-frozen (halted but not yet typed). A one-shot shouldn't be
   *  spent re-targeting an already-seized banner, so the threat list drops these. */
  isFrozen(): boolean {
    return this.frozen;
  }

  /** True once the parchment has arrived and the phrase is actually typeable. */
  isReady(): boolean {
    return this.target !== null && !this.resolved;
  }

  private dropTarget(): void {
    if (!this.target) return;
    this.opts.typingInput.unregister(this.target);
    this.target.destroy();
    this.target = null;
  }

  /** Tier 4 toll-strike — fell this banner as a clean clear (the bell's tongue).
   *  Counts toward the wave like a completion (no miss penalty): halt the scroll,
   *  tear down the still-live typing target, burst + dissolve, and fire onComplete.
   *  No-op once resolved. */
  strike(): void {
    if (this.resolved || !this.target) return;
    this.resolved = true;
    this.clearWordAttachTimer();
    this.entryTween?.stop();
    this.entryTween = null;
    this.scrollTween?.stop();
    this.scrollTween = null;
    this.flutterTween?.stop();
    this.flutterTween = null;
    this.frozenOverlay?.destroy();
    this.frozenOverlay = null;
    // The word was never typed, so the target is still registered — drop it.
    this.dropTarget();
    playWordCompleteBurst(this.opts.scene, this.container.x, this.opts.y, {
      color: PALETTE_HEX.ember,
      count: 16,
      radius: 60,
    });
    playBodyImpact(this.opts.scene, this.container, {
      kind: "ember",
      color: PALETTE_HEX.ember,
      offsetY: 0,
      ringRadius: Math.min(74, this.bannerW / 4),
      count: 16,
    });
    this.opts.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      scale: 1.15,
      duration: 320,
      ease: "Sine.easeOut",
      onComplete: () => this.container.destroy(),
    });
    this.opts.onComplete?.();
  }

  /** Tier 4 jam-foe — halt the banner's drift so it can't scroll off (no miss),
   *  but KEEP the word typeable so the player mops it up at leisure. A frost
   *  overlay reads the seized state. Stays held until typed or torn down. No-op
   *  once resolved or already frozen. */
  freeze(): void {
    if (this.resolved || this.frozen || !this.target) return;
    this.frozen = true;
    this.scrollTween?.stop();
    this.scrollTween = null;
    const g = this.opts.scene.add.graphics();
    g.fillStyle(PALETTE_HEX.frost, 0.12);
    g.fillRoundedRect(-this.bannerW / 2, -this.bannerH / 2, this.bannerW, this.bannerH, 10);
    g.lineStyle(2, PALETTE_HEX.frost, 0.9);
    g.strokeRoundedRect(-this.bannerW / 2, -this.bannerH / 2, this.bannerW, this.bannerH, 10);
    this.container.add(g);
    this.frozenOverlay = g;
    playWordCompleteBurst(this.opts.scene, this.container.x, this.opts.y, {
      color: PALETTE_HEX.frost,
      count: 10,
      radius: 40,
    });
  }

  /** Apply a per-frame blur amount in [0, 1]. 0 = fully clear, 1 = beam core.
   *  In the beam core the untyped suffix is "eaten" (masked) so the player must
   *  have read ahead; the banner also dims but stays locatable for triage.
   *  No-op once resolved so the completion / miss fade is not undone. */
  setBlur(amount: number): void {
    if (this.resolved || !this.target) return;
    const clamped = Math.max(0, Math.min(1, amount));
    this.target.setSuffixMasked(shouldEatSuffix(clamped));
    const alpha = blurAlphaFor(clamped);
    this.container.setAlpha(alpha);
    this.target.setVisualAlpha(alpha);
  }
}
