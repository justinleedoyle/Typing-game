// Soft pitched chime for "word claimed/completed" events. Two stacked sine
// tones a fifth apart, with a quick attack and an exponential decay. Quiet
// enough to layer on top of the typewriter clacks without crowding them.

import { getAudioContext } from "./context";

export function playChime(): void {
  const audio = getAudioContext();
  const now = audio.currentTime;
  const duration = 0.45;

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  gain.connect(audio.destination);

  for (const freq of [880, 1318.5]) {
    const osc = audio.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + duration);
  }
}
