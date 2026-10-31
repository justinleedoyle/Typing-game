import type Phaser from "phaser";

const installed = new WeakMap<Phaser.Scene, () => void>();
const interruptions = new WeakMap<Phaser.Game, { pending: boolean; dispose: () => void }>();

/** Install before scenes boot: artwork and save promises can settle while no
 * chapter menu exists. Focus/visibility returning never acknowledges a pause. */
export function installGameInterruptionTracker(game: Phaser.Game): () => void {
  const existing = interruptions.get(game);
  if (existing) return existing.dispose;
  let disposed = false;
  const state = { pending: typeof document !== "undefined" && document.hidden, dispose: () => {} };
  const interrupt = (): void => { state.pending = true; };
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    game.events.off("blur", interrupt);
    game.events.off("hidden", interrupt);
    game.events.off("destroy", dispose);
    interruptions.delete(game);
  };
  state.dispose = dispose;
  game.events.on("blur", interrupt);
  game.events.on("hidden", interrupt);
  game.events.once("destroy", dispose);
  interruptions.set(game, state);
  return dispose;
}

/** Game.hasFocus starts false even in a focused window; the loop starts true
 * and changes on actual blur. Also consult current visibility for boot in an
 * already-hidden tab that never received a visibility event. */
export function needsInterruptionPause(game: Phaser.Game): boolean {
  return interruptions.get(game)?.pending === true ||
    (typeof document !== "undefined" && document.hidden) || game.loop?.inFocus === false;
}

/** Acknowledge at the deliberate action, before any asynchronous save. A later
 * interruption must remain pending for the scene that eventually opens. */
export function acknowledgeGameInterruption(game: Phaser.Game): void {
  const state = interruptions.get(game);
  if (state) state.pending = false;
}

/** Scene timers stop during pause, but Phaser's TweenManager samples Date.now.
 * Exclude the same paused interval from its documented wall-clock anchors so
 * enemies and handoffs retain their remaining active time when play resumes.
 * Keep the installed tween algorithm, lag smoothing and per-tween pause state. */
export function installTweenPauseClock(scene: Phaser.Scene): () => void {
  const existing = installed.get(scene);
  if (existing) return existing;
  let pausedAt: number | null = null;
  let disposed = false;
  const pause = (): void => { pausedAt ??= Date.now(); };
  const resume = (): void => {
    if (pausedAt === null) return;
    const elapsed = Date.now() - pausedAt;
    pausedAt = null;
    scene.tweens.startTime += elapsed;
    scene.tweens.prevTime += elapsed;
  };
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    pausedAt = null;
    scene.events.off("pause", pause);
    scene.events.off("resume", resume);
    scene.events.off("shutdown", dispose);
    scene.events.off("destroy", dispose);
    installed.delete(scene);
  };
  scene.events.on("pause", pause);
  scene.events.on("resume", resume);
  scene.events.once("shutdown", dispose);
  scene.events.once("destroy", dispose);
  installed.set(scene, dispose);
  return dispose;
}
