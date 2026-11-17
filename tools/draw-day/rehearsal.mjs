// Draw-day rehearsal against a running server: plays the host for a whole match-draw event at real
// speed and checks every rule the audience depends on (hidden reveals, double taps, undo, seals,
// every team once, results, knockout, champion, Restart).
//   node tools/draw-day/rehearsal.mjs <main|kids> [aimMs] [drawonly|continue]
//   drawonly = stop after the draw (+ one result 2 s later); continue = resume a draw in progress.
// Server: PICKLEPRO_API (default http://localhost:4000/api). Password: ADMIN_PASSWORD env, else
// server/.env (never printed). WARNING: it starts a NEW match draw — never point it at production
// during an event.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\/]$/, '');
const ev = process.argv[2] === 'kids' ? 'kids' : 'main';
const aimMs = Number(process.argv[3] ?? 3500);
const BASE = process.env.PICKLEPRO_API ?? 'http://localhost:4000/api';
const P = ev === 'kids' ? '/kids/fixtures' : '/fixtures';
const season = JSON.parse(fs.readFileSync(`${ROOT}/client/src/cup/season2.json`, 'utf8'));
const proofText = ({ seq, tie, a, b, salt }) => `PicklePro|cup|v1|${seq}|${tie}|${a}|${b}|${salt}`;
const sha = s => createHash('sha256').update(s).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(`[${ev} ${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s]`, ...a);
let failures = 0;
const check = (cond, msg) => {
  if (!cond) {
    failures++;
    console.log(`  ✗ FAIL: ${msg}`);
  }
  return cond;
};

const pw = process.env.ADMIN_PASSWORD
  ?? /^ADMIN_PASSWORD=(.*)$/m.exec(fs.readFileSync(`${ROOT}/server/.env`, 'utf8'))?.[1].trim().replace(/^["']|["']$/g, '');
const login = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
if (!login.ok) throw new Error(`login ${login.status}`);
const cookie = login.headers.get('set-cookie').split(';')[0];

async function call(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (auth) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${P}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try {
    json = await res.json();
  } catch { /* not json */ }
  return { status: res.status, json };
}
const must = async (path, opts) => {
  const r = await call(path, opts);
  if (r.status !== 200) throw new Error(`${opts?.method ?? 'GET'} ${path} -> ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
};
const state = () => must('/state', { auth: false });
async function waitShow() {
  for (;;) {
    const s = await state();
    if (!s.current) return s;
    await sleep(Math.max(200, Math.min(2000, s.current.doneAt - s.now + 60)));
  }
}
const randomGames = () => {
  let games = Array.from({ length: 6 }, () => (Math.random() < 0.5 ? { sa: 11, sb: 3 + Math.floor(Math.random() * 8) } : { sa: 3 + Math.floor(Math.random() * 8), sb: 11 }));
  // Never 3-3 (that needs the host's decider): turn one of B's games into A's.
  if (games.filter(g => g.sa > g.sb).length === 3) {
    const k = games.findIndex(g => g.sb > g.sa);
    games[k] = { sa: 11, sb: 4 };
  }
  return games;
};

// ---------- Setup ----------
await waitShow();
const teams = season[ev].map(t => ({ name: t.name, players: t.players, color: t.color, logo: t.logo }));
const resume = process.argv[4] === 'continue'; // pick up a draw already in progress
let s;
if (!resume) {
await must('/new', { method: 'POST', body: { name: ev === 'kids' ? 'ICC Season 2 · Kids Match Draw' : 'ICC Season 2 · Match Draw' } });
check((await call('/teams', { method: 'PUT', body: { teams }, auth: false })).status === 401, 'teams without login must be refused');
await must('/teams', { method: 'PUT', body: { teams } });
await must('/settings', { method: 'PATCH', body: { aimMs, weapon: 'auto', courts: 2 } });
s = await state();
check(s.phase === 'setup' && s.teams.length === teams.length, `setup with ${teams.length} teams (got ${s.teams.length})`);
check(s.teams.every((t, i) => t.logo === teams[i].logo), 'every team keeps its bundled logo');
check((await call('/draw', { method: 'POST', body: { tie: 1 } })).status === 409, 'draw before opening is refused');
check((await call('/draw', { method: 'POST', body: { tie: 1 }, auth: false })).status === 401, 'draw without login is refused');
await must('/open', { method: 'POST' });
check((await call('/teams', { method: 'PUT', body: { teams } })).status === 409, 'teams are locked once the arena is open');
log(`arena open, ${teams.length} teams, suspense ${aimMs} ms`);
await sleep(4000); // the arena fly-in
}

// ---------- The draw ----------
let undone = resume;
const showTimes = [];
for (;;) {
  s = await state();
  if (s.phase !== 'draw') break;
  const tie = s.nextTie;
  const started = Date.now();
  // A double tap from two host phones at once: exactly one draw wins.
  const [r1, r2] = await Promise.all([call('/draw', { method: 'POST', body: { tie } }), call('/draw', { method: 'POST', body: { tie } })]);
  check([r1.status, r2.status].sort().join() === '200,409', `match ${tie}: double tap gives one draw (${r1.status}, ${r2.status})`);
  const { seq } = (r1.status === 200 ? r1 : r2).json;
  check((await call('/draw', { method: 'POST', body: { tie: tie + 1 } })).status === 409, `match ${tie}: next draw refused while the show runs`);
  check((await call('/undo', { method: 'POST', body: { seq } })).status === 409, `match ${tie}: undo refused while the show runs`);
  check((await call('/new', { method: 'POST', body: { keepTeams: true } })).status === 409, `match ${tie}: restart refused while the show runs`);
  // Watch the public state like a phone: nobody learns a team before its reveal time.
  let seenA = false;
  let seenB = false;
  for (;;) {
    const p = await state();
    const c = p.current;
    if (!c) break;
    if (c.a) {
      check(p.now >= c.revealA, `match ${tie}: team A visible before its reveal`);
      seenA = true;
    } else check(!p.teams.some(t => t.tie === tie), `match ${tie}: team list leaks the pair before the reveal`);
    if (c.b) {
      check(p.now >= c.revealB, `match ${tie}: team B visible before its reveal`);
      seenB = true;
    }
    check(!p.ties.some(t => t.no === tie && !c.b), `match ${tie}: tie listed before both reveals`);
    await sleep(150);
  }
  check(seenA && seenB, `match ${tie}: both reveals observed during the show`);
  s = await state();
  const t = s.ties.find(x => x.no === tie);
  check(t && t.a && t.b && t.a !== t.b, `match ${tie}: listed with two different teams`);
  check(t?.salt && sha(proofText({ seq, tie, a: s.teams.find(x => x.key === t.a).name, b: s.teams.find(x => x.key === t.b).name, salt: t.salt })) === t.commitment, `match ${tie}: fairness seal verifies`);
  showTimes.push((Date.now() - started) / 1000);
  log(`match ${tie}: ${s.teams.find(x => x.key === t.a).name} v ${s.teams.find(x => x.key === t.b).name} (${t.weapon}, ${showTimes.at(-1).toFixed(1)} s)`);
  if (tie === 2 && !undone && ev === 'main') {
    undone = true;
    await must('/undo', { method: 'POST', body: { seq } });
    const u = await state();
    check(u.nextTie === 2 && !u.ties.some(x => x.no === 2), 'undo takes match 2 back');
    log('undo of match 2 OK, drawing it again');
    await sleep(1500);
    continue;
  }
  await sleep(1200); // host pause between matches
}

// ---------- League checks ----------
s = await state();
check(s.phase === 'league', `phase league after the draw (got ${s.phase})`);
const keys = s.ties.flatMap(t => [t.a, t.b]);
check(s.ties.length === teams.length / 2, `${teams.length / 2} matches drawn (got ${s.ties.length})`);
check(new Set(keys).size === teams.length && keys.length === teams.length, 'every team drawn exactly once');
check(s.remaining.length === 0, 'nobody left over');

if (process.argv[4] === 'drawonly') {
  // A result 2 s after "all set" (used to freeze the overlay on screens), then stop.
  await sleep(2000);
  await must('/result', { method: 'PUT', body: { tie: s.ties[0].id, games: randomGames() } });
  log(`draw only — ${failures ? `${failures} FAILURES` : 'all checks passed'}`);
  process.exit(failures ? 1 : 0);
}

// ---------- Results, knockout ----------
check((await call('/result', { method: 'PUT', body: { tie: s.ties[0].id, games: randomGames().slice(0, 5) } })).status === 400, 'results need all 6 games');
check((await call('/result', { method: 'PUT', body: { tie: s.ties[0].id, games: [{ sa: 11, sb: 11 }, ...randomGames().slice(1)] } })).status === 400, 'a level game score is refused');
check((await call('/result', { method: 'PUT', body: { tie: 'nope', games: randomGames() } })).status === 404, 'unknown match refused');
for (const t of s.ties) await must('/result', { method: 'PUT', body: { tie: t.id, games: randomGames() } });
s = await state();
check(s.ties.every(t => t.winner), 'every match has a winner');
const seeds = s.standings.slice(0, s.knockout.seedCount).map(r => r.key);
// Adults: the server builds the line-up from the standings; teams level on games + points (random
// scores can do that) must be decided first, as the host would.
for (const g of s.qualification?.blocking ?? []) await must('/tiebreak', { method: 'POST', body: { teams: g.teams, reason: 'Rehearsal: decided by the script', by: 'rehearsal' } });
await must('/seed', { method: 'POST', body: { seeds } });
for (let round = 0; round < 5; round++) {
  s = await state();
  if (s.phase === 'done') break;
  const open = s.knockout.ties.filter(t => t.a && t.b && !t.winner);
  for (const t of open) await must('/result', { method: 'PUT', body: { tie: t.id, games: randomGames() } });
}
s = await state();
check(s.phase === 'done' && s.knockout.champion, 'a champion is crowned');
log(`champion: ${s.teams.find(t => t.key === s.knockout.champion)?.name}`);

// ---------- Restart for the real show ----------
await must('/new', { method: 'POST', body: { keepTeams: true } });
s = await state();
check(s.phase === 'setup' && s.teams.length === teams.length && s.ties.length === 0, 'restart: setup, same teams, nothing drawn');
check(s.teams.every((t, i) => t.name === teams[i].name && t.logo === teams[i].logo), 'restart keeps names and logos');
check(s.aimMs === aimMs, 'restart keeps the settings');
log(`done — ${failures ? `${failures} FAILURES` : 'all checks passed'}; shows avg ${(showTimes.reduce((a, b) => a + b, 0) / showTimes.length).toFixed(1)} s`);
process.exit(failures ? 1 : 0);
