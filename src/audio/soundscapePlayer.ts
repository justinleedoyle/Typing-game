/** Own decoded loops independently of Phaser's frame clock. Pause saves each
 * playhead and stops its source; resume creates one replacement at that offset.
 * There are no scheduling timers that can accumulate while a tab is hidden. */
export interface LoopSpec { id: string; url: string; gain: number }
export interface SoundscapeStatus {
  paused: boolean; stopped: boolean;
  layers: Array<{ id: string; playing: boolean; offset: number; duration: number | null; loaded: boolean; failed: boolean }>;
  cues: number;
}
interface Layer {
  spec: LoopSpec; buffer?: AudioBuffer; loading?: Promise<void>; failed: boolean;
  source?: AudioBufferSourceNode; gain?: GainNode; offset: number; startedAt: number;
}
export class SoundscapePlayer {
  private layers = new Map<string, Layer>();
  private paused: boolean;
  private stopped = false;
  private generation = 0;
  private cues = new Map<AudioBufferSourceNode, GainNode>();
  private loopSources = new Map<AudioBufferSourceNode, GainNode>();
  constructor(private readonly context: AudioContext, private readonly output: AudioNode,
    private readonly load: (url: string) => Promise<AudioBuffer>, initiallyPaused = false) {
    this.paused = initiallyPaused;
  }

  setLayers(specs: readonly LoopSpec[]): void {
    if (this.stopped) return;
    const desired = new Set(specs.map(spec => spec.id));
    for (const [id, layer] of this.layers) if (!desired.has(id)) {
      this.silence(layer, .55); this.layers.delete(id);
    }
    for (const spec of specs) {
      let layer = this.layers.get(spec.id);
      if (!layer) {
        layer = { spec, failed: false, offset: 0, startedAt: 0 };
        this.layers.set(spec.id, layer);
      } else layer.spec = spec;
      if (layer.gain) this.ramp(layer.gain.gain, spec.gain, .8);
      this.prepare(layer);
    }
  }

  private prepare(layer: Layer): void {
    if (this.stopped || this.paused || layer.source || layer.loading) return;
    if (layer.buffer) { this.start(layer); return; }
    layer.failed = false;
    layer.loading = this.load(layer.spec.url).then(buffer => {
      layer.buffer = buffer;
      if (this.layers.get(layer.spec.id) === layer && !this.paused && !this.stopped) this.start(layer);
    }).catch(() => { layer.failed = true; }).finally(() => { layer.loading = undefined; });
  }
  private start(layer: Layer): void {
    if (!layer.buffer || layer.source || this.paused || this.stopped) return;
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = layer.buffer; source.loop = true;
    gain.gain.setValueAtTime(0, this.context.currentTime);
    gain.gain.linearRampToValueAtTime(layer.spec.gain, this.context.currentTime + 1.3);
    source.connect(gain); gain.connect(this.output);
    layer.offset %= layer.buffer.duration;
    layer.source = source; layer.gain = gain; layer.startedAt = this.context.currentTime;
    this.loopSources.set(source, gain);
    source.onended = () => { this.loopSources.delete(source); source.disconnect(); gain.disconnect(); };
    source.start(0, layer.offset);
  }
  private ramp(parameter: AudioParam, target: number, duration: number): void {
    const now = this.context.currentTime;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(parameter.value, now);
    parameter.linearRampToValueAtTime(target, now + duration);
  }
  private silence(layer: Layer, fade = 0): void {
    const source = layer.source;
    if (!source) return;
    layer.offset = (layer.offset + this.context.currentTime - layer.startedAt) % layer.buffer!.duration;
    layer.source = undefined;
    if (layer.gain) this.ramp(layer.gain.gain, 0, fade);
    source.stop(this.context.currentTime + fade);
    layer.gain = undefined;
  }
  pause(): void {
    if (this.stopped || this.paused) return;
    this.paused = true; this.generation += 1;
    for (const layer of this.layers.values()) this.silence(layer, .025);
    // A removed layer may still be in its short crossfade. It belongs to this
    // scene too, and must stop immediately on pause or backgrounding.
    for (const [source, gain] of this.loopSources) {
      this.ramp(gain.gain, 0, .025); source.stop(this.context.currentTime + .025);
    }
    this.stopCues();
  }
  resume(): void {
    if (this.stopped || !this.paused) return;
    this.paused = false;
    for (const layer of this.layers.values()) this.prepare(layer);
  }
  stop(): void {
    if (this.stopped) return;
    this.stopped = true; this.generation += 1;
    for (const layer of this.layers.values()) this.silence(layer, .08);
    for (const [source, gain] of this.loopSources) {
      this.ramp(gain.gain, 0, .08); source.stop(this.context.currentTime + .08);
    }
    this.layers.clear(); this.stopCues();
  }
  private stopCues(): void {
    for (const [source, gain] of this.cues) {
      this.ramp(gain.gain, 0, .025); source.stop(this.context.currentTime + .025);
    }
    this.cues.clear();
  }
  cue(url: string, volume = .7): void {
    if (this.paused || this.stopped) return;
    const generation = this.generation;
    void this.load(url).then(buffer => {
      if (generation !== this.generation || this.paused || this.stopped || this.cues.size >= 4) return;
      const source = this.context.createBufferSource(), gain = this.context.createGain();
      source.buffer = buffer; gain.gain.value = volume;
      source.connect(gain); gain.connect(this.output); this.cues.set(source, gain);
      source.onended = () => { this.cues.delete(source); source.disconnect(); gain.disconnect(); };
      source.start();
    }).catch(() => { /* Optional Foley never blocks typing or progression. */ });
  }
  status(): SoundscapeStatus {
    return { paused: this.paused, stopped: this.stopped, cues: this.cues.size,
      layers: [...this.layers.values()].map(layer => ({ id: layer.spec.id, playing: !!layer.source,
        offset: layer.buffer ? (layer.offset + (layer.source ? this.context.currentTime - layer.startedAt : 0)) % layer.buffer.duration : 0,
        duration: layer.buffer?.duration ?? null, loaded: !!layer.buffer, failed: layer.failed })) };
  }
}
