/** Sky checkpoints restart only the pending encounter or unfinished phrase.
 * Passage indices address the current phrase, including its held response. */
export const SKY_STEPS = [
  "arrival", "path", "lighter", "first-spirits", "temple-intro", "temple",
  "temple-cleared", "etta", "etta-book", "fork1", "help-etta", "steal-flame",
  "boss-intro", "boss", "boss-defeated", "fork2", "answer-kindly", "cut-tether",
  "moth", "moth-answer", "true-name", "ending",
] as const;
export type SkyStep = typeof SKY_STEPS[number];
