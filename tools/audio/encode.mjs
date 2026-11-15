// WAV (16-bit PCM) -> MP3 with lamejs. node encode.mjs <in.wav> <out.mp3> [kbps=96] [mono|stereo]
// Run from tools/audio after `npm install` (lamejs, mpg123-decoder).
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// lamejs 1.2.1 bug: its modules expect these as globals.
globalThis.MPEGMode = require('lamejs/src/js/MPEGMode.js');
globalThis.Lame = require('lamejs/src/js/Lame.js');
globalThis.BitStream = require('lamejs/src/js/BitStream.js');
const lamejs = require('lamejs');

const [src, dst, kbpsArg = '96', modeArg = 'mono'] = process.argv.slice(2);
const buf = readFileSync(src);
let p = 12;
let fmt;
let data;
while (p < buf.length) {
  const id = buf.toString('ascii', p, p + 4);
  const size = buf.readUInt32LE(p + 4);
  if (id === 'fmt ') fmt = { ch: buf.readUInt16LE(p + 10), sr: buf.readUInt32LE(p + 12) };
  if (id === 'data') data = buf.subarray(p + 8, p + 8 + size);
  p += 8 + size + (size % 2);
}
const pcm = new Int16Array(data.buffer, data.byteOffset, data.length / 2);
const n = pcm.length / fmt.ch;
const L = new Int16Array(n);
const R = new Int16Array(n);
for (let i = 0; i < n; i++) {
  L[i] = pcm[i * fmt.ch];
  R[i] = fmt.ch > 1 ? pcm[i * fmt.ch + 1] : L[i];
}
const stereo = modeArg === 'stereo';
const enc = new lamejs.Mp3Encoder(stereo ? 2 : 1, fmt.sr, Number(kbpsArg));
const M = stereo ? null : Int16Array.from(L, (v, i) => (v + R[i]) >> 1);
const out = [];
for (let i = 0; i < n; i += 1152) {
  const chunk = stereo ? enc.encodeBuffer(L.subarray(i, i + 1152), R.subarray(i, i + 1152)) : enc.encodeBuffer(M.subarray(i, i + 1152));
  if (chunk.length) out.push(Buffer.from(chunk));
}
out.push(Buffer.from(enc.flush()));
writeFileSync(dst, Buffer.concat(out));
console.log(dst.split(/[\/]/).pop(), `${(n / fmt.sr).toFixed(2)} s`, `${Math.round(Buffer.concat(out).length / 1024)} KB`);
