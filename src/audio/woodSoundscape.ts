import type { SoundscapeMood } from "./soundscapes";

const threats = ["crossroads1", "crossroads2", "crossroads3", "boss-intro", "boss-a", "boss-b"];
const afterFlute = ["flute-reward", "act3", "fork2", "bargain", "bargain-reward", "force", "boss-intro", "boss-a", "boss-a-cleared", "boss-b", "boss-b-cleared", "capstone", "capstone-answer", "final-intro", "final1", "final2"];
const afterFire = ["force", "boss-intro", "boss-a", "boss-a-cleared", "boss-b", "boss-b-cleared", "capstone", "capstone-answer", "final-intro", "final1", "final2"];
const sealed = ["sealed", "cat-gate", "cat-answer", "ending"];

/** A selected branch is not a completed physical action. Earlier checkpoints
 * ignore future saved choices; unknown histories receive neutral aftermath. */
export function woodSoundscapeMood(step = "arrival", fork1?: string | null, fork2?: string | null,
  data: { index?: unknown; response?: unknown } = {}): SoundscapeMood {
  if (sealed.includes(step)) return fork2 === "force" ? "wood-rest-ash" : "wood-rest";
  if (threats.includes(step)) return "wood-threat";
  if (fork2 === "force" && afterFire.includes(step)) return "wood-ash";
  const fluteTaken = step === "flute" && typeof data.index === "number" && Number.isInteger(data.index)
    && (data.index > 1 || (data.index === 1 && data.response === true));
  if (fork1 === "bone-flute" && (fluteTaken || afterFlute.includes(step))) return "wood-restless";
  if (step === "arrival" || step === "path" && data.index === 0) return "wood-path";
  if (step === "path" || ["inga", "act2", "ward-intro", "ward", "crossroads1-cleared", "crossroads2-intro", "crossroads3-intro", "fork1", "offering", "offering-reward", "inga-name", "inga-name-answer", "flute", ...afterFlute].includes(step)) return "wood-hush";
  return "wood-path";
}
