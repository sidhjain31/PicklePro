import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { Tournament, Player, DrawEvent, LABELS, ALL_CATEGORIES } from './models.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => { throw new HttpError(status, message); };

// ponytail: in-process lock serialises every mutation. Correct because we run one server
// instance; a multi-instance deploy would need Mongo transactions instead.
let queue = Promise.resolve();
function locked(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}

let io = null;
export const setIo = server => { io = server; };
const emit = (event, data) => io?.emit(event, data);
async function broadcast() {
  try {
    emit('tournament:state', await publicState());
  } catch (err) {
    console.error('broadcast failed', err);
  }
}

export const cleanName = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const keyOf = name => name.toLowerCase();
const modeOf = category => (category === 'A' ? 'shuffle' : 'spin');

// Fisher–Yates with a CSPRNG.
export function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function activeTournament() {
  return (await Tournament.findOne().sort({ _id: -1 })) ?? Tournament.create({ name: 'Team Draw' });
}

// `tournamentId` reads an archived tournament; by default it's the active (newest) one.
async function findTournament(id) {
  const t = mongoose.isValidObjectId(id) && await Tournament.findById(id);
  return t || fail(404, 'Tournament not found');
}

// Every tournament, newest first; the first one is active, the rest are the archive.
export async function listTournaments() {
  const [all, counts] = await Promise.all([
    Tournament.find().sort({ _id: -1 }).lean(),
    DrawEvent.aggregate([{ $match: { voided: false } }, { $group: { _id: '$tournamentId', n: { $sum: 1 } } }]),
  ]);
  const drawn = new Map(counts.map(c => [String(c._id), c.n]));
  return all.map((t, i) => ({
    id: String(t._id),
    name: t.name,
    status: t.status,
    active: i === 0,
    createdAt: t.createdAt,
    categories: t.categories,
    teamCount: t.teamCount,
    draws: drawn.get(String(t._id)) ?? 0,
  }));
}

export async function snapshot(tournamentId) {
  const t = tournamentId ? await findTournament(tournamentId) : await activeTournament();
  const [players, events] = await Promise.all([
    Player.find({ tournamentId: t._id }).sort({ _id: 1 }).lean(),
    DrawEvent.find({ tournamentId: t._id }).sort({ sequence: 1 }).lean(),
  ]);
  const now = Date.now();
  const active = events.filter(e => !e.voided);
  return {
    t, players, events, active, now,
    revealed: active.filter(e => +e.revealAt <= now),
    pending: active.filter(e => +e.revealAt > now),
    current: t.status === 'LIVE' ? t.categories[t.currentIndex] : null,
  };
}

// The exact text that is hashed. Clients rebuild it to verify; keep in sync with client/src/fair.js.
export const proofText = ({ actionId, category, assignments, salt }) =>
  `PicklePro|v1|${actionId}|${category}|${assignments.map(a => `${a.teamNumber}=${a.name}`).join(';')}|${salt}`;
export const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');

// Only ever built from revealed events, so including the salt is safe.
const actionSummary = events => ({
  actionId: events[0].actionId,
  category: events[0].category,
  mode: modeOf(events[0].category),
  assignments: events.map(e => ({ teamNumber: e.teamNumber, name: e.playerName })),
  commitment: events[0].commitment ?? null,
  salt: events[0].salt ?? null,
});

// What the audience (and admin board) may see: nothing that is still behind a running spin.
export async function publicState(s) {
  s ??= await snapshot();
  const { t, players, revealed, pending, current } = s;
  const teams = Array.from({ length: t.teamCount }, (_, i) => ({ number: i + 1, players: {} }));
  for (const e of revealed) teams[e.teamNumber - 1].players[e.category] = e.playerName;
  const assigned = new Set(revealed.map(e => String(e.playerId)));
  const countOf = c => revealed.filter(e => e.category === c).length;
  const filled = current ? countOf(current) : 0;
  const last = revealed.at(-1);
  return {
    id: String(t._id),
    name: t.name,
    status: t.status,
    teamCount: t.teamCount,
    spinMs: t.spinMs,
    categories: t.categories.map((key, i) => ({
      key,
      label: LABELS[key],
      state: t.status === 'COMPLETED' || i < t.currentIndex ? 'done' : key === current ? 'active' : 'upcoming',
      players: players.filter(p => p.category === key).length,
      assigned: countOf(key),
    })),
    current,
    mode: current && modeOf(current),
    currentTeam: pending.length ? pending[0].teamNumber : current && filled < t.teamCount ? filled + 1 : null,
    remaining: players.filter(p => p.category === current && !assigned.has(String(p._id))).map(p => p.name),
    teams,
    pending: pending.length
      ? { actionId: pending[0].actionId, category: pending[0].category, mode: modeOf(pending[0].category), teamNumbers: pending.map(e => e.teamNumber), commitment: pending[0].commitment ?? null }
      : null,
    last: last ? actionSummary(revealed.filter(e => e.actionId === last.actionId)) : null,
  };
}

// A category's list can change until its first draw; finalized categories never change.
function isEditable({ t, active }, c) {
  if (t.status === 'DRAFT') return true;
  if (t.status !== 'LIVE' || t.categories.slice(0, t.currentIndex).includes(c)) return false;
  return !active.some(e => e.category === c);
}

export async function adminState() {
  const s = await snapshot();
  return {
    lists: Object.fromEntries(ALL_CATEGORIES.map(c => [c, s.players.filter(p => p.category === c).map(p => p.name)])),
    editable: Object.fromEntries(ALL_CATEGORIES.map(c => [c, isEditable(s, c)])),
    history: historyRows(s),
  };
}

export const historyRows = s => s.events
  .filter(e => +e.revealAt <= s.now)
  .map(e => ({
    sequence: e.sequence,
    at: e.createdAt,
    category: LABELS[e.category],
    teamNumber: e.teamNumber,
    player: e.playerName,
    eventId: String(e._id),
    actionId: e.actionId,
    voided: e.voided,
    commitment: e.commitment ?? '',
    salt: e.salt ?? '',
  }));

function requireReady({ t, players }, c) {
  const n = players.filter(p => p.category === c).length;
  if (n !== t.teamCount) fail(400, `${LABELS[c]} needs exactly ${t.teamCount} players (has ${n})`);
}

const requireIdle = ({ pending }) => pending.length && fail(409, 'Wait for the current draw to finish');

function requireName(value) {
  const name = cleanName(value);
  if (!name || name.length > 100) fail(400, 'Name must be 1–100 characters');
  return name;
}

function scheduleReveal(actionId, ms) {
  setTimeout(async () => {
    try {
      const events = await DrawEvent.find({ actionId, voided: false }).sort({ sequence: 1 }).lean();
      if (events.length) emit('draw:revealed', actionSummary(events));
      await broadcast();
    } catch (err) {
      console.error('reveal failed', err);
    }
  }, Math.max(0, ms) + 25); // fire just after revealAt so the state we broadcast includes the result
}

// After a server restart, finish broadcasting any spin that was mid-animation.
export async function resumePendingReveals() {
  const now = Date.now();
  const pending = await DrawEvent.find({ voided: false, revealAt: { $gt: new Date(now) } }).lean();
  const byAction = new Map(pending.map(e => [e.actionId, +e.revealAt]));
  for (const [actionId, revealAt] of byAction) scheduleReveal(actionId, revealAt - now);
}

export const updateSettings = body => locked(async () => {
  const { t } = await snapshot();
  if (body.name !== undefined) t.name = requireName(body.name);
  if (body.spinMs !== undefined) {
    if (!Number.isInteger(body.spinMs) || body.spinMs < 0 || body.spinMs > 30000) fail(400, 'spinMs must be 0–30000');
    t.spinMs = body.spinMs;
  }
  if (body.categories !== undefined) {
    if (t.status !== 'DRAFT') fail(409, 'Categories are locked once the draw starts');
    const c = body.categories;
    const valid = Array.isArray(c) && c.length && new Set(c).size === c.length && c.every(x => ALL_CATEGORIES.includes(x));
    if (!valid) fail(400, 'Categories must be a non-empty list of A, WOMEN, B, C, D');
    t.categories = c;
  }
  await t.save();
  await broadcast();
});

export const savePlayers = ({ lists } = {}) => locked(async () => {
  if (!lists || typeof lists !== 'object' || Array.isArray(lists)) fail(400, 'lists must be an object');
  const s = await snapshot();
  const cats = Object.keys(lists);
  const cleaned = {};
  for (const c of cats) {
    if (!ALL_CATEGORIES.includes(c)) fail(400, `Unknown category ${c}`);
    if (!isEditable(s, c)) fail(409, `${LABELS[c]} has already been drawn and can't be edited`);
    if (!Array.isArray(lists[c]) || lists[c].length > 200) fail(400, `${LABELS[c]} must be a list of at most 200 names`);
    cleaned[c] = lists[c].map(cleanName).filter(Boolean);
    const long = cleaned[c].find(n => n.length > 60);
    if (long) fail(400, `Name too long (max 60): "${long}"`);
  }
  // Check uniqueness against the final state: untouched categories plus the new lists.
  const seen = new Map(s.players.filter(p => !cats.includes(p.category)).map(p => [keyOf(p.name), p.category]));
  const errors = [];
  for (const c of cats) {
    for (const name of cleaned[c]) {
      const other = seen.get(keyOf(name));
      if (!other) seen.set(keyOf(name), c);
      else errors.push(other === c ? `"${name}" is listed twice in ${LABELS[c]}` : `"${name}" is in both ${LABELS[other]} and ${LABELS[c]}`);
    }
  }
  if (errors.length) fail(400, errors.slice(0, 10).join('\n'));
  await Player.deleteMany({ tournamentId: s.t._id, category: { $in: cats } });
  await Player.insertMany(cats.flatMap(c => cleaned[c].map(name => ({ tournamentId: s.t._id, category: c, name, nameKey: keyOf(name) }))));
  await broadcast();
});

export const createTournament = ({ name } = {}) => locked(async () => {
  const s = await snapshot();
  requireIdle(s);
  await Tournament.create({ name: requireName(name), categories: s.t.categories, spinMs: s.t.spinMs });
  await broadcast();
});

export const startDraw = () => locked(async () => {
  const s = await snapshot();
  if (s.t.status !== 'DRAFT') fail(409, 'The draw has already started');
  requireReady(s, s.t.categories[0]);
  s.t.status = 'LIVE';
  s.t.currentIndex = 0;
  await s.t.save();
  await broadcast();
});

// The one draw engine. A: random permutation of the pool onto the open teams in one action.
// Women/B/C/D: one secure random pick for the next team. `team` is the team the admin's
// screen says is next; it only guards against double clicks and stale tabs, the server
// decides everything else.
export const draw = ({ category, team } = {}) => locked(async () => {
  const s = await snapshot();
  const { t, players, active, events, current } = s;
  if (t.status !== 'LIVE') fail(409, 'The draw is not live');
  if (category !== current) fail(409, `${LABELS[current]} is the active category`);
  requireIdle(s);
  requireReady(s, current);
  const filled = active.filter(e => e.category === current).length;
  if (filled >= t.teamCount) fail(409, `All ${t.teamCount} teams are filled — finalize ${LABELS[current]}`);
  if (team !== filled + 1) fail(409, `Team ${filled + 1} is next — your screen was out of date`);

  const taken = new Set(active.map(e => String(e.playerId)));
  const pool = players.filter(p => p.category === current && !taken.has(String(p._id)));
  const picks = current === 'A' ? shuffle(pool) : [pool[randomInt(pool.length)]];
  const actionId = randomUUID();
  const revealAt = new Date(Date.now() + t.spinMs);
  const salt = randomBytes(32).toString('hex');
  const assignments = picks.map((p, i) => ({ teamNumber: filled + 1 + i, name: p.name }));
  const commitment = sha256(proofText({ actionId, category: current, assignments, salt }));
  await DrawEvent.insertMany(picks.map((p, i) => ({
    commitment,
    salt,
    tournamentId: t._id,
    actionId,
    sequence: events.length + i + 1,
    category: current,
    teamNumber: filled + 1 + i,
    playerId: p._id,
    playerName: p.name,
    revealAt,
  })));
  scheduleReveal(actionId, t.spinMs);
  emit('draw:spinning', {
    actionId,
    category: current,
    mode: modeOf(current),
    teamNumbers: picks.map((_, i) => filled + 1 + i),
    candidates: pool.map(p => p.name),
    commitment,
  });
  await broadcast();
  return { actionId };
});

export const undo = ({ actionId } = {}) => locked(async () => {
  const s = await snapshot();
  requireIdle(s);
  const last = s.active.at(-1);
  if (s.t.status !== 'LIVE' || !last || last.category !== s.current) fail(409, 'Nothing to undo in the active category');
  if (last.actionId !== actionId) fail(409, 'That is no longer the latest draw — your screen was out of date');
  await DrawEvent.updateMany({ tournamentId: s.t._id, actionId }, { voided: true, voidedAt: new Date() });
  emit('draw:undone', { actionId });
  await broadcast();
});

export const finalize = ({ category } = {}) => locked(async () => {
  const s = await snapshot();
  const { t, current } = s;
  if (t.status !== 'LIVE' || category !== current) fail(409, `${LABELS[current] ?? 'No category'} is the active category`);
  requireIdle(s);
  const done = s.active.filter(e => e.category === current);
  const n = t.teamCount;
  const complete = done.length === n
    && new Set(done.map(e => e.teamNumber)).size === n
    && new Set(done.map(e => String(e.playerId))).size === n;
  if (!complete) fail(409, `Fill all ${n} teams before finalizing ${LABELS[current]}`);
  t.currentIndex += 1;
  if (t.currentIndex >= t.categories.length) t.status = 'COMPLETED';
  await t.save();
  emit('category:finalized', { category: current });
  await broadcast();
});
