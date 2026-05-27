// A typeable word floating above an in-world thing.
//
// The text is rendered as two parts: the already-typed prefix (bright) and
// the remaining suffix (dim). When the player completes the word, the
// onComplete callback runs — that's where the scene applies the in-world
// effect (open the portal, defeat the wolf, light the lantern, etc.).

import Phaser from "phaser";
import { PALETTE, PALETTE_HEX, SERIF } from "./palette";
import type { WordTarget } from "./typingInput";
import { playWordCompleteBurst } from "./vfx";

export interface TextWordTargetOptions {
  scene: Phaser.Scene;
  word: string;
  x: number;
  y: number;
  fontSize?: number;
  /** Higher wins on first-letter ties. Default 0. */
  priority?: number;
  onComplete: () => void;
  /** Fired instead of onComplete when the target was claimed in spell mode
   *  (first letter typed with Shift held). If omitted, onComplete runs
   *  normally and spell mode is purely cosmetic. */
  onSpellComplete?: () => void;
  /** Fired instead of onComplete/onSpellComplete when the claim landed with
   *  Alt held (the "wild" variant — Forge spark-chain, etc.). If omitted,
   *  Alt claims fall back to onSpellComplete or onComplete. */
  onAltSpellComplete?: () => void;
  /** Color (hex) for the radial burst when the word completes. Defaults to
   *  brass. Pass `null` to suppress the burst entirely (e.g. for very
   *  small text where the burst would feel oversized). */
  burstColor?: number | null;
  /** When true, matching is case-sensitive — uppercase characters require
   *  Shift, lowercase forbids it. The controller compares the raw keystroke
   *  against the preserved-case word both for pre-claim prefix narrowing
   *  and mid-claim advancement. Off by default; most targets are case-
   *  insensitive. Used by the Clockwork Forge's capital-as-command
   *  curriculum mechanic. */
  caseSensitive?: boolean;
  /** Called when this target locks in to the typing controller (first matching
   *  letter typed). Use for character-facing reactions like Wren leaning toward
   *  the target. */
  onClaim?: (mods: { spell: boolean; alt: boolean }) => void;
  /** Called when a mid-claim target is released without completing — e.g. the
   *  player backspaced out of it. */
  onRelease?: () => void;
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
  private readonly caseWord: string;
  private readonly displayWord: string;
  private cursor = 0;
  private complete = false;
  private dimmed = false;
  private candidate = false;
  private spellClaimed = false;
  private altClaimed = false;
  private danger = 0;

  readonly priority: number;

  constructor(private readonly opts: TextWordTargetOptions) {
    const fontSize = opts.fontSize ?? 56;
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: SERIF,
      fontSize: `${fontSize}px`,
    };

    // Two views: `displayWord` keeps the original case for the UI; `word`
    // is lowercase so the typing controller's lowercased input compares
    // directly. Typed words can now be capitalized as proper nouns.
    // `caseWord` mirrors displayWord and is consumed by case-sensitive
    // matching via rawRemaining() — it's the preserved-case equivalent of
    // `word`.
    this.displayWord = opts.word;
    this.word = opts.word.toLowerCase();
    this.caseWord = opts.word;
    this.priority = opts.priority ?? 0;
    this.typedText = opts.scene.add
      .text(0, 0, "", { ...style, color: PALETTE.brass })
      .setOrigin(0, 0.5);
    this.remainingText = opts.scene.add
      .text(0, 0, this.displayWord, { ...style, color: PALETTE.cream })
      .setOrigin(0, 0.5);

    this.container = opts.scene.add
      .container(opts.x, opts.y, [this.typedText, this.remainingText])
      .setSize(this.remainingText.width, this.remainingText.height);

    this.relayout();
  }

  remaining(): string {
    return this.word.slice(this.cursor);
  }

  /** Preserved-case version of remaining(). Used by the typing controller
   *  for case-sensitive prefix matching and mid-claim advancement. */
  rawRemaining(): string {
    return this.caseWord.slice(this.cursor);
  }

  caseSensitive(): boolean {
    return this.opts.caseSensitive === true;
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

  /**
   * Reverse the cursor by one character. Returns true on success; false if
   * we're already at the word's start (caller should fall through to release
   * the claim entirely). The target stays claimed and stays visible — only
   * the typed prefix shrinks by one letter.
   */
  reverse(): boolean {
    if (this.cursor === 0) return false;
    this.cursor -= 1;
    this.complete = false;
    this.relayout();
    return true;
  }

  /**
   * Snap the cursor back to the word's start without releasing the claim.
   * Used by purist mode — a typo wipes typing progress on the claimed word
   * but the target stays selected, so the player doesn't have to re-find it.
   */
  resetCursor(): void {
    if (this.cursor === 0) return;
    this.cursor = 0;
    this.complete = false;
    this.relayout();
  }

  /**
   * Drive the word's color toward "danger" as a wolf advances on Wren.
   * `level` is 0..1 — at 0 the word stays cream, at 1 it's full ember-red.
   * Plays cleanly with the dim/candidate/spell color rules in applyDim().
   */
  setDanger(level: number): void {
    const clamped = Math.max(0, Math.min(1, level));
    if (Math.abs(clamped - this.danger) < 0.01) return;
    this.danger = clamped;
    this.applyDim();
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

  onClaim(mods: { spell: boolean; alt: boolean }): void {
    this.dimmed = false;
    this.spellClaimed = mods.spell;
    this.altClaimed = mods.alt;
    if (mods.alt) {
      // Alt = wild — brass tint reads as electric, distinct from ember spell.
      this.typedText.setColor(PALETTE.brass);
      this.remainingText.setColor(PALETTE.brass);
    } else if (mods.spell) {
      this.typedText.setColor(PALETTE.ember);
      this.remainingText.setColor(PALETTE.ember);
    }
    this.applyDim();
    this.opts.onClaim?.(mods);
  }

  onRelease(): void {
    if (this.complete) return;
    this.cursor = 0;
    this.spellClaimed = false;
    this.altClaimed = false;
    this.candidate = false;
    this.typedText.setColor(PALETTE.brass);
    this.remainingText.setColor(PALETTE.cream);
    this.relayout();
    this.opts.onRelease?.();
  }

  onComplete(): void {
    const spell = this.spellClaimed;
    const alt = this.altClaimed;

    // Burst on completion — turns "text fades" into "you hit the thing."
    // Default brass; scenes pass frost for wolves, etc. `null` opts out.
    const burstColor = this.opts.burstColor;
    if (burstColor !== null) {
      playWordCompleteBurst(
        this.opts.scene,
        this.container.x,
        this.container.y,
        { color: burstColor ?? PALETTE_HEX.brass },
      );
    }

    this.opts.scene.tweens.add({
      targets: this.container,
      alpha: { from: 1, to: 0 },
      y: { from: this.container.y, to: this.container.y - 30 },
      duration: 320,
      ease: "Sine.easeOut",
      onComplete: () => {
        // Alt has priority over Shift when both were held.
        if (alt && this.opts.onAltSpellComplete) {
          this.opts.onAltSpellComplete();
        } else if (spell && this.opts.onSpellComplete) {
          this.opts.onSpellComplete();
        } else {
          this.opts.onComplete();
        }
        this.destroy();
      },
    });
  }

  setDimmed(dimmed: boolean): void {
    this.dimmed = dimmed;
    this.applyDim();
  }

  /** Tween the container's alpha for a sensory-obscure beat (e.g. Wood's mist
   *  roll). Restoring goes back to the dimmed-state alpha so this composes
   *  with setDimmed. Typing input is unaffected — the word is just hidden. */
  setHidden(hidden: boolean, durationMs = 220): void {
    const targetAlpha = hidden ? 0 : this.dimmed ? 0.12 : 1;
    this.opts.scene.tweens.add({
      targets: this.container,
      alpha: targetAlpha,
      duration: durationMs,
      ease: "Sine.easeInOut",
    });
  }

  setCandidate(candidate: boolean): void {
    this.candidate = candidate;
    this.applyDim();
  }

  /** Reposition the floating word — used to keep it pinned above a moving
   *  enemy. */
  setAnchorX(x: number): void {
    this.container.x = x;
  }

  setAnchorY(y: number): void {
    this.container.y = y;
  }

  destroy(): void {
    this.container.destroy();
  }

  private relayout(): void {
    // Display uses the original case; matching uses the lowercased word.
    const typed = this.displayWord.slice(0, this.cursor);
    const remaining = this.displayWord.slice(this.cursor);
    this.typedText.setText(typed);
    this.remainingText.setText(remaining);
    this.remainingText.x = this.typedText.width;

    const totalWidth = this.typedText.width + this.remainingText.width;
    this.typedText.x = -totalWidth / 2;
    this.remainingText.x = this.typedText.x + this.typedText.width;
  }

  private applyDim(): void {
    const alpha = this.dimmed ? 0.12 : 1;
    this.container.setAlpha(alpha);
    if (this.dimmed) return;
    // Color priority: alt > spell > candidate > danger > default.
    if (this.altClaimed) return; // brass, set in onClaim
    if (this.spellClaimed) return; // ember, set in onClaim
    if (this.candidate) {
      this.remainingText.setColor(PALETTE.frost ?? PALETTE.cream);
      return;
    }
    if (this.danger > 0) {
      this.remainingText.setColor(this.dangerColor());
      return;
    }
    this.remainingText.setColor(PALETTE.cream);
  }

  /** Linear interpolation between cream and ember by the current danger level.
   *  Returns a CSS hex string suitable for Phaser Text.setColor. */
  private dangerColor(): string {
    const t = this.danger;
    const lerp = (a: number, b: number): number =>
      Math.round(a + (b - a) * t);
    const r = lerp(0xf3, 0xd6);
    const g = lerp(0xea, 0x75);
    const b = lerp(0xd2, 0x4a);
    const hex = (n: number): string => n.toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }
}
