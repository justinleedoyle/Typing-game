// Original Portalwright score and environmental Foley. No samples, soundfonts,
// third-party compositions or voices. Regenerate with Node + installed ffmpeg.
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const rate = 32000, out = new URL('../art/audio/', import.meta.url);
mkdirSync(out, { recursive: true });
let seed = 73641;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
function track(seconds) { return [new Float32Array(rate * seconds), new Float32Array(rate * seconds)]; }
function add(a, sample, index, pan = 0) {
  const i = ((index % a[0].length) + a[0].length) % a[0].length;
  a[0][i] += sample * Math.sqrt((1 - pan) / 2);
  a[1][i] += sample * Math.sqrt((1 + pan) / 2);
}
function note(a, midi, time, strength, pan, glass = false) {
  const frequency = 440 * 2 ** ((midi - 69) / 12), duration = glass ? 7 : 5;
  // Dispersive string partials and a soft felt attack, rather than a sustained
  // oscillator pad. Higher modes decay sooner, leaving space between phrases.
  const phases = Array.from({ length: 7 }, () => random() * Math.PI * 2);
  for (let i = 0; i < duration * rate; i++) {
    const t = i / rate, attack = 1 - Math.exp(-t / (glass ? .025 : .012));
    let sample = 0;
    for (let h = 1; h <= 7; h++) {
      const partial = glass ? [1, 2.003, 3.99, 5.43, 6.8, 8.21, 10.3][h - 1] : h * Math.sqrt(1 + .00014 * h * h);
      sample += Math.sin(Math.PI * 2 * frequency * partial * t + phases[h - 1])
        * Math.exp(-t * (glass ? .65 + h * .19 : .7 + h * .39)) / h ** (glass ? 2 : 1.7);
    }
    sample *= strength * attack * Math.min(1, (duration - t) * 3);
    const index = Math.round(time * rate) + i;
    add(a, sample, index, pan);
    // Small, discrete room reflections; the return wraps into the loop so the
    // last chord's tail is present underneath the first bar at the seam.
    add(a, sample * .19, index + Math.round(rate * .173), -pan * .7);
    add(a, sample * .1, index + Math.round(rate * .337), pan * .4);
    add(a, sample * .055, index + Math.round(rate * .613), -pan);
  }
}
function score(winter) {
  const a = track(96);
  const chords = winter
    ? [[50,57,62,65,69],[46,53,60,62,65],[53,60,64,69,72],[48,55,62,64,67], [50,57,62,65,69],[43,50,57,62,65],[46,53,60,65,69],[45,52,57,62,64]]
    : [[50,57,62,66,69],[43,50,57,62,67],[47,54,61,66,69],[45,52,59,62,64], [50,57,62,66,69],[43,50,59,62,66],[47,54,62,66,69],[45,52,57,62,64]];
  const motif = winter ? [74,81,76,77,74,72,69,74] : [74,81,76,78,74,73,69,74];
  for (let bar = 0; bar < 24; bar++) {
    const chord = chords[bar % 8], start = bar * 4;
    note(a, chord[0], start + .02, .12, -.25);
    // Broken, unhurried harmony; alternate phrases leave an entire bar open.
    if (bar % 8 !== 7) {
      note(a, chord[2], start + .17, .085, -.48);
      note(a, chord[3], start + 1.48, .065, .32);
      if (bar % 3 !== 1) note(a, chord[4], start + 2.67, .06, .5);
    }
    if (bar % 2 === 0) {
      const phrase = Math.floor(bar / 8), index = Math.floor(bar / 2) % 4;
      note(a, motif[index + (phrase === 1 ? 4 : 0)], start + .7,
        winter ? .075 : .105, .12, winter);
      if (phrase === 2 && index !== 3) note(a, motif[index + 4], start + 2.2, .055, -.13, winter);
    }
  }
  return a;
}
function weather(kind) {
  const a = track(24), size = a[0].length;
  for (let channel = 0; channel < 2; channel++) {
    let low = 0, middle = 0, soft = 0;
    for (let i = 0; i < size + rate * 2; i++) {
      const n = random() * 2 - 1;
      low += .012 * (n - low); middle += .12 * (n - middle); soft += .035 * (n - soft);
      const t = i / rate;
      const swell = .6 + .19 * Math.sin(t * Math.PI * 2 / 8 + channel * .7) + .14 * Math.sin(t * Math.PI * 2 / 24);
      const value = kind === 'wind' ? (soft - low * .65) * swell * .9
        : kind === 'stream' ? (middle - low) * (.56 + .1 * Math.sin(t * 3.14)) * .5
          : (low * .6 + middle * .1) * .19;
      if (i >= rate * 2) a[channel][i - rate * 2] = value;
    }
  }
  // Overlap the end with the beginning, then trim that overlapped beginning.
  // The final sample now leads into the first retained sample, not a second
  // copy of the crossfade. This keeps the filtered noise continuous.
  const fade = rate * 2;
  for (const data of a) for (let i = 0; i < fade; i++) {
    const mix = i / fade;
    data[size - fade + i] = data[size - fade + i] * (1 - mix) + data[i] * mix;
  }
  if (kind === 'hearth') for (let time = .7; time < 23; time += .8 + random() * 2) {
    const pan = (random() - .5) * .8, length = .015 + random() * .035;
    for (let i = 0; i < length * rate; i++) add(a, (random() * 2 - 1) * .026 * Math.exp(-i / (rate * .008)), Math.round(time * rate) + i, pan);
  }
  return a.map(data => data.slice(fade));
}
function foley(kind) {
  const a = track(2);
  let low = 0;
  for (let i = 0; i < rate * 1.7; i++) {
    const t = i / rate, n = random() * 2 - 1;
    low += .06 * (n - low);
    let value = 0;
    if (kind === 'snow') value = (n * .16 + low * 1.4) * Math.exp(-t * 15) * (1 - Math.exp(-t * 120));
    if (kind === 'wood') value = (low * 1.1 + Math.sin(2 * Math.PI * (96 - t * 18) * t) * .08) * Math.exp(-t * 6) * (1 - Math.exp(-t * 80));
    if (kind === 'stone') value = (low * .7 + Math.sin(2 * Math.PI * 214 * t) * .08 * Math.exp(-t * 26)) * Math.exp(-t * 9) * (1 - Math.exp(-t * 140));
    if (kind === 'bough') value = (n - low) * .07 * Math.exp(-(((t - .14) / .13) ** 2));
    if (kind === 'flame') value = (low * .8 + n * .04) * Math.exp(-t * 4) * (1 - Math.exp(-t * 7));
    add(a, value, i, .1);
  }
  return a;
}
const report = [];
function save(name, a) {
  const frames = a[0].length, pcm = Buffer.alloc(frames * 4);
  let peak = 0, sum = 0;
  for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) {
    const value = a[c][i]; peak = Math.max(peak, Math.abs(value)); sum += value * value;
    if (Math.abs(value) > .96 || !Number.isFinite(value)) throw new Error(`Invalid/headroomless sample in ${name}`);
    pcm.writeInt16LE(Math.round(value * 32767), i * 4 + c * 2);
  }
  const temp = join(tmpdir(), `portalwright-${name}.pcm`); writeFileSync(temp, pcm);
  const result = spawnSync('ffmpeg', ['-v','error','-y','-f','s16le','-ar',String(rate),'-ac','2','-i',temp,'-codec:a','libmp3lame','-b:a','128k','-map_metadata','-1',new URL(`${name}.mp3`,out).pathname]);
  if (result.status !== 0) throw new Error(result.stderr?.toString() || 'ffmpeg failed');
  report.push({ name, seconds: frames / rate, peak, rms: Math.sqrt(sum / frames / 2), sampleRate: rate, channels: 2 });
}
save('hearth-theme', score(false)); save('winter-theme', score(true));
for (const kind of ['hearth','wind','stream']) save(kind, weather(kind));
for (const kind of ['snow','wood','stone','bough','flame']) save(kind, foley(kind));
writeFileSync(new URL('render-report.json',out), JSON.stringify({generator:'Original deterministic DSP; seed73641; no source samples or voices',tracks:report},null,2)+'\n');
console.log(JSON.stringify(report));
