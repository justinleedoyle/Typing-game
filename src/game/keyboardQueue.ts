import type Phaser from "phaser";

interface DrainedKeyboard {
  target: EventTarget;
  // Phaser 3.90 exposes this existing method at runtime but omits it from its
  // declarations. Keep the version-dependent boundary here; never replace the
  // manager emitter or scene dispatcher. Real-source tests guard the contract.
  postUpdate(): void;
}
const installed = new WeakMap<Phaser.Game, () => void>();

/** Phaser dispatches its accumulated keyboard queue immediately for every DOM
 * event, but normally clears it only at POST_STEP. Two keys before a frame can
 * therefore replay older keys. Drain after the complete synchronous dispatch,
 * so every active scene still sees the current event in the original order. */
export function installKeyboardQueueDrain(game: Phaser.Game): () => void {
  const existing = installed.get(game);
  if (existing) return existing;
  let disposed = false;
  let keyboard: DrainedKeyboard | undefined;
  const drain = (): void => { if (!disposed) keyboard?.postUpdate(); };
  const fallback = (): void => {
    // Another DOM consumer can stop native propagation before the tail
    // listener. A microtask is outside Phaser's synchronous scene dispatch;
    // it can never clear the queue halfway through that dispatch.
    queueMicrotask(drain);
  };
  const attach = (): void => {
    if (disposed || keyboard) return;
    const manager = game.input.keyboard as unknown as DrainedKeyboard | null;
    if (!manager?.target) return; // Keyboard input can intentionally be disabled.
    if (typeof manager.postUpdate !== "function") {
      throw new Error("The game's keyboard event handling could not start.");
    }
    keyboard = manager;
    for (const name of ["keydown", "keyup"]) {
      manager.target.addEventListener(name, fallback, true);
      // READY follows manager boot/startListeners, so this listener follows
      // Phaser's native handler and all of its synchronous scene callbacks.
      manager.target.addEventListener(name, drain, false);
    }
  };
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    game.events.off("ready", attach);
    game.events.off("destroy", dispose);
    if (keyboard) for (const name of ["keydown", "keyup"]) {
      keyboard.target.removeEventListener(name, fallback, true);
      keyboard.target.removeEventListener(name, drain, false);
    }
    installed.delete(game);
  };
  installed.set(game, dispose);
  game.events.once("destroy", dispose);
  if (game.isRunning) attach();
  else game.events.once("ready", attach);
  return dispose;
}
