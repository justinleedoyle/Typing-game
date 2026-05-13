// First-letter-lock typing input, in the lineage of Z-Type and Touch Type Tale.
//
// The controller holds a list of WordTargets. The first matching keystroke
// "claims" a target — every other target dims and stops accepting input until
// the claim is released (by completion or cancellation). This keeps the
// player's intent unambiguous when several typeable words are on screen.

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
  /** Called when this target is claimed. */
  onClaim(): void;
  /** Called when this target is released (canceled or completed). */
  onRelease(): void;
  /** Called once on completion, after the final advance(). */
  onComplete(): void;
  /** Called when the controller wants to dim/un-dim non-claimed targets. */
  setDimmed(dimmed: boolean): void;
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
  }

  /**
   * Process a single typed character. Returns true if it was consumed by
   * a target (right or wrong); false if no target was eligible (e.g. no
   * target starts with this letter and nothing is currently claimed).
   */
  handleChar(char: string): boolean {
    const ch = normalize(char);
    if (!ch) return false;

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

    const candidate = this.pickCandidate(ch);
    if (!candidate) {
      // No claim, no matching first-letter — count as a miss against the
      // typed letter so the diagnostic still picks up wandering hands.
      this.store?.recordKeystroke(ch, false);
      return false;
    }

    this.claimed = candidate;
    candidate.onClaim();
    candidate.advance();
    this.dimOthers(true);
    this.store?.recordKeystroke(ch, true);
    if (candidate.isComplete()) {
      this.completeClaimed();
    }
    return true;
  }

  /**
   * Among all targets whose next character matches `ch`, pick the one with
   * the highest `priority` (default 0). Ties break by registration order
   * (earlier wins), so scenes can express "this gameplay target should beat
   * the always-on Almanac target" without ordering ceremony.
   */
  private pickCandidate(ch: string): WordTarget | undefined {
    let best: WordTarget | undefined;
    let bestPriority = -Infinity;
    for (const t of this.targets) {
      if (t.isComplete()) continue;
      if (t.remaining()[0] !== ch) continue;
      const p = t.priority ?? 0;
      if (p > bestPriority) {
        best = t;
        bestPriority = p;
      }
    }
    return best;
  }

  private completeClaimed(): void {
    if (!this.claimed) return;
    const completed = this.claimed;
    this.claimed = null;
    this.dimOthers(false);
    // Remove from the live target list before firing onComplete so the
    // callback (which often registers new targets) sees a clean slate.
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

function normalize(char: string): string | null {
  // Phaser hands us KeyboardEvent.key. We accept printable single chars and
  // a literal space; everything else (Shift, Enter, F-keys, etc.) is ignored.
  if (char === " ") return " ";
  if (char.length !== 1) return null;
  const code = char.charCodeAt(0);
  if (code < 0x20 || code > 0x7e) return null;
  return char.toLowerCase();
}
