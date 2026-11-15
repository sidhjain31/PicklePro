// N simulated phones in the main match-draw room: how late does each reveal reach each phone, and
// does any phone ever see a team early? Run while a draw is going (e.g. with rehearsal.mjs).
//   node tools/draw-day/crowdload.mjs [phones=300] [seconds=60]      (server: PICKLEPRO_SOCKET)
// Uses socket.io-client from server/node_modules (run `npm install` in server/ first).
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../server/package.json', import.meta.url));
const SOCKET = process.env.PICKLEPRO_SOCKET ?? 'http://localhost:4000';
const { io } = require('socket.io-client');
const N = Number(process.argv[2] ?? 300);
const SECONDS = Number(process.argv[3] ?? 60);
const lags = [];
let early = 0;
let states = 0;
let connected = 0;
let errors = 0;
const sockets = [];
for (let i = 0; i < N; i++) {
  const s = io(SOCKET, { transports: ['websocket'], auth: { role: 'audience', viewer: `load-${i}`, event: 'main', module: 'cup' }, reconnection: true });
  const seen = new Set();
  let first = true;
  s.on('connect', () => connected++);
  s.on('connect_error', () => errors++);
  s.on('cup:state', st => {
    states++;
    const c = st.current;
    const joined = first;
    first = false;
    if (!c) return;
    for (const [side, at] of [['a', c.revealA], ['b', c.revealB]]) {
      const key = `${c.seq}${side}`;
      if (c[side] && !seen.has(key)) {
        seen.add(key);
        if (st.now < at) early++;
        if (!joined) lags.push(Date.now() - at); // the first state is a catch-up, not a live reveal // same machine: same clock as the server
      }
    }
  });
  sockets.push(s);
  if (i % 50 === 49) await new Promise(r => setTimeout(r, 200));
}
await new Promise(r => setTimeout(r, SECONDS * 1000));
const sorted = [...lags].sort((a, b) => a - b);
const pct = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
console.log(JSON.stringify({ phones: N, connected, connectErrors: errors, statesReceived: states, reveals: lags.length, early, lagMs: lags.length ? { min: sorted[0], p50: pct(0.5), p95: pct(0.95), max: sorted.at(-1) } : null }));
sockets.forEach(s => s.close());
process.exit(0);
