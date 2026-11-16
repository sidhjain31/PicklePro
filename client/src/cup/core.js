// Match draw ("fixtures") rules — shared by the server (server/src/fixtures.js) and the pages
// (client/src/cup/*), so both read the cup the same way. Pure functions over a plain "cup"
// object: no I/O, no globals, randomness is passed in. Separate from the team auction: teams come
// from the final-teams PDF the host uploads.
//
// Format (from the organisers' sheet): every team plays one tie against a drawn opponent. A tie is
// six doubles games, same categories against each other: A/B, C/D, A/C, B/D, A/D, B/C.
// Then a knockout: 8+ teams -> QF (1v8, 2v7, 3v6, 4v5) -> SF (QF1/QF2, QF3/QF4) -> Final;
// fewer teams (kids, 4) -> Final (1st v 2nd) + 3rd/4th place (3rd v 4th).

export const SLOTS = ['A', 'B', 'C', 'D'];
export const GAMES = [['A', 'B'], ['C', 'D'], ['A', 'C'], ['B', 'D'], ['A', 'D'], ['B', 'C']];
export const GAME_CODES = GAMES.map(g => g.join('/'));
// Smash Arena shots: each match of the draw is decided by one of these (the last pair is 'fate').
export const WEAPONS = ['fireball', 'thunder', 'laser', 'rocket', 'meteor', 'curve'];
// Show timeline. The server reveals each team at a fixed time; every screen animates around it.
// strikeMs = lock-on, toss, slow-motion smash, flight, impact and the team rising.
export const TIMING = { introMs: 1800, strikeMs: 3800, vsMs: 7800, fateMs: 2600 };
// Default team colours (vivid on the navy arena); a team's own colour or logo colour wins.
export const PALETTE = ['#e63946', '#3a86ff', '#ffbe0b', '#06d6a0', '#8338ec', '#fb5607', '#00b4d8', '#ff006e', '#8ac926', '#f4a261',
  '#9b5de5', '#2ec4b6', '#ef476f', '#4cc9f0', '#ffd166', '#7209b7', '#00f5d4', '#ff595e', '#1982c4', '#f15bb5',
  '#80ed99', '#ff9f1c', '#c77dff', '#118ab2', '#e9c46a', '#f72585', '#2a9d8f', '#ffafcc'];
const HEX = /^#[0-9a-f]{6}$/i;
// A logo is the hash of an uploaded image, or a bundled file "s:<name>" (served from /season2/logos).
const HASH = /^([0-9a-f]{16,64}|s:[a-z0-9][a-z0-9_.-]{0,60}\.(webp|png|jpe?g))$/;
export const AIM_MIN = 1500;
export const AIM_MAX = 9000;
export const MAX_TEAMS = 64;

export const cupError = (status, message) => Object.assign(new Error(message), { status });
const fail = (status, message) => { throw cupError(status, message); };

// Same cleaning as the auction's names: NFC, invisible characters removed, spaces collapsed.
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F­​-‍⁠﻿‪-‮⁦-⁩]/g;
export const clean = value => String(value ?? '').normalize('NFC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();

export const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
export const formatOf = teamCount => (teamCount >= 8 ? 'qf' : 'final');
export const seedCountOf = teamCount => (formatOf(teamCount) === 'qf' ? 8 : 4);

export function newCup({ event = 'main', name } = {}) {
  return {
    event,
    name: clean(name) || (event === 'kids' ? 'Kids Match Draw' : 'Adults Match Draw'),
    status: 'SETUP', // SETUP -> DRAW -> KNOCKOUT (league / done are derived)
    aimMs: 3500,
    weapon: 'auto',
    courts: 2,
    teams: [],
    draws: [],
    results: {},
    seeds: [],
  };
}

// The text that is hashed for the fairness seal. Server and browser must build it identically.
export const proofText = ({ seq, tie, a, b, salt }) => `PicklePro|cup|v1|${seq}|${tie}|${a}|${b}|${salt}`;

// When each team is revealed and when the show for a match ends (server clock, ms).
export function timeline(start, aimMs, last) {
  const { introMs, strikeMs, vsMs, fateMs } = TIMING;
  if (last) {
    const at = start + introMs + fateMs;
    return { revealA: at, revealB: at, doneAt: at + strikeMs + vsMs };
  }
  const revealA = start + introMs + aimMs;
  const revealB = revealA + strikeMs + Math.round(aimMs * 0.8);
  return { revealA, revealB, doneAt: revealB + strikeMs + vsMs };
}

export function cleanTeams(list) {
  if (!Array.isArray(list)) fail(400, 'teams must be a list');
  if (list.length > MAX_TEAMS) fail(400, `At most ${MAX_TEAMS} teams`);
  const teams = list.map((t, i) => ({
    key: `t${i + 1}`,
    name: clean(t?.name).slice(0, 40) || `Team ${i + 1}`,
    players: Object.fromEntries(SLOTS.map(s => [s, clean(t?.players?.[s]).slice(0, 60)])),
    // Look: logo = content hash of an uploaded image (served separately), colour = #rrggbb.
    color: HEX.test(t?.color ?? '') ? t.color.toLowerCase() : PALETTE[i % PALETTE.length],
    logo: HASH.test(t?.logo ?? '') ? t.logo : null,
  }));
  const seen = new Map();
  for (const t of teams) {
    const k = t.name.toLowerCase();
    if (seen.has(k)) fail(400, `Two teams are called "${t.name}" — give each team a different name`);
    seen.set(k, true);
  }
  return teams;
}

export function outcome(games, decider) {
  let ga = 0;
  let gb = 0;
  let pa = 0;
  let pb = 0;
  for (const g of games) {
    if (g.w === 'a') ga++;
    else if (g.w === 'b') gb++;
    pa += g.sa ?? 0;
    pb += g.sb ?? 0;
  }
  const played = ga + gb;
  let winner = null;
  if (ga * 2 > GAMES.length) winner = 'a';
  else if (gb * 2 > GAMES.length) winner = 'b';
  else if (played === GAMES.length) {
    if (decider === 'a' || decider === 'b') winner = decider;
    else if (pa !== pb) winner = pa > pb ? 'a' : 'b';
  }
  return { ga, gb, pa, pb, played, winner, needsDecider: played === GAMES.length && ga === gb && !winner };
}

const hasData = r => Boolean(r && (r.decider || r.games?.some(g => g && (g.w || g.sa != null || g.sb != null))));

function tieOf(cup, t) {
  const r = cup.results?.[t.id];
  const valid = Boolean(r && t.a && t.b && r.a === t.a && r.b === t.b);
  const games = GAMES.map((_, i) => {
    const g = valid ? r.games?.[i] : null;
    return { w: g?.w ?? null, sa: g?.sa ?? null, sb: g?.sb ?? null };
  });
  const decider = valid ? r.decider ?? null : null;
  return { ...t, games, decider, ...outcome(games, decider) };
}

const winnerOf = t => (t?.winner ? t[t.winner] : null);
const loserOf = t => (t?.winner ? t[t.winner === 'a' ? 'b' : 'a'] : null);

function standingsOf(teams, league) {
  const rows = new Map(teams.map(t => [t.key, { key: t.key, p: 0, w: 0, l: 0, gw: 0, gl: 0, pf: 0, pa: 0, order: 1e6 }]));
  for (const t of league) {
    const A = rows.get(t.a);
    const B = rows.get(t.b);
    if (!A || !B) continue;
    A.order = Math.min(A.order, t.no * 2);
    B.order = Math.min(B.order, t.no * 2 + 1);
    A.gw += t.ga; A.gl += t.gb; B.gw += t.gb; B.gl += t.ga;
    A.pf += t.pa; A.pa += t.pb; B.pf += t.pb; B.pa += t.pa;
    if (t.winner) {
      A.p++; B.p++;
      if (t.winner === 'a') { A.w++; B.l++; } else { B.w++; A.l++; }
    }
  }
  return [...rows.values()]
    .map(r => ({ ...r, pd: r.pf - r.pa }))
    .sort((x, y) => y.w - x.w || y.gw - x.gw || y.pd - x.pd || y.pf - x.pf || x.order - y.order)
    .map(({ order, ...r }, i) => ({ ...r, rank: i + 1 }));
}

function knockoutOf(cup) {
  const format = formatOf(cup.teams.length);
  const seeds = cup.status === 'KNOCKOUT' ? cup.seeds ?? [] : [];
  const seed = n => seeds[n - 1] ?? null;
  const make = (id, stage, label, note, a, b, court) => tieOf(cup, { id, stage, label, note, a, b, court });
  const ties = [];
  if (format === 'qf') {
    const qf = [[1, 8], [2, 7], [3, 6], [4, 5]].map(([x, y], i) =>
      make(`QF${i + 1}`, 'QF', `Quarter-final ${i + 1}`, `${ordinal(x)} vs ${ordinal(y)}`, seed(x), seed(y), (i % 2) + 1));
    const sf = [[0, 1], [2, 3]].map(([x, y], i) =>
      make(`SF${i + 1}`, 'SF', `Semi-final ${i + 1}`, `Winners of QF ${x + 1} & QF ${y + 1}`, winnerOf(qf[x]), winnerOf(qf[y]), i + 1));
    ties.push(...qf, ...sf, make('F', 'F', 'Final', 'Winners of the semi-finals', winnerOf(sf[0]), winnerOf(sf[1]), 1));
  } else {
    ties.push(make('F', 'F', 'Final', '1st vs 2nd', seed(1), seed(2), 1));
    ties.push(make('3P', '3P', '3rd / 4th place', '3rd vs 4th', seed(3), seed(4), 2));
  }
  const final = ties.find(t => t.id === 'F');
  return {
    format,
    seedCount: seedCountOf(cup.teams.length),
    locked: seeds.length > 0,
    ties,
    champion: winnerOf(final),
    runnerUp: loserOf(final),
    third: format === 'final' ? winnerOf(ties.find(t => t.id === '3P')) : null,
  };
}

// Everything a screen may see at server time `now`. A drawn team stays hidden until its reveal.
export function view(cup, now) {
  const teams = cup.teams ?? [];
  const courts = cup.courts || 2;
  const active = (cup.draws ?? []).filter(d => !d.voided);
  const running = active.find(d => d.doneAt > now) ?? null;
  const paired = new Map();
  const league = [];
  for (const d of active) {
    if (d.revealA <= now) paired.set(d.a, d.tie);
    if (d.revealB <= now) paired.set(d.b, d.tie);
    if (d.revealB <= now) {
      const revealed = d.doneAt <= now;
      league.push(tieOf(cup, {
        id: `L${d.tie}`, stage: 'L', no: d.tie, label: `Match ${d.tie}`, a: d.a, b: d.b, seq: d.seq, weapon: d.weapon,
        court: ((d.tie - 1) % courts) + 1, round: Math.ceil(d.tie / courts),
        commitment: d.commitment ?? null, salt: revealed ? d.salt ?? null : null,
      }));
    }
  }
  const knockout = knockoutOf(cup);
  const allPaired = teams.length > 0 && paired.size === teams.length;
  const phase = cup.status === 'SETUP' ? 'setup'
    : cup.status === 'KNOCKOUT' ? (knockout.champion ? 'done' : 'knockout')
      : allPaired && !running ? 'league' : 'draw';
  return {
    event: cup.event,
    name: cup.name,
    status: cup.status,
    phase,
    aimMs: cup.aimMs,
    weapon: cup.weapon,
    courts,
    timing: TIMING,
    teams: teams.map(t => ({ ...t, tie: paired.get(t.key) ?? null })),
    remaining: teams.filter(t => !paired.has(t.key)).map(t => t.key),
    totalTies: Math.floor(teams.length / 2),
    nextTie: active.length + 1,
    ties: league,
    current: running && {
      seq: running.seq,
      tie: running.tie,
      weapon: running.weapon,
      last: Boolean(running.last),
      aimMs: running.aimMs,
      startAt: running.startAt,
      revealA: running.revealA,
      revealB: running.revealB,
      doneAt: running.doneAt,
      a: running.revealA <= now ? running.a : null,
      b: running.revealB <= now ? running.b : null,
      commitment: running.commitment ?? null,
    },
    lastSeq: active.at(-1)?.seq ?? null,
    standings: standingsOf(teams, league),
    knockout,
    seeds: cup.status === 'KNOCKOUT' ? cup.seeds : [],
    now,
  };
}

// ---------- Host actions (mutate `cup`; throw cupError on a rule violation) ----------

export function setSettings(cup, body = {}) {
  if (body.name !== undefined) {
    const name = clean(body.name);
    if (!name || name.length > 100) fail(400, 'Name must be 1–100 characters');
    cup.name = name;
  }
  if (body.aimMs !== undefined) {
    if (!Number.isInteger(body.aimMs) || body.aimMs < AIM_MIN || body.aimMs > AIM_MAX) fail(400, `Suspense must be ${AIM_MIN / 1000}–${AIM_MAX / 1000} seconds`);
    cup.aimMs = body.aimMs;
  }
  if (body.weapon !== undefined) {
    if (body.weapon !== 'auto' && !WEAPONS.includes(body.weapon)) fail(400, 'Unknown weapon');
    cup.weapon = body.weapon;
  }
  if (body.courts !== undefined) {
    if (!Number.isInteger(body.courts) || body.courts < 1 || body.courts > 6) fail(400, 'Courts must be 1–6');
    cup.courts = body.courts;
  }
}

export function setTeams(cup, list) {
  if (cup.status !== 'SETUP') fail(409, 'Teams are locked once the arena is open');
  cup.teams = cleanTeams(list);
}

// Logos and colours are only looks: they can change at any time, even mid-tournament.
export function setLooks(cup, looks) {
  if (!looks || typeof looks !== 'object' || Array.isArray(looks)) fail(400, 'looks must be an object');
  for (const [key, v] of Object.entries(looks).slice(0, MAX_TEAMS)) {
    const t = cup.teams.find(x => x.key === key);
    if (!t || !v || typeof v !== 'object') continue;
    if (v.color !== undefined) {
      if (!HEX.test(v.color)) fail(400, 'Colour must look like #1f5fc6');
      t.color = v.color.toLowerCase();
    }
    if (v.logo !== undefined) {
      if (v.logo !== null && !HASH.test(v.logo)) fail(400, 'Bad logo id');
      t.logo = v.logo;
    }
  }
}

export function openArena(cup) {
  if (cup.status !== 'SETUP') fail(409, 'The arena is already open');
  const n = cup.teams.length;
  if (n < 4 || n % 2) fail(400, `The draw needs an even number of teams, at least 4 (you have ${n})`);
  cup.status = 'DRAW';
}

export function backToSetup(cup, now) {
  if (cup.status !== 'DRAW') fail(409, 'Only before the first match is drawn');
  if (cup.draws.some(d => !d.voided)) fail(409, 'Matches are already drawn — undo them first');
  void now;
  cup.status = 'SETUP';
}

function pickWeapon(cup, choice, rand) {
  if (WEAPONS.includes(choice)) return choice;
  if (WEAPONS.includes(cup.weapon)) return cup.weapon;
  // Surprise: never one of the last three used, so every match feels different.
  const recent = cup.draws.filter(d => !d.voided && d.weapon !== 'fate').slice(-3).map(d => d.weapon);
  const options = WEAPONS.filter(w => !recent.includes(w));
  return options[rand(options.length)];
}

// One match: two secure random picks from the teams not yet drawn. `tie` is the match number
// the host's screen thinks is next (guards double clicks / stale tabs); the rules decide the rest.
export function drawMatch(cup, { tie, weapon, now, rand }) {
  const v = view(cup, now);
  if (v.phase !== 'draw') fail(409, cup.status === 'SETUP' ? 'Open the arena first' : 'Every team already has a match');
  if (v.current) fail(409, `Wait — the show for match ${v.current.tie} is still running`);
  if (tie !== v.nextTie) fail(409, `Match ${v.nextTie} is next — your screen was out of date`);
  const pool = v.remaining;
  if (pool.length < 2) fail(409, 'Every team already has a match');
  const last = pool.length === 2;
  let a;
  let b;
  if (last) [a, b] = rand(2) ? [pool[1], pool[0]] : [pool[0], pool[1]];
  else {
    const i = rand(pool.length);
    a = pool[i];
    const rest = pool.filter((_, k) => k !== i);
    b = rest[rand(rest.length)];
  }
  const d = {
    seq: cup.draws.length + 1,
    tie: v.nextTie,
    a, b,
    weapon: last ? 'fate' : pickWeapon(cup, weapon, rand),
    last,
    aimMs: cup.aimMs,
    startAt: now,
    ...timeline(now, cup.aimMs, last),
    voided: false,
  };
  cup.draws.push(d);
  return d;
}

export function undoMatch(cup, { seq, now }) {
  if (cup.status !== 'DRAW') fail(409, cup.status === 'KNOCKOUT' ? 'Unlock the knockout line-up first' : 'Nothing to undo');
  const v = view(cup, now);
  if (v.current) fail(409, 'Wait for the show to finish');
  const last = cup.draws.filter(d => !d.voided).at(-1);
  if (!last) fail(409, 'Nothing to undo');
  if (last.seq !== seq) fail(409, 'That is no longer the latest match — your screen was out of date');
  if (hasData(cup.results[`L${last.tie}`])) fail(409, `Match ${last.tie} has results — clear them first`);
  last.voided = true;
  last.voidedAt = now;
  delete cup.results[`L${last.tie}`];
}

const score = (v, label) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 99) fail(400, `${label}: points must be 0–99`);
  return n;
};

export function setResult(cup, { tie, games, decider = null, now }) {
  const v = view(cup, now);
  if (!['league', 'knockout', 'done'].includes(v.phase)) fail(409, 'Results open once every match is drawn');
  const all = [...v.ties, ...v.knockout.ties];
  const t = all.find(x => x.id === tie);
  if (!t) fail(404, 'Unknown match');
  if (t.stage !== 'L' && cup.status !== 'KNOCKOUT') fail(409, 'Lock the knockout line-up first');
  if (!t.a || !t.b) fail(409, `${t.label}: both teams are not known yet`);
  if (!Array.isArray(games) || games.length !== GAMES.length) fail(400, `Send all ${GAMES.length} games`);
  const clean6 = games.map((g, i) => {
    const label = `Game ${i + 1} (${GAME_CODES[i]})`;
    const sa = score(g?.sa, label);
    const sb = score(g?.sb, label);
    let w = g?.w === 'a' || g?.w === 'b' ? g.w : null;
    if (g?.w && !w) fail(400, `${label}: winner must be a or b`);
    if (sa !== null && sb !== null) {
      if (sa === sb) fail(400, `${label}: the score can't be level`);
      const byScore = sa > sb ? 'a' : 'b';
      if (w && w !== byScore) fail(400, `${label}: the winner doesn't match the score`);
      w = byScore;
    }
    return { w, sa, sb };
  });
  if (decider !== null && decider !== 'a' && decider !== 'b') fail(400, 'decider must be a, b or empty');
  const before = { ...cup.results };
  const next = { a: t.a, b: t.b, games: clean6, decider };
  if (hasData(next)) cup.results[tie] = next;
  else delete cup.results[tie];
  // A changed knockout winner must not silently rewrite a later round that already has results.
  const after = view(cup, now).knockout.ties;
  for (const k of v.knockout.ties) {
    const r = before[k.id];
    if (k.id === tie || !hasData(r) || r.a !== k.a || r.b !== k.b) continue;
    const now2 = after.find(x => x.id === k.id);
    if (now2.a !== k.a || now2.b !== k.b) {
      cup.results = before;
      fail(409, `${k.label} already has results and depends on this match — clear ${k.label} first`);
    }
  }
}

export function lockKnockout(cup, { seeds, now }) {
  const v = view(cup, now);
  if (v.phase !== 'league') fail(409, 'Lock the line-up after the draw, before the knockout');
  const n = seedCountOf(cup.teams.length);
  const keys = new Set(cup.teams.map(t => t.key));
  if (!Array.isArray(seeds) || seeds.length !== n || new Set(seeds).size !== n || !seeds.every(k => keys.has(k))) {
    fail(400, `Choose ${n} different teams for the knockout`);
  }
  cup.seeds = [...seeds];
  cup.status = 'KNOCKOUT';
}

export function unlockKnockout(cup, { now }) {
  if (cup.status !== 'KNOCKOUT') fail(409, 'The knockout is not locked');
  const v = view(cup, now);
  const used = v.knockout.ties.find(t => hasData(cup.results[t.id]));
  if (used) fail(409, `${used.label} has results — clear them first`);
  for (const t of v.knockout.ties) delete cup.results[t.id];
  cup.seeds = [];
  cup.status = 'DRAW';
}

// Host-only extras (fairness data for every finished match).
export function history(cup, now) {
  const byKey = new Map(cup.teams.map(t => [t.key, t.name]));
  return cup.draws
    .filter(d => d.doneAt <= now)
    .map(d => ({ seq: d.seq, tie: d.tie, a: byKey.get(d.a), b: byKey.get(d.b), weapon: d.weapon, voided: Boolean(d.voided), commitment: d.commitment ?? '', salt: d.salt ?? '', at: d.startAt }));
}
