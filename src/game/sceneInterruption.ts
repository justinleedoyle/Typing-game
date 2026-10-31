import type Phaser from "phaser";

const installed = new WeakMap<Phaser.Scene, () => void>();

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
