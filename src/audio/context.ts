// Single shared AudioContext. Browsers limit how many a tab can create, and
// every SFX in the game wants to live in the same one anyway so they can be
// scheduled relative to each other.
//
// All sound flows through a master GainNode so the player's audio level
// (loud/medium/quiet/off) scales every output in one place. SFX and ambient
// modules connect to getMasterGain() instead of ctx.destination directly,
// and setAudioLevel() — called at startup and from Settings — adjusts the
// master gain.

import type { AudioLevel } from "../game/saveState";

const LEVEL_TO_GAIN: Record<AudioLevel, number> = {
  loud: 1.0,
  medium: 0.6,
  quiet: 0.25,
  off: 0,
};

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let currentLevel: AudioLevel = "medium";

export function getAudioContext(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

/** Master gain node — every SFX and ambient track connects here instead of
 *  audio.destination. Lazily created on first call. */
export function getMasterGain(): GainNode {
  const audio = getAudioContext();
  if (!masterGain) {
    masterGain = audio.createGain();
    masterGain.gain.value = LEVEL_TO_GAIN[currentLevel];
    masterGain.connect(audio.destination);
  }
  return masterGain;
}

/** Apply the player's audio level to all current and future audio output.
 *  Called at startup from the loaded save, and from Settings whenever the
 *  level cycles. Short ramp avoids clicks on sudden level changes. */
export function setAudioLevel(level: AudioLevel): void {
  currentLevel = level;
  const target = LEVEL_TO_GAIN[level];
  const gain = getMasterGain();
  const audio = getAudioContext();
  const now = audio.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(target, now + 0.05);
}
