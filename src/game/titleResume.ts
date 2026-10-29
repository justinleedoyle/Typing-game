import { CHECKPOINT_REALMS, type SaveCheckpoint, type SaveState } from "./saveState";

/** Completed/reset progress always takes precedence over a chapter marker. */
export function titleCheckpoint(
  state: Pick<SaveState, "checkpoint" | "typewriterAwakened" | "realms">,
): SaveCheckpoint | null {
  const checkpoint = state.checkpoint;
  if (!checkpoint) return null;
  if (checkpoint.scene === "OpeningScene" && !state.typewriterAwakened) {
    return checkpoint;
  }
  if (checkpoint.scene !== "OpeningScene" && state.typewriterAwakened &&
    !state.realms[CHECKPOINT_REALMS[checkpoint.scene]]?.cleared) {
    return checkpoint;
  }
  return null;
}
