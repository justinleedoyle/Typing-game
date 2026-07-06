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
import { SERIF } from "./palette";
import type { Difficulty, SaveStore } from "./saveState";
import { cornerTicks, UI_CSS, UI_HEX } from "./ui/uiTheme";

const ORDER: readonly Difficulty[] = ["forgiving", "standard", "purist"];

const LABELS: Record<Difficulty, string> = {
  forgiving: "Forgiving",
  standard: "Standard",
  purist: "Purist",
};

interface SceneWithConsoleBand extends Phaser.Scene {
  band?: {
    showNotice(
      text: string,
      opts?: {
        label?: string;
        durationMs?: number;
      },
    ): void;
  };
}

/** Human-readable label for the Settings row and difficulty notices. */
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

interface TogglePuristModeOptions {
  announce?: boolean;
}

/** Cycle forgiving → standard → purist → … on the store, with an optional notice. */
export function togglePuristMode(
  scene: Phaser.Scene,
  store: SaveStore,
  opts: TogglePuristModeOptions = {},
): Difficulty {
  let next: Difficulty = "standard";
  store.update((s) => {
    const i = ORDER.indexOf(s.difficulty);
    next = ORDER[(i + 1) % ORDER.length];
    s.difficulty = next;
  });
  if (opts.announce !== false) {
    showDifficultyToast(scene, next);
  }
  return next;
}

function showDifficultyToast(scene: Phaser.Scene, tier: Difficulty): void {
  const band = (scene as SceneWithConsoleBand).band;
  if (typeof band?.showNotice === "function") {
    band.showNotice(`Difficulty set to ${LABELS[tier]}.`, {
      label: "difficulty",
      durationMs: 1800,
    });
    return;
  }

  const container = scene.add
    .container(scene.scale.width / 2, 92)
    .setScrollFactor(0)
    .setDepth(100)
    .setAlpha(0);
  const bg = scene.add.graphics();
  bg.fillStyle(UI_HEX.parchment, 0.94);
  bg.fillRoundedRect(-168, -27, 336, 54, 10);
  bg.lineStyle(2, UI_HEX.brass, 0.82);
  bg.strokeRoundedRect(-168, -27, 336, 54, 10);
  const ticks = cornerTicks(scene, 320, 42, { inset: 4, size: 8, width: 2 });
  const text = scene.add
    .text(0, 0, `Difficulty: ${LABELS[tier]}`, {
      fontFamily: SERIF,
      fontSize: "24px",
      color: tier === "forgiving" ? UI_CSS.ink : UI_CSS.ember,
      fontStyle: "italic",
    })
    .setOrigin(0.5);
  container.add([bg, ticks, text]);

  scene.tweens.add({
    targets: container,
    alpha: { from: 0, to: 1 },
    y: "-=6",
    duration: 200,
    yoyo: true,
    hold: 1100,
    ease: "Sine.easeInOut",
    onComplete: () => container.destroy(),
  });
}
