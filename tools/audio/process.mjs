// Turns the downloaded sound files into small, even, app-ready MP3s.
// node process.mjs <rawDir> <outDir>
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { MPEGDecoder } from 'mpg123-decoder';

const require = createRequire(import.meta.url);
// lamejs 1.2.1 bug: its modules expect these as globals.
globalThis.MPEGMode = require('lamejs/src/js/MPEGMode.js');
globalThis.Lame = require('lamejs/src/js/Lame.js');
globalThis.BitStream = require('lamejs/src/js/BitStream.js');
const lamejs = require('lamejs');
const [raw, out] = process.argv.slice(2);

// name: { src (prefix in rawDir), max seconds, mode, kbps, gain (dB after normalising), fadeIn/Out ms, stereo }
const JOBS = {
  crowd: { src: 'mixkit-crowd-', mode: 'loop', max: 30, kbps: 80, target: -18 },
  open: { src: 'mixkit-open-', max: 7 },
  title: { src: 'mixkit-title-', max: 7 },
  drumroll: { src: 'mixkit-drumroll-', max: 9, target: -16 },
  slowmo: { src: 'mixkit-slowmo-', max: 3.2 },
  fireball: { src: 'mixkit-fireball-', max: 3 },
  thunder: { src: 'mixkit-thunder-', max: 5 },
  laser: { src: 'mixkit-laser-', max: 3.5 },
  rocket: { src: 'mixkit-rocket-', max: 3.5 },
  meteor: { src: 'mixkit-meteor-', max: 3.5 },
  curve: { src: 'mixkit-curve-', max: 2.5 },
  shatter: { src: 'mixkit-shatter-', max: 2.5 },
  cheer: { src: 'mixkit-cheer-', max: 7, target: -14 },
  clash: { src: 'mixkit-clash-', max: 4 },
  whistle: { src: 'mixkit-whistle-', max: 1.5 },
  fanfare: { src: 'mixkit-fanfare-', max: 8 },
  fireworks: { src: 'mixkit-fireworks-', max: 7 },
  // Pixabay (downloaded by hand):
  pop: { src: 'freesound_community-pickleball', mode: 'transient', max: 0.45, kbps: 96 },
  'dhol-hit': { src: 'kaazoom-dhol-and-neon-15-sec-stinger', max: 7, stereo: true, kbps: 112 },
  music: { src: 'kaazoom-dhol-and-neon-1-min-edit', max: 60, stereo: true, kbps: 112, target: -17, fadeOut: 1500 },
  dhols: { src: 'freesound_community-indian-wedding-dhols', mode: 'loudest', max: 6, kbps: 96, fadeIn: 200, fadeOut: 900 },
};

const db = x => 20 * Math.log10(Math.max(1e-9, x));
const peakOf = ch => ch.reduce((m, c) => { for (let i = 0; i < c.length; i++) m = Math.max(m, Math.abs(c[i])); return m; }, 0);
const rmsOf = (c, a = 0, b = c.length) => { let s = 0; for (let i = a; i < b; i++) s += c[i] * c[i]; return Math.sqrt(s / Math.max(1, b - a)); };

async function decode(file) {
  const d = new MPEGDecoder();
  await d.ready;
  const r = d.decode(new Uint8Array(readFileSync(file)));
  d.free();
  return { channels: r.channelData.map(c => c.slice(0, r.samplesDecoded)), rate: r.sampleRate };
}

function encode(channels, rate, kbps) {
  const enc = new lamejs.Mp3Encoder(channels.length, rate, kbps);
  const toI16 = c => { const o = new Int16Array(c.length); for (let i = 0; i < c.length; i++) o[i] = Math.max(-32768, Math.min(32767, Math.round(c[i] * 32767))); return o; };
  const pcm = channels.map(toI16);
  const parts = [];
  for (let i = 0; i < pcm[0].length; i += 1152) {
    const buf = channels.length === 2 ? enc.encodeBuffer(pcm[0].subarray(i, i + 1152), pcm[1].subarray(i, i + 1152)) : enc.encodeBuffer(pcm[0].subarray(i, i + 1152));
    if (buf.length) parts.push(Buffer.from(buf));
  }
  const end = enc.flush();
  if (end.length) parts.push(Buffer.from(end));
  return Buffer.concat(parts);
}

const files = readdirSync(raw);
const report = [];
for (const [name, job] of Object.entries(JOBS)) {
  const file = files.find(f => f.startsWith(job.src));
  if (!file) { report.push(`${name}: (no source file yet)`); continue; }
  let { channels, rate } = await decode(join(raw, file));
  // Mono unless asked to keep stereo.
  if (!job.stereo || channels.length < 2) {
    const m = new Float32Array(channels[0].length);
    for (const c of channels) for (let i = 0; i < m.length; i++) m[i] += c[i] / channels.length;
    channels = [m];
  }
  const len = channels[0].length;
  const mono = channels[0];
  let a = 0;
  let b = len;
  const max = Math.round((job.max ?? 10) * rate);
  if (job.mode === 'transient') {
    // The sharpest single hit with quiet around it: highest peak/neighbourhood ratio.
    const win = Math.round(0.02 * rate);
    let best = 0;
    let score = 0;
    for (let i = win * 10; i < len - win * 30; i += win) {
      const hit = rmsOf(mono, i, i + win);
      const before = rmsOf(mono, i - win * 8, i - win);
      const after = rmsOf(mono, i + win * 6, i + win * 20);
      const s = hit / (before + after * 0.7 + 1e-4);
      if (hit > 0.05 && s > score) { score = s; best = i; }
    }
    a = Math.max(0, best - Math.round(0.01 * rate));
    b = Math.min(len, a + max);
  } else if (job.mode === 'loudest') {
    const win = Math.round(0.25 * rate);
    let best = 0;
    let top = 0;
    for (let i = 0; i + max < len; i += win) { const r = rmsOf(mono, i, i + max); if (r > top) { top = r; best = i; } }
    a = best;
    b = Math.min(len, a + max);
  } else if (job.mode === 'loop') {
    // A slice from the middle; edges cross-faded so it loops without a click.
    a = Math.max(0, Math.round(len / 2 - max / 2));
    b = Math.min(len, a + max);
  } else {
    // Skip leading silence (-45 dBFS), cap the length.
    const th = 10 ** (-45 / 20);
    while (a < len && Math.abs(mono[a]) < th) a++;
    a = Math.max(0, a - Math.round(0.005 * rate));
    b = Math.min(len, a + max);
  }
  channels = channels.map(c => c.slice(a, b));
  const n = channels[0].length;
  // Fades.
  const fi = Math.round(((job.fadeIn ?? (job.mode === 'loop' ? 1200 : 4)) / 1000) * rate);
  const fo = Math.round(((job.fadeOut ?? (job.mode === 'loop' ? 1200 : b - a < len - a ? 350 : 30)) / 1000) * rate);
  for (const c of channels) {
    for (let i = 0; i < fi && i < n; i++) c[i] *= i / fi;
    for (let i = 0; i < fo && i < n; i++) c[n - 1 - i] *= i / fo;
  }
  if (job.mode === 'loop') {
    // Overlap the faded tail onto the head for a seamless loop, then drop the tail.
    for (const c of channels) for (let i = 0; i < fo; i++) c[i] += c[n - fo + i];
    channels = channels.map(c => c.slice(0, n - fo));
  }
  // Level: peak to -1 dBFS, or RMS to a target loudness (then capped at -1 dBFS peak).
  let g;
  if (job.target) g = 10 ** (job.target / 20) / Math.max(1e-6, rmsOf(channels[0]));
  else g = 10 ** (-1 / 20) / Math.max(1e-6, peakOf(channels));
  const pk = peakOf(channels) * g;
  if (pk > 10 ** (-1 / 20)) g *= 10 ** (-1 / 20) / pk;
  for (const c of channels) for (let i = 0; i < c.length; i++) c[i] *= g;
  const mp3 = encode(channels, rate, job.kbps ?? 96);
  writeFileSync(join(out, `${name}.mp3`), mp3);
  report.push(`${name}: ${(channels[0].length / rate).toFixed(2)}s ${channels.length}ch ${Math.round(mp3.length / 1024)}KB (from ${file}, peak ${db(peakOf(channels)).toFixed(1)} dB)`);
}
console.log(report.join('\n'));
