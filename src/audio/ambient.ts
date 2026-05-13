// Ambient music synthesized entirely with the Web Audio API.
// Each exported function starts a looping ambient track suited to its scene
// and returns an AmbientHandle whose stop() method fades out gracefully.
//
// Gain levels are kept in the 0.06–0.12 range so the ambient layer sits well
// below the typing clacks and chimes.

import { getAudioContext } from "./context";

export interface AmbientHandle {
  stop(): void;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Create a looping white-noise buffer source.
 * The buffer is 2 seconds of random samples; setting loop = true makes it
 * play indefinitely without clicking.
 */
function createNoiseSource(ctx: AudioContext): AudioBufferSourceNode {
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

/**
 * Create an LFO that modulates the gain of a target AudioParam.
 * Returns the LFO oscillator so it can be tracked and stopped.
 */
function createLfo(
  ctx: AudioContext,
  rate: number,
  depth: number,
  targetParam: AudioParam,
): OscillatorNode {
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = rate;

  const lfoGain = ctx.createGain();
  lfoGain.gain.value = depth;

  lfo.connect(lfoGain);
  lfoGain.connect(targetParam);
  lfo.start();
  return lfo;
}

/**
 * Build the stop handle for any ambient track.
 * Fades the master gain to 0 over 1.5 s then disconnects everything.
 */
function makeHandle(
  masterGain: GainNode,
  nodes: Array<OscillatorNode | AudioBufferSourceNode>,
  ctx: AudioContext,
  extraCleanup?: () => void,
): AmbientHandle {
  return {
    stop() {
      const now = ctx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(0, now + 1.5);
      setTimeout(() => {
        nodes.forEach((n) => {
          try {
            n.stop();
            n.disconnect();
          } catch {
            // already stopped or never started — ignore
          }
        });
        try { masterGain.disconnect(); } catch { /* ignore */ }
        extraCleanup?.();
      }, 1600);
    },
  };
}

// ─── Hub — Portal Chamber ─────────────────────────────────────────────────────
// Mood: quiet library, warmly lit, expectant.

export function playAmbientHub(): AmbientHandle {
  const ctx = getAudioContext();
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.1;
  masterGain.connect(ctx.destination);

  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = [];

  // Soft pad — two triangle oscillators at 110 Hz and 220 Hz, slightly detuned
  const padFreqs = [110, 110.35, 220, 220.6];
  const padGain = ctx.createGain();
  padGain.gain.value = 0.45;
  padGain.connect(masterGain);

  for (const freq of padFreqs) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    osc.connect(padGain);
    osc.start();
    nodes.push(osc);
  }

  // Very slow LFO on pad gain — 0.08 Hz breathing effect
  const lfo = createLfo(ctx, 0.08, 0.18, padGain.gain);
  nodes.push(lfo);

  // Faint highpass-filtered noise for paper/dust texture
  const noise = createNoiseSource(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 3000;
  hp.Q.value = 0.5;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.03;
  noise.connect(hp);
  hp.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start();
  nodes.push(noise);

  return makeHandle(masterGain, nodes, ctx);
}

// ─── Winter Mountain ──────────────────────────────────────────────────────────
// Mood: cold, vast, slow.

export function playAmbientWinter(): AmbientHandle {
  const ctx = getAudioContext();
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.09;
  masterGain.connect(ctx.destination);

  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = [];

  // Very low drone at 55 Hz
  const drone = ctx.createOscillator();
  drone.type = "sine";
  drone.frequency.value = 55;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.06 / 0.09; // normalised within masterGain
  drone.connect(droneGain);
  droneGain.connect(masterGain);
  drone.start();
  nodes.push(drone);

  // Pad: two sines at 165 Hz and 220 Hz, detuned ±2 cents
  const padFreqs: [number, number][] = [
    [165 * Math.pow(2, 2 / 1200), 0.3],
    [165 * Math.pow(2, -2 / 1200), 0.3],
    [220 * Math.pow(2, 2 / 1200), 0.25],
    [220 * Math.pow(2, -2 / 1200), 0.25],
  ];
  const padGain = ctx.createGain();
  padGain.gain.value = 0.6;
  padGain.connect(masterGain);

  for (const [freq] of padFreqs) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = 0.25;
    osc.connect(g);
    g.connect(padGain);
    osc.start();
    nodes.push(osc);
  }

  // Slow LFO at 0.05 Hz
  const lfo = createLfo(ctx, 0.05, 0.2, padGain.gain);
  nodes.push(lfo);

  // Bandpass noise centered at 400 Hz (wind texture)
  const noise = createNoiseSource(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 400;
  bp.Q.value = 1;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.04 / 0.09;
  noise.connect(bp);
  bp.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start();
  nodes.push(noise);

  return makeHandle(masterGain, nodes, ctx);
}

// ─── Sunken Bell ──────────────────────────────────────────────────────────────
// Mood: underwater, slow, resonant.

export function playAmbientBell(): AmbientHandle {
  const ctx = getAudioContext();
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.1;
  masterGain.connect(ctx.destination);

  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = [];

  // Drone at D2 (73.4 Hz)
  const drone = ctx.createOscillator();
  drone.type = "sine";
  drone.frequency.value = 73.4;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.07 / 0.1;
  drone.connect(droneGain);
  droneGain.connect(masterGain);
  drone.start();
  nodes.push(drone);

  // Pad: 146.8 Hz and 220.2 Hz (slightly off-tune), LFO at 0.12 Hz
  const padFreqs = [146.8, 146.4, 220.2, 219.8];
  const padGain = ctx.createGain();
  padGain.gain.value = 0.5;
  padGain.connect(masterGain);

  for (const freq of padFreqs) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    osc.connect(g);
    g.connect(padGain);
    osc.start();
    nodes.push(osc);
  }

  const lfo = createLfo(ctx, 0.12, 0.2, padGain.gain);
  nodes.push(lfo);

  // Lowpass noise for water texture
  const noise = createNoiseSource(ctx);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 300;
  lp.Q.value = 1;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.04 / 0.1;
  noise.connect(lp);
  lp.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start();
  nodes.push(noise);

  // Occasional bell shimmer — brief sine burst at 880 Hz
  let shimmerTimeout: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function scheduleShimmer(): void {
    if (stopped) return;
    const delayMs = 8000 + Math.random() * 4000; // 8–12 s
    shimmerTimeout = setTimeout(() => {
      if (stopped) return;
      const now = ctx.currentTime;
      const shimmerOsc = ctx.createOscillator();
      shimmerOsc.type = "sine";
      shimmerOsc.frequency.value = 880;
      const shimmerGain = ctx.createGain();
      shimmerGain.gain.setValueAtTime(0, now);
      shimmerGain.gain.linearRampToValueAtTime(0.05, now + 0.01);
      shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
      shimmerOsc.connect(shimmerGain);
      shimmerGain.connect(ctx.destination);
      shimmerOsc.start(now);
      shimmerOsc.stop(now + 2.1);
      scheduleShimmer();
    }, delayMs);
  }
  scheduleShimmer();

  return makeHandle(masterGain, nodes, ctx, () => {
    stopped = true;
    if (shimmerTimeout !== null) clearTimeout(shimmerTimeout);
  });
}

// ─── Clockwork Forge ─────────────────────────────────────────────────────────
// Mood: industrial, rhythmic heat, deep rumble.

export function playAmbientForge(): AmbientHandle {
  const ctx = getAudioContext();
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.1;
  masterGain.connect(ctx.destination);

  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = [];

  // Drone at E2 (82.4 Hz) — sawtooth filtered through lowpass
  const drone = ctx.createOscillator();
  drone.type = "sawtooth";
  drone.frequency.value = 82.4;
  const droneLp = ctx.createBiquadFilter();
  droneLp.type = "lowpass";
  droneLp.frequency.value = 200;
  droneLp.Q.value = 1;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.06 / 0.1;
  drone.connect(droneLp);
  droneLp.connect(droneGain);
  droneGain.connect(masterGain);
  drone.start();
  nodes.push(drone);

  // Rhythmic pulse: bandpass noise (center 800 Hz, Q=3) with LFO at 1.5 Hz
  const pulseNoise = createNoiseSource(ctx);
  const pulseBp = ctx.createBiquadFilter();
  pulseBp.type = "bandpass";
  pulseBp.frequency.value = 800;
  pulseBp.Q.value = 3;
  const pulseGain = ctx.createGain();
  pulseGain.gain.value = 0.5;
  pulseNoise.connect(pulseBp);
  pulseBp.connect(pulseGain);
  pulseGain.connect(masterGain);
  pulseNoise.start();
  nodes.push(pulseNoise);

  // LFO at 1.5 Hz modulating the pulse gain
  const pulseLfo = createLfo(ctx, 1.5, 0.45, pulseGain.gain);
  nodes.push(pulseLfo);

  // Faint high hiss: highpass noise at 4000 Hz
  const hissNoise = createNoiseSource(ctx);
  const hissHp = ctx.createBiquadFilter();
  hissHp.type = "highpass";
  hissHp.frequency.value = 4000;
  hissHp.Q.value = 0.5;
  const hissGain = ctx.createGain();
  hissGain.gain.value = 0.02 / 0.1;
  hissNoise.connect(hissHp);
  hissHp.connect(hissGain);
  hissGain.connect(masterGain);
  hissNoise.start();
  nodes.push(hissNoise);

  return makeHandle(masterGain, nodes, ctx);
}

// ─── Sky-Island of Lanterns ───────────────────────────────────────────────────
// Mood: golden, airy, gentle.

export function playAmbientSkyIsland(): AmbientHandle {
  const ctx = getAudioContext();
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.09;
  masterGain.connect(ctx.destination);

  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = [];

  // Pad: E4 (329.6 Hz) and B4 (493.9 Hz), detuned ±1 cent
  const padFreqs = [
    329.6 * Math.pow(2, 1 / 1200),
    329.6 * Math.pow(2, -1 / 1200),
    493.9 * Math.pow(2, 1 / 1200),
    493.9 * Math.pow(2, -1 / 1200),
  ];
  const padGain = ctx.createGain();
  padGain.gain.value = 0.55;
  padGain.connect(masterGain);

  for (const freq of padFreqs) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    osc.connect(g);
    g.connect(padGain);
    osc.start();
    nodes.push(osc);
  }

  // Very slow LFO at 0.06 Hz
  const lfo = createLfo(ctx, 0.06, 0.2, padGain.gain);
  nodes.push(lfo);

  // Highpass noise for breeze texture
  const noise = createNoiseSource(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2000;
  hp.Q.value = 0.5;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.03 / 0.09;
  noise.connect(hp);
  hp.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start();
  nodes.push(noise);

  // Occasional lantern chime — E6 (1318.5 Hz) every 6–10 s
  let chimeTimeout: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function scheduleChime(): void {
    if (stopped) return;
    const delayMs = 6000 + Math.random() * 4000; // 6–10 s
    chimeTimeout = setTimeout(() => {
      if (stopped) return;
      const now = ctx.currentTime;
      const chimeOsc = ctx.createOscillator();
      chimeOsc.type = "sine";
      chimeOsc.frequency.value = 1318.5;
      const chimeGain = ctx.createGain();
      chimeGain.gain.setValueAtTime(0, now);
      chimeGain.gain.linearRampToValueAtTime(0.05, now + 0.01);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
      chimeOsc.connect(chimeGain);
      chimeGain.connect(ctx.destination);
      chimeOsc.start(now);
      chimeOsc.stop(now + 2.1);
      scheduleChime();
    }, delayMs);
  }
  scheduleChime();

  return makeHandle(masterGain, nodes, ctx, () => {
    stopped = true;
    if (chimeTimeout !== null) clearTimeout(chimeTimeout);
  });
}

// ─── Haunted Wood ─────────────────────────────────────────────────────────────
// Mood: fog, distant, uneasy stillness.

export function playAmbientWood(): AmbientHandle {
  const ctx = getAudioContext();
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.1;
  masterGain.connect(ctx.destination);

  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = [];

  // Very low drone at C2 (65.4 Hz)
  const drone = ctx.createOscillator();
  drone.type = "sine";
  drone.frequency.value = 65.4;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.05 / 0.1;
  drone.connect(droneGain);
  droneGain.connect(masterGain);
  drone.start();
  nodes.push(drone);

  // Pad: triangle oscillators at 130.8 Hz and 196 Hz, slightly detuned
  const padFreqs = [130.8, 131.1, 196.0, 196.4];
  const padGain = ctx.createGain();
  padGain.gain.value = 0.5;
  padGain.connect(masterGain);

  for (const freq of padFreqs) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = 0.2;
    osc.connect(g);
    g.connect(padGain);
    osc.start();
    nodes.push(osc);
  }

  // LFO at 0.07 Hz
  const lfo = createLfo(ctx, 0.07, 0.18, padGain.gain);
  nodes.push(lfo);

  // Bandpass noise (center 200 Hz, Q=0.8) for fog texture
  const fogNoise = createNoiseSource(ctx);
  const fogBp = ctx.createBiquadFilter();
  fogBp.type = "bandpass";
  fogBp.frequency.value = 200;
  fogBp.Q.value = 0.8;
  const fogGain = ctx.createGain();
  fogGain.gain.value = 0.05 / 0.1;
  fogNoise.connect(fogBp);
  fogBp.connect(fogGain);
  fogGain.connect(masterGain);
  fogNoise.start();
  nodes.push(fogNoise);

  // Second bandpass noise layer (center 1200 Hz, Q=4) for distant-whisper texture
  const whisperNoise = createNoiseSource(ctx);
  const whisperBp = ctx.createBiquadFilter();
  whisperBp.type = "bandpass";
  whisperBp.frequency.value = 1200;
  whisperBp.Q.value = 4;
  const whisperGain = ctx.createGain();
  whisperGain.gain.value = 0.015 / 0.1;
  whisperNoise.connect(whisperBp);
  whisperBp.connect(whisperGain);
  whisperGain.connect(masterGain);
  whisperNoise.start();
  nodes.push(whisperNoise);

  return makeHandle(masterGain, nodes, ctx);
}

// ─── Great Battle ─────────────────────────────────────────────────────────────
// Mood: tense, building, ominous.

export function playAmbientBattle(): AmbientHandle {
  const ctx = getAudioContext();
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.12;
  masterGain.connect(ctx.destination);

  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = [];

  // Low drone at D1 (36.7 Hz)
  const drone = ctx.createOscillator();
  drone.type = "sine";
  drone.frequency.value = 36.7;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.08 / 0.12;
  drone.connect(droneGain);
  droneGain.connect(masterGain);
  drone.start();
  nodes.push(drone);

  // Pad: two sawtooth oscillators at 73.4 Hz and 110 Hz filtered through lowpass
  const padFreqs = [73.4, 73.8, 110.0, 110.3];
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 400;
  padFilter.Q.value = 1;
  const padGain = ctx.createGain();
  padGain.gain.value = 0.45;
  padFilter.connect(padGain);
  padGain.connect(masterGain);

  for (const freq of padFreqs) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = 0.2;
    osc.connect(g);
    g.connect(padFilter);
    osc.start();
    nodes.push(osc);
  }

  // LFO at 0.15 Hz on pad gain
  const lfo = createLfo(ctx, 0.15, 0.2, padGain.gain);
  nodes.push(lfo);

  // Bandpass noise (center 600 Hz, Q=2) with LFO at 0.2 Hz on its gain
  const battleNoise = createNoiseSource(ctx);
  const battleBp = ctx.createBiquadFilter();
  battleBp.type = "bandpass";
  battleBp.frequency.value = 600;
  battleBp.Q.value = 2;
  const battleNoiseGain = ctx.createGain();
  battleNoiseGain.gain.value = 0.06 / 0.12;
  battleNoise.connect(battleBp);
  battleBp.connect(battleNoiseGain);
  battleNoiseGain.connect(masterGain);
  battleNoise.start();
  nodes.push(battleNoise);

  // LFO at 0.2 Hz on noise gain
  const noiseLfo = createLfo(ctx, 0.2, 0.25, battleNoiseGain.gain);
  nodes.push(noiseLfo);

  return makeHandle(masterGain, nodes, ctx);
}
