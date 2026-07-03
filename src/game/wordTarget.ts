// A typeable word floating above an in-world thing.
//
// The text is rendered as two parts: the already-typed prefix (bright) and
// the remaining suffix (dim). When the player completes the word, the
// onComplete callback runs — that's where the scene applies the in-world
// effect (open the portal, defeat the wolf, light the lantern, etc.).

import Phaser from "phaser";
import { PALETTE, PALETTE_HEX, SERIF } from "./palette";
import type { WordTarget } from "./typingInput";
import { UI_HEX } from "./ui/uiTheme";
import { playWordCompleteBurst } from "./vfx";

export interface TextWordTargetOptions {
  scene: Phaser.Scene;
  word: string;
  x: number;
  y: number;
  /** Optional render depth for scenes where the word must sit above an actor/body. */
  depth?: number;
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
  /** When true, UNtyped punctuation marks (. , ? ! ; :) render as a neutral
   *  placeholder (·) instead of the real glyph, so the player can't just read
   *  the mark off the word — they must supply it from context. Typed marks show
   *  real (correct-ward feedback). Matching is unaffected (display-only). Used
   *  by the Haunted Wood's directional warding. Off by default. */
  maskMarks?: boolean;
  /** When true, a mid-claim miss snaps the cursor back to the word's start in
   *  ALL difficulty modes (not just Standard/Purist) — the Sky-Island "sealed
   *  scroll" no-miss temple: one slip and the scroll reseals. Off by default. */
  resetOnMiss?: boolean;
  /** Fired on every mid-claim miss (a wrong character typed). The sealed-scroll
   *  temple uses it to flash the reseal. Independent of the controller's own
   *  difficulty-based miss handling. NOT fired when the miss is pardoned by a
   *  forgive-reset (see setForgiveResets) — onResetForgiven fires instead. */
  onMiss?: () => void;
  /** Fired instead of onMiss when a would-be cursor reset is PARDONED by a
   *  forgive-reset token (Tier 4 `unseal` — the Master Key reopening a resealed
   *  scroll). The typed progress is kept. */
  onResetForgiven?: () => void;
  /** Called when this target locks in to the typing controller (first matching
   *  letter typed). Use for character-facing reactions like Wren leaning toward
   *  the target. */
  onClaim?: (mods: { spell: boolean; alt: boolean }) => void;
  /** Called when a mid-claim target is released without completing — e.g. the
   *  player backspaced out of it. */
  onRelease?: () => void;
  /** Called after each correct character advances this target. Combat owners
   *  use this to make the body/banner react while typing is in progress. */
  onAdvance?: (cursor: number, wordLength: number) => void;
  /** Optional anchor sprite to flash/shake when the player misses. */
  anchor?: Phaser.GameObjects.GameObject & {
    setTint?: (tint: number) => void;
    clearTint?: () => void;
  };
  /** UI-cohesion pass: a dark legibility stroke around the glyphs so a word reads
   *  cleanly against busy painted art (TTT's outlined in-world words). Off by default. */
  outline?: boolean;
  /** UI-cohesion pass: draw a framed dark plate behind the word — used for choice
   *  "banners" so a fork reads as a pickable option, not bare floating text. */
  frame?: "banner";
}

/** Replace punctuation marks with a neutral placeholder for masked display. */
const WARD_MARK_PLACEHOLDER = "·";
function maskWardMarks(text: string): string {
  return text.replace(/[.,?!;:]/g, WARD_MARK_PLACEHOLDER);
}

/** Replace every non-space char with a faded placeholder — the Sky-Island
 *  lantern-beam "eats" the letters you haven't typed yet (read-ahead pressure).
 *  Spaces are kept so word breaks don't collapse. Display-only; matching is
 *  unaffected, so a player who read ahead can still type through the blur. */
const SUFFIX_EAT_PLACEHOLDER = "·";
export function maskSuffix(text: string): string {
  return text.replace(/[^ ]/g, SUFFIX_EAT_PLACEHOLDER);
}

const BANNER_TEXT_MAX_W = 520;
const BANNER_MIN_FONT_SIZE = 34;
const BANNER_PAD_X = 44;
const BANNER_PAD_Y = 22;

/** State for the Tier 4 forgive-reset (unseal) machine. `tokens` = pardons
 *  left; `pending` collapses the TWO resetCursor() calls a single miss triggers
 *  (the target's resetOnMiss path + the controller's difficulty path) into ONE
 *  token spend. Callers clear `pending` at the start of each miss. */
export interface ForgiveResetState {
  tokens: number;
  pending: boolean;
}

/** Pure decision for one resetCursor() call: pardon (keep progress) while a
 *  token is available or a pardon is already in flight this miss, else reset.
 *  Exported so the subtle double-call guard is unit-testable without Phaser. */
export function applyForgiveReset(s: ForgiveResetState): {
  didReset: boolean;
  next: ForgiveResetState;
} {
  if (s.tokens > 0 || s.pending) {
    if (!s.pending) {
      return { didReset: false, next: { tokens: s.tokens - 1, pending: true } };
    }
    return { didReset: false, next: { tokens: s.tokens, pending: true } };
  }
  return { didReset: true, next: s };
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
  private suffixMasked = false;
  private bannerW = 0;
  private bannerH = 0;
  // Tier 4 `unseal`: number of cursor-resets to PARDON (keep progress) before
  // the target resets for real. `resetForgivenPending` collapses the two
  // resetCursor() calls a single miss triggers (the target's own resetOnMiss +
  // the controller's difficulty reset) into ONE token spend.
  private forgiveResets = 0;
  private resetForgivenPending = false;

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
    if (opts.depth !== undefined) this.container.setDepth(opts.depth);

    // UI-cohesion: a dark stroke makes the word legible on busy painted art.
    if (opts.outline) {
      this.typedText.setStroke("#0b0a0f", 5);
      this.remainingText.setStroke("#0b0a0f", 5);
    }
    // UI-cohesion: a framed plate behind the word turns a fork into a clear,
    // pickable banner. Sized to the full word (measured at construction) and
    // inserted behind the glyphs so the cream text reads on the dark plate.
    if (opts.frame === "banner") {
      this.fitBannerText(fontSize);
      this.container.setSize(this.remainingText.width, this.remainingText.height);
      const w = this.remainingText.width + BANNER_PAD_X;
      const h = this.remainingText.height + BANNER_PAD_Y;
      this.bannerW = w;
      this.bannerH = h;
      const plate = opts.scene.add.graphics();
      plate.fillStyle(UI_HEX.panel, 0.85);
      plate.fillRoundedRect(-w / 2, -h / 2, w, h, 9);
      plate.lineStyle(2, UI_HEX.brass, 0.9);
      plate.strokeRoundedRect(-w / 2, -h / 2, w, h, 9);
      this.container.addAt(plate, 0);
    }

    this.relayout();
  }

  private fitBannerText(initialFontSize: number): void {
    for (
      let size = initialFontSize;
      size > BANNER_MIN_FONT_SIZE && this.remainingText.width > BANNER_TEXT_MAX_W;
      size -= 1
    ) {
      const nextSize = size - 1;
      this.typedText.setFontSize(nextSize);
      this.remainingText.setFontSize(nextSize);
    }
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
    this.opts.onAdvance?.(this.cursor, this.word.length);
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
  /** Tier 4 `unseal`: pardon the next `n` cursor-resets (keep typed progress)
   *  before the target resets for real. Used by the Sky sealed-scroll temple,
   *  fed from the grace pool. */
  setForgiveResets(n: number): void {
    this.forgiveResets = Math.max(0, n);
  }

  resetCursor(): void {
    if (this.cursor === 0) return;
    // A pardon spends ONE token per miss even though a miss can call this twice
    // (the target's resetOnMiss path + the controller's difficulty path).
    // `resetForgivenPending` (cleared at the top of miss()) lets the second call
    // skip free; with no token left, the reset proceeds for real. The decision
    // is the pure applyForgiveReset() so the guard is unit-tested.
    const { didReset, next } = applyForgiveReset({
      tokens: this.forgiveResets,
      pending: this.resetForgivenPending,
    });
    this.forgiveResets = next.tokens;
    this.resetForgivenPending = next.pending;
    if (!didReset) return;
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
    // Sealed-scroll no-miss: snap back to the start regardless of difficulty,
    // then let the scene flash the reseal — UNLESS a forgive-reset token pardons
    // this miss (Tier 4 `unseal`), in which case progress is kept and the gentle
    // onResetForgiven cue fires instead of the harsh reseal.
    this.resetForgivenPending = false;
    const pardoned =
      this.opts.resetOnMiss && this.cursor > 0 && this.forgiveResets > 0;
    if (this.opts.resetOnMiss) this.resetCursor();
    if (pardoned) {
      this.opts.onResetForgiven?.();
    } else {
      this.opts.onMiss?.();
    }
  }

  /** Mask/unmask the untyped suffix — the Sky-Island lantern-beam "eats" the
   *  letters you haven't typed yet. Display-only; matching is unaffected, so a
   *  player who read ahead can still type through the blur. */
  setSuffixMasked(masked: boolean): void {
    if (this.suffixMasked === masked) return;
    this.suffixMasked = masked;
    this.relayout();
  }

  onClaim(mods: { spell: boolean; alt: boolean }): void {
    this.dimmed = false;
    this.spellClaimed = mods.spell;
    this.altClaimed = mods.alt;
    this.playClaimPulse();
    this.playBannerWake(false);
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
    this.container.setScale(1);
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
    this.playBannerWake(true);

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

  /** Set the container alpha directly, bypassing the dimmed/hidden state. For
   *  owners that drive visual alpha externally on a per-frame basis (e.g.
   *  Sky-Island's lantern blur, where alpha is recomputed each tick from a
   *  proximity calculation). Caller is responsible for restoring alpha. */
  setVisualAlpha(alpha: number): void {
    this.container.setAlpha(alpha);
  }

  /** Short entrance motion for targets that are created by a room/surface
   *  state change. This keeps controls from popping on top of a painted scene
   *  while preserving immediate keyboard registration. */
  playEntryWake(opts: {
    delayMs?: number;
    durationMs?: number;
    offsetY?: number;
  } = {}): void {
    const delayMs = opts.delayMs ?? 0;
    const durationMs = opts.durationMs ?? 220;
    const offsetY = opts.offsetY ?? 12;
    const baseY = this.container.y;
    this.container.setAlpha(0);
    this.container.setY(baseY + offsetY);
    this.container.setScale(0.98);

    this.opts.scene.time.delayedCall(delayMs, () => {
      if (!this.container.scene) return;
      this.opts.scene.tweens.add({
        targets: this.container,
        alpha: 1,
        y: baseY,
        scaleX: 1,
        scaleY: 1,
        duration: durationMs,
        ease: "Sine.easeOut",
      });
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

  getAnchorX(): number {
    return this.container.x;
  }

  getAnchorY(): number {
    return this.container.y;
  }

  destroy(): void {
    this.container.destroy();
  }

  private playClaimPulse(): void {
    this.container.setScale(1.055);
    this.opts.scene.tweens.add({
      targets: this.container,
      scaleX: 1,
      scaleY: 1,
      duration: 180,
      ease: "Back.easeOut",
    });
  }

  private playBannerWake(stronger: boolean): void {
    if (this.opts.frame !== "banner" || this.bannerW <= 0 || this.bannerH <= 0) {
      return;
    }
    const wake = this.opts.scene.add.graphics().setAlpha(stronger ? 0.74 : 0.58);
    wake.lineStyle(2, UI_HEX.brass, stronger ? 0.72 : 0.52);
    wake.strokeRoundedRect(
      -this.bannerW / 2 - 4,
      -this.bannerH / 2 - 4,
      this.bannerW + 8,
      this.bannerH + 8,
      10,
    );
    wake.fillStyle(
      stronger ? UI_HEX.parchment : UI_HEX.brass,
      stronger ? 0.14 : 0.09,
    );
    wake.fillRoundedRect(
      -this.bannerW / 2 + 6,
      -this.bannerH / 2 + 5,
      this.bannerW - 12,
      5,
      3,
    );
    this.container.addAt(wake, 1);
    this.opts.scene.tweens.add({
      targets: wake,
      alpha: 0,
      scaleX: stronger ? 1.055 : 1.025,
      scaleY: stronger ? 1.12 : 1.07,
      duration: stronger ? 360 : 280,
      ease: "Sine.easeOut",
      onComplete: () => wake.destroy(),
    });
  }

  private relayout(): void {
    // Display uses the original case; matching uses the lowercased word.
    const typed = this.displayWord.slice(0, this.cursor);
    const remaining = this.displayWord.slice(this.cursor);
    // Typed text always shows real glyphs (so correctly-typed letters appear as
    // confirmation); only the UNtyped remainder is masked. suffixMasked (the
    // Sky-Island blur) eats the whole remainder and wins over maskMarks.
    this.typedText.setText(typed);
    const displayRemaining = this.suffixMasked
      ? maskSuffix(remaining)
      : this.opts.maskMarks
        ? maskWardMarks(remaining)
        : remaining;
    this.remainingText.setText(displayRemaining);
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
