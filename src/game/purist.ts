// Difficulty tiers — how harshly a mid-word typo is punished — plus the
// Ctrl+Shift+P shortcut and the helpers that read the player's chosen tier.
//
//   forgiving — a wrong key is free; the next correct key just advances.
//   standard  — (default) a wrong key resets the current word's typed
//               progress; you retype it, but the target stays claimed.
//   purist    — progress resets AND the claim drops, so the enemy keeps
//               coming and you must re-acquire the word under pressure.
//
// Cycled in-game with Ctrl+Shift+P from any playing scene, and set in the
// Settings menu. The tier persists on the SaveStore.

import Phaser from "phaser";
import { PALETTE, SERIF } from "./palette";
import type { Difficulty, SaveStore } from "./saveState";

const ORDER: readonly Difficulty[] = ["forgiving", "standard", "purist"];

const LABELS: Record<Difficulty, string> = {
  forgiving: "Forgiving",
  standard: "Standard",
  purist: "Purist",
};

/** Human-readable label for the Settings row + toast. */
export function difficultyLabel(tier: Difficulty): string {
  return LABELS[tier];
}

/** True if a mid-word typo should reset the current word's typed progress
 *  (standard + purist). Forgiving leaves progress untouched. */
export function missResetsProgress(store: SaveStore): boolean {
  return store.get().difficulty !== "forgiving";
}

/** True if a mid-word typo should also drop the claim, forcing the player to
 *  re-acquire the word while the enemy keeps advancing (purist only). */
export function missReleasesClaim(store: SaveStore): boolean {
  return store.get().difficulty === "purist";
}

/** True if the given KeyboardEvent is the Ctrl+Shift+P shortcut. */
export function isPuristToggleKey(event: KeyboardEvent): boolean {
  if (!event.ctrlKey || !event.shiftKey) return false;
  // Shift+P → "P"; some browsers report event.key without the case shift.
  return event.key === "P" || event.key === "p";
}

/** Cycle forgiving → standard → purist → … on the store, with a brief toast. */
export function togglePuristMode(scene: Phaser.Scene, store: SaveStore): void {
  let next: Difficulty = "standard";
  store.update((s) => {
    const i = ORDER.indexOf(s.difficulty);
    next = ORDER[(i + 1) % ORDER.length];
    s.difficulty = next;
  });
  showDifficultyToast(scene, next);
}

function showDifficultyToast(scene: Phaser.Scene, tier: Difficulty): void {
  const text = scene.add
    .text(scene.scale.width / 2, 140, `Difficulty: ${LABELS[tier]}`, {
      fontFamily: SERIF,
      fontSize: "28px",
      color: tier === "forgiving" ? PALETTE.cream : PALETTE.ember,
      fontStyle: "italic",
    })
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
