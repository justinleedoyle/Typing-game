import type { SoundscapeMood } from "./soundscapes";

const afterRepair = ["fork1-reward", "boss-intro", "boss1", "boss2", "boss3", "boss-defeated", "fork2", "peaceful", "peaceful-answer", "fight", "fight-answer", "fork2-reward", "companion-gate", "companion-answer", "true-name-intro", "true-name", "ending"];
const afterOrder = ["peaceful-answer", "fork2-reward", "companion-gate", "companion-answer", "true-name-intro", "true-name", "ending"];
const aftermath = ["boss-defeated", "fork2", "peaceful", "peaceful-answer", "fight-answer", "fork2-reward", "companion-gate", "companion-answer", "true-name-intro", "true-name", "ending"];
const threats = ["tutorial-fight", "wave1", "wave2", "boss-intro", "boss1", "boss2", "boss3", "fight"];

/** The valve must actually close before its choice changes the foundry. A
 * recorded future choice never changes an earlier restored scene's sound. */
export function forgeSoundscapeMood(step = "arrival", fork1?: string | null, fork2?: string | null,
  data: { index?: unknown; reading?: unknown } = {}): SoundscapeMood {
  const valveClosed = step === "cabal" && typeof data.index === "number" && Number.isInteger(data.index)
    && (data.index > 0 || (data.index === 0 && data.reading === true));
  const slowed = fork1 === "cabal" && (afterRepair.includes(step) || valveClosed);
  if (fork2 === "peaceful" && afterOrder.includes(step)) return slowed ? "forge-still-slow" : "forge-still";
  if (threats.includes(step)) return slowed ? "forge-threat-slow" : "forge-threat";
  if (aftermath.includes(step)) return slowed ? "forge-rest-slow" : "forge-rest";
  return slowed ? "forge-workshop-slow" : "forge-workshop";
}
