// A configurable beat clock for rhythm-shaped scenes (Sunken Bell first,
// possibly other realms later). Owns a Phaser timer that fires onBeat at
// the configured tempo, exposes an "in window" state that gates input, and
// drives optional audio + visual cues so the player sees and hears the
// beat before they're expected to type on it.
//
// Tempo is mutable mid-encounter — Phase 2 of the Bell-Warden boss
// halves it from 2000ms to 1000ms by calling setTempo(1000).
//
// The clock is silent until start() is called, so the scene can build it
// in create() and trigger it only when the bell-tender activates rhythm.

import Phaser from "phaser";
import { playBellToll } from "../audio/bellToll";
import { isOffBeat, isOnBeat, windowMsFor } from "./beatGate";

const DEFAULT_TEMPO_MS = 2000;
/** ms around each beat in which input is accepted at the DEFAULT tempo. */
const DEFAULT_WINDOW_MS = 350;
/** Window as a fraction of the beat, so a faster tempo tightens the gate.
 *  350/2000 keeps the slow-toll window identical to the old fixed constant. */
const DEFAULT_WINDOW_FRACTION = DEFAULT_WINDOW_MS / DEFAULT_TEMPO_MS;

interface BeatClockConfig {
  /** Tempo in ms between beats. Default 2000 (slow toll). */
  tempoMs?: number;
  /** Pin an ABSOLUTE window width (ms). Overrides windowFraction — the gate is
   *  then NOT tempo-scaled. Omit to get the tempo-scaled default. */
  windowMs?: number;
  /** Window as a fraction of tempo (ignored if windowMs is set). Default 0.175
   *  → 350ms at the 2000ms toll, 175ms when Phase 2 halves tempo to 1000ms. */
  windowFraction?: number;
  /** Fired on each beat. Use to drive visuals, spawn things on-beat. */
  onBeat?: () => void;
  /** Whether to play a bell-toll audio cue on each beat. Default true. */
  audio?: boolean;
}

export class BeatClock {
  private tempoMs: number;
  /** Absolute window override (ms); undefined ⇒ tempo-scaled. */
  private readonly fixedWindowMs?: number;
  private readonly windowFraction: number;
  private readonly onBeat?: () => void;
  private readonly audio: boolean;
  private timer: Phaser.Time.TimerEvent | null = null;
  private lastBeatAt = 0;
  private running = false;

  private readonly oneShotListeners: Array<() => void> = [];

  constructor(
    private readonly scene: Phaser.Scene,
    config: BeatClockConfig = {},
  ) {
    this.tempoMs = config.tempoMs ?? DEFAULT_TEMPO_MS;
    this.fixedWindowMs = config.windowMs;
    this.windowFraction = config.windowFraction ?? DEFAULT_WINDOW_FRACTION;
    this.onBeat = config.onBeat;
    this.audio = config.audio ?? true;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stop());
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.stop());
  }

  /** Fire `cb` once, on the next beat. Use to spawn the next thing
   *  precisely on a toll (Phase 3 of the Bell-Warden — one word per beat). */
  onNextBeat(cb: () => void): void {
    this.oneShotListeners.push(cb);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // Fire one beat immediately so the player gets an audio + visual anchor
    // before the first prompt instead of waiting a full tempoMs.
    this.fire();
    this.scheduleNext();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.timer?.remove();
    this.timer = null;
  }

  /** Change tempo mid-flight. Reschedules the next beat from now. */
  setTempo(ms: number): void {
    this.tempoMs = ms;
    if (this.running) {
      this.timer?.remove();
      this.scheduleNext();
    }
  }

  getTempo(): number {
    return this.tempoMs;
  }

  /** Current accept-window width in ms — tempo-scaled unless pinned via the
   *  windowMs config. Exposed for the HUD and tests. */
  getWindowMs(): number {
    return windowMsFor(this.tempoMs, this.fixedWindowMs, this.windowFraction);
  }

  /** True if right now is within the on-beat window after the last toll. The
   *  asymmetric "since last beat only" gate matches how players actually
   *  perceive rhythm — you commit just after the beat hits, not before it. */
  isInWindow(): boolean {
    if (!this.running) return true;
    const since = this.scene.time.now - this.lastBeatAt;
    return isOnBeat(since, this.getWindowMs());
  }

  /** True if right now is within the OFF-beat ("antiphon") window — the answer
   *  the choir sings between the tolls. Centered on the half-beat. Returns true
   *  when the clock isn't running (mirrors isInWindow, so free passages flow).
   *  Used for the antiphon (off-beat) enemy encounter. */
  isInOffbeatWindow(): boolean {
    if (!this.running) return true;
    const since = this.scene.time.now - this.lastBeatAt;
    return isOffBeat(since, this.tempoMs, this.getWindowMs());
  }

  private scheduleNext(): void {
    this.timer = this.scene.time.delayedCall(this.tempoMs, () => {
      if (!this.running) return;
      this.fire();
      this.scheduleNext();
    });
  }

  private fire(): void {
    this.lastBeatAt = this.scene.time.now;
    if (this.audio) playBellToll();
    this.onBeat?.();
    if (this.oneShotListeners.length > 0) {
      const listeners = this.oneShotListeners.splice(0);
      for (const cb of listeners) cb();
    }
  }
}
