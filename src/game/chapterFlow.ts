// Stable first-chapter checkpoints deliberately restart an encounter, never a
// half-typed word. Keep the routing rules independent of Phaser for regression QA.
export type ReadingAction = "continue" | "replay" | "pause" | "ignore";

export function readingAction(key: string, repeat = false): ReadingAction {
  if (key === "Escape") return "pause";
  if (repeat) return "ignore";
  if (key === "Enter" || key === " ") return "continue";
  if (key.toLowerCase() === "r") return "replay";
  return "ignore";
}

export function checkpointIndex(value: unknown, length: number): number {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.max(0, Math.min(length - 1, value))
    : 0;
}

export const OPENING_STEPS = [
  "arrival", "runa", "identity", "sibling", "name", "typewriter",
  "almanac", "portal-wakes", "portal-name", "farewell", "departure",
] as const;
export type OpeningStep = typeof OPENING_STEPS[number];
export function openingStep(value: string | undefined): OpeningStep {
  return OPENING_STEPS.includes(value as OpeningStep) ? value as OpeningStep : "arrival";
}

export const WINTER_STEPS = [
  "arrival", "trail", "heldur", "heldur-answer", "heldur-awake", "cold", "kindle",
  "wave", "fox", "fox-answer", "fork1", "huntress", "firefly", "boss", "boss-defeated",
  "fork2", "bury", "pelt", "fox-gate", "companion-answer", "true-name", "ending",
] as const;
export type WinterStep = typeof WINTER_STEPS[number];
export function winterStep(value: string | undefined): WinterStep {
  return WINTER_STEPS.includes(value as WinterStep) ? value as WinterStep : "arrival";
}

export interface WinterDecisions {
  fox: "spared" | "ignored" | null;
  fork1: "huntress" | "firefly" | null;
  fork2: "bury" | "pelt" | null;
}

/** A checkpoint may remember that a fork is upcoming, but must never create an
 * answer to it. The cloud conflict detector compares only committed choices. */
export function committedWinterChoices(
  previous: Readonly<Record<string, string>>,
  decisions: WinterDecisions,
): Record<string, string> {
  const choices = { ...previous };
  for (const key of ["fox", "fork1", "fork2"] as const) {
    const decision = decisions[key];
    if (decision === null) delete choices[key];
    else choices[key] = decision;
  }
  return choices;
}
