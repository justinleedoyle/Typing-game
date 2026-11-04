import { SoundscapePlayer } from "../src/audio/soundscapePlayer";
import { assert, assertClose, assertEqual, suite } from "./_assert";

// Web Audio is the inert boundary. Source scheduling, playheads, generation
// checks, layer ownership and cue admission execute in the production player.
function fixture(initiallyPaused = false) {
  const sources: any[] = [], gains: any[] = [], requests: any[] = [];
  const output = { name: "master-output" };
  const node = () => ({ connections: [] as any[], disconnected: 0,
    connect(target: any) { this.connections.push(target); return target; },
    disconnect() { this.disconnected++; } });
  const context = {
    currentTime: 0,
    createGain() {
      const gain = { ...node(), gain: { value: 1, events: [] as any[],
        cancelScheduledValues(time: number) { this.events.push(["cancel", time]); },
        setValueAtTime(value: number, time: number) { this.value = value; this.events.push(["set", value, time]); },
        linearRampToValueAtTime(value: number, time: number) { this.events.push(["ramp", value, time]); },
      } }; gains.push(gain); return gain;
    },
    createBufferSource() {
      const source: any = { ...node(), loop: false, buffer: null, onended: null, started: false,
        ended: false, starts: [], stops: [], stopAt: Infinity,
        start(when = 0, offset = 0) { this.started = true; this.starts.push({ when, offset });
          this.naturalEnd = this.loop ? Infinity : context.currentTime + this.buffer.duration - offset; },
        stop(when = context.currentTime) { this.stops.push(when); this.stopAt = when; },
        finish() { if (this.ended) return; this.ended = true; this.onended?.(); },
      }; sources.push(source); return source;
    },
  };
  const load = (url: string) => new Promise<AudioBuffer>((resolve, reject) => requests.push({ url, resolve, reject, settled: false }));
  const player = new SoundscapePlayer(context as any, output as any, load, initiallyPaused);
  return { player, context, output, sources, gains, requests,
    active: () => sources.filter(source => source.started && !source.ended),
    resolve(url: string, duration = 10) { const pending = requests.find(request => request.url === url && !request.settled);
      assert(pending, `a real load is pending for ${url}`); pending.settled = true; pending.resolve({ duration }); },
    reject(url: string) { const pending = requests.find(request => request.url === url && !request.settled);
      assert(pending, `a failed request is pending for ${url}`); pending.settled = true; pending.reject(new Error("fixture decode unavailable")); },
    advance(seconds: number) { context.currentTime += seconds;
      for (const source of sources) if (source.started && !source.ended && context.currentTime >= Math.min(source.stopAt, source.naturalEnd)) source.finish(); },
  };
}
const layer = (id: string, gain = .5) => ({ id, url: `/${id}.mp3`, gain });
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

await suite("Soundscape player: one live source per layer, output ownership and gain-only changes", async () => {
  const f = fixture(); f.player.setLayers([layer("music"), layer("wind", .3)]);
  assertEqual(f.requests.map(request => request.url), ["/music.mp3", "/wind.mp3"], "each desired layer loads once");
  f.player.setLayers([layer("music", .2), layer("wind", .4)]);
  assertEqual(f.requests.length, 2, "repeated moods cannot multiply pending asset loads");
  f.resolve("/music.mp3"); f.resolve("/wind.mp3"); await settle();
  assertEqual([f.sources.length, f.player.status().layers.map(value => value.playing)], [2, [true, true]], "each decoded layer starts one owned loop");
  for (const source of f.sources) {
    assert(source.loop && source.connections.length === 1, "every musical layer is a loop with one local gain");
    assertEqual(source.connections[0].connections, [f.output], "all sound reaches only the supplied preference-controlled output");
  }
  f.player.setLayers([layer("music", .1), layer("wind", .25)]);
  assertEqual(f.sources.length, 2, "changing a mood's mix keeps both live playheads");
  assertEqual(f.gains.map(gain => gain.gain.events.at(-1)), [["ramp", .1, .8], ["ramp", .25, .8]], "mix changes ramp the existing gains instead of restarting music");
  const stoppedAt = f.context.currentTime; f.player.stop();
  assert(f.sources.every(source => source.stopAt <= stoppedAt + .08), "shutdown bounds every source's de-click tail to80ms");
  f.advance(.081);
  assertEqual(f.active(), [], "stop terminates all currently owned loops");
  assert(f.sources.every(source => source.disconnected === 1) && f.gains.every(gain => gain.disconnected === 1), "ended loops release both sides of their local output chain");
});

await suite("Soundscape player: delayed loads cannot start after pause, mood removal or stop", async () => {
  const f = fixture(true); f.player.setLayers([layer("music")]);
  assertEqual(f.requests, [], "initially paused scenes do not request or start optional audio");
  f.player.resume(); f.player.resume(); assertEqual(f.requests.length, 1, "repeated resume starts one pending load");
  f.player.pause(); f.resolve("/music.mp3"); await settle();
  assertEqual([f.sources.length, f.player.status().layers[0]!.loaded], [0, true], "a decode may finish while paused but cannot create a source");
  f.player.resume(); assertEqual(f.sources.length, 1, "deliberate resume can use the successfully decoded buffer");
  f.player.setLayers([layer("wind")]); f.player.setLayers([]); f.resolve("/wind.mp3"); await settle();
  assertEqual(f.sources.length, 1, "a removed mood's late load cannot resurrect its loop");
  f.player.setLayers([layer("stream")]); f.player.stop(); f.resolve("/stream.mp3"); await settle();
  assertEqual([f.sources.length, f.player.status().stopped, f.player.status().layers], [1, true, []], "a retired player remains empty after its final pending decode");
  f.player.resume(); f.player.setLayers([layer("again")]); f.player.cue("/step.mp3");
  assertEqual(f.requests.length, 3, "stale controls cannot add asset requests to a stopped owner");
});

await suite("Soundscape player: pause preserves independent wrapped playheads without time-away catch-up", async () => {
  const f = fixture(); f.player.setLayers([layer("music"), layer("wind")]);
  f.resolve("/music.mp3", 10); f.resolve("/wind.mp3", 3); await settle();
  f.advance(8.5); f.player.pause();
  assert(f.sources.every(source => source.stopAt <= f.context.currentTime + .025), "pause bounds its de-click tail to25ms");
  f.advance(.026);
  assertEqual(f.player.status().layers.map(value => value.offset), [8.5, 2.5], "each paused loop saves its own wrapped audio position");
  assertEqual(f.active(), [], "pause stops actual sources rather than hiding only their status");
  const stops = f.sources.map(source => [...source.stops]);
  f.player.pause(); f.advance(600);
  assertEqual(f.sources.map(source => source.stops), stops, "repeated pause is harmless and cannot keep stopping retired nodes");
  assertEqual(f.player.status().layers.map(value => value.offset), [8.5, 2.5], "ten minutes away consumes no playhead time");
  f.player.resume(); f.player.resume();
  assertEqual(f.sources.slice(2).map(source => source.starts[0].offset), [8.5, 2.5], "resume creates exactly one replacement at each saved position");
  assertEqual(f.sources.length, 4, "a duplicate resume cannot overlap replacement loops");
  f.advance(4.25); f.player.pause();
  for (const [index, expected] of [2.75, .75].entries()) assertClose(f.player.status().layers[index]!.offset, expected, 1e-9, "subsequent pauses preserve only active elapsed audio time");
  f.player.stop(); f.player.stop(); f.player.resume(); f.advance(.081);
  assertEqual([f.player.status().stopped, f.active()], [true, []], "repeated stop/resume cannot revive a completed lifecycle");
});

await suite("Soundscape cues: load races, concurrency cap and natural completion never queue a hidden burst", async () => {
  const f = fixture(); f.player.cue("/old-step.mp3"); f.player.pause(); f.player.resume();
  f.resolve("/old-step.mp3"); await settle();
  assertEqual(f.sources, [], "a cue requested before interruption is not replayed after resume");
  for (let i = 0; i < 7; i++) f.player.cue(`/cue${i}.mp3`, .2);
  for (let i = 0; i < 7; i++) f.resolve(`/cue${i}.mp3`, 2);
  await settle();
  assertEqual([f.sources.length, f.player.status().cues], [4, 4], "concurrent material cues are capped at four actual sources");
  assert(f.sources.every(source => !source.loop && source.connections[0].gain.value === .2), "one-shots use their own intended cue volume and never loop");
  f.sources[0].finish(); f.sources[1].finish();
  assertEqual(f.player.status().cues, 2, "natural endings release cue admission immediately");
  f.player.cue("/new-step.mp3"); f.resolve("/new-step.mp3"); await settle();
  assertEqual(f.player.status().cues, 3, "later deliberate actions can sound after earlier cues finish");
  f.player.pause(); f.advance(.026);
  assertEqual([f.player.status().cues, f.active()], [0, []], "pause fades and disconnects in-flight cues within25ms instead of leaving a hidden tail");
  f.player.cue("/paused.mp3"); assert(!f.requests.some(request => request.url === "/paused.mp3"), "paused cues do not even begin decoding");
  f.player.resume(); f.player.cue("/late.mp3"); f.player.stop(); f.resolve("/late.mp3"); await settle();
  assertEqual(f.sources.length, 5, "a decode that completes after stop cannot add another cue");
});

await suite("Soundscape failure: optional decode failure stays silent and a later request can recover", async () => {
  const f = fixture(); f.player.setLayers([layer("music")]); f.reject("/music.mp3"); await settle();
  assertEqual(f.player.status().layers.map(value => [value.playing, value.failed]), [[false, true]], "failed optional music reports its bounded state without a source");
  f.player.setLayers([layer("music")]);
  assertEqual(f.requests.length, 2, "a deliberate repeat can retry a failed layer");
  f.resolve("/music.mp3"); await settle();
  assertEqual(f.player.status().layers.map(value => [value.playing, value.failed]), [[true, false]], "successful retry replaces the failure state with one live loop");
  f.player.cue("/unavailable.mp3"); f.reject("/unavailable.mp3"); await settle();
  assertEqual(f.player.status().cues, 0, "a failed optional Foley does not enter the active cue set");
  f.player.stop(); f.advance(.081);
});

await suite("Soundscape crossfades: removed loops release normally and interruptions cut every fading tail", async () => {
  const f = fixture(); f.player.setLayers([layer("old")]); f.resolve("/old.mp3"); await settle();
  f.advance(2); f.player.setLayers([layer("next")]); f.resolve("/next.mp3"); await settle();
  assertEqual(f.active().length, 2, "a normal mood change briefly overlaps old and new layers for its fade");
  f.advance(.56);
  assertEqual([f.sources[0].disconnected, f.gains[0].disconnected, f.active().length], [1, 1, 1], "the old fade releases its source and gain after its scheduled end");
  f.player.setLayers([layer("third")]);
  f.player.pause();
  assert(f.sources.every(source => source.ended || source.stopAt <= f.context.currentTime + .025), "interruption replaces every removed loop's long crossfade with a bounded25ms de-click tail");
  f.advance(.026);
  assertEqual(f.active(), [], "interruption stops a removed loop that is still fading after it left the layer map");
  f.resolve("/third.mp3"); await settle();
  f.player.resume(); f.player.setLayers([]); f.player.stop(); f.advance(.081);
  assertEqual(f.active(), [], "shutdown also terminates a fading layer even after an empty mood removed it");
});
