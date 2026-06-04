// Prefix-match typing input — a target is claimed only once the typed prefix
// uniquely identifies it among all live targets.  This resolves conflicts when
// several targets share a first letter (e.g. "the winter mountain" vs
// "the almanac") without the player having to think about priorities.
//
// Backspace reverses one character mid-claim (the target stays claimed; only
// the typed prefix shrinks). If you backspace past the start of the claimed
// word, the target releases entirely and you're back to free buffer typing.
// Escape always releases the claim entirely (panic abort).

import { missReleasesClaim, missResetsProgress } from "./purist";
import type { SaveStore } from "./saveState";
import { SessionStats } from "./sessionStats";

export interface ClaimMods {
  /** Shift was held when the first letter of this claim landed. */
  spell: boolean;
  /** Alt was held when the first letter of this claim landed. Alt has
   *  priority over Shift in the completion routing. */
  alt: boolean;
}

export interface WordTarget {
  /** Lowercase characters yet to be typed. */
  remaining(): string;
  /** Case-preserved characters yet to be typed. Optional — only required
   *  when the target opts into case-sensitive matching via caseSensitive().
   *  Targets that don't implement this method are matched case-insensitively. */
  rawRemaining?(): string;
  /** True if this target enforces case in matching. When true, the controller
   *  compares raw (case-preserved) keystrokes against rawRemaining()[0] both
   *  for pre-claim prefix narrowing and mid-claim advancement. Default false —
   *  targets that don't implement this method behave case-insensitively. */
  caseSensitive?(): boolean;
  /** True when there are no more characters to type. */
  isComplete(): boolean;
  /** Advance the cursor by one matched character. */
  advance(): void;
  /** Reverse the cursor by one matched character. Returns true on success;
   *  false if the cursor is already at the word's start (caller should
   *  release the claim entirely). */
  reverse?(): boolean;
  /** Snap the cursor back to the word's start (no-op if already there).
   *  Used by purist mode — wipes typing progress without releasing the
   *  claim. */
  resetCursor?(): void;
  /** Called when the user types a wrong character mid-claim. */
  miss(): void;
  /** Called when this target is claimed. `mods.spell` is true if Shift was
   *  held; `mods.alt` is true if Alt was held. Targets can react visually
   *  and the controller routes completion to the matching variant
   *  (onSpellComplete / onAltSpellComplete / onComplete). Alt has priority
   *  over Shift when both are held — Alt is the "wild" variant. */
  onClaim(mods: ClaimMods): void;
  /** Called when this target is released (canceled or completed). */
  onRelease(): void;
  /** Called once on completion, after the final advance(). */
  onComplete(): void;
  /** Called when the controller wants to dim/un-dim non-claimed targets. */
  setDimmed(dimmed: boolean): void;
  /**
   * Called to indicate whether this target is a live candidate for the current
   * typed prefix (true) or has been ruled out (false). Optional — targets that
   * don't implement it fall back to the standard dim/undim behaviour.
   */
  setCandidate?(candidate: boolean): void;
  /**
   * Tiebreaker when two targets share a first letter. Higher wins. Default
   * 0; chrome/UI targets (the almanac, settings, etc.) should sit below
   * gameplay targets (a wolf, a portal, a choice).
   */
  priority?: number;
}

export class TypingInputController {
  private targets: WordTarget[] = [];
  private claimed: WordTarget | null = null;
  private typingBuffer = "";
  /** Parallel to typingBuffer but case-preserved. Used to narrow against
   *  case-sensitive targets via rawRemaining(). Always kept in sync with
   *  typingBuffer length. */
  private rawTypingBuffer = "";
  private onCorrectChar?: () => void;
  private onMissChar?: () => void;
  private onClaimChar?: (spell: boolean) => void;
  private readonly stats = new SessionStats();

  constructor(private readonly store?: SaveStore) {}

  /** Rolling Heart/Soul telemetry, ticked on every keystroke regardless of
   *  scene-level hooks. Scenes read this each frame to drive the HUD. */
  getStats(): SessionStats {
    return this.stats;
  }

  /** Wire per-keystroke feedback hooks.
   *  - `onCorrect` fires for every keystroke that lands a matching character
   *    (mid-claim or pre-claim narrowing).
   *  - `onMiss` fires for every keystroke that does not.
   *  - `onClaim` fires once when the prefix uniquely identifies a target and
   *    the controller locks onto it. Use for the "lock-on" sting. */
  setKeystrokeHooks(hooks: {
    onCorrect?: () => void;
    onMiss?: () => void;
    onClaim?: (spell: boolean) => void;
  }): void {
    this.onCorrectChar = hooks.onCorrect;
    this.onMissChar = hooks.onMiss;
    this.onClaimChar = hooks.onClaim;
  }

  register(target: WordTarget): void {
    this.targets.push(target);
  }

  unregister(target: WordTarget): void {
    const i = this.targets.indexOf(target);
    if (i >= 0) this.targets.splice(i, 1);
    if (this.claimed === target) this.releaseClaim();
  }

  /** Drop every registered target. Call on scene shutdown. */
  reset(): void {
    this.releaseClaim();
    this.targets = [];
    this.typingBuffer = "";
    this.rawTypingBuffer = "";
    this.stats.reset();
  }

  /** True when a target is currently claimed (prefix matched, mid-word). */
  hasClaim(): boolean {
    return this.claimed !== null;
  }

  /** Current unconfirmed typed prefix (before a target is claimed). */
  getTypingBuffer(): string {
    return this.typingBuffer;
  }

  /**
   * Process a single key from the keyboard. Handles printable characters,
   * space, Backspace, and Escape. Returns true if consumed.
   */
  handleChar(char: string, mods?: { spell?: boolean; alt?: boolean }): boolean {
    // Backspace: reverse one character if mid-claim; otherwise trim the
    // pre-claim buffer. Falls through to a full release only when the
    // claimed target is already at its start.
    if (char === "Backspace") {
      if (this.claimed) {
        if (this.claimed.reverse?.()) {
          return true;
        }
        // At the start of the claimed word — release entirely.
        this.releaseClaim();
        this.typingBuffer = "";
        this.rawTypingBuffer = "";
        this.refreshCandidateDisplay();
        return true;
      }
      if (this.typingBuffer.length > 0) {
        this.typingBuffer = this.typingBuffer.slice(0, -1);
        this.rawTypingBuffer = this.rawTypingBuffer.slice(0, -1);
        this.refreshCandidateDisplay();
        return true;
      }
      return false;
    }

    // Escape: panic abort — always release claim and clear buffer.
    if (char === "Escape") {
      if (this.claimed) {
        this.releaseClaim();
        this.typingBuffer = "";
        this.rawTypingBuffer = "";
        this.refreshCandidateDisplay();
        return true;
      }
      if (this.typingBuffer.length > 0) {
        this.typingBuffer = "";
        this.rawTypingBuffer = "";
        this.refreshCandidateDisplay();
        return true;
      }
      return false;
    }

    const ch = normalize(char);
    if (!ch) return false;

    // ── Mid-claim: validate against the claimed target ───────────────────────
    if (this.claimed) {
      // Case-sensitive targets compare the RAW keystroke against the raw
      // expected char (preserves case). Non-case-sensitive targets compare
      // the lowercased forms (existing behavior; default for all targets
      // that don't opt in).
      const isCaseSensitive =
        this.claimed.caseSensitive?.() === true && !!this.claimed.rawRemaining;
      const expected = isCaseSensitive
        ? this.claimed.rawRemaining!()[0]
        : this.claimed.remaining()[0];
      const inputChar = isCaseSensitive ? char : ch;

      if (inputChar === expected) {
        this.claimed.advance();
        this.store?.recordKeystroke(ch, true);
        this.stats.record(true);
        this.onCorrectChar?.();
        if (this.claimed.isComplete()) {
          this.completeClaimed();
        }
        return true;
      }
      this.claimed.miss();
      this.store?.recordKeystroke(ch, false);
      this.stats.record(false);
      this.onMissChar?.();
      // Difficulty: standard+ wipes the word's typed progress; purist also
      // drops the claim, so the enemy keeps coming and you must re-acquire it.
      if (this.store && missResetsProgress(this.store)) {
        this.claimed.resetCursor?.();
        if (missReleasesClaim(this.store)) {
          this.releaseClaim();
          this.typingBuffer = "";
          this.rawTypingBuffer = "";
          this.refreshCandidateDisplay();
        }
      }
      return true;
    }

    // ── Pre-claim: extend the prefix buffer and check candidates ─────────────
    const newBuffer = this.typingBuffer + ch;
    const newRawBuffer = this.rawTypingBuffer + char;
    const candidates = this.findCandidates(newBuffer, newRawBuffer);

    if (candidates.length === 0) {
      // No target starts with this prefix.
      this.store?.recordKeystroke(ch, false);
      this.stats.record(false);
      this.onMissChar?.();
      return false;
    }

    // Record the char as correct — it narrowed the field.
    this.store?.recordKeystroke(ch, true);
    this.stats.record(true);
    this.onCorrectChar?.();
    this.typingBuffer = newBuffer;
    this.rawTypingBuffer = newRawBuffer;

    if (candidates.length === 1) {
      // Unique match — claim it and fast-forward the cursor to buffer length.
      const target = pickBest(candidates);
      const claimMods: ClaimMods = {
        spell: mods?.spell === true,
        alt: mods?.alt === true,
      };
      this.claimed = target;
      target.onClaim(claimMods);
      // The onClaim hook only fires when a spell-variant lock-on happens —
      // the audio sting cue. Alt also counts here so the spark zap can
      // play on Alt-claims too.
      this.onClaimChar?.(claimMods.spell || claimMods.alt);
      for (let i = 0; i < newBuffer.length; i++) {
        target.advance();
      }
      this.typingBuffer = "";
      this.rawTypingBuffer = "";
      for (const t of this.targets) t.setCandidate?.(false);
      this.dimOthers(true);
      if (target.isComplete()) {
        this.completeClaimed();
      }
      return true;
    }

    // Multiple candidates still — update the highlighting.
    this.refreshCandidateDisplay();
    return true;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /** Narrow the live targets to those whose remaining string starts with
   *  the current buffer. Case-sensitive targets are matched against the
   *  raw (case-preserved) buffer; all others use the normalized buffer. */
  private findCandidates(
    normBuffer: string,
    rawBuffer: string,
  ): WordTarget[] {
    return this.targets.filter((t) => {
      if (t.isComplete()) return false;
      if (t.caseSensitive?.() === true && t.rawRemaining) {
        return t.rawRemaining().startsWith(rawBuffer);
      }
      return t.remaining().startsWith(normBuffer);
    });
  }

  private refreshCandidateDisplay(): void {
    const candidates =
      this.typingBuffer.length > 0
        ? this.findCandidates(this.typingBuffer, this.rawTypingBuffer)
        : [];
    for (const t of this.targets) {
      if (t.isComplete() || t === this.claimed) continue;
      const isCandidate = candidates.includes(t);
      t.setCandidate?.(isCandidate);
      t.setDimmed(this.typingBuffer.length > 0 && !isCandidate);
    }
  }

  private completeClaimed(): void {
    if (!this.claimed) return;
    const completed = this.claimed;
    this.claimed = null;
    this.dimOthers(false);
    this.unregister(completed);
    completed.onComplete();
  }

  private releaseClaim(): void {
    if (!this.claimed) return;
    const released = this.claimed;
    this.claimed = null;
    released.onRelease();
    this.dimOthers(false);
  }

  private dimOthers(dim: boolean): void {
    for (const t of this.targets) {
      if (t !== this.claimed) t.setDimmed(dim);
    }
  }
}

function pickBest(candidates: WordTarget[]): WordTarget {
  return candidates.reduce((best, t) => {
    const p = t.priority ?? 0;
    const bp = best.priority ?? 0;
    return p > bp ? t : best;
  });
}

function normalize(char: string): string | null {
  if (char === " ") return " ";
  if (char.length !== 1) return null;
  const code = char.charCodeAt(0);
  if (code < 0x20 || code > 0x7e) return null;
  return char.toLowerCase();
}
