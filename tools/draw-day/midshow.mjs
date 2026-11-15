// Server restart in the middle of a show (LOCAL server only):
//   node tools/draw-day/midshow.mjs draw     -> opens the main arena (if needed) and draws a match
//   (now stop and restart the server while the show runs)
//   node tools/draw-day/midshow.mjs watch    -> after the restart: reveals still on time, match complete?
//   node tools/draw-day/midshow.mjs restart  -> host Restart (same teams, nothing drawn)
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\/]$/, '');
const API = process.env.PICKLEPRO_API ?? 'http://localhost:4000/api';
const BASE = `${API}/fixtures`;
const MEMO = `${os.tmpdir()}/picklepro-midshow.json`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pw = process.env.ADMIN_PASSWORD
  ?? /^ADMIN_PASSWORD=(.*)$/m.exec(fs.readFileSync(`${ROOT}/server/.env`, 'utf8'))?.[1].trim().replace(/^["']|["']$/g, '');

async function login() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
      if (r.ok) return r.headers.get('set-cookie').split(';')[0];
    } catch { /* server still starting */ }
    await sleep(500);
  }
  throw new Error('no login');
}
const state = async () => (await fetch(`${BASE}/state`)).json();

if (process.argv[2] === 'restart') {
  const cookie = await login();
  const r = await fetch(`${BASE}/new`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ keepTeams: true }) });
  const s = await state();
  console.log('restart', r.status, 'phase', s.phase, 'teams', s.teams.length, 'ties', s.ties.length);
} else if (process.argv[2] === 'draw') {
  const cookie = await login();
  const post = (p, body) => fetch(`${BASE}${p}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }).then(async r => ({ status: r.status, json: await r.json() }));
  let s = await state();
  if (s.phase === 'setup') console.log('open', (await post('/open')).status);
  s = await state();
  const r = await post('/draw', { tie: s.nextTie });
  s = await state();
  fs.writeFileSync(MEMO, JSON.stringify({ seq: r.json.seq, tie: r.json.tie, revealA: s.current.revealA, revealB: s.current.revealB, doneAt: s.current.doneAt }));
  console.log('drew', r.status, JSON.stringify(r.json), 'revealA in', s.current.revealA - s.now, 'ms; doneAt in', s.current.doneAt - s.now, 'ms');
} else {
  const memo = JSON.parse(fs.readFileSync(MEMO, 'utf8'));
  let s;
  for (let i = 0; i < 120; i++) {
    try {
      s = await state();
      break;
    } catch {
      await sleep(500);
    }
  }
  console.log('server back; now - revealA =', s.now - memo.revealA, 'ms; current:', s.current ? `match ${s.current.tie}, a=${s.current.a ?? 'hidden'} b=${s.current.b ?? 'hidden'}` : 'none');
  // Watch until the show ends: teams must appear exactly at their reveal times, never early.
  let fails = 0;
  for (;;) {
    s = await state();
    const c = s.current;
    if (!c) break;
    if (c.a && s.now < memo.revealA) fails++;
    if (c.b && s.now < memo.revealB) fails++;
    if (!c.a && s.now > memo.revealA + 1100) { fails++; console.log('team A late', s.now - memo.revealA); }
    if (!c.b && s.now > memo.revealB + 1100) { fails++; console.log('team B late', s.now - memo.revealB); }
    await sleep(200);
  }
  const t = s.ties.find(x => x.no === memo.tie);
  console.log(t?.a && t?.b && t.salt ? `match ${memo.tie} complete after the restart: ${t.a} v ${t.b}, seal key published` : 'MATCH MISSING', fails ? `${fails} FAILURES` : 'all reveal checks passed');
}
