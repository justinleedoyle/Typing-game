import type { SoundscapeMood } from "./soundscapes";

const afterBeacon = ["boss-intro", "boss", "boss-defeated", "fork2", "answer-kindly", "cut-tether", "moth", "moth-answer", "true-name", "ending"];
const afterSpirit = ["moth", "moth-answer", "true-name", "ending"];
const aftermath = ["boss-defeated", "fork2", "answer-kindly", "cut-tether", ...afterSpirit];
const quiet = ["lighter", "temple-intro", "temple-cleared", "etta", "etta-book", "fork1", "help-etta", "steal-flame"];

/** Choices affect the atmosphere only after their physical action completes.
 * Saved future choices cannot change an earlier reconstructed scene. */
export function skySoundscapeMood(step = "arrival", fork1?: string | null, fork2?: string | null,
  data: { index?: unknown; reading?: unknown; helpedBefore?: unknown } = {}): SoundscapeMood {
  const completed = (index: number): boolean => typeof data.index === "number" && Number.isInteger(data.index)
    && (data.index > index || (data.index === index && data.reading === true));
  const dim = fork1 === "steal-flame" && (afterBeacon.includes(step) || (step === "steal-flame" && completed(1)));
  if (fork2 === "answer-kindly" && ((step === "answer-kindly" && data.reading === true) || afterSpirit.includes(step))) return "sky-kind";
  if (fork2 === "cut-tether" && ((step === "cut-tether" && completed(1)) || afterSpirit.includes(step))) return dim ? "sky-freed-dim" : "sky-freed";
  if (step === "boss-intro" || step === "boss"
    || (step === "first-spirits" && data.reading !== true)
    || (step === "temple" && data.index !== 2 && data.reading !== true)) return "sky-threat";
  if (aftermath.includes(step)) return dim ? "sky-rest-dim" : "sky-rest";
  if (step === "help-etta" && fork1 === "help-etta" && completed(data.helpedBefore === true ? 1 : 3)) return "sky-rest";
  if (dim) return "sky-dim";
  if (quiet.includes(step) || step === "temple" || step === "first-spirits") return "sky-library";
  return "sky-terrace";
}
