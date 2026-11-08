import type { SoundscapeMood } from "./soundscapes";

/** The existing beat clock owns every audible timing cue. Story choices stay
 * untimed, and only a known late clapper outcome removes the aftermath score. */
export function bellSoundscapeMood(step?: string, fork2?: string): SoundscapeMood {
  if (["practice", "choir", "choir-cleared", "warden", "warden1-cleared", "warden2", "warden3"].includes(step ?? "")) {
    return "bell-rhythm";
  }
  if (["warden-defeated", "fork2", "free-aurland", "claim-tongue", "fork2-reward", "fish", "companion-answer", "true-name", "ending"].includes(step ?? "")) {
    return fork2 === "claim-tongue" ? "bell-silence" : "bell-rest";
  }
  return "bell-depths";
}
