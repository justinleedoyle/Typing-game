/** Stable Bell boundaries contain only scalar progress, never display objects. */
export const BELL_STEPS = [
  "arrival", "descent", "olin", "olin-taught", "practice", "practice-done",
  "choir", "choir-cleared", "chamber", "chamber-read", "fork1", "chant", "force",
  "force-break", "fork1-reward", "corridor", "warden", "warden1-cleared", "warden2",
  "warden3", "warden-defeated", "fork2", "free-aurland", "claim-tongue", "fork2-reward",
  "fish", "companion-answer", "true-name", "ending",
] as const;
export type BellStep = typeof BELL_STEPS[number];
export function bellStep(value: unknown): BellStep {
  return BELL_STEPS.includes(value as BellStep) ? value as BellStep : "arrival";
}
/** Inclusive upper bound allows a finished chain to hold its final response. */
export function bellIndex(value: unknown, last: number): number {
  return typeof value === "number" && Number.isInteger(value) ? Math.max(0, Math.min(last, value)) : 0;
}
