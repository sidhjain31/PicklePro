// Match-day load: N phones open the page at the same moment (GET /state) and stay connected (socket),
// while the host saves scores fast. Checks every phone gets every update, how late, and how big an
// update is. Needs a drawn main draw in the league phase. NEVER run against production.
//   node tools/draw-day/matchday-load.mjs [phones=500] [saves=60] [gapMs=500]
// Server: PICKLEPRO_API (default http://localhost:4000/api), PICKLEPRO_SOCKET; ADMIN_PASSWORD env.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const require = createRequire(`${ROOT}/server/package.json`);
const { io } = require('socket.io-client');
const API = process.env.PICKLEPRO_API ?? 'http://localhost:4000/api';
const SOCKET = process.env.PICKLEPRO_SOCKET ?? 'http://localhost:4000';
if (/onrender\.com|vercel\.app/.test(API + SOCKET)) throw new Error('Never load-test production');
const N = Number(process.argv[2] ?? 500);
const SAVES = Number(process.argv[3] ?? 60);
const GAP = Number(process.argv[4] ?? 500);
const pw = process.env.ADMIN_PASSWORD ?? /^ADMIN_PASSWORD=(.*)$/m.exec(fs.readFileSync(`${ROOT}/server/.env`, 'utf8'))?.[1].trim();
const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] : NaN);

// 1. Everyone opens the page at once.
const t0 = Date.now();
const gets = await Promise.all(Array.from({ length: N }, async () => {
  const s = Date.now();
  const r = await fetch(`${API}/fixtures/state`);
  const body = await r.text();
  return { ms: Date.now() - s, ok: r.ok, bytes: body.length };
}));
const first = JSON.parse(await (await fetch(`${API}/fixtures/state`)).text());
console.log(`${N} page loads at once: ${gets.filter(g => g.ok).length} OK in ${Date.now() - t0} ms (p50 ${pct(gets.map(g => g.ms), 0.5)} ms, p95 ${pct(gets.map(g => g.ms), 0.95)} ms); state = ${(gets[0].bytes / 1024).toFixed(1)} KB, phase ${first.phase}`);
if (first.phase !== 'league' && first.phase !== 'knockout') throw new Error('Needs a drawn main draw (league or knockout phase)');

// 2. N phones on the live socket.
let connected = 0;
let errors = 0;
const seen = Array.from({ length: N }, () => new Map()); // lastChangeAt -> arrival time
const sockets = [];
for (let i = 0; i < N; i++) {
  const s = io(SOCKET, { transports: ['websocket'], auth: { role: 'audience', viewer: `md-${i}`, event: 'main', module: 'cup' } });
  s.on('connect', () => connected++);
  s.on('connect_error', () => errors++);
  s.on('cup:state', st => { if (st.lastChangeAt && !seen[i].has(st.lastChangeAt)) seen[i].set(st.lastChangeAt, Date.now()); });
  sockets.push(s);
  if (i % 50 === 49) await new Promise(r => setTimeout(r, 150));
}
await new Promise(r => setTimeout(r, 2000));
console.log(`sockets: ${connected}/${N} connected, ${errors} connect errors`);

// 3. The host saves scores fast (the same match, game 1 alternates 15-11 / 15-12: winners unchanged).
const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
if (!login.ok) throw new Error(`login ${login.status}`);
const cookie = login.headers.get('set-cookie').split(';')[0];
const tie = first.ties.find(t => t.games.every(g => g.sa != null && g.sb != null)) ?? first.ties[0];
const sends = [];
const putMs = [];
for (let k = 0; k < SAVES; k++) {
  const games = tie.games.map((g, i) => (i === 0 ? { sa: g.sa >= g.sb ? Math.max(g.sb + 1, 15) : g.sa, sb: g.sa >= g.sb ? (k % 2 ? 12 : 11) : g.sb } : g));
  const s = Date.now();
  const r = await fetch(`${API}/fixtures/result`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ tie: tie.id, games, by: 'load test' }) });
  if (!r.ok) throw new Error(`save ${k}: ${r.status} ${await r.text()}`);
  putMs.push(Date.now() - s);
  sends.push(s);
  await new Promise(res => setTimeout(res, GAP));
}
await new Promise(r => setTimeout(r, 3000));

// 4. Did every phone get every save, and how late?
const lags = [];
let missing = 0;
for (const m of seen) {
  const arrivals = [...m.values()].slice(-SAVES); // the last SAVES distinct updates = our saves, in order
  if (arrivals.length < SAVES) missing += SAVES - arrivals.length;
  arrivals.forEach((at, k) => lags.push(at - sends[sends.length - arrivals.length + k]));
}
console.log(`${SAVES} saves (every ${GAP} ms): save p50 ${pct(putMs, 0.5)} ms, p95 ${pct(putMs, 0.95)} ms`);
console.log(`updates delivered: ${N * SAVES - missing}/${N * SAVES}; on the phone after the save started: p50 ${pct(lags, 0.5)} ms, p95 ${pct(lags, 0.95)} ms, max ${Math.max(...lags)} ms`);
console.log(`data per save to all phones ≈ ${((gets[0].bytes * N) / 1024 / 1024).toFixed(1)} MB`);
sockets.forEach(s => s.close());
process.exit(missing ? 1 : 0);
