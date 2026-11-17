// Match draw (fixtures) module: rules (pure, shared with the browser demo) and the live API.
// The show timeline is fast-forwarded with a swappable server clock instead of real waiting.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { io as connect } from 'socket.io-client';
import * as core from '../../client/src/cup/core.js';
import { ok, raw, setup } from './qa/helpers.js';

const { setCupClock } = await import('../src/fixtures.js');
const ctx = setup('cup');

const teamsOf = n => Array.from({ length: n }, (_, i) => ({
  name: `Team ${i + 1}`,
  players: { A: `A${i + 1}`, B: `B${i + 1}`, C: `C${i + 1}`, D: `D${i + 1}` },
}));
let seedRand = 7;
const rand = n => {
  seedRand = (seedRand * 1103515245 + 12345) % 2147483648;
  return seedRand % n;
};
// A local cup with n teams, opened and fully drawn (fake clock).
function drawnCup(n) {
  const cup = core.newCup({ event: 'main' });
  core.setTeams(cup, teamsOf(n));
  core.openArena(cup);
  let now = 1_000_000;
  while (core.view(cup, now).phase === 'draw') {
    const v = core.view(cup, now);
    const d = core.drawMatch(cup, { tie: v.nextTie, now, rand });
    now = d.doneAt;
  }
  return { cup, now };
}
const win = (side, n = 4) => Array.from({ length: 6 }, (_, i) => ({ w: i < n ? side : side === 'a' ? 'b' : 'a' }));
// Same with scores: the winner of a game scores 11, the loser `lose` (different per match -> no team level).
const scored = (side, n = 4, lose = 5, winPts = 11) => Array.from({ length: 6 }, (_, i) => {
  const w = i < n ? side : side === 'a' ? 'b' : 'a';
  return w === 'a' ? { sa: winPts, sb: lose } : { sa: lose, sb: winPts };
});

// ---------- Rules ----------

test('cup: every team is drawn exactly once; weapons never repeat within three matches', () => {
  for (let k = 0; k < 30; k++) {
    const { cup, now } = drawnCup(28);
    const v = core.view(cup, now);
    assert.equal(v.phase, 'league');
    assert.equal(v.ties.length, 14);
    const seen = v.ties.flatMap(t => [t.a, t.b]);
    assert.equal(new Set(seen).size, 28);
    assert.deepEqual(v.ties.map(t => t.no), Array.from({ length: 14 }, (_, i) => i + 1));
    assert.equal(v.ties.at(-1).weapon, 'fate');
    const weapons = v.ties.map(t => t.weapon).filter(w => w !== 'fate');
    for (let i = 3; i < weapons.length; i++) assert.ok(!weapons.slice(i - 3, i).includes(weapons[i]), weapons.join());
    // Courts alternate 1, 2, 1, 2 …
    assert.deepEqual(v.ties.slice(0, 4).map(t => t.court), [1, 2, 1, 2]);
  }
});

test('cup: a drawn team stays hidden until its reveal time', () => {
  const cup = core.newCup();
  core.setTeams(cup, teamsOf(8));
  core.openArena(cup);
  const d = core.drawMatch(cup, { tie: 1, now: 0, rand });
  const at = t => core.view(cup, t);
  assert.equal(at(d.revealA - 1).current.a, null);
  assert.equal(at(d.revealA - 1).remaining.length, 8);
  assert.equal(at(d.revealA).current.a, d.a);
  assert.equal(at(d.revealA).current.b, null);
  assert.equal(at(d.revealB).current.b, d.b);
  assert.equal(at(d.revealB).ties.length, 1);
  assert.equal(at(d.revealB).ties[0].salt, null, 'key stays secret while the show runs');
  assert.equal(at(d.doneAt).current, null);
  assert.ok(at(d.doneAt).ties[0].weapon);
  assert.throws(() => core.drawMatch(cup, { tie: 2, now: d.doneAt - 1, rand }), /still running/);
  assert.throws(() => core.drawMatch(cup, { tie: 3, now: d.doneAt, rand }), /Match 2 is next/);
  assert.equal(core.drawMatch(cup, { tie: 2, now: d.doneAt, rand }).tie, 2);
});

test('cup: setup rules — even team count, unique names, teams locked after opening', () => {
  const cup = core.newCup();
  core.setTeams(cup, teamsOf(5));
  assert.throws(() => core.openArena(cup), /even number/);
  assert.throws(() => core.setTeams(cup, [{ name: 'X' }, { name: ' x ' }]), /Two teams/);
  core.setTeams(cup, teamsOf(4));
  core.openArena(cup);
  assert.throws(() => core.setTeams(cup, teamsOf(4)), /locked/);
  core.backToSetup(cup, 0);
  assert.equal(cup.status, 'SETUP');
});

test('cup: undo only the latest match, never while its show runs or once it has results', () => {
  const cup = core.newCup();
  core.setTeams(cup, teamsOf(8));
  core.openArena(cup);
  const d1 = core.drawMatch(cup, { tie: 1, now: 0, rand });
  assert.throws(() => core.undoMatch(cup, { seq: 1, now: 10 }), /show to finish/);
  const d2 = core.drawMatch(cup, { tie: 2, now: d1.doneAt, rand });
  assert.throws(() => core.undoMatch(cup, { seq: 1, now: d2.doneAt }), /no longer the latest/);
  core.undoMatch(cup, { seq: 2, now: d2.doneAt });
  const v = core.view(cup, d2.doneAt);
  assert.equal(v.ties.length, 1);
  assert.equal(v.nextTie, 2);
  assert.equal(v.remaining.length, 6);
});

test('cup: tie outcome — majority wins, 3-3 by points or decider', () => {
  assert.equal(core.outcome(win('a').map(g => ({ ...g, sa: null, sb: null })), null).winner, 'a');
  const level = [{ w: 'a' }, { w: 'a' }, { w: 'a' }, { w: 'b' }, { w: 'b' }, { w: 'b' }];
  const o = core.outcome(level, null);
  assert.equal(o.winner, null);
  assert.equal(o.needsDecider, true);
  assert.equal(core.outcome(level, 'b').winner, 'b');
  const pts = level.map((g, i) => ({ ...g, sa: g.w === 'a' ? 11 : 9 - (i === 5 ? 5 : 0), sb: g.w === 'b' ? 11 : 3 }));
  assert.equal(core.outcome(pts, null).winner, 'a');
  assert.equal(core.outcome([{ w: 'a' }, { w: 'a' }, {}, {}, {}, {}], null).winner, null);
});

test('cup: results validation and the adults bracket (details in qualify.test.js)', () => {
  const { cup, now } = drawnCup(16);
  const v0 = core.view(cup, now);
  assert.throws(() => core.setResult(cup, { tie: 'L1', games: [{ sa: 5, sb: 5 }, {}, {}, {}, {}, {}], now }), /level/);
  assert.throws(() => core.setResult(cup, { tie: 'L1', games: [{ w: 'b', sa: 11, sb: 2 }, {}, {}, {}, {}, {}], now }), /doesn't match/);
  assert.throws(() => core.setResult(cup, { tie: 'QF1', games: win('a'), now }), /Lock the knockout/);
  // League with scores (distinct points so no team is level): team "a" of match n wins.
  for (const t of v0.ties) core.setResult(cup, { tie: t.id, games: scored('a', t.no <= 2 ? 6 : t.no <= 4 ? 5 : 4, t.no, 11 + t.no), now });
  const v1 = core.view(cup, now);
  assert.equal(v1.qualification.final, true);
  const top = v1.qualification.top;
  assert.equal(top.length, 8);
  core.lockKnockout(cup, { now });
  const v2 = core.view(cup, now);
  assert.equal(v2.phase, 'knockout');
  assert.deepEqual([v2.knockout.ties[0].a, v2.knockout.ties[0].b], [top[0], top[7]]); // QF1 1v8
  assert.deepEqual([v2.knockout.ties[3].a, v2.knockout.ties[3].b], [top[3], top[4]]); // QF4 4v5
  for (const id of ['QF1', 'QF2', 'QF3', 'QF4', 'SF1', 'SF2', 'F']) core.setResult(cup, { tie: id, games: win('a'), now });
  const v3 = core.view(cup, now);
  assert.equal(v3.phase, 'done');
  assert.equal(v3.knockout.champion, top[0]);
  assert.throws(() => core.unlockKnockout(cup, { now }), /has results/);
});

test('cup: 4 teams (kids) -> Final 1st v 2nd and 3rd/4th place', () => {
  const { cup, now } = drawnCup(4);
  const v = core.view(cup, now);
  assert.equal(v.knockout.format, 'final');
  assert.equal(v.ties.length, 2);
  for (const t of v.ties) core.setResult(cup, { tie: t.id, games: win('a'), now });
  const order = core.view(cup, now).standings.map(r => r.key);
  core.lockKnockout(cup, { seeds: order, now });
  const k = core.view(cup, now).knockout;
  assert.deepEqual([k.ties[0].a, k.ties[0].b, k.ties[1].a, k.ties[1].b], order);
  core.setResult(cup, { tie: '3P', games: win('b'), now });
  core.setResult(cup, { tie: 'F', games: win('a'), now });
  const done = core.view(cup, now).knockout;
  assert.deepEqual([done.champion, done.runnerUp, done.third], [order[0], order[1], order[3]]);
});

// ---------- Live API ----------

const P = '/fixtures';
test('cup API: host routes need the login; audience can read state', async () => {
  for (const [method, path] of [['POST', '/draw'], ['PUT', '/teams'], ['POST', '/open'], ['PUT', '/result'], ['POST', '/seed'], ['GET', '/admin'], ['POST', '/new']]) {
    const body = method === 'GET' ? undefined : {};
    assert.equal((await raw(ctx, `${P}${path}`, { method, body, auth: false })).status, 401, path);
    assert.equal((await raw(ctx, `/kids${P}${path}`, { method, body, auth: false })).status, 401, path);
  }
  const s = await ok(ctx, `${P}/state`, { auth: false });
  assert.equal(s.phase, 'setup');
  assert.equal((await raw(ctx, `${P}/nope`, { auth: false })).status, 404);
});

test('cup API: full live flow with sealed, timed reveals over the socket', async () => {
  let shift = 0;
  setCupClock(() => Date.now() + shift);
  try {
    await ok(ctx, `${P}/new`, { method: 'POST', body: { name: 'API Cup' } });
    await ok(ctx, `${P}/teams`, { method: 'PUT', body: { teams: teamsOf(8) } });
    await ok(ctx, `${P}/settings`, { method: 'PATCH', body: { aimMs: 2000, weapon: 'auto', courts: 2 } });
    assert.equal((await raw(ctx, `${P}/settings`, { method: 'PATCH', body: { weapon: 'bazooka' } })).status, 400);
    await ok(ctx, `${P}/open`, { method: 'POST' });

    const socket = connect(`http://127.0.0.1:${ctx.server.port}`, { transports: ['websocket'], auth: { role: 'audience', event: 'main', module: 'cup', viewer: 'cup-viewer-1' } });
    const states = [];
    let auctionStates = 0;
    socket.on('cup:state', s => states.push(s));
    socket.on('tournament:state', () => auctionStates++);
    await new Promise(r => socket.on('connect', r));

    for (let n = 1; n <= 4; n++) {
      const { seq } = await ok(ctx, `${P}/draw`, { method: 'POST', body: { tie: n } });
      const s = await ok(ctx, `${P}/state`, { auth: false });
      assert.equal(s.current.seq, seq);
      assert.equal(s.current.a, null, 'first team hidden at start');
      assert.match(s.current.commitment, /^[0-9a-f]{64}$/);
      assert.equal((await raw(ctx, `${P}/draw`, { method: 'POST', body: { tie: n + 1 } })).status, 409);
      shift += s.current.doneAt - s.now + 50;
    }
    await new Promise(r => setTimeout(r, 1100)); // state cache window
    const s = await ok(ctx, `${P}/state`, { auth: false });
    assert.equal(s.phase, 'league');
    assert.equal(s.ties.length, 4);
    // Fairness: every finished match's key reproduces its published seal.
    const name = k => s.teams.find(t => t.key === k).name;
    for (const t of s.ties) {
      const text = core.proofText({ seq: t.seq, tie: t.no, a: name(t.a), b: name(t.b), salt: t.salt });
      assert.equal(createHash('sha256').update(text).digest('hex'), t.commitment);
    }
    assert.ok(states.length >= 4, 'socket got live states');
    assert.equal(auctionStates, 0, 'match-draw sockets never get auction state');

    for (const t of s.ties) await ok(ctx, `${P}/result`, { method: 'PUT', body: { tie: t.id, games: scored('a', t.no === 1 ? 6 : 4, t.no) } });
    const st = await ok(ctx, `${P}/state`, { auth: false });
    await ok(ctx, `${P}/seed`, { method: 'POST', body: { seeds: st.standings.map(r => r.key) } });
    for (const id of ['QF1', 'QF2', 'QF3', 'QF4', 'SF1', 'SF2', 'F']) await ok(ctx, `${P}/result`, { method: 'PUT', body: { tie: id, games: win('a') } });
    const end = await ok(ctx, `${P}/state`, { auth: false });
    assert.equal(end.phase, 'done');
    assert.equal(end.knockout.champion, st.standings[0].key);
    const hist = await ok(ctx, `${P}/admin`);
    assert.equal(hist.history.length, 4);
    socket.close();

    // Kids is a separate match draw; the auction is untouched.
    const kids = await ok(ctx, `/kids${P}/state`, { auth: false });
    assert.equal(kids.event, 'kids');
    assert.equal(kids.phase, 'setup');
    const auction = await ok(ctx, '/state', { auth: false });
    assert.equal(auction.status, 'DRAFT');
  } finally {
    setCupClock(null);
  }
});

// ---------- Team looks: colours + logos ----------

test('cup: team colours default from the palette; looks can change any time', () => {
  const cup = core.newCup();
  core.setTeams(cup, [...teamsOf(3), { name: 'Custom', color: '#ABCDEF', logo: 'f'.repeat(32) }]);
  assert.equal(cup.teams[0].color, core.PALETTE[0]);
  assert.equal(cup.teams[3].color, '#abcdef');
  assert.equal(cup.teams[3].logo, 'f'.repeat(32));
  core.openArena(cup);
  core.setLooks(cup, { t1: { color: '#112233', logo: 'a'.repeat(32) }, nope: { color: '#000000' } });
  assert.equal(cup.teams[0].color, '#112233');
  assert.equal(cup.teams[0].logo, 'a'.repeat(32));
  assert.throws(() => core.setLooks(cup, { t1: { color: 'red' } }), /Colour/);
  assert.throws(() => core.setLooks(cup, { t1: { logo: '../x' } }), /logo/);
});

// 1x1 transparent PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
test('cup API: logos are stored once, served with long caching, and only PNG/JPEG/WebP', async () => {
  setCupClock(() => Date.now() + 1e9); // the previous test fast-forwarded its shows
  await ok(ctx, `${P}/new`, { method: 'POST', body: { name: 'Logo Cup' } });
  setCupClock(null);
  await ok(ctx, `${P}/teams`, { method: 'PUT', body: { teams: teamsOf(4) } });
  assert.equal((await raw(ctx, `${P}/logos`, { method: 'PUT', body: { logos: { t1: PNG } }, auth: false })).status, 401);
  assert.equal((await raw(ctx, `${P}/logos`, { method: 'PUT', body: { logos: { t1: 'data:image/svg+xml;base64,PHN2Zy8+' } } })).status, 400);
  await ok(ctx, `${P}/logos`, { method: 'PUT', body: { logos: { t1: PNG, t2: PNG } } });
  await ok(ctx, `${P}/looks`, { method: 'PATCH', body: { looks: { t3: { color: '#00ff00' } } } });
  await new Promise(r => setTimeout(r, 1100));
  const s = await ok(ctx, `${P}/state`, { auth: false });
  const hash = s.teams[0].logo;
  assert.match(hash, /^[0-9a-f]{32}$/);
  assert.equal(s.teams[1].logo, hash, 'same image stored once');
  assert.equal(s.teams[2].color, '#00ff00');
  const img = await raw(ctx, `${P}/logo/${hash}`, { auth: false });
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.match(img.headers.get('cache-control'), /immutable/);
  assert.equal(img.body[1], 0x50); // "PNG"
  assert.equal((await raw(ctx, `${P}/logo/${'0'.repeat(32)}`, { auth: false })).status, 404);
  assert.equal((await raw(ctx, `/kids${P}/logo/${hash}`, { auth: false })).status, 200);
  await ok(ctx, `${P}/logos`, { method: 'PUT', body: { logos: { t1: null } } });
});

test('cup: bundled season logos ("s:file.webp") are accepted; anything path-like is not', () => {
  const cup = core.newCup();
  core.setTeams(cup, [{ name: 'A', logo: 's:m01.webp' }, { name: 'B', logo: 's:../etc/passwd.webp' }, { name: 'C', logo: 's:m03.png' }, { name: 'D', logo: 's:x.svg' }]);
  assert.deepEqual(cup.teams.map(t => t.logo), ['s:m01.webp', null, 's:m03.png', null]);
  core.setLooks(cup, { t2: { logo: 's:m02.webp' } });
  assert.equal(cup.teams[1].logo, 's:m02.webp');
  assert.throws(() => core.setLooks(cup, { t1: { logo: 's:/abs.webp' } }), /logo/);
});

test('cup API: Restart keeps teams, logos and settings but clears every draw; never during a show', async () => {
  let shift = 2e9; // past every show of the earlier tests
  setCupClock(() => Date.now() + shift);
  try {
    await ok(ctx, `${P}/new`, { method: 'POST', body: { name: 'Rehearsal Cup' } });
    await ok(ctx, `${P}/teams`, { method: 'PUT', body: { teams: teamsOf(8).map((t, i) => ({ ...t, logo: `s:m0${i + 1}.webp` })) } });
    await ok(ctx, `${P}/settings`, { method: 'PATCH', body: { aimMs: 2000, weapon: 'laser', courts: 3 } });
    await ok(ctx, `${P}/open`, { method: 'POST' });
    await ok(ctx, `${P}/draw`, { method: 'POST', body: { tie: 1 } });
    assert.equal((await raw(ctx, `${P}/new`, { method: 'POST', body: { keepTeams: true } })).status, 409, 'not during a show');
    shift += 60000;
    await ok(ctx, `${P}/new`, { method: 'POST', body: { keepTeams: true } });
    const s = await ok(ctx, `${P}/state`, { auth: false });
    assert.equal(s.phase, 'setup');
    assert.equal(s.name, 'Rehearsal Cup');
    assert.equal(s.ties.filter(t => t.a || t.b).length, 0, 'nothing drawn');
    assert.deepEqual(s.teams.map(t => t.name), teamsOf(8).map(t => t.name));
    assert.equal(s.teams[0].logo, 's:m01.webp');
    assert.deepEqual([s.aimMs, s.weapon, s.courts], [2000, 'laser', 3]);
    await ok(ctx, `${P}/open`, { method: 'POST' }); // ready to draw again straight away
    await ok(ctx, `${P}/new`, { method: 'POST', body: {} });
    assert.equal((await ok(ctx, `${P}/state`, { auth: false })).teams.length, 0, 'plain new draw starts empty');
  } finally {
    setCupClock(null);
  }
});
