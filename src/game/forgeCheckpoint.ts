// Stable Forge boundaries restart the current encounter or phrase. Typed
// characters and moving golem positions deliberately are not checkpoint data.
export const FORGE_STEPS = [
  "arrival", "catwalk", "catwalk-answer", "gregor", "gregor-lesson",
  "tutorial-move", "tutorial-move-answer", "tutorial-command", "tutorial-command-answer",
  "tutorial-fight", "act2", "wave1", "forn-encounter", "wave2", "fork1",
  "forn", "cabal", "fork1-reward", "boss-intro", "boss1", "boss2", "boss3",
  "boss-defeated", "fork2", "peaceful", "peaceful-answer", "fight", "fight-answer",
  "fork2-reward", "companion-gate", "companion-answer", "true-name-intro", "true-name", "ending",
] as const;

export type ForgeStep = typeof FORGE_STEPS[number];

export function forgeStep(value: string | undefined): ForgeStep {
  return FORGE_STEPS.includes(value as ForgeStep) ? value as ForgeStep : "arrival";
}

/** Passage completion may be saved before its callback/timer runs. Length is
 * a real boundary here, so a reload must finish rather than repeat the phrase. */
export function forgePassageIndex(value: unknown, length: number): number {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.max(0, Math.min(length, value)) : 0;
}
