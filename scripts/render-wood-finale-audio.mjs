// Original, provisional Whispering Wood, finale and homecoming palette. Stable files allow the music to
// be replaced independently of the atmosphere, action sounds and saved journey.
// No samples, soundfonts, third-party compositions, voices or provider calls.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const rate = 32000, out = new URL('../art/audio/', import.meta.url);
mkdirSync(out, { recursive: true });
const initialSeed = 592813;
let seed = initialSeed;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const track = seconds => [new Float32Array(rate * seconds), new Float32Array(rate * seconds)];
function add(a, value, index, pan = 0) {
  const i = ((index % a[0].length) + a[0].length) % a[0].length;
  a[0][i] += value * Math.sqrt((1 - pan) / 2);
  a[1][i] += value * Math.sqrt((1 + pan) / 2);
}

function stringNote(a, midi, time, strength, pan, palette) {
  const frequency = 440 * 2 ** ((midi - 69) / 12), duration = palette === 'finale' ? 8 : 6;
  const phases = Array.from({ length: 6 }, () => random() * Math.PI * 2);
  for (let i = 0; i < duration * rate; i++) {
    const t = i / rate;
    let value = 0;
    // A softly struck wooden/string body. Finale notes open more slowly;
    // every note decays, rather than maintaining an endless ominous pad.
    for (let h = 1; h <= 6; h++) {
      const partial = h * Math.sqrt(1 + .00019 * h * h);
      value += Math.sin(Math.PI * 2 * frequency * partial * t + phases[h - 1])
        * Math.exp(-t * ((palette === 'finale' ? .35 : .63) + h * .24)) / h ** 2.1;
    }
    value *= strength * (1 - Math.exp(-t * (palette === 'finale' ? 8 : 30))) * Math.min(1, (duration - t) * 3);
    const index = Math.round(time * rate) + i;
    add(a, value, index, pan);
    for (const [delay, gain] of [[.193,.15],[.419,.08],[.733,.035]]) {
      add(a, value * gain, index + Math.round(delay * rate), -pan * .8);
    }
  }
}

function score(palette) {
  const a = track(96);
  const chords = {
    wood: [[50,57,62,65,69],[46,53,60,62,65],[43,55,59,62,67],[45,57,60,64,69]],
    woodClear: [[50,57,62,66,69],[43,55,59,62,67],[47,54,62,66,69],[45,57,61,64,69]],
    finale: [[38,50,57,60,64],[41,53,60,64,67],[43,55,58,62,69],[45,57,60,62,64]],
    home: [[50,57,62,66,69],[43,55,59,62,69],[47,54,62,66,69],[45,57,61,64,69]],
  }[palette];
  const motif = {
    wood: [62,69,64,65,62,60,57,62],
    woodClear: [62,69,64,66,62,61,57,62],
    finale: [62,64,60,57,62,65,64,57],
    home: [74,81,76,78,76,73,69,74],
  }[palette];
  // One musical family throughout the journey, with different register,
  // harmony and unequal placement for the forest, confrontation and return.
  for (let section = 0; section < 8; section++) {
    const chord = chords[section % 4], start = section * 12;
    stringNote(a, chord[0], start + .17, palette === 'finale' ? .108 : .105, -.24, palette);
    if (palette !== 'finale' || section % 2 === 0) stringNote(a, chord[2], start + 2.43, .064, .34, palette);
    stringNote(a, motif[section], start + (palette === 'home' ? 4.27 : 5.13), palette === 'home' ? .102 : .078, .08, palette);
    if (section % 3 !== 2 && palette !== 'finale') stringNote(a, chord[3], start + 8.57, .05, -.38, palette);
    if (palette === 'home' && [1,4,6].includes(section)) stringNote(a, chord[4] + 12, start + 10.29, .03, .4, palette);
    // Home's last phrase settles on D with no new triumphant percussion.
    if (palette === 'home' && section === 7) stringNote(a, 62, start + 9.71, .076, -.12, palette);
  }
  return a;
}

function air(kind) {
  const a = track(24), size = a[0].length, fade = rate * 2;
  for (let c = 0; c < 2; c++) {
    let low = 0, soft = 0, middle = 0;
    for (let i = 0; i < size + fade; i++) {
      const n = random() * 2 - 1, t = i / rate;
      low += .009 * (n - low); soft += .043 * (n - soft); middle += .12 * (n - middle);
      const swell = .60 + .14 * Math.sin(Math.PI * 2 * t / 14 + c * .48)
        + .08 * Math.sin(Math.PI * 2 * t / 22 + c * 1.1);
      const value = kind === 'wood'
        ? ((soft - low * .75) * .43 + low * .13) * swell
        : ((soft - low * .5) * .47 + (middle - soft) * .045) * swell;
      if (i >= fade) a[c][i - fade] = value;
    }
  }
  for (const data of a) for (let i = 0; i < fade; i++) {
    const mix = i / fade;
    data[size - fade + i] = data[size - fade + i] * (1 - mix) + data[i] * mix;
  }
  return a.map(data => data.slice(fade));
}

function leaves() {
  const a = track(22);
  // Irregular soft canopy/leaf movement, not footsteps or imaginary voices.
  for (const [time, pan, duration, strength] of [
    [.87,-.42,1.2,.18],[4.63,.32,2.3,.14],[10.71,-.18,1.7,.17],
    [15.43,.46,1.4,.19],[20.39,-.36,2.2,.15],
  ]) {
    let middle = 0, low = 0;
    for (let i = 0; i < duration * rate; i++) {
      const t = i / rate, n = random() * 2 - 1;
      middle += .15 * (n - middle); low += .034 * (n - low);
      const envelope = Math.sin(Math.PI * t / duration) ** 2;
      const flutter = .8 + .11 * Math.sin(23 * t + time) + .055 * Math.sin(37 * t);
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
    low += .031 * (n - low); soft += .077 * (n - soft); middle += .18 * (n - middle);
    const tail = Math.min(1, (duration - t) * 4);
    let value = 0;
    if (kind === 'root') {
      value = (low * .69 + (middle - low) * .10)
        * Math.exp(-t * 6.8) * (1 - Math.exp(-t * 105));
    }
    if (kind === 'stone') {
      value = (low * .56 + Math.sin(Math.PI * 2 * 191 * t) * .043 * Math.exp(-t * 23))
        * Math.exp(-t * 7) * (1 - Math.exp(-t * 115));
    }
    if (kind === 'lantern') {
      value = ((soft - low * .55) * .53 + (middle - soft) * .075)
        * Math.exp(-t * 2.7) * (1 - Math.exp(-t * 9));
    }
    if (kind === 'seal') {
      const contact = low * .53 * Math.exp(-t * 8) * (1 - Math.exp(-t * 95));
      const release = (soft - low * .75) * .36 * Math.exp(-(((t - .39) / .31) ** 2));
      value = contact + release;
    }
    add(a, value * tail, i, .06);
  }
  return a;
}

const report = [], temp = mkdtempSync(join(tmpdir(), 'portalwright-wood-finale-audio-'));
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
  save('wood-theme', score('wood')); save('wood-clear-theme', score('woodClear'));
  save('wood-air', air('wood')); save('wood-leaves', leaves());
  for (const kind of ['root','stone','lantern','seal']) save(`wood-${kind}`, cue(kind));
  save('finale-theme', score('finale')); save('finale-air', air('ruins'));
  save('homecoming-theme', score('home'));
  writeFileSync(new URL('wood-finale-render-report.json', out), JSON.stringify({status:'Temporary replaceable production palette',
    generator:`Original deterministic DSP; seed${initialSeed}; no source samples, soundfonts, provider calls or voices`,
    scope:'Pre-encode and decoded MP3 technical measurements; no physical listening or artistic approval implied', tracks:report}, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  rmSync(temp, {recursive:true, force:true});
}
