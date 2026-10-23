import type { SaveCheckpoint, SaveState } from "./saveState";

/** Completed/reset progress always takes precedence over a chapter marker. */
export function titleCheckpoint(
  state: Pick<SaveState, "checkpoint" | "typewriterAwakened" | "realms">,
): SaveCheckpoint | null {
  const checkpoint = state.checkpoint;
  if (!checkpoint) return null;
  if (checkpoint.scene === "OpeningScene" && !state.typewriterAwakened) {
    return checkpoint;
  }
  if (checkpoint.scene === "WinterMountainScene" && state.typewriterAwakened &&
    !state.realms["winter-mountain"]?.cleared) {
    return checkpoint;
  }
  return null;
}
