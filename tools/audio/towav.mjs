// node towav.mjs <in.mp3> <out.wav> — full decode to 16-bit PCM WAV (all channels).
import { readFileSync, writeFileSync } from 'node:fs';
import { MPEGDecoder } from 'mpg123-decoder';
const [src, dst] = process.argv.slice(2);
const d = new MPEGDecoder(); await d.ready;
const r = d.decode(new Uint8Array(readFileSync(src)));
const ch = r.channelData.length, n = r.samplesDecoded, sr = r.sampleRate;
const buf = Buffer.alloc(44 + n * ch * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * ch * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(sr, 24);
buf.writeUInt32LE(sr * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * ch * 2, 40);
let o = 44;
for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, r.channelData[c][i])); buf.writeInt16LE(Math.round(v * 32767), o); o += 2; }
writeFileSync(dst, buf);
console.log(dst.split(/[\/]/).pop(), `${ch}ch ${sr}Hz ${(n / sr).toFixed(2)}s`);
d.free();
