// Original, provisional Sky Island palette. Stable files allow the music to
// be replaced independently of the atmosphere, action sounds and saved journey.
// No samples, soundfonts, third-party compositions, voices or provider calls.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const rate = 32000, out = new URL('../art/audio/', import.meta.url);
mkdirSync(out, { recursive: true });
const initialSeed = 387241;
let seed = initialSeed;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const track = seconds => [new Float32Array(rate * seconds), new Float32Array(rate * seconds)];
function add(a, value, index, pan = 0) {
  const i = ((index % a[0].length) + a[0].length) % a[0].length;
  a[0][i] += value * Math.sqrt((1 - pan) / 2);
  a[1][i] += value * Math.sqrt((1 + pan) / 2);
}

function airHarp(a, midi, time, strength, pan, high = false) {
  const frequency = 440 * 2 ** ((midi - 69) / 12), duration = high ? 7 : 6;
  const phases = Array.from({ length: 6 }, () => random() * Math.PI * 2);
  for (let i = 0; i < duration * rate; i++) {
    const t = i / rate;
    let value = 0;
    // Softly plucked, slightly dispersive strings with an airy harmonic tail.
    // Each note decays to silence; no sustained pad or ringing beat grid.
    for (let h = 1; h <= 6; h++) {
      const partial = h * Math.sqrt(1 + .0001 * h * h);
      value += Math.sin(Math.PI * 2 * frequency * partial * t + phases[h - 1])
        * Math.exp(-t * (.58 + h * (high ? .18 : .32))) / h ** 2.15;
    }
    value *= strength * (1 - Math.exp(-t * 34)) * Math.min(1, (duration - t) * 3);
    const index = Math.round(time * rate) + i;
    add(a, value, index, pan);
    // Sparse open-air reflections; tails wrap naturally around the score loop.
    for (const [delay, gain] of [[.227,.13],[.503,.075],[.811,.035]]) {
      add(a, value * gain, index + Math.round(delay * rate), -pan * .8);
    }
  }
}

function score(clear) {
  const a = track(96);
  const chords = clear
    ? [[50,57,62,66,69],[43,55,59,62,67],[47,54,62,66,69],[45,57,61,64,69],
       [50,57,62,66,74],[43,55,59,66,69],[47,54,62,66,71],[45,57,62,64,69]]
    : [[50,57,62,64,69],[43,55,59,62,69],[47,54,62,65,69],[45,57,62,64,69],
       [50,57,62,66,69],[43,55,62,64,67],[47,54,61,65,69],[45,57,62,64,71]];
  // The established D/A/E family, lifted above the Forge's lower register.
  // Wide, unequal gaps leave the reading and moving-scroll tasks unhurried.
  const motif = clear ? [74,81,76,78,74,73,76,74] : [74,81,76,77,74,72,76,69];
  for (let section = 0; section < 8; section++) {
    const chord = chords[section], start = section * 12;
    airHarp(a, chord[0], start + .13, .10, -.27);
    airHarp(a, chord[2], start + 1.31, .065, .36);
    airHarp(a, motif[section], start + 3.17, clear ? .092 : .078, .08, true);
    if (section % 3 !== 2) airHarp(a, chord[3], start + 6.83, .052, -.39);
    if (clear && [1,4,6].includes(section)) airHarp(a, chord[4] + 12, start + 9.41, .032, .41, true);
    if (!clear && [2,5].includes(section)) airHarp(a, chord[4], start + 8.53, .043, .3);
  }
  return a;
}

function wind() {
  const a = track(24), size = a[0].length, fade = rate * 2;
  for (let c = 0; c < 2; c++) {
    let low = 0, soft = 0, middle = 0;
    for (let i = 0; i < size + fade; i++) {
      const n = random() * 2 - 1, t = i / rate;
      low += .007 * (n - low); soft += .04 * (n - soft); middle += .12 * (n - middle);
      const swell = .58 + .15 * Math.sin(Math.PI * 2 * t / 14 + c * .57)
        + .09 * Math.sin(Math.PI * 2 * t / 22 + c * 1.1);
      const value = ((soft - low * .8) * .54 + (middle - soft) * .09) * swell;
      if (i >= fade) a[c][i - fade] = value;
    }
  }
  // Crossfade the end to the beginning and trim the overlapped beginning so
  // the last retained sample leads into the first retained sample exactly.
  for (const data of a) for (let i = 0; i < fade; i++) {
    const mix = i / fade;
    data[size - fade + i] = data[size - fade + i] * (1 - mix) + data[i] * mix;
  }
  return a.map(data => data.slice(fade));
}

function paper() {
  const a = track(22);
  // Paper lantern skins and loose page edges stirred at irregular intervals;
  // broad soft swishes, without identifiable speech, birds or clock pulses.
  for (const [time, pan, duration, strength] of [
    [1.31,-.42,1.7,.19],[5.87,.36,2.1,.16],[11.43,-.14,1.3,.20],
    [16.19,.47,2.4,.14],[20.67,-.32,1.8,.17],
  ]) {
    let middle = 0, low = 0;
    for (let i = 0; i < duration * rate; i++) {
      const t = i / rate, n = random() * 2 - 1;
      middle += .16 * (n - middle); low += .026 * (n - low);
      const envelope = Math.sin(Math.PI * t / duration) ** 2;
      const flutter = .8 + .12 * Math.sin(19 * t + time) + .06 * Math.sin(31 * t);
      add(a, (middle - low) * envelope * flutter * strength, Math.round(time * rate) + i, pan);
    }
  }
  return a;
}

function cue(kind) {
  const a = track(3), duration = 2.8;
  let low = 0, middle = 0, soft = 0;
  for (let i = 0; i < duration * rate; i++) {
    const t = i / rate, n = random() * 2 - 1;
    low += .028 * (n - low); soft += .075 * (n - soft); middle += .19 * (n - middle);
    const tail = Math.min(1, (duration - t) * 4);
    let value = 0;
    if (kind === 'stone') {
      value = (low * .66 + Math.sin(Math.PI * 2 * 237 * t) * .047 * Math.exp(-t * 20))
        * Math.exp(-t * 7) * (1 - Math.exp(-t * 110));
    }
    if (kind === 'lantern') {
      value = ((soft - low * .6) * .48 + (middle - soft) * .10)
        * Math.exp(-t * 2.9) * (1 - Math.exp(-t * 8));
    }
    if (kind === 'book') {
      const cover = low * .54 * Math.exp(-t * 8) * (1 - Math.exp(-t * 85));
      const page = (middle - low) * .21 * Math.exp(-(((t - .28) / .19) ** 2));
      value = cover + page;
    }
    if (kind === 'tether') {
      const fiber = Math.sin(Math.PI * 2 * (331 * t - 68 * t * t)) * .022
        * Math.exp(-t * 15) * (1 - Math.exp(-t * 90));
      const air = (soft - low * .65) * .65 * Math.exp(-(((t - .48) / .38) ** 2));
      value = fiber + air;
    }
    add(a, value * tail, i, .06);
  }
  return a;
}

const report = [], temp = mkdtempSync(join(tmpdir(), 'portalwright-sky-audio-'));
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
  save('sky-theme', score(false)); save('sky-clear-theme', score(true));
  save('sky-wind', wind()); save('sky-paper', paper());
  for (const kind of ['stone','lantern','book','tether']) save(`sky-${kind}`, cue(kind));
  writeFileSync(new URL('sky-render-report.json', out), JSON.stringify({status:'Temporary replaceable production palette',
    generator:`Original deterministic DSP; seed${initialSeed}; no source samples, soundfonts, provider calls or voices`,
    scope:'Pre-encode and decoded MP3 technical measurements; no physical listening or artistic approval implied', tracks:report}, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  rmSync(temp, {recursive:true, force:true});
}
