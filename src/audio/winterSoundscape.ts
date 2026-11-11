import type { SoundscapeMood } from "./soundscapes";

/** Derive atmosphere from the existing checkpoint, never from a new save flag.
 * The same selection applies to ordinary entry and checkpoint restoration. */
export function winterSoundscapeMood(step?: string): SoundscapeMood {
  if (step === "wave" || step === "boss") return "winter-threat";
  if (step === "return-trail") return "winter-return";
  if (["boss-defeated", "fork2", "bury", "pelt", "fox-gate", "companion-answer", "true-name", "ending"].includes(step ?? "")) return "winter-rest";
  if (["arrival", "trail", "return-plan", "return-prep"].includes(step ?? "arrival")) return "winter-trail";
  return "winter-glade";
}
