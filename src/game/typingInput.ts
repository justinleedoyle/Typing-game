// Prefix-match typing input — a target is claimed only once the typed prefix
// uniquely identifies it among all live targets.  This resolves conflicts when
// several targets share a first letter (e.g. "the winter mountain" vs
// "the almanac") without the player having to think about priorities.
//
// Backspace (or Escape) either releases a mid-word claim (resetting that
// target to its start) or trims the last character off the pre-claim buffer.

import type { SaveStore } from "./saveState";

export interface WordTarget {
  /** Lowercase characters yet to be typed. */
  remaining(): string;
  /** True when there are no more characters to type. */
  isComplete(): boolean;
  /** Advance the cursor by one matched character. */
  advance(): void;
  /** Called when the user types a wrong character mid-claim. */
  miss(): void;
  /** Called when this target is claimed. `spell` is true if the claim came in
   *  while a modifier (Shift) was held — the target can react visually and
   *  the controller will route completion to the spell variant. */
  onClaim(spell: boolean): void;
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

  constructor(private readonly store?: SaveStore) {}

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
  handleChar(char: string, mods?: { spell?: boolean }): boolean {
    // Backspace / Escape: undo last action.
    if (char === "Backspace" || char === "Escape") {
      if (this.claimed) {
        this.releaseClaim();
        this.typingBuffer = "";
        this.refreshCandidateDisplay();
        return true;
      }
      if (this.typingBuffer.length > 0) {
        this.typingBuffer = this.typingBuffer.slice(0, -1);
        this.refreshCandidateDisplay();
        return true;
      }
      return false;
    }

    const ch = normalize(char);
    if (!ch) return false;

    // ── Mid-claim: validate against the claimed target ───────────────────────
    if (this.claimed) {
      const expected = this.claimed.remaining()[0];
      if (ch === expected) {
        this.claimed.advance();
        this.store?.recordKeystroke(ch, true);
        if (this.claimed.isComplete()) {
          this.completeClaimed();
        }
        return true;
      }
      this.claimed.miss();
      this.store?.recordKeystroke(ch, false);
      return true;
    }

    // ── Pre-claim: extend the prefix buffer and check candidates ─────────────
    const newBuffer = this.typingBuffer + ch;
    const candidates = this.findCandidates(newBuffer);

    if (candidates.length === 0) {
      // No target starts with this prefix.
      this.store?.recordKeystroke(ch, false);
      return false;
    }

    // Record the char as correct — it narrowed the field.
    this.store?.recordKeystroke(ch, true);
    this.typingBuffer = newBuffer;

    if (candidates.length === 1) {
      // Unique match — claim it and fast-forward the cursor to buffer length.
      const target = pickBest(candidates);
      this.claimed = target;
      target.onClaim(mods?.spell === true);
      for (let i = 0; i < newBuffer.length; i++) {
        target.advance();
      }
      this.typingBuffer = "";
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

  private findCandidates(buffer: string): WordTarget[] {
    return this.targets.filter(
      (t) => !t.isComplete() && t.remaining().startsWith(buffer),
    );
  }

  private refreshCandidateDisplay(): void {
    const candidates =
      this.typingBuffer.length > 0 ? this.findCandidates(this.typingBuffer) : [];
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
