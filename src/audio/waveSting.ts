// Wave-start sting — fires when a new wave of wolves begins. Two stacked
// low oscillators a minor third apart, brief and rising, paired with the
// camera shake at the same beat. Reads as "something just changed —
// brace." Distinct from playClack (per-key), playClaim (lock-on, high),
// playChime (word-complete, bright). Wave-sting lives at the low end.

import { getAudioContext } from "./context";

export function playWaveSting(): void {
  const audio = getAudioContext();
  const now = audio.currentTime;
  const duration = 0.28;

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.14, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  gain.connect(audio.destination);

  // 165 Hz (E3) and 196 Hz (G3) — a minor third, slightly ominous.
  for (const freq of [165, 196]) {
    const osc = audio.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq * 0.85, now);
    osc.frequency.exponentialRampToValueAtTime(freq, now + 0.08);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + duration);
  }
}
