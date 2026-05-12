// A typeable word floating above an in-world thing.
//
// The text is rendered as two parts: the already-typed prefix (bright) and
// the remaining suffix (dim). When the player completes the word, the
// onComplete callback runs — that's where the scene applies the in-world
// effect (open the portal, defeat the wolf, light the lantern, etc.).

import Phaser from "phaser";
import { PALETTE, SERIF } from "./palette";
import type { WordTarget } from "./typingInput";

export interface TextWordTargetOptions {
  scene: Phaser.Scene;
  word: string;
  x: number;
  y: number;
  fontSize?: number;
  /** Higher wins on first-letter ties. Default 0. */
  priority?: number;
  onComplete: () => void;
  /** Optional anchor sprite to flash/shake when the player misses. */
  anchor?: Phaser.GameObjects.GameObject & {
    setTint?: (tint: number) => void;
    clearTint?: () => void;
  };
}

export class TextWordTarget implements WordTarget {
  private readonly typedText: Phaser.GameObjects.Text;
  private readonly remainingText: Phaser.GameObjects.Text;
  private readonly container: Phaser.GameObjects.Container;
  private readonly word: string;
  private cursor = 0;
  private complete = false;
  private dimmed = false;

  readonly priority: number;

  constructor(private readonly opts: TextWordTargetOptions) {
    const fontSize = opts.fontSize ?? 56;
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: SERIF,
      fontSize: `${fontSize}px`,
    };

    this.word = opts.word.toLowerCase();
    this.priority = opts.priority ?? 0;
    this.typedText = opts.scene.add
      .text(0, 0, "", { ...style, color: PALETTE.brass })
      .setOrigin(0, 0.5);
    this.remainingText = opts.scene.add
      .text(0, 0, this.word, { ...style, color: PALETTE.cream })
      .setOrigin(0, 0.5);

    this.container = opts.scene.add
      .container(opts.x, opts.y, [this.typedText, this.remainingText])
      .setSize(this.remainingText.width, this.remainingText.height);

    this.relayout();
  }

  remaining(): string {
    return this.word.slice(this.cursor);
  }

  isComplete(): boolean {
    return this.complete;
  }

  advance(): void {
    this.cursor += 1;
    if (this.cursor >= this.word.length) {
      this.complete = true;
    }
    this.relayout();
  }

  miss(): void {
    const anchor = this.opts.anchor;
    if (anchor?.setTint) {
      anchor.setTint(0xff7766);
      this.opts.scene.time.delayedCall(120, () => anchor.clearTint?.());
    }
    this.opts.scene.tweens.add({
      targets: this.container,
      x: { from: this.container.x - 6, to: this.container.x },
      duration: 80,
      ease: "Sine.easeOut",
    });
  }

  onClaim(): void {
    this.dimmed = false;
    this.applyDim();
  }

  onRelease(): void {
    if (this.complete) return;
    // If released without completing (e.g. scene shutdown), reset state so
    // the same target could be reclaimed later.
    this.cursor = 0;
    this.relayout();
  }

  onComplete(): void {
    this.opts.scene.tweens.add({
      targets: this.container,
      alpha: { from: 1, to: 0 },
      y: { from: this.container.y, to: this.container.y - 30 },
      duration: 320,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.opts.onComplete();
        this.destroy();
      },
    });
  }

  setDimmed(dimmed: boolean): void {
    this.dimmed = dimmed;
    this.applyDim();
  }

  destroy(): void {
    this.container.destroy();
  }

  private relayout(): void {
    const typed = this.word.slice(0, this.cursor);
    const remaining = this.word.slice(this.cursor);
    this.typedText.setText(typed);
    this.remainingText.setText(remaining);
    this.remainingText.x = this.typedText.width;

    const totalWidth = this.typedText.width + this.remainingText.width;
    this.typedText.x = -totalWidth / 2;
    this.remainingText.x = this.typedText.x + this.typedText.width;
  }

  private applyDim(): void {
    const alpha = this.dimmed ? 0.25 : 1;
    this.container.setAlpha(alpha);
  }
}
