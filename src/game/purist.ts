// "Purist mode" — opt-in difficulty where typing a wrong letter on a
// claimed word resets the typing progress (the player has to retype the
// word from the start). Off by default since Aiden is the target player.
//
// Toggled in-game with Ctrl+Shift+P from any playing scene. The setting
// persists on the SaveStore, so it survives scene transitions and reloads.

import Phaser from "phaser";
import { PALETTE, SERIF } from "./palette";
import type { SaveStore } from "./saveState";

/** True if the given KeyboardEvent is the Ctrl+Shift+P shortcut. */
export function isPuristToggleKey(event: KeyboardEvent): boolean {
  if (!event.ctrlKey || !event.shiftKey) return false;
  // Shift+P → "P"; some browsers report event.key without the case shift.
  return event.key === "P" || event.key === "p";
}

/** Flip the purist flag in the store and show a brief on-screen confirmation. */
export function togglePuristMode(scene: Phaser.Scene, store: SaveStore): void {
  store.update((s) => {
    s.purist = !s.purist;
  });
  showPuristToast(scene, store.get().purist);
}

function showPuristToast(scene: Phaser.Scene, isOn: boolean): void {
  const text = scene.add
    .text(
      scene.scale.width / 2,
      140,
      `Purist mode: ${isOn ? "ON" : "OFF"}`,
      {
        fontFamily: SERIF,
        fontSize: "28px",
        color: isOn ? PALETTE.ember : PALETTE.cream,
        fontStyle: "italic",
      },
    )
    .setOrigin(0.5)
    .setDepth(100)
    .setAlpha(0);

  scene.tweens.add({
    targets: text,
    alpha: { from: 0, to: 1 },
    duration: 200,
    yoyo: true,
    hold: 1100,
    ease: "Sine.easeInOut",
    onComplete: () => text.destroy(),
  });
}
