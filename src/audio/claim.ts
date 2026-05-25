// "Claim sting" — fired when the typing controller uniquely identifies a
// target and locks onto it. Distinct from playClack (per-key noise burst)
// and playChime (word-completion bell). A brief pitch-up sine tone, quiet
// enough to layer on top of the clack of the same keystroke without
// crowding it. Reads as "lock-on" — the moment the player knows which
// word they're committed to.

import { getAudioContext } from "./context";

export function playClaim(): void {
  const audio = getAudioContext();
  const now = audio.currentTime;
  const duration = 0.13;

  const osc = audio.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(1320, now + 0.04);

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.07, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(audio.destination);

  osc.start(now);
  osc.stop(now + duration);
}
