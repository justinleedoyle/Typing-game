// Original, provisional Clockwork Forge palette. Stable filenames allow later
// music replacement without changing scenes, saves or environmental recordings.
// No samples, soundfonts, third-party compositions, voices or provider calls.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const rate = 32000, out = new URL('../art/audio/', import.meta.url);
mkdirSync(out, { recursive: true });
const initialSeed = 251903;
let seed = initialSeed;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const track = seconds => [new Float32Array(rate * seconds), new Float32Array(rate * seconds)];
function add(a, value, index, pan = 0) {
  const i = ((index % a[0].length) + a[0].length) % a[0].length;
  a[0][i] += value * Math.sqrt((1 - pan) / 2);
  a[1][i] += value * Math.sqrt((1 + pan) / 2);
}

function struckString(a, midi, time, strength, pan) {
  const frequency = 440 * 2 ** ((midi - 69) / 12), duration = 6;
  const phases = Array.from({ length: 6 }, () => random() * Math.PI * 2);
  for (let i = 0; i < duration * rate; i++) {
    const t = i / rate;
    let value = 0;
    // A worn, softly struck metal/string resonator. Upper modes die quickly;
    // neither a sustained brass pad nor a periodic anvil/clock percussion bed.
    for (let h = 1; h <= 6; h++) {
      const partial = h * Math.sqrt(1 + .00032 * h * h);
      value += Math.sin(Math.PI * 2 * frequency * partial * t + phases[h - 1])
        * Math.exp(-t * (.7 + h * .38)) / h ** 1.95;
    }
    value *= strength * (1 - Math.exp(-t * 47)) * Math.min(1, (duration - t) * 3);
    const index = Math.round(time * rate) + i;
    add(a, value, index, pan);
    // Reflections and tails wrap to the next loop; there is no hard end fade.
    for (const [delay, gain] of [[.131,.18],[.287,.09],[.479,.045]]) {
      add(a, value * gain, index + Math.round(delay * rate), -pan * .8);
    }
  }
}

function score(clear) {
  const a = track(96);
  const chords = clear
    ? [[50,57,62,66,69],[43,55,59,62,67],[47,54,62,66,69],[45,57,61,64,69]]
    : [[50,57,62,65,69],[46,53,60,62,65],[43,55,59,62,67],[45,52,59,62,64]];
  // Related to the established home D/A/E motif, an octave lower and with
  // deliberately different placement/voicing from the submerged Bell study.
  const motif = [62,69,64,clear ? 66 : 65,62,clear ? 61 : 60];
  for (let bar = 0; bar < 12; bar++) {
    const chord = chords[bar % 4], start = bar * 8;
    struckString(a, chord[0], start + .09, clear ? .115 : .105, -.24);
    if (bar % 4 !== 3) {
      struckString(a, chord[2], start + 1.13, .07, .26);
      struckString(a, chord[3], start + 4.61, .055, -.38);
    }
    if (bar % 2 === 0) struckString(a, motif[Math.floor(bar / 2)], start + 2.47, .095, .12);
    if (clear && [2,6,9].includes(bar)) struckString(a, chord[4], start + 6.23, .045, .38);
  }
  return a;
}

function furnace() {
  const a = track(24), size = a[0].length, fade = rate * 2;
  for (let c = 0; c < 2; c++) {
    let low = 0, soft = 0;
    for (let i = 0; i < size + fade; i++) {
      const n = random() * 2 - 1, t = i / rate;
      low += .012 * (n - low); soft += .09 * (n - soft);
      const swell = .6 + .16 * Math.sin(Math.PI * 2 * t / 11 + c * .45)
        + .08 * Math.sin(Math.PI * 2 * t / 22 + c * 1.2);
      const value = (low * .6 + soft * .26) * swell * .52;
      if (i >= fade) a[c][i - fade] = value;
    }
  }
  // Crossfade the last two seconds into the beginning, then retain the next
  // sample after that overlapped beginning. Filtered noise remains continuous.
  for (const data of a) for (let i = 0; i < fade; i++) {
    const mix = i / fade;
    data[size - fade + i] = data[size - fade + i] * (1 - mix) + data[i] * mix;
  }
  return a.map(data => data.slice(fade));
}

function mechanism() {
  const a = track(22);
  // Irregular, rounded bearing/pipe contacts. They are texture, not a metronome
  // or a sequence of hammer/toll hits that could imply a gameplay timing cue.
  for (const [time, pan, length] of [[1.7,-.4,1.1],[6.4,.45,1.8],[12.6,-.16,1.4],[17.1,.3,2],[20.2,-.35,.9]]) {
    let low = 0, soft = 0;
    for (let i = 0; i < length * rate; i++) {
      const t = i / rate, n = random() * 2 - 1;
      low += .018 * (n - low); soft += .08 * (n - soft);
      const envelope = Math.sin(Math.PI * t / length) ** 2;
      add(a, (low * .24 + soft * .08) * envelope, Math.round(time * rate) + i, pan);
    }
  }
  return a;
}

function cue(kind) {
  const a = track(3), duration = 2.8;
  let low = 0, middle = 0;
  for (let i = 0; i < duration * rate; i++) {
    const t = i / rate, n = random() * 2 - 1;
    low += .035 * (n - low); middle += .14 * (n - middle);
    const attack = 1 - Math.exp(-t * 80), tail = Math.min(1, (duration - t) * 4);
    let value = 0;
    if (kind === 'wheel') {
      value = (low * .52 + middle * .10 + Math.sin(Math.PI * 2 * (116 * t - 11 * t * t)) * .035)
        * Math.sin(Math.PI * Math.min(t / 1.6, 1)) ** 2 * Math.exp(-t * 1.7);
    }
    if (kind === 'lock') {
      value = (low * .75 + Math.sin(Math.PI * 2 * 182 * t) * .065 * Math.exp(-t * 12)) * Math.exp(-t * 5.8);
    }
    if (kind === 'gear') {
      value = (low * .65 + middle * .08 + Math.sin(Math.PI * 2 * (154 * t - 17 * t * t)) * .025)
        * Math.exp(-t * 3.7) * (1 - Math.exp(-t * 12));
    }
    if (kind === 'flame') {
      value = (low * .65 + middle * .2) * Math.exp(-t * 2.8) * (1 - Math.exp(-t * 8));
    }
    add(a, value * attack * tail, i, .1);
  }
  return a;
}

const report = [], temp = mkdtempSync(join(tmpdir(), 'portalwright-forge-audio-'));
function save(name, a) {
  const frames = a[0].length, pcm = Buffer.alloc(frames * 4);
  let peak = 0, sum = 0;
  for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) {
    const value = a[c][i]; peak = Math.max(peak, Math.abs(value)); sum += value * value;
    if (!Number.isFinite(value) || Math.abs(value) > .9) throw new Error(`Invalid or loud sample: ${name}`);
    pcm.writeInt16LE(Math.round(value * 32767), i * 4 + c * 2);
  }
  const source = join(temp, `${name}.pcm`), file = new URL(`${name}.mp3`, out).pathname;
  writeFileSync(source, pcm);
  const encoded = spawnSync('ffmpeg', ['-v','error','-y','-f','s16le','-ar',String(rate),'-ac','2','-i',source,
    '-codec:a','libmp3lame','-b:a','128k','-map_metadata','-1',file]);
  if (encoded.status !== 0) throw new Error(encoded.stderr?.toString() || 'ffmpeg encode failed');
  const decoded = spawnSync('ffmpeg', ['-v','error','-i',file,'-f','f32le','-ar',String(rate),'-ac','2','pipe:1'], {maxBuffer:64 * 1024 * 1024});
  if (decoded.status !== 0) throw new Error(decoded.stderr?.toString() || 'ffmpeg decode failed');
  let decodedPeak = 0, decodedSum = 0, nonfinite = 0, fullscale = 0, boundaryJump = 0;
  const samples = decoded.stdout.length / 4;
  if (samples !== frames * 2) throw new Error(`${name} decoded to ${samples / 2 / rate}s rather than ${frames / rate}s`);
  for (let i = 0; i < samples; i++) {
    const value = decoded.stdout.readFloatLE(i * 4);
    if (!Number.isFinite(value)) nonfinite++;
    if (Math.abs(value) >= 1) fullscale++;
    decodedPeak = Math.max(decodedPeak, Math.abs(value)); decodedSum += value * value;
  }
  for (let c = 0; c < 2; c++) boundaryJump = Math.max(boundaryJump,
    Math.abs(decoded.stdout.readFloatLE(c * 4) - decoded.stdout.readFloatLE((samples - 2 + c) * 4)));
  if (nonfinite || fullscale) throw new Error(`${name} has invalid/fullscale decoded samples`);
  const bytes = readFileSync(file);
  report.push({name, seconds:frames / rate, peak, rms:Math.sqrt(sum / frames / 2), sampleRate:rate, channels:2,
    decoded:{seconds:samples / 2 / rate, peak:decodedPeak, peakDbFS:20 * Math.log10(decodedPeak), rms:Math.sqrt(decodedSum / samples), nonfinite, fullscale, boundaryJump},
    bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex')});
}
try {
  save('forge-theme', score(false)); save('forge-clear-theme', score(true));
  save('forge-furnace', furnace()); save('forge-mechanism', mechanism());
  for (const kind of ['wheel','lock','gear','flame']) save(`forge-${kind}`, cue(kind));
  writeFileSync(new URL('forge-render-report.json', out), JSON.stringify({status:'Temporary replaceable production palette',
    generator:`Original deterministic DSP; seed${initialSeed}; no source samples, soundfonts, provider calls or voices`,
    scope:'Pre-encode and decoded MP3 technical measurements; no physical listening or artistic approval implied', tracks:report}, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  rmSync(temp, {recursive:true, force:true});
}
