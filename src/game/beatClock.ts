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

/** ms around each beat in which input is accepted. Anything outside is offbeat. */
const DEFAULT_WINDOW_MS = 350;

interface BeatClockConfig {
  /** Tempo in ms between beats. Default 2000 (slow toll). */
  tempoMs?: number;
  /** Width of the "in window" gate around each beat. Default 350ms. */
  windowMs?: number;
  /** Fired on each beat. Use to drive visuals, spawn things on-beat. */
  onBeat?: () => void;
  /** Whether to play a bell-toll audio cue on each beat. Default true. */
  audio?: boolean;
}

export class BeatClock {
  private tempoMs: number;
  private readonly windowMs: number;
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
    this.tempoMs = config.tempoMs ?? 2000;
    this.windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;
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

  /** True if right now is within ±windowMs/2 of the last beat. The
   *  asymmetric "since last beat only" gate matches how players actually
   *  perceive rhythm — you commit just after the beat hits, not before it. */
  isInWindow(): boolean {
    if (!this.running) return true;
    const since = this.scene.time.now - this.lastBeatAt;
    return since <= this.windowMs;
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
