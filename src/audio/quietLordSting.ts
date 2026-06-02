// Audio companions to the Quiet Lord's scratched-text visuals. Per §5.5.10
// the Lord's interruptions are meant to land as dread, not surprise — so the
// audio is sub-bass body + a high whisper texture, rather than a chime or
// sting. Two flavors, both fire-and-forget:
//
//   playQuietLordIntrusionSting — long (2.4s), slow attack, layered under the
//     mid-realm intrusion's screen dim. Peaks around the quill stroke draw.
//
//   playQuietLordFragmentSting — shorter (1.4s), sharper attack, paired with
//     the boss-defeat fragment flash. Higher fundamental so it reads as a
//     reveal, not a beat.
//
// Both share a deliberate sonic motif — a low fundamental + a detuned partner
// for slow beating + a bandpass-filtered noise whisper layered on top — so a
// player who hears them across the game recognizes the Lord even with no
// onscreen text. Tuning notes are inline at each parameter.

import { getAudioContext, getMasterGain } from "./context";

/** White-noise buffer used for the whisper layer. Generated fresh per call so
 *  successive intrusions don't reuse a buffer that's still being read by a
 *  source node — Web Audio buffer sources are one-shot. */
function createNoiseBuffer(
  audio: AudioContext,
  durationSec: number,
): AudioBuffer {
  const length = Math.floor(audio.sampleRate * durationSec);
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/** Mid-realm intrusion sting. Designed to swell under the screen dim and peak
 *  with the quill stroke draw (~280–660ms after call). Long exponential tail
 *  carries past the visual fade-out so the "memory" of his voice lingers. */
export function playQuietLordIntrusionSting(): void {
  const audio = getAudioContext();
  const now = audio.currentTime;
  const duration = 2.4;

  // Master envelope: slow attack so it sneaks in under the visual dim,
  // long exponential decay so the rumble outlasts the cross-out stroke.
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.16, now + 0.4);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  gain.connect(getMasterGain());

  // Sub-bass body — A1 fundamental (55 Hz) plus a 1.5 Hz detuned partner.
  // The slow beating gives the rumble an unsettled quality without anyone
  // having to listen for it. Inaudible-but-felt on full-range speakers,
  // perceptible-as-pressure on headphones.
  for (const freq of [55, 56.5]) {
    const osc = audio.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + duration);
  }

  // Octave-up presence layer (A2, 110 Hz). Laptop speakers roll off
  // dramatically below ~80 Hz; without this layer Aiden on a MacBook
  // wouldn't hear the rumble at all. Quieter than the fundamental so it
  // doesn't overpower the sub-bass on headphones.
  const octave = audio.createOscillator();
  octave.type = "sine";
  octave.frequency.value = 110;
  const octaveGain = audio.createGain();
  octaveGain.gain.value = 0.35;
  octave.connect(octaveGain);
  octaveGain.connect(gain);
  octave.start(now);
  octave.stop(now + duration);

  // Whisper texture — white noise through a narrow bandpass at 800 Hz. Reads
  // as "voiceless sibilants" rather than rain or static. Its own envelope is
  // slower than the body so the whisper feels like it's *arriving with* the
  // rumble rather than being struck.
  const noise = audio.createBufferSource();
  noise.buffer = createNoiseBuffer(audio, duration);
  const bandpass = audio.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 800;
  bandpass.Q.value = 2;
  const noiseGain = audio.createGain();
  noiseGain.gain.setValueAtTime(0, now);
  noiseGain.gain.linearRampToValueAtTime(0.18, now + 0.6);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  noise.connect(bandpass);
  bandpass.connect(noiseGain);
  // Whisper bypasses the body-gain master envelope and goes straight to the
  // master output — its own envelope already shapes it, and routing it
  // through `gain` would couple their timing in ways that flatten the cue.
  noiseGain.connect(getMasterGain());
  noise.start(now);
  noise.stop(now + duration);
}

/** Boss-defeat fragment sting. Sharper attack, higher fundamental than the
 *  intrusion so it reads as the moment of reveal, not a beat that's been
 *  brewing. Shorter overall so the boss-defeat audio (camera flash, victory
 *  chime, ambient sting) has room to land afterward. */
export function playQuietLordFragmentSting(): void {
  const audio = getAudioContext();
  const now = audio.currentTime;
  const duration = 1.4;

  // Faster attack than the intrusion (120ms vs 400ms) — peaks with the
  // stroke draw (~220ms after call) rather than swelling under a dim.
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.12);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  gain.connect(getMasterGain());

  // Sharper fundamental — D2 (73 Hz) instead of A1 (55 Hz). Same detuned-
  // partner trick for the unsettled-beating motif so a listener who heard
  // the intrusion sting earlier recognizes "this is the same voice."
  for (const freq of [73, 73.6]) {
    const osc = audio.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + duration);
  }

  // Octave-up presence (D3, 146 Hz) for the same small-speaker survival
  // reason as the intrusion sting.
  const octave = audio.createOscillator();
  octave.type = "sine";
  octave.frequency.value = 146;
  const octaveGain = audio.createGain();
  octaveGain.gain.value = 0.3;
  octave.connect(octaveGain);
  octaveGain.connect(gain);
  octave.start(now);
  octave.stop(now + duration);

  // Whisper texture — slightly higher bandpass (1100 Hz vs 800 Hz) and a
  // sharper Q so the layer reads as more articulate, more "spoken" than the
  // intrusion's softer brush.
  const noise = audio.createBufferSource();
  noise.buffer = createNoiseBuffer(audio, duration);
  const bandpass = audio.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 1100;
  bandpass.Q.value = 2.5;
  const noiseGain = audio.createGain();
  noiseGain.gain.setValueAtTime(0, now);
  noiseGain.gain.linearRampToValueAtTime(0.14, now + 0.2);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  noise.connect(bandpass);
  bandpass.connect(noiseGain);
  noiseGain.connect(getMasterGain());
  noise.start(now);
  noise.stop(now + duration);
}
