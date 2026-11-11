/** Stable Wood boundaries; no moving enemies or partly typed words are serialized. */
export const WOOD_STEPS = [
  "arrival", "path", "inga", "act2", "ward-intro", "ward", "crossroads1",
  "crossroads1-cleared", "crossroads2-intro", "crossroads2", "crossroads3-intro", "crossroads3",
  "fork1", "offering", "offering-reward", "inga-name", "inga-name-answer", "flute", "flute-reward",
  "act3", "fork2", "bargain", "bargain-reward", "force", "boss-intro", "boss-a",
  "boss-a-cleared", "boss-b", "boss-b-cleared", "capstone", "capstone-answer", "final-intro",
  "final1", "final2", "sealed", "cat-gate", "cat-answer",
] as const;
export type WoodStep = typeof WOOD_STEPS[number];
export function woodStep(value: string | undefined): WoodStep {
  return WOOD_STEPS.includes(value as WoodStep) ? value as WoodStep : "arrival";
}
/** Length is a valid completed boundary, including the gap before the next callback. */
export function woodIndex(value: unknown, length: number): number {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.max(0, Math.min(length, value)) : 0;
}
