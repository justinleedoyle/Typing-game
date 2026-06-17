// Scrolling phrase banner — the Sky-Island typing target shape.
// A sentence rides on a parchment-style strip that drifts across the
// screen at configurable speed. The player must finish typing the
// phrase before the banner exits the far side — otherwise it counts
// as a miss and Wren takes a knock (Heart drop + camera shake).
//
// Built as a thin wrapper around TextWordTarget: the target tracks the
// typing state, this module owns the moving visuals and the timeout.

import Phaser from "phaser";
import { PALETTE, PALETTE_HEX, SERIF } from "./palette";
import { blurAlphaFor, bannerDangerAt, shouldEatSuffix } from "./skyBlur";
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
}

const BANNER_PADDING_X = 32;
const BANNER_PADDING_Y = 18;
const BANNER_FONT_SIZE = 30;

export class ScrollingPhrase {
  private readonly container: Phaser.GameObjects.Container;
  private readonly bannerGfx: Phaser.GameObjects.Graphics;
  private readonly target: TextWordTarget;
  private scrollTween: Phaser.Tweens.Tween | null = null;
  private resolved = false;

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

    const startX =
      opts.fromSide === "left" ? -bannerW / 2 - 40 : screenW + bannerW / 2 + 40;
    const endX =
      opts.fromSide === "left" ? screenW + bannerW / 2 + 40 : -bannerW / 2 - 40;

    this.container = opts.scene.add
      .container(startX, opts.y)
      .setDepth(20)
      .setAlpha(0);

    // Parchment-style banner — cream with a thin brass border.
    this.bannerGfx = opts.scene.add.graphics();
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

    // The target wraps its own text rendering. Place its anchor at the
    // banner center; the target's container is independent — we move it
    // each frame via setAnchorX to track the banner.
    this.target = new TextWordTarget({
      scene: opts.scene,
      word: opts.phrase,
      x: startX,
      y: opts.y,
      fontSize: BANNER_FONT_SIZE,
      burstColor: PALETTE_HEX.brass,
      onComplete: () => this.handleComplete(),
    });
    opts.typingInput.register(this.target);

    // Fade in, then drift across the screen.
    opts.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: 280,
      delay: opts.delayMs ?? 0,
      ease: "Sine.easeOut",
    });

    this.scrollTween = opts.scene.tweens.add({
      targets: this.container,
      x: endX,
      duration: opts.durationMs,
      delay: opts.delayMs ?? 0,
      ease: "Linear",
      onUpdate: (tween) => {
        this.target.setAnchorX(this.container.x);
        // Triage urgency cue — the banner's text tints cream → ember as it
        // nears the exit edge, so the player can prioritise among several.
        this.target.setDanger(bannerDangerAt(tween.progress));
      },
      onComplete: () => this.handleMiss(),
    });
  }

  private handleComplete(): void {
    if (this.resolved) return;
    this.resolved = true;
    this.scrollTween?.stop();
    this.scrollTween = null;
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
    this.opts.typingInput.unregister(this.target);
    // Banner has already drifted off-screen. Tear it down.
    this.target.destroy();
    this.container.destroy();
    // Knock feedback at the scene level — caller's onMiss handles Heart
    // drop, camera shake, etc.
    this.opts.onMiss?.();
    void PALETTE; // keep import live for future tinting work
  }

  destroy(): void {
    this.scrollTween?.stop();
    this.scrollTween = null;
    if (!this.resolved) {
      this.opts.typingInput.unregister(this.target);
      this.target.destroy();
    }
    this.container.destroy();
  }

  /** Current horizontal screen position of the banner center. Owners use this
   *  to compute proximity to scene-level features (e.g. Sky-Island lanterns). */
  getX(): number {
    return this.container.x;
  }

  /** Apply a per-frame blur amount in [0, 1]. 0 = fully clear, 1 = beam core.
   *  In the beam core the untyped suffix is "eaten" (masked) so the player must
   *  have read ahead; the banner also dims but stays locatable for triage.
   *  No-op once resolved so the completion / miss fade is not undone. */
  setBlur(amount: number): void {
    if (this.resolved) return;
    const clamped = Math.max(0, Math.min(1, amount));
    this.target.setSuffixMasked(shouldEatSuffix(clamped));
    const alpha = blurAlphaFor(clamped);
    this.container.setAlpha(alpha);
    this.target.setVisualAlpha(alpha);
  }
}
