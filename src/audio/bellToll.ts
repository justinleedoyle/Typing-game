// Deep resonant bell toll, fired on each beat of the Bell scene's BeatClock.
// Distinct from playChime (high, bright) and playClaim (rising sine) —
// this is the low fundamental + a metallic upper partial, slow attack,
// long exponential tail, so it actually reads as a cathedral bell rather
// than a chime.

import { getAudioContext, getMasterGain } from "./context";

export function playBellToll(): void {
  const audio = getAudioContext();
  const now = audio.currentTime;
  const duration = 1.6;

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  gain.connect(getMasterGain());

  // Fundamental — low E2 (82.4 Hz). The body of the toll.
  const fundamental = audio.createOscillator();
  fundamental.type = "sine";
  fundamental.frequency.value = 82.4;
  const fundGain = audio.createGain();
  fundGain.gain.value = 1.0;
  fundamental.connect(fundGain);
  fundGain.connect(gain);
  fundamental.start(now);
  fundamental.stop(now + duration);

  // Metallic upper partial — a perfect twelfth above (3x fundamental, ~247 Hz).
  // Gives the toll its "bell" character without being shrill.
  const upper = audio.createOscillator();
  upper.type = "sine";
  upper.frequency.value = 247.2;
  const upperGain = audio.createGain();
  upperGain.gain.setValueAtTime(0.45, now);
  upperGain.gain.exponentialRampToValueAtTime(0.05, now + duration);
  upper.connect(upperGain);
  upperGain.connect(gain);
  upper.start(now);
  upper.stop(now + duration);
}
