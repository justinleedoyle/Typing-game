import { CHECKPOINT_REALMS, type SaveCheckpoint, type SaveState } from "./saveState";

/** Newly earned victories keep their short reunion available until the player
 * deliberately leaves it. Historical completed saves still open the library. */
export function titleHomecoming(state: Pick<SaveState, "typewriterAwakened" | "realms">): boolean {
  const battle = state.realms["great-battle"];
  return state.typewriterAwakened && battle?.cleared === true &&
    battle.choices.homecomingStarted === "yes" && battle.choices.homecomingCompleted !== "yes";
}

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
