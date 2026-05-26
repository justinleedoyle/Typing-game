// Rolling typing telemetry that drives the Heart/Soul HUD.
//
// Heart is the rolling accuracy over the last HEART_WINDOW keystrokes —
// every press counts, hits raise it, misses pull it down. It starts at 100
// (clean slate) and the window means a long stretch of clean typing brings
// it back up after a rough patch.
//
// Soul is normalized CPM over the last SOUL_WINDOW_MS of *correct* presses —
// it tracks how fast the player is actually advancing the words. It starts
// at 0 (cold engine), climbs as typing flows, and decays when typing pauses
// because old samples fall outside the window.

const HEART_WINDOW = 50;
const SOUL_WINDOW_MS = 10_000;
const SOUL_FLOOR_CPM = 30;
const SOUL_CEIL_CPM = 90;

interface KeystrokeRecord {
  hit: boolean;
  t: number;
}

export class SessionStats {
  private history: KeystrokeRecord[] = [];

  record(hit: boolean): void {
    this.history.push({ hit, t: performance.now() });
    const cap = HEART_WINDOW * 4;
    if (this.history.length > cap) {
      this.history.splice(0, this.history.length - cap);
    }
  }

  reset(): void {
    this.history = [];
  }

  getHeart(): number {
    if (this.history.length === 0) return 100;
    const recent = this.history.slice(-HEART_WINDOW);
    const hits = recent.reduce((n, r) => n + (r.hit ? 1 : 0), 0);
    return Math.round((hits / recent.length) * 100);
  }

  getSoul(): number {
    if (this.history.length === 0) return 0;
    const now = performance.now();
    const recent = this.history.filter(
      (r) => r.hit && now - r.t < SOUL_WINDOW_MS,
    );
    if (recent.length < 2) return 0;
    const span = Math.max(now - recent[0].t, 1_000);
    const cpm = (recent.length / span) * 60_000;
    const normalized =
      (cpm - SOUL_FLOOR_CPM) / (SOUL_CEIL_CPM - SOUL_FLOOR_CPM);
    return Math.max(0, Math.min(100, Math.round(normalized * 100)));
  }
}
