// SIT — end-to-end flows across HTTP, Socket.IO and MongoDB; predictions; viewer counting; import
// over HTTP; PWA / deployment configuration; contact details shown in the app.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { assertInvariants, finalize, fresh, names, ok, pause, pre, raw, setup, socketTo, spin, state } from './helpers.js';

const ctx = setup('sit');
let n = 0;
const id = () => `SIT-${String(++n).padStart(3, '0')}`;
const ROOT = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const collect = s => { const log = []; s.onAny((e, d) => log.push([e, d])); return log; };

// ---------- live event sequences ----------
for (const ev of ['main', 'kids']) {
  let sock; let log;
  test(`${id()} flow (${ev}): a connecting screen immediately receives state + viewer count`, async () => {
    if (ev === 'main') await fresh(ctx, { categories: ['WOMEN', 'B'], spinMs: 300 });
    else await fresh(ctx, { ev: 'kids', spinMs: 300 });
    sock = await socketTo(ctx, { event: ev, role: 'audience', viewer: `viewer-flow-${ev}-01` });
    log = collect(sock);
    const s = await state(ctx, ev);
    assert.equal(s.event, ev);
  });
  test(`${id()} flow (${ev}): a draw emits spinning, then state, then revealed, in order`, async () => {
    assert.equal((await spin(ctx, ev)).status, 200);
    await pause(500);
    const names_ = log.map(([e]) => e);
    const iSpin = names_.indexOf('draw:spinning');
    const iRev = names_.indexOf('draw:revealed');
    assert.ok(iSpin >= 0 && iRev > iSpin, names_.join(','));
  });
  test(`${id()} flow (${ev}): spinning and revealed refer to the same action and teams`, async () => {
    const sp = log.find(([e]) => e === 'draw:spinning')[1];
    const rv = log.find(([e]) => e === 'draw:revealed')[1];
    assert.equal(sp.actionId, rv.actionId);
    assert.deepEqual(sp.teamNumbers, rv.assignments.map(a => a.teamNumber));
  });
  test(`${id()} flow (${ev}): the revealed winner was one of the announced candidates`, async () => {
    const sp = log.find(([e]) => e === 'draw:spinning')[1];
    const rv = log.find(([e]) => e === 'draw:revealed')[1];
    for (const a of rv.assignments) assert.ok(sp.candidates.includes(a.name));
  });
  test(`${id()} flow (${ev}): the final broadcast state matches GET /state`, async () => {
    const last = log.filter(([e]) => e === 'tournament:state').at(-1)[1];
    assert.deepEqual(last.teams, (await state(ctx, ev)).teams);
  });
  test(`${id()} flow (${ev}): finalize emits category:finalized and the next round becomes current`, async () => {
    let s = await state(ctx, ev);
    if (ev === 'main') { await ok(ctx, '/tournament', { method: 'PATCH', body: { spinMs: 0 } }); while ((s = await state(ctx, ev)).currentTeam) await spin(ctx, ev); }
    const fin = new Promise(r => sock.once('category:finalized', r));
    const cur = s.current;
    await finalize(ctx, ev);
    assert.equal((await fin).category, cur);
    assert.notEqual((await state(ctx, ev)).current, cur);
  });
  test(`${id()} flow (${ev}): undo emits draw:undone with the action id`, async () => {
    await ok(ctx, `${pre(ev)}/tournament`, { method: 'PATCH', body: { spinMs: 0 } });
    await spin(ctx, ev);
    const s = await state(ctx, ev);
    const undone = new Promise(r => sock.once('draw:undone', r));
    await ok(ctx, `${pre(ev)}/undo`, { method: 'POST', body: { actionId: s.last.actionId } });
    assert.equal((await undone).actionId, s.last.actionId);
  });
  test(`${id()} flow (${ev}): a screen that reconnects gets the current state, nothing replays`, async () => {
    sock.close();
    const before = await state(ctx, ev);
    sock = await socketTo(ctx, { event: ev });
    log = collect(sock);
    await pause(150);
    assert.ok(!log.some(([e]) => e === 'draw:spinning' || e === 'draw:revealed'));
    assert.deepEqual((await state(ctx, ev)).teams, before.teams);
    sock.close();
  });
}
test(`${id()} ticker: recent lists the last 5 one-by-one picks newest first, never shuffle picks`, async () => {
  await fresh(ctx, { categories: ['A', 'WOMEN'] });
  await spin(ctx); await finalize(ctx);
  for (let k = 0; k < 7; k++) await spin(ctx);
  const s = await state(ctx);
  assert.deepEqual(s.recent.map(r => r.teamNumber), [7, 6, 5, 4, 3]);
  assert.ok(s.recent.every(r => r.category === 'WOMEN'));
});
test(`${id()} ticker: an undone pick disappears from recent`, async () => {
  const s = await state(ctx);
  await ok(ctx, '/undo', { method: 'POST', body: { actionId: s.last.actionId } });
  assert.deepEqual((await state(ctx)).recent.map(r => r.teamNumber), [6, 5, 4, 3, 2]);
});
test(`${id()} ticker: hidden while spinning (pending pick not in recent)`, async () => {
  await ok(ctx, '/tournament', { method: 'PATCH', body: { spinMs: 800 } });
  await spin(ctx);
  assert.ok(!(await state(ctx)).recent.some(r => r.teamNumber === 7));
  await pause(900);
  assert.equal((await state(ctx)).recent[0].teamNumber, 7);
});
test(`${id()} captain data: the first shuffle round is flagged so screens can show the captain`, async () => {
  const s = await state(ctx);
  assert.equal(s.categories[0].shuffle, true); assert.equal(s.categories[1].shuffle, false);
  const k = await state(ctx, 'kids');
  assert.equal(k.categories.find(c => c.key === 'ICON').shuffle, true);
});
test(`${id()} short codes: team cards get distinct codes (kids A B C D)`, async () => {
  const k = await state(ctx, 'kids');
  assert.deepEqual(k.categories.map(c => c.short), ['A', 'B', 'C', 'D']);
});

// ---------- predictions ----------
let base;
const guess = (body, ev = 'main') => raw(ctx, `${pre(ev)}/guess`, { method: 'POST', auth: false, body: { voterId: 'voter-sit-0001', nickname: 'Asha', ...body } });
test(`${id()} predict: setup a live Women round`, async () => {
  await ok(ctx, '/tournament', { method: 'PATCH', body: { spinMs: 0 } });
  base = await fresh(ctx, { categories: ['A', 'WOMEN'] });
});
test(`${id()} predict: closed during a shuffle round (A)`, async () => {
  assert.equal((await guess({ category: 'A', team: 1, name: 'A Player 1' })).status, 409);
});
test(`${id()} predict: opens once the one-by-one round starts`, async () => {
  await spin(ctx); await finalize(ctx);
  assert.equal((await guess({ category: 'WOMEN', team: 1, name: 'WOMEN Player 1' })).status, 200);
});
const PRED = [
  ['wrong team (ahead)', { category: 'WOMEN', team: 2, name: 'WOMEN Player 1' }, 409],
  ['wrong team (0)', { category: 'WOMEN', team: 0, name: 'WOMEN Player 1' }, 409],
  ['wrong round', { category: 'B', team: 1, name: 'WOMEN Player 1' }, 409],
  ['player not in the pool', { category: 'WOMEN', team: 1, name: 'Nobody' }, 400],
  ['player from another list', { category: 'WOMEN', team: 1, name: 'A Player 1' }, 400],
  ['empty nickname', { category: 'WOMEN', team: 1, name: 'WOMEN Player 1', nickname: '' }, 400],
  ['nickname 25 chars', { category: 'WOMEN', team: 1, name: 'WOMEN Player 1', nickname: 'n'.repeat(25) }, 400],
  ['nickname 24 chars', { category: 'WOMEN', team: 1, name: 'WOMEN Player 1', nickname: 'n'.repeat(24) }, 200],
  ['voter id too short', { category: 'WOMEN', team: 1, name: 'WOMEN Player 1', voterId: 'short' }, 400],
  ['voter id with spaces', { category: 'WOMEN', team: 1, name: 'WOMEN Player 1', voterId: 'voter id 0001' }, 400],
  ['voter id 64 chars', { category: 'WOMEN', team: 1, name: 'WOMEN Player 1', voterId: 'v'.repeat(64) }, 200],
  ['voter id 65 chars', { category: 'WOMEN', team: 1, name: 'WOMEN Player 1', voterId: 'v'.repeat(65) }, 400],
  ['player name differently spaced', { category: 'WOMEN', team: 1, name: '  WOMEN   Player 1 ' }, 200],
  ['name as number', { category: 'WOMEN', team: 1, name: 5 }, 400],
];
for (const [label, body, code] of PRED) {
  test(`${id()} predict: ${label} -> ${code}`, async () => {
    const r = await guess(body);
    assert.equal(r.status, code, JSON.stringify(r.body));
  });
}
test(`${id()} predict: same viewer can change the pick; only the last one counts`, async () => {
  await ok(ctx, '/guess', { method: 'POST', auth: false, body: { voterId: 'voter-sit-0002', nickname: 'Bo', category: 'WOMEN', team: 1, name: 'WOMEN Player 2' } });
  await ok(ctx, '/guess', { method: 'POST', auth: false, body: { voterId: 'voter-sit-0002', nickname: 'Bo', category: 'WOMEN', team: 1, name: 'WOMEN Player 3' } });
});
test(`${id()} predict: nothing is scored before the reveal`, async () => {
  assert.equal((await ok(ctx, '/leaderboard', { auth: false })).players, 0);
});
test(`${id()} predict: after the reveal, guesses for that team close`, async () => {
  await spin(ctx);
  assert.equal((await guess({ category: 'WOMEN', team: 1, name: 'WOMEN Player 9', voterId: 'voter-sit-late' })).status, 409);
});
test(`${id()} predict: leaderboard scores 1 point per correct pick and counts every guesser`, async () => {
  const s = await state(ctx);
  const winner = s.teams[0].players.WOMEN;
  const b = await ok(ctx, '/leaderboard?voter=voter-sit-0002', { auth: false });
  assert.equal(b.last.team, 1);
  assert.ok(b.players >= 3);
  assert.equal(b.me.total, 1);
  assert.equal(b.me.correct, winner === 'WOMEN Player 3' ? 1 : 0);
});
test(`${id()} predict: an undone pick no longer scores; the re-draw does`, async () => {
  const s = await state(ctx);
  await ok(ctx, '/undo', { method: 'POST', body: { actionId: s.last.actionId } });
  assert.equal((await ok(ctx, '/leaderboard', { auth: false })).players, 0);
  await spin(ctx);
  assert.ok((await ok(ctx, '/leaderboard', { auth: false })).players >= 1);
});
test(`${id()} predict: host closes predictions -> 409 "closed by the host", records kept`, async () => {
  await ok(ctx, '/tournament', { method: 'PATCH', body: { predictions: false } });
  const s = await state(ctx);
  const r = await guess({ category: 'WOMEN', team: s.currentTeam, name: s.remaining[0], voterId: 'voter-sit-close' });
  assert.equal(r.status, 409); assert.match(r.body.error, /closed by the host/);
  assert.ok((await ok(ctx, '/leaderboard', { auth: false })).players >= 1);
});
test(`${id()} predict: host reopens -> accepted again`, async () => {
  await ok(ctx, '/tournament', { method: 'PATCH', body: { predictions: true } });
  const s = await state(ctx);
  assert.equal((await guess({ category: 'WOMEN', team: s.currentTeam, name: s.remaining[0], voterId: 'voter-sit-open' })).status, 200);
});
test(`${id()} predict: kids guesses go to the kids leaderboard only`, async () => {
  await fresh(ctx, { ev: 'kids' });
  await spin(ctx, 'kids'); await finalize(ctx, 'kids');
  const k = await state(ctx, 'kids');
  await ok(ctx, '/kids/guess', { method: 'POST', auth: false, body: { voterId: 'voter-kid-sit1', nickname: 'Kid', category: 'GIRL1', team: 1, name: k.remaining[0] } });
  await spin(ctx, 'kids');
  assert.equal((await ok(ctx, '/kids/leaderboard', { auth: false })).last.total, 1);
  assert.notEqual((await ok(ctx, '/leaderboard', { auth: false })).last?.category, 'GIRL1');
});
test(`${id()} predict: per-viewer rate limit -> 429 after 12 attempts in a minute (other viewers unaffected)`, async () => {
  const s = await state(ctx, 'kids');
  let last;
  for (let k = 0; k < 13; k++) last = await raw(ctx, '/kids/guess', { method: 'POST', auth: false, body: { voterId: 'voter-rate-0001', nickname: 'R', category: s.current, team: s.currentTeam, name: s.remaining[0] } });
  assert.equal(last.status, 429);
  assert.equal((await raw(ctx, '/kids/guess', { method: 'POST', auth: false, body: { voterId: 'voter-rate-0002', nickname: 'S', category: s.current, team: s.currentTeam, name: s.remaining[0] } })).status, 200);
});
test(`${id()} predict: leaderboard never exposes voter ids`, async () => {
  const b = await ok(ctx, '/leaderboard', { auth: false });
  assert.ok(b.top.every(r => !('voterId' in r)));
});

// ---------- viewer counting ----------
const counter = async ev => {
  const w = await socketTo(ctx, { event: ev, role: 'screen' });
  let latest = 0;
  w.on('viewers', v => { latest = v.count; });
  return { w, get: async () => { await pause(1800); return latest; } };
};
test(`${id()} viewers: host and projector are not counted`, async () => {
  const c = await counter('main');
  const h = await socketTo(ctx, { role: 'host', viewer: 'viewer-host-zz01' });
  assert.equal(await c.get(), 0);
  h.close(); c.w.close();
});
test(`${id()} viewers: 3 audience browsers -> 3`, async () => {
  const c = await counter('main');
  const a = await Promise.all([1, 2, 3].map(i => socketTo(ctx, { role: 'audience', viewer: `viewer-v3-000${i}` })));
  assert.equal(await c.get(), 3);
  a.forEach(s => s.close()); c.w.close();
});
test(`${id()} viewers: same browser in 3 tabs -> 1`, async () => {
  const c = await counter('main');
  const a = await Promise.all([1, 2, 3].map(() => socketTo(ctx, { role: 'audience', viewer: 'viewer-tabs-0001' })));
  assert.equal(await c.get(), 1);
  a.forEach(s => s.close()); c.w.close();
});
test(`${id()} viewers: invalid viewer ids are not counted`, async () => {
  const c = await counter('main');
  const a = await Promise.all(['x', '', 'a b c d e f g', 'v'.repeat(65)].map(v => socketTo(ctx, { role: 'audience', viewer: v })));
  assert.equal(await c.get(), 0);
  a.forEach(s => s.close()); c.w.close();
});
test(`${id()} viewers: kids audience counted only on kids screens`, async () => {
  const cm = await counter('main'); const ck = await counter('kids');
  const k = await socketTo(ctx, { event: 'kids', role: 'audience', viewer: 'viewer-kidsonly-01' });
  const [m, kk] = await Promise.all([cm.get(), ck.get()]);
  assert.equal(m, 0); assert.equal(kk, 1);
  k.close(); cm.w.close(); ck.w.close();
});
test(`${id()} viewers: count drops after a viewer leaves`, async () => {
  const c = await counter('main');
  const a = await socketTo(ctx, { role: 'audience', viewer: 'viewer-leave-0001' });
  assert.equal(await c.get(), 1);
  a.close();
  assert.equal(await c.get(), 0);
  c.w.close();
});

// ---------- import over HTTP, then save ----------
const b64 = s => Buffer.from(s).toString('base64');
test(`${id()} import: CSV through the API returns lists; saving applies the same validation`, async () => {
  await fresh(ctx, { categories: ['A', 'WOMEN'], start: false });
  const { lists } = await ok(ctx, '/players/import', { method: 'POST', body: { filename: 'p.csv', data: b64('A,Women\nX,Y\nX,Z\n') } });
  assert.deepEqual(lists, { A: ['X', 'X'], WOMEN: ['Y', 'Z'] });
  assert.equal((await raw(ctx, '/players', { method: 'PUT', body: { lists } })).status, 400, 'duplicate X caught on save');
});
test(`${id()} import: invisible-character duplicates from a spreadsheet are caught on save`, async () => {
  const { lists } = await ok(ctx, '/players/import', { method: 'POST', body: { filename: 'p.csv', data: b64('A\nRahul\nRa​hul\n') } });
  assert.equal((await raw(ctx, '/players', { method: 'PUT', body: { lists } })).status, 400);
});
test(`${id()} import: XLSX through the API`, async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('s').addRows([['Women'], ...names('W', 28).map(x => [x])]);
  const data = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
  const { lists } = await ok(ctx, '/players/import', { method: 'POST', body: { filename: 'p.xlsx', data } });
  assert.equal(lists.WOMEN.length, 28);
  await ok(ctx, '/players', { method: 'PUT', body: { lists } });
});
test(`${id()} import: kids file through the kids API`, async () => {
  const { lists } = await ok(ctx, '/kids/players/import', { method: 'POST', body: { filename: 'k.csv', data: b64('B1,G1,B2,G2\nI1,G1,B1,H1\n') } });
  assert.deepEqual(Object.keys(lists).sort(), ['BOY', 'GIRL1', 'GIRL2', 'ICON']);
});
test(`${id()} import: anonymous import -> 401`, async () => {
  assert.equal((await raw(ctx, '/players/import', { method: 'POST', body: { filename: 'p.csv', data: b64('A\nX') }, auth: false })).status, 401);
});

// ---------- configuration: PWA, Vercel, Render ----------
const read = p => readFileSync(join(ROOT, p), 'utf8');
test(`${id()} config: Vercel rewrites /api (incl. /api/kids) to the Render backend`, () => {
  const v = JSON.parse(read('client/vercel.json'));
  const api = v.rewrites.find(r => r.source.startsWith('/api'));
  assert.match(api.destination, /^https:\/\/picklepro-api\.onrender\.com\/api\/:path\*$/);
  assert.equal(api.source, '/api/:path*');
});
test(`${id()} config: Vercel SPA fallback serves index.html for every page, never for assets, sounds or logos`, () => {
  const v = JSON.parse(read('client/vercel.json'));
  const fallback = v.rewrites.find(r => r.destination === '/index.html');
  assert.ok(fallback);
  const re = new RegExp(`^${fallback.source}$`);
  for (const p of ['/', '/admin', '/tv', '/screen', '/auction', '/auction/admin', '/auction/tv', '/fixtures', '/fixtures/admin', '/fixtures/tv', '/kids/fixtures']) assert.ok(re.test(p), p);
  // A missing file must be a real 404, not the app's HTML (sounds and textures would fail to decode).
  for (const p of ['/assets/index.js', '/sounds/crowd.mp3', '/season2/logos/m01.webp']) assert.ok(!re.test(p), p);
});
test(`${id()} config: PWA service worker never caches /api or /socket.io (no stale draw data)`, () => {
  const c = read('client/vite.config.js');
  assert.match(c, /navigateFallbackDenylist: \[\/\^\\\/api\/, \/\^\\\/socket\\\.io\/\]/);
});
test(`${id()} config: PWA manifest has name, start_url "/", standalone and icons incl. maskable`, () => {
  const c = read('client/vite.config.js');
  for (const s of ["start_url: '/'", "display: 'standalone'", "purpose: 'maskable'", 'pwa-192.png', 'pwa-512.png']) assert.ok(c.includes(s), s);
});
test(`${id()} config: PWA auto-updates to new deployments`, () => {
  assert.match(read('client/vite.config.js'), /registerType: 'autoUpdate'/);
});
test(`${id()} config: Render health check path is /api/health and start command is npm start`, () => {
  const r = read('render.yaml');
  assert.match(r, /healthCheckPath: \/api\/health/); assert.match(r, /startCommand: npm start/);
});
test(`${id()} config: Render secrets are not committed (sync: false / generated)`, () => {
  const r = read('render.yaml');
  assert.match(r, /MONGODB_URI\s*\n\s*sync: false/); assert.match(r, /ADMIN_PASSWORD\s*\n\s*sync: false/); assert.match(r, /SESSION_SECRET\s*\n\s*generateValue: true/);
});
test(`${id()} config: the server refuses to start without required env vars`, () => {
  const s = read('server/src/index.js');
  assert.match(s, /MONGODB_URI', 'ADMIN_PASSWORD', 'SESSION_SECRET'/); assert.match(s, /length < 32/);
});
test(`${id()} config: CI runs the server tests against MongoDB and builds the client`, () => {
  const w = read('.github/workflows/test.yml');
  assert.match(w, /image: mongo/); assert.match(w, /npm test/); assert.match(w, /npm run build/);
});
test(`${id()} brand: contact numbers and WhatsApp link are defined once and correct`, () => {
  const b = read('client/src/Brand.jsx');
  assert.match(b, /tel: '\+919067127688'/); assert.match(b, /tel: '\+919653672196'/);
  assert.match(b, /WHATSAPP_NUMBER = '919067127688'/); assert.match(b, /encodeURIComponent\(WHATSAPP_MESSAGE\)/);
  assert.match(b, /Pinkesh Valdria/);
});
test(`${id()} brand: no other source file hard-codes a phone number`, () => {
  for (const f of ['Live.jsx', 'Admin.jsx', 'Screen.jsx', 'Audience.jsx', 'Stage.jsx', 'Follow.jsx']) {
    assert.ok(!/9067127688|9653672196/.test(read(`client/src/${f}`)), f);
  }
});
test(`${id()} client: the browser fairness check uses the same proof format as the server`, () => {
  assert.match(read('client/src/fair.js'), /PicklePro\|v1\|\$\{actionId\}\|\$\{category\}\|/);
});
test(`${id()} client: audience pages hide the fairness seal (host-only)`, () => {
  assert.match(read('client/src/Admin.jsx'), /showSeal/);
  assert.ok(!/showSeal/.test(read('client/src/Live.jsx')));
});
test(`${id()} client: sound unlock happens inside the tap and mute cancels scheduled sounds`, () => {
  const s = read('client/src/sound.js');
  assert.match(s, /createBuffer\(1, 1/); assert.match(s, /export function stopAll/); assert.match(s, /timers\.forEach\(clearTimeout\)/);
});
test(`${id()} client: switching draws does not reload the page (history.pushState)`, () => {
  assert.match(read('client/src/event.js'), /history\.pushState/);
});

// ---------- read caches (state / leaderboard) ----------
test(`${id()} cache: GET /state right after a draw shows the new pick (cache refreshed on change)`, async () => {
  await fresh(ctx, { categories: ['WOMEN'] });
  for (let k = 0; k < 3; k++) {
    await spin(ctx);
    assert.equal((await state(ctx)).currentTeam, k + 2);
  }
});
test(`${id()} cache: during a spin, repeated GET /state never shows the hidden pick`, async () => {
  await ok(ctx, '/tournament', { method: 'PATCH', body: { spinMs: 700 } });
  await spin(ctx);
  for (let k = 0; k < 10; k++) {
    const s = await state(ctx);
    if (s.pending) assert.equal(s.teams[3].players.WOMEN, undefined);
    await pause(40);
  }
  await pause(800);
  assert.ok((await state(ctx)).teams[3].players.WOMEN, 'revealed after the spin');
});
test(`${id()} cache: leaderboard reflects a reveal immediately (not a stale cached copy)`, async () => {
  await ok(ctx, '/tournament', { method: 'PATCH', body: { spinMs: 0 } });
  const s = await state(ctx);
  await ok(ctx, '/guess', { method: 'POST', auth: false, body: { voterId: 'voter-cache-001', nickname: 'C', category: 'WOMEN', team: s.currentTeam, name: s.remaining[0] } });
  const before = await ok(ctx, '/leaderboard', { auth: false });
  await spin(ctx);
  const after = await ok(ctx, '/leaderboard?voter=voter-cache-001', { auth: false });
  assert.notDeepEqual(after.last, before.last);
  assert.equal(after.me.total, 1);
});
test(`${id()} cache: main and kids caches are separate`, async () => {
  const m = await state(ctx); const k = await state(ctx, 'kids');
  assert.equal(m.event, 'main'); assert.equal(k.event, 'kids'); assert.notEqual(m.id, k.id);
});

test(`${id()} import: organisers' auction format (Category / Name / AGE / CONTACT, side-by-side blocks) and export round trip`, async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['Category', '', 'Name', 'AGE', 'CONTACT NUMBER', '', 'Category', '', 'Name', 'AGE', 'CONTACT NUMBER']);
  for (let i = 1; i <= 28; i++) ws.addRow(['A', 'MEN', `Amen ${i}`, 30 + (i % 9), 9800000000 + i, '', 'W1', 'WOMEN', `Wom ${i}`, 25, 9900000000 + i]);
  const data = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
  const r = await ok(ctx, '/players/import', { method: 'POST', body: { filename: 'MEN.xlsx', data } });
  assert.equal(r.lists.A.length, 28); assert.equal(r.lists.WOMEN.length, 28);
  assert.deepEqual(r.details['Amen 1'], { age: '31', phone: '9800000001' });
  await ok(ctx, '/tournaments', { method: 'POST', body: { name: 'Auction import' } });
  await ok(ctx, '/tournament', { method: 'PATCH', body: { categories: ['A', 'WOMEN'] } });
  await ok(ctx, '/players', { method: 'PUT', body: { lists: r.lists, details: r.details } });
  // Phone numbers never reach the public state.
  assert.ok(!JSON.stringify(await state(ctx)).includes('9800000001'));
  const x = await raw(ctx, '/export.xlsx');
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(x.body);
  const sheet = out.getWorksheet('Players');
  assert.deepEqual([1, 3, 4, 5, 6].map(n => sheet.getRow(1).getCell(n).text), ['Category', 'Name', 'AGE', 'CONTACT NUMBER', 'TEAM']);
  assert.deepEqual([sheet.getRow(2).getCell(1).text, sheet.getRow(2).getCell(2).text, sheet.getRow(2).getCell(3).text, sheet.getRow(2).getCell(4).text, sheet.getRow(2).getCell(5).text], ['A', 'MEN', 'Amen 1', '31', '9800000001']);
  assert.equal(sheet.getRow(30).getCell(1).text, 'W1'); assert.equal(sheet.getRow(30).getCell(2).text, 'WOMEN');
});

test(`${id()} details: host can fix an age / number after drawing; never public; anonymous refused`, async () => {
  const s = await fresh(ctx, { categories: ['WOMEN'] });
  await spin(ctx);
  const drawn = (await state(ctx)).teams[0].players.WOMEN;
  assert.equal((await raw(ctx, '/players/details', { method: 'PUT', auth: false, body: { details: { [drawn]: { phone: '9833174584' } } } })).status, 401);
  const r = await ok(ctx, '/players/details', { method: 'PUT', body: { details: { [drawn]: { age: '34', phone: '+91 98331 74584' }, 'Nobody Here': { phone: '1' } } } });
  assert.equal(r.updated, 1);
  assert.deepEqual((await ok(ctx, '/admin')).details[drawn], { age: '34', phone: '+91 98331 74584' });
  assert.ok(!JSON.stringify(await state(ctx)).includes('98331'));
  assert.equal((await raw(ctx, '/players/details', { method: 'PUT', body: { details: [] } })).status, 400);
  assert.equal(s.event, 'main');
});
