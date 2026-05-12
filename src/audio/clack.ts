// Synthesized typewriter clack. Phase 0 ships a Web Audio synth so we don't
// need to license or download an SFX asset; Phase 1 swaps in a recorded clack.
//
// The sound is a short burst of bandpass-filtered noise with a snappy
// envelope. Slight randomization on every call keeps repeated keystrokes
// from sounding mechanical.

let ctx: AudioContext | null = null;

function getContext(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

export function playClack(): void {
  const audio = getContext();
  // Browsers suspend the context until the first user gesture; the keystroke
  // that triggers playClack counts, so we resume on demand.
  if (audio.state === "suspended") {
    void audio.resume();
  }

  const now = audio.currentTime;
  const duration = 0.06;

  const buffer = audio.createBuffer(
    1,
    Math.floor(audio.sampleRate * duration),
    audio.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = audio.createBufferSource();
  source.buffer = buffer;

  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1400 + Math.random() * 600;
  filter.Q.value = 4;

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(audio.destination);

  source.start(now);
  source.stop(now + duration);
}
