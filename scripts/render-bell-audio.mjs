// Temporary, original Bell palette. Replace the MP3 assets independently of
// scene logic later; this generator never touches Opening/Winter recordings.
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const rate = 32000, out = new URL('../art/audio/', import.meta.url);
mkdirSync(out, { recursive: true });
let seed = 148307;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const track = seconds => [new Float32Array(rate * seconds), new Float32Array(rate * seconds)];
function add(a, value, index, pan = 0) {
  const i = ((index % a[0].length) + a[0].length) % a[0].length;
  a[0][i] += value * Math.sqrt((1 - pan) / 2);
  a[1][i] += value * Math.sqrt((1 + pan) / 2);
}
function pluck(a, midi, time, strength, pan) {
  const frequency = 440 * 2 ** ((midi - 69) / 12), phases = Array.from({ length: 5 }, () => random() * Math.PI * 2);
  for (let i = 0; i < rate * 7; i++) {
    const t = i / rate;
    let value = 0;
    for (let h = 1; h <= 5; h++) value += Math.sin(2 * Math.PI * frequency * h * t + phases[h - 1]) * Math.exp(-t * (.6 + h * .28)) / h ** 2.1;
    value *= strength * (1 - Math.exp(-t * 55)) * Math.min(1, (7 - t) * 2);
    const index = Math.round(time * rate) + i;
    add(a, value, index, pan);
    for (const [delay, gain] of [[.29,.22],[.63,.12],[1.07,.06]]) add(a, value * gain, index + Math.round(delay * rate), -pan);
  }
}
function score(clear) {
  const a = track(96);
  const chords = clear ? [[50,57,62,66,69],[43,55,59,62,67],[47,54,62,66,69],[45,57,61,64,69]]
    : [[50,57,62,65,69],[46,53,60,62,65],[43,55,62,65,69],[45,52,59,62,64]];
  for (let bar = 0; bar < 12; bar++) {
    const chord = chords[bar % 4], start = bar * 8;
    pluck(a, chord[0], start + .03, .13, -.28);
    pluck(a, chord[2], start + .64, .075, .23);
    if (bar % 4 !== 3) pluck(a, chord[3], start + 3.73, .07, -.35);
    if (bar % 2 === 0) pluck(a, [74,76,81,clear ? 78 : 77,74,69][Math.floor(bar / 2)], start + 1.89, .08, .32);
    if (bar >= 8 && bar !== 11) pluck(a, chord[4], start + 5.27, .045, .1);
  }
  return a;
}
function water() {
  const a = track(24), size = a[0].length;
  for (let c = 0; c < 2; c++) {
    let low = 0, soft = 0;
    for (let i = 0; i < size + rate * 2; i++) {
      const n = random() * 2 - 1, t = i / rate;
      low += .007 * (n - low); soft += .045 * (n - soft);
      const value = (soft - low * .85) * (.45 + .12 * Math.sin(t * Math.PI * 2 / 11 + c * .7)) * .65;
      if (i >= rate * 2) a[c][i - rate * 2] = value;
    }
  }
  const fade = rate * 2;
  for (const data of a) for (let i = 0; i < fade; i++) data[size - fade + i] = data[size - fade + i] * (1 - i / fade) + data[i] * (i / fade);
  return a.map(data => data.slice(fade));
}
function masonry() {
  const a = track(22);
  // A few filtered, non-periodic masonry contacts: no drone or toll pattern.
  for (const [time, pan] of [[2.3,-.6],[9.8,.45],[18.1,-.2]]) {
    let low = 0;
    for (let i = 0; i < rate * 1.8; i++) {
      const t = i / rate; low += .018 * (random() * 2 - 1 - low);
      add(a, low * .2 * Math.sin(Math.PI * t / 1.8) ** 2, Math.round(time * rate) + i, pan);
    }
  }
  return a;
}
function cue(kind) {
  const a = track(3); let low = 0;
  for (let i = 0; i < rate * 2.8; i++) {
    const t = i / rate, n = random() * 2 - 1; low += .045 * (n - low);
    const onset = 1 - Math.exp(-t * 65), tail = Math.min(1, (2.8 - t) * 4);
    let value = 0;
    if (kind === 'lantern') value = (low * .45 + Math.sin(2 * Math.PI * (580 * t - 80 * t * t)) * .027) * Math.exp(-t * 7);
    if (kind === 'latch') value = (low * .6 + Math.sin(2 * Math.PI * 147 * t) * .055 * Math.exp(-t * 7)) * Math.exp(-t * 4.5);
    if (kind === 'rubble') value = (low * .75 + n * .015) * Math.exp(-t * 3.5);
    // A short water/stone unbinding texture, not a choir/voice or bell toll.
    if (kind === 'release') value = low * .55 * Math.exp(-t * 2.4) * (1 - Math.exp(-t * 8));
    add(a, value * onset * tail, i, .12);
  }
  return a;
}
const report = [];
function save(name, a) {
  const frames = a[0].length, pcm = Buffer.alloc(frames * 4); let peak = 0, sum = 0;
  for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) {
    const value = a[c][i]; peak = Math.max(peak, Math.abs(value)); sum += value * value;
    if (!Number.isFinite(value) || Math.abs(value) > .9) throw new Error(`Invalid or loud sample: ${name}`);
    pcm.writeInt16LE(Math.round(value * 32767), i * 4 + c * 2);
  }
  const temp = join(tmpdir(), `portalwright-${name}.pcm`); writeFileSync(temp, pcm);
  const result = spawnSync('ffmpeg', ['-v','error','-y','-f','s16le','-ar',String(rate),'-ac','2','-i',temp,'-codec:a','libmp3lame','-b:a','128k','-map_metadata','-1',new URL(`${name}.mp3`,out).pathname]);
  if (result.status !== 0) throw new Error(result.stderr?.toString() || 'ffmpeg failed');
  report.push({ name, seconds: frames / rate, peak, rms: Math.sqrt(sum / frames / 2), sampleRate: rate, channels: 2 });
}
save('bell-theme', score(false)); save('bell-clear-theme', score(true));
save('bell-water', water()); save('bell-masonry', masonry());
for (const kind of ['lantern','latch','rubble','release']) save(`bell-${kind}`, cue(kind));
writeFileSync(new URL('bell-render-report.json',out), JSON.stringify({ status:'Temporary replaceable production palette', generator:'Original deterministic DSP; seed148307; no source samples or voices',tracks:report},null,2)+'\n');
console.log(JSON.stringify(report));
