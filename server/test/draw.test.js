import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import { io as connect } from 'socket.io-client';

process.env.ADMIN_PASSWORD = 'test-password';
process.env.SESSION_SECRET = 'x'.repeat(32);
const MONGO = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/picklepro_test';
const { start } = await import('../src/server.js');
const { shuffle, proofText, sha256 } = await import('../src/draw.js');
const { headerCategory, parseUpload } = await import('../src/excel.js');

const CATS = ['A', 'WOMEN', 'B', 'C', 'D'];
const namesFor = c => Array.from({ length: 28 }, (_, i) => `${c} Player ${i + 1}`);
let server;
let cookie = '';

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const res = await fetch(`http://127.0.0.1:${server.port}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(auth && cookie ? { cookie } : {}) },
    body: body && JSON.stringify(body),
  });
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, headers: res.headers, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
}
const ok = async (...args) => {
  const r = await api(...args);
  assert.equal(r.status, 200, `${args[0]} -> ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const state = () => ok('/state', { auth: false });

async function freshTournament({ categories = CATS, spinMs = 0 } = {}) {
  await ok('/tournaments', { method: 'POST', body: { name: 'Test Cup' } });
  await ok('/tournament', { method: 'PATCH', body: { categories, spinMs } });
  await ok('/players', { method: 'PUT', body: { lists: Object.fromEntries(categories.map(c => [c, namesFor(c)])) } });
  await ok('/start', { method: 'POST' });
}
const spin = async () => {
  const s = await state();
  return api('/draw', { method: 'POST', body: { category: s.current, team: s.currentTeam } });
};

before(async () => {
  await mongoose.connect(MONGO);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  server = await start({ port: 0, mongoUri: MONGO });
});
after(() => server.close());

test('shuffle is a permutation', () => {
  const items = Array.from({ length: 28 }, (_, i) => i);
  for (let k = 0; k < 50; k++) assert.deepEqual(shuffle(items).sort((a, b) => a - b), items);
});

test('admin APIs reject the audience', async () => {
  assert.equal((await api('/draw', { method: 'POST', body: {}, auth: false })).status, 401);
  assert.equal((await api('/admin', { auth: false })).status, 401);
  assert.equal((await api('/export.xlsx', { auth: false })).status, 401);
  assert.equal((await api('/auth/login', { method: 'POST', body: { password: 'nope' } })).status, 401);
  assert.equal((await api('/admin', { auth: false, headers: {} })).status, 401);
  const res = await api('/auth/login', { method: 'POST', body: { password: 'test-password' } });
  assert.equal(res.status, 200);
  cookie = res.headers.get('set-cookie').split(';')[0];
  assert.equal((await ok('/auth/me')).admin, true);
  // A forged cookie must not pass.
  const forged = `admin=${Date.now() + 1e6}.AAAA`;
  const r = await fetch(`http://127.0.0.1:${server.port}/api/admin`, { headers: { cookie: forged } });
  assert.equal(r.status, 401);
});

test('player validation', async () => {
  await ok('/tournaments', { method: 'POST', body: { name: 'Validation' } });
  const dupAcross = await api('/players', { method: 'PUT', body: { lists: { A: ['Rahul', 'Sid'], B: ['rahul '] } } });
  assert.equal(dupAcross.status, 400);
  assert.match(dupAcross.body.error, /both A and B/);
  const dupWithin = await api('/players', { method: 'PUT', body: { lists: { WOMEN: ['Kruti', 'KRUTI'] } } });
  assert.match(dupWithin.body.error, /listed twice/);
  await ok('/players', { method: 'PUT', body: { lists: { A: namesFor('A').slice(0, 27) } } });
  const start27 = await api('/start', { method: 'POST' });
  assert.equal(start27.status, 400);
  assert.match(start27.body.error, /exactly 28 players \(has 27\)/);
  assert.equal((await api('/tournament', { method: 'PATCH', body: { categories: ['A', 'X'] } })).status, 400);
});

test('full draw A, Women, B, C, D with guards, undo and export', async () => {
  await freshTournament();
  let s = await state();
  assert.equal(s.status, 'LIVE');
  assert.equal(s.current, 'A');
  assert.equal(s.currentTeam, 1);

  // Wrong category / stale team are rejected.
  assert.equal((await api('/draw', { method: 'POST', body: { category: 'WOMEN', team: 1 } })).status, 409);
  assert.equal((await api('/draw', { method: 'POST', body: { category: 'A', team: 2 } })).status, 409);
  assert.equal((await api('/finalize', { method: 'POST', body: { category: 'A' } })).status, 409);

  // A shuffle: one action fills all 28 teams.
  assert.equal((await spin()).status, 200);
  s = await state();
  assert.deepEqual(s.teams.map(t => t.players.A).sort(), namesFor('A').sort());
  assert.equal(s.currentTeam, null);
  assert.equal((await spin()).status, 409, 'cannot draw after team 28');
  // Players of a drawn category are locked; later categories are still editable.
  assert.equal((await api('/players', { method: 'PUT', body: { lists: { A: namesFor('A') } } })).status, 409);
  assert.equal((await ok('/admin')).editable.WOMEN, true);
  await ok('/finalize', { method: 'POST', body: { category: 'A' } });
  assert.equal((await api('/finalize', { method: 'POST', body: { category: 'A' } })).status, 409);

  for (const category of ['WOMEN', 'B', 'C', 'D']) {
    s = await state();
    assert.equal(s.current, category);
    assert.equal(s.remaining.length, 28);
    let undid = false;
    for (let team = 1; team <= 28; team++) {
      if (team === 5) {
        // Double click: same request twice in parallel -> exactly one draw.
        const results = await Promise.all([1, 2, 3].map(() => api('/draw', { method: 'POST', body: { category, team } })));
        assert.deepEqual(results.map(r => r.status).sort(), [200, 409, 409]);
      } else {
        const r = await api('/draw', { method: 'POST', body: { category, team } });
        assert.equal(r.status, 200, JSON.stringify(r.body));
      }
      s = await state();
      assert.equal(s.remaining.length, 28 - team);
      assert.equal(s.last.assignments[0].teamNumber, team);
      if (team === 10 && !undid) {
        undid = true;
        // Undo the last spin: team 10 opens up again, the player goes back to the pool.
        const undone = s.last;
        assert.equal((await api('/undo', { method: 'POST', body: { actionId: 'stale' } })).status, 409);
        await ok('/undo', { method: 'POST', body: { actionId: undone.actionId } });
        s = await state();
        assert.equal(s.currentTeam, 10);
        assert.ok(s.remaining.includes(undone.assignments[0].name));
        assert.equal(s.teams[9].players[category], undefined);
        team--;
      }
    }
    assert.equal((await spin()).status, 409);
    await ok('/finalize', { method: 'POST', body: { category } });
  }

  s = await state();
  assert.equal(s.status, 'COMPLETED');
  assert.equal((await spin()).status, 409);
  for (const c of CATS) {
    const names = s.teams.map(t => t.players[c]);
    assert.equal(new Set(names).size, 28, `${c} has 28 unique players`);
    assert.deepEqual(names.slice().sort(), namesFor(c).sort(), `${c} contains only its own players`);
  }
  // Undo is not allowed into a finalized category.
  assert.equal((await api('/undo', { method: 'POST', body: { actionId: s.last.actionId } })).status, 409);

  // Excel export matches the state.
  const xlsx = await api('/export.xlsx');
  assert.equal(xlsx.status, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsx.body);
  const teams = wb.getWorksheet('Final Teams');
  assert.deepEqual(teams.getRow(1).values.slice(1), ['Team', 'A Player', 'Women', 'B Player', 'C Player', 'D Player']);
  for (let i = 0; i < 28; i++) {
    assert.deepEqual(teams.getRow(i + 2).values.slice(1), [i + 1, ...CATS.map(c => s.teams[i].players[c])]);
  }
  const history = wb.getWorksheet('Draw History');
  const rows = history.getSheetValues().slice(2);
  assert.equal(rows.length, 28 * 5 + 4, '140 final draws + 4 undone spins');
  assert.equal(rows.filter(r => r[8] === 'UNDONE').length, 4);
  const admin = await ok('/admin');
  assert.equal(admin.history.length, rows.length);
});

test('concurrent spins from two admin tabs never double-assign', async () => {
  await freshTournament({ categories: ['WOMEN'] });
  // Five tabs all think team 1 is next.
  const results = await Promise.all(Array.from({ length: 5 }, () => api('/draw', { method: 'POST', body: { category: 'WOMEN', team: 1 } })));
  assert.equal(results.filter(r => r.status === 200).length, 1);
  const s = await state();
  assert.equal(s.currentTeam, 2);
  assert.equal(s.remaining.length, 27);
});

test('spin is hidden until reveal, broadcast over Socket.IO, and survives a restart', async () => {
  await freshTournament({ categories: ['WOMEN', 'B'], spinMs: 400 });
  const socket = connect(`http://127.0.0.1:${server.port}`, { transports: ['websocket'] });
  const seen = [];
  socket.onAny((event, data) => seen.push({ event, data }));
  await new Promise(resolve => socket.once('tournament:state', resolve));

  assert.equal((await spin()).status, 200);
  let s = await state();
  assert.ok(s.pending, 'spin in progress');
  assert.equal(s.remaining.length, 28, 'winner not revealed yet');
  assert.equal(s.teams[0].players.WOMEN, undefined);
  assert.equal(s.last, null);
  assert.equal((await api('/draw', { method: 'POST', body: { category: 'WOMEN', team: 2 } })).status, 409, 'busy while spinning');
  assert.equal((await api('/undo', { method: 'POST', body: { actionId: s.pending.actionId } })).status, 409);

  const revealed = await new Promise(resolve => socket.once('draw:revealed', resolve));
  const spinning = seen.find(e => e.event === 'draw:spinning').data;
  assert.equal(spinning.actionId, revealed.actionId);
  assert.equal(spinning.candidates.length, 28);
  assert.ok(!('assignments' in spinning), 'spinning event carries no result');
  assert.equal(revealed.assignments[0].teamNumber, 1);
  s = await state();
  assert.equal(s.teams[0].players.WOMEN, revealed.assignments[0].name);

  // Restart mid-spin: the reveal is rescheduled from Mongo and the pointer continues.
  assert.equal((await spin()).status, 200);
  socket.close();
  await server.close();
  server = await start({ port: 0, mongoUri: MONGO });
  s = await state();
  assert.equal(s.currentTeam, 2);
  const socket2 = connect(`http://127.0.0.1:${server.port}`, { transports: ['websocket'] });
  const late = await new Promise(resolve => socket2.once('draw:revealed', resolve));
  assert.equal(late.assignments[0].teamNumber, 2);
  socket2.close();
  s = await state();
  assert.equal(s.currentTeam, 3);
  assert.equal(s.remaining.length, 26);
});

test('health reports the database', async () => {
  assert.deepEqual(await ok('/health', { auth: false }), { ok: true, db: 'up' });
});

test('archive lists past tournaments and exports any of them', async () => {
  assert.equal((await api('/tournaments', { auth: false })).status, 401);
  await freshTournament({ categories: ['WOMEN'] });
  assert.equal((await spin()).status, 200);
  const archived = (await state()).id;
  await ok('/tournaments', { method: 'POST', body: { name: 'Next Cup' } });

  const list = await ok('/tournaments');
  assert.equal(list[0].name, 'Next Cup');
  assert.equal(list[0].active, true);
  const past = list.find(t => t.id === archived);
  assert.equal(past.active, false);
  assert.equal(past.status, 'LIVE');
  assert.equal(past.draws, 1);

  const xlsx = await api(`/export.xlsx?tournament=${archived}`);
  assert.equal(xlsx.status, 200);
  assert.match(xlsx.headers.get('content-disposition'), /Test Cup\.xlsx/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsx.body);
  assert.equal(wb.getWorksheet('Draw History').rowCount, 2);
  assert.equal((await api('/export.xlsx?tournament=nope')).status, 404);
  assert.equal((await api('/export.xlsx?tournament=000000000000000000000000')).status, 404);
});

test('spreadsheet import', async () => {
  assert.equal(headerCategory('A Player'), 'A');
  assert.equal(headerCategory('Women'), 'WOMEN');
  assert.equal(headerCategory('Category C'), 'C');
  assert.equal(headerCategory('Notes'), null);

  const csv = 'A,Women,B\nRahul,Kruti,Amit\n"Sid, Jr",Anita,\n';
  const { lists } = await parseUpload({ filename: 'players.csv', data: Buffer.from(csv).toString('base64') });
  assert.deepEqual(lists, { A: ['Rahul', 'Sid, Jr'], WOMEN: ['Kruti', 'Anita'], B: ['Amit'] });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('x');
  ws.addRows([['C Player', 'D Player'], ['Ravi', 'Dev'], ['  Om  ', null]]);
  const data = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
  assert.deepEqual((await parseUpload({ filename: 'p.xlsx', data })).lists, { C: ['Ravi', 'Om'], D: ['Dev'] });
  await assert.rejects(parseUpload({ filename: 'p.xls', data }), /xlsx or \.csv/);
  await assert.rejects(parseUpload({ filename: 'p.csv', data: Buffer.from('foo,bar\n1,2').toString('base64') }), /First row/);
});

test('every host route requires the admin cookie', async () => {
  const routes = [
    ['GET', '/admin'], ['PATCH', '/tournament'], ['POST', '/tournaments'], ['GET', '/tournaments'],
    ['PUT', '/players'], ['POST', '/players/import'], ['POST', '/start'], ['POST', '/draw'],
    ['POST', '/undo'], ['POST', '/finalize'], ['GET', '/export.xlsx'],
  ];
  for (const [method, path] of routes) {
    const r = await api(path, { method, body: method === 'GET' ? undefined : {}, auth: false });
    assert.equal(r.status, 401, `${method} ${path}`);
  }
  // A cookie signed with another secret, and an expired one, are both rejected.
  const { createHmac } = await import('node:crypto');
  const signed = (exp, secret) => `admin=${exp}.${createHmac('sha256', secret).update(String(exp)).digest('base64url')}`;
  const get = c => fetch(`http://127.0.0.1:${server.port}/api/admin`, { headers: { cookie: c } }).then(r => r.status);
  assert.equal(await get(signed(Date.now() + 1e6, 'y'.repeat(32))), 401);
  assert.equal(await get(signed(Date.now() - 1, process.env.SESSION_SECRET)), 401);
  assert.equal(await get(signed(Date.now() + 1e6, process.env.SESSION_SECRET)), 200);
});

test('login cookie is HttpOnly + SameSite=Strict, and logout clears it', async () => {
  const res = await api('/auth/login', { method: 'POST', body: { password: 'test-password' }, auth: false });
  const set = res.headers.get('set-cookie');
  assert.match(set, /HttpOnly/i);
  assert.match(set, /SameSite=Strict/i);
  assert.match(set, /Max-Age=43200/);
  const out = await api('/auth/logout', { method: 'POST' });
  assert.match(out.headers.get('set-cookie'), /admin=;/);
});

test('new tournaments default to A, Women, B, C', async () => {
  await ok('/tournament', { method: 'PATCH', body: { categories: ['A'] } });
  await ok('/tournaments', { method: 'POST', body: { name: 'Defaults' } });
  // A new tournament copies the previous order; a brand-new database gets the full default.
  const { Tournament } = await import('../src/models.js');
  assert.deepEqual([...new Tournament({ name: 'x' }).categories], ['A', 'WOMEN', 'B', 'C']);
});

test('categories lock at start and the next category waits for finalize', async () => {
  await freshTournament({ categories: ['A', 'WOMEN'] });
  assert.equal((await api('/tournament', { method: 'PATCH', body: { categories: ['WOMEN'] } })).status, 409);
  assert.equal((await api('/start', { method: 'POST' })).status, 409);
  assert.equal((await spin()).status, 200);
  // A is fully drawn but not finalized: Women can't start.
  assert.equal((await api('/draw', { method: 'POST', body: { category: 'WOMEN', team: 1 } })).status, 409);
  await ok('/finalize', { method: 'POST', body: { category: 'A' } });
  assert.equal((await api('/draw', { method: 'POST', body: { category: 'WOMEN', team: 1 } })).status, 200);
  // Undo can't reach back into the finalized A shuffle.
  const s = await state();
  await ok('/undo', { method: 'POST', body: { actionId: s.last.actionId } });
  const after = await state();
  assert.equal(after.last.category, 'A');
  assert.equal((await api('/undo', { method: 'POST', body: { actionId: after.last.actionId } })).status, 409);
});

test('audience sockets cannot change the draw', async () => {
  await freshTournament({ categories: ['WOMEN'] });
  const before = await state();
  const socket = connect(`http://127.0.0.1:${server.port}`, { transports: ['websocket'] });
  await new Promise(resolve => socket.once('tournament:state', resolve));
  for (const event of ['draw', 'draw:spinning', 'draw:revealed', 'undo', 'finalize', 'tournament:state']) {
    socket.emit(event, { category: 'WOMEN', team: 1, teams: [], status: 'COMPLETED' });
  }
  await new Promise(resolve => setTimeout(resolve, 200));
  socket.close();
  assert.deepEqual(await state(), before);
});

test('spreadsheet upload over HTTP is validated', async () => {
  const b64 = text => Buffer.from(text).toString('base64');
  assert.equal((await api('/players/import', { method: 'POST', body: {} })).status, 400);
  assert.equal((await api('/players/import', { method: 'POST', body: { filename: 'x.xlsx', data: b64('not a zip') } })).status, 400);
  assert.equal((await api('/players/import', { method: 'POST', body: { filename: 'x.txt', data: b64('A\nRahul') } })).status, 400);
  const good = await ok('/players/import', { method: 'POST', body: { filename: 'x.csv', data: b64('Ladies;Category D\nKruti;Dev\n') } });
  assert.deepEqual(good.lists, { WOMEN: ['Kruti'], D: ['Dev'] });
  // Imported lists still go through the same save validation.
  await ok('/tournaments', { method: 'POST', body: { name: 'Import' } });
  const tooMany = await api('/players', { method: 'PUT', body: { lists: { A: Array.from({ length: 201 }, (_, i) => `P${i}`) } } });
  assert.equal(tooMany.status, 400);
  const longName = await api('/players', { method: 'PUT', body: { lists: { A: ['x'.repeat(61)] } } });
  assert.equal(longName.status, 400);
});

test('login is rate limited after repeated failures only', async () => {
  for (let i = 0; i < 3; i++) await ok('/auth/login', { method: 'POST', body: { password: 'test-password' }, auth: false });
  for (let i = 0; i < 10; i++) {
    assert.equal((await api('/auth/login', { method: 'POST', body: { password: 'bad' }, auth: false })).status, 401);
  }
  assert.equal((await api('/auth/login', { method: 'POST', body: { password: 'test-password' }, auth: false })).status, 429);
});

test('A is shuffled in one go wherever it sits in the order', async () => {
  await freshTournament({ categories: ['WOMEN', 'A'] });
  assert.equal((await state()).mode, 'spin');
  for (let team = 1; team <= 28; team++) assert.equal((await api('/draw', { method: 'POST', body: { category: 'WOMEN', team } })).status, 200);
  await ok('/finalize', { method: 'POST', body: { category: 'WOMEN' } });
  const s = await state();
  assert.equal(s.mode, 'shuffle');
  assert.equal((await spin()).status, 200);
  assert.equal((await state()).teams.filter(t => t.players.A).length, 28);
});

test('every draw is provably fair: sealed before the spin, verifiable after', async t => {
  await freshTournament({ categories: ['A', 'WOMEN'], spinMs: 300 });
  const socket = connect(`http://127.0.0.1:${server.port}`, { transports: ['websocket'] });
  t.after(() => socket.close());
  await new Promise(resolve => socket.once('tournament:state', resolve));
  for (const category of ['A', 'WOMEN']) {
    const spinning = new Promise(resolve => socket.once('draw:spinning', resolve));
    const revealed = new Promise(resolve => socket.once('draw:revealed', resolve));
    assert.equal((await spin()).status, 200);
    const sealed = await spinning;
    assert.match(sealed.commitment, /^[0-9a-f]{64}$/);
    // While spinning: the commitment is public, the key is not anywhere.
    const during = await state();
    assert.equal(during.pending.commitment, sealed.commitment);
    assert.equal(during.pending.salt, undefined);
    assert.notEqual(during.last?.actionId, during.pending.actionId, 'the spinning draw is not in `last` yet');
    const done = await revealed;
    assert.match(done.salt, /^[0-9a-f]{64}$/);
    assert.equal(done.commitment, sealed.commitment);
    assert.equal(sha256(proofText(done)), sealed.commitment, 'result matches what was sealed');
    // Tampering with any detail breaks the proof.
    const forged = { ...done, assignments: [{ ...done.assignments[0], name: 'Someone Else' }, ...done.assignments.slice(1)] };
    assert.notEqual(sha256(proofText(forged)), sealed.commitment);
    assert.equal((await state()).last.salt, done.salt);
    if (category === 'A') await ok('/finalize', { method: 'POST', body: { category: 'A' } });
  }
  socket.close();
  const history = (await ok('/admin')).history;
  assert.ok(history.every(h => /^[0-9a-f]{64}$/.test(h.commitment) && /^[0-9a-f]{64}$/.test(h.salt)));
});

const socketTo = async () => {
  const s = connect(`http://127.0.0.1:${server.port}`, { transports: ['websocket'] });
  await new Promise(resolve => s.once('tournament:state', resolve));
  return s;
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test('reactions: only the allowed emojis are relayed, and they are rate limited', async t => {
  const a = await socketTo();
  const b = await socketTo();
  t.after(() => { a.close(); b.close(); });
  const got = [];
  b.on('reaction', r => got.push(r.emoji));
  a.emit('reaction', '🔥');
  a.emit('reaction', '<script>');
  a.emit('reaction', { emoji: '🔥' });
  for (let i = 0; i < 10; i++) a.emit('reaction', '👏');
  await pause(300);
  assert.equal(got[0], '🔥');
  assert.ok(!got.includes('<script>'));
  assert.equal(got.length, 4, 'four per second per screen');
});

test('crowd spin: taps do nothing until the host enables it, then start exactly one draw', async t => {
  await freshTournament({ categories: ['WOMEN'], spinMs: 300 });
  const screens = await Promise.all([1, 2, 3].map(socketTo));
  t.after(() => screens.forEach(s => s.close()));
  for (const s of screens) for (let i = 0; i < 5; i++) s.emit('tap');
  await pause(300);
  assert.equal((await state()).currentTeam, 1, 'crowd spin is off by default');

  assert.equal((await api('/tournament', { method: 'PATCH', body: { crowdTarget: 2 } })).status, 400);
  await ok('/tournament', { method: 'PATCH', body: { crowdSpin: true, crowdTarget: 6 } });
  assert.deepEqual((await state()).crowd, { enabled: true, target: 6 });
  const fired = new Promise(resolve => screens[0].once('crowd:fired', resolve));
  // One screen alone can't fill the meter past its own cap, but three together can.
  for (const s of screens) for (let i = 0; i < 4; i++) s.emit('tap');
  await fired;
  await pause(200);
  const s = await state();
  assert.ok(s.pending, 'the crowd started the spin');
  assert.deepEqual(s.pending.teamNumbers, [1]);
  for (const sc of screens) sc.emit('tap'); // taps during a spin are ignored
  await pause(500);
  const after = await state();
  assert.equal(after.currentTeam, 2);
  assert.equal(after.remaining.length, 27, 'exactly one pick');
});

test('predictions: open only for the next spin, scored only after the reveal', async () => {
  await freshTournament({ categories: ['A', 'WOMEN'], spinMs: 400 });
  const guess = (body, voterId = 'voter-aaaa-1') => api('/guess', { method: 'POST', auth: false, body: { voterId, nickname: 'Asha', ...body } });
  assert.equal((await guess({ category: 'A', team: 1, name: 'A Player 1' })).status, 409, 'A is shuffled, no predictions');
  assert.equal((await spin()).status, 200);
  await pause(500);
  await ok('/finalize', { method: 'POST', body: { category: 'A' } });

  assert.equal((await guess({ category: 'WOMEN', team: 2, name: 'WOMEN Player 1' })).status, 409, 'wrong team');
  assert.equal((await guess({ category: 'WOMEN', team: 1, name: 'Nobody' })).status, 400);
  assert.equal((await guess({ category: 'WOMEN', team: 1, name: 'WOMEN Player 1', nickname: '' })).status, 400);
  assert.equal((await api('/guess', { method: 'POST', auth: false, body: { voterId: 'x', nickname: 'a', category: 'WOMEN', team: 1, name: 'WOMEN Player 1' } })).status, 400);
  // Everyone guesses a different player, so exactly one is right.
  for (let i = 1; i <= 28; i++) await ok('/guess', { method: 'POST', auth: false, body: { voterId: `voter-${String(i).padStart(4, '0')}`, nickname: `P${i}`, category: 'WOMEN', team: 1, name: `WOMEN Player ${i}` } });
  // Changing your guess is allowed before the reveal.
  await ok('/guess', { method: 'POST', auth: false, body: { voterId: 'voter-0001', nickname: 'P1', category: 'WOMEN', team: 1, name: 'WOMEN Player 2' } });

  assert.equal((await spin()).status, 200);
  let board = await ok('/leaderboard', { auth: false });
  assert.equal(board.players, 0, 'nothing scored while the result is hidden');
  // Guesses still accepted during the spin (result is hidden), but not after.
  await ok('/guess', { method: 'POST', auth: false, body: { voterId: 'voter-late', nickname: 'Late', category: 'WOMEN', team: 1, name: 'WOMEN Player 3' } });
  await pause(600);
  assert.equal((await guess({ category: 'WOMEN', team: 1, name: 'WOMEN Player 4' }, 'voter-after')).status, 409);

  // 29 guesses on Team 1: P1..P28 (P1 switched to Player 2) + Late (Player 3).
  const winner = (await state()).teams[0].players.WOMEN;
  const named = { 'WOMEN Player 1': 0, 'WOMEN Player 2': 2, 'WOMEN Player 3': 2 }[winner] ?? 1;
  board = await ok('/leaderboard?voter=voter-0002', { auth: false });
  assert.equal(board.last.total, 29);
  assert.equal(board.last.correct, named);
  assert.equal(board.top.filter(r => r.correct === 1).length, named);
  assert.ok(board.top.every(r => !('voterId' in r)), 'voter ids stay private');
  assert.equal(board.me.total, 1);
});
