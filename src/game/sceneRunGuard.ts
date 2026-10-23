/** Identifies one activation of a reusable scene. Async work and one-shot
 *  listeners from an earlier visit must never act on a later visit. */
export class SceneRunGuard {
  private generation = 0;
  private active = false;
  private claimed = new Set<string>();

  begin(): number {
    this.generation += 1;
    this.active = true;
    this.claimed.clear();
    return this.generation;
  }

  end(): void {
    this.active = false;
    this.claimed.clear();
  }

  token(): number {
    return this.generation;
  }

  isCurrent(token: number): boolean {
    return this.active && token === this.generation;
  }

  has(key: string): boolean {
    return this.active && this.claimed.has(key);
  }

  release(key: string): void {
    this.claimed.delete(key);
  }

  /** Reserve an action once during this visit, such as starting or credits. */
  once(key: string): boolean {
    if (!this.active || this.claimed.has(key)) return false;
    this.claimed.add(key);
    return true;
  }
}
