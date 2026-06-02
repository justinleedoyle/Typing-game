// Low percussive "you got hit" thud, fired when an enemy reaches Wren and
// snuffs a candle. Distinct from the other SFX: playBellToll is musical,
// playChime is bright, the Quiet Lord stings are dread. This one is impact —
// a fast pitch-dropping body plus a short filtered-noise transient, so a hit
// is felt, not just seen (the camera shake was previously silent).

import { getAudioContext, getMasterGain } from "./context";

export function playDamageThud(): void {
  const audio = getAudioContext();
  const now = audio.currentTime;
  const duration = 0.32;

  // Master envelope — near-instant attack (it's an impact), short tail.
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.22, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  gain.connect(getMasterGain());

  // Thump body — a fast pitch drop from 150Hz → 48Hz reads as a punch rather
  // than a pitched tone. The exponential ramp gives it the "whump" shape.
  const body = audio.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(150, now);
  body.frequency.exponentialRampToValueAtTime(48, now + 0.13);
  body.connect(gain);
  body.start(now);
  body.stop(now + duration);

  // Impact transient — a short noise burst through a lowpass, decaying in
  // ~80ms. Gives the hit its "smack" attack edge without being shrill.
  const noiseLen = Math.floor(audio.sampleRate * 0.08);
  const buffer = audio.createBuffer(1, noiseLen, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const noise = audio.createBufferSource();
  noise.buffer = buffer;
  const lowpass = audio.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 1200;
  const noiseGain = audio.createGain();
  noiseGain.gain.setValueAtTime(0.12, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  noise.connect(lowpass);
  lowpass.connect(noiseGain);
  noiseGain.connect(getMasterGain());
  noise.start(now);
  noise.stop(now + 0.08);
}
