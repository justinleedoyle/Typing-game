// "Spark zap" — the Alt-spell chain-defeat audio in the Clockwork Forge.
// A short, sharp electric crackle: bandpass-filtered noise burst plus a
// brief descending sine sweep so it reads as an arc, not a chime.
// Distinct from clack / chime / claim / waveSting / bellToll.

import { getAudioContext, getMasterGain } from "./context";

export function playSparkZap(): void {
  const audio = getAudioContext();
  const now = audio.currentTime;
  const duration = 0.22;

  // Noise burst — bandpass at 2.4kHz for "electric crackle" character.
  const noiseBuffer = audio.createBuffer(
    1,
    Math.floor(audio.sampleRate * duration),
    audio.sampleRate,
  );
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const noise = audio.createBufferSource();
  noise.buffer = noiseBuffer;
  const noiseFilter = audio.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 2400;
  noiseFilter.Q.value = 5;
  const noiseGain = audio.createGain();
  noiseGain.gain.setValueAtTime(0.22, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(getMasterGain());
  noise.start(now);
  noise.stop(now + duration);

  // Descending sine sweep — gives the zap a direction (arc traveling away).
  const sweep = audio.createOscillator();
  sweep.type = "sawtooth";
  sweep.frequency.setValueAtTime(1800, now);
  sweep.frequency.exponentialRampToValueAtTime(220, now + duration);
  const sweepGain = audio.createGain();
  sweepGain.gain.setValueAtTime(0, now);
  sweepGain.gain.linearRampToValueAtTime(0.08, now + 0.01);
  sweepGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  sweep.connect(sweepGain);
  sweepGain.connect(getMasterGain());
  sweep.start(now);
  sweep.stop(now + duration);
}
