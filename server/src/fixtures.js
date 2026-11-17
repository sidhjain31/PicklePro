// Match draw ("fixtures") module: who plays whom, live. Separate from the team auction — its own
// collection (Cup), routes (/api/fixtures, /api/kids/fixtures) and Socket.IO rooms (cup:<event>).
// The rules are in client/src/cup/core.js (shared with the browser demo); this file adds storage,
// secure randomness, the fairness seal and the timed reveals.
import { createHash, randomBytes, randomInt } from 'node:crypto';
import express from 'express';
import * as core from '../../client/src/cup/core.js';
import { requireAdmin } from './auth.js';
import { sha256 } from './draw.js';
import { Cup, CupLogo, eventOf } from './models.js';

let io = null;
export const setCupIo = server => { io = server; };
// Server clock for the show timeline. Tests swap it to fast-forward a show instead of waiting.
let clock = () => Date.now();
export const setCupClock = fn => { clock = fn ?? (() => Date.now()); };
export const cupRoom = ev => `cup:${eventOf(ev)}`;

// ponytail: one in-process lock for every match-draw change (single server instance, like the auction).
let queue = Promise.resolve();
const locked = fn => {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
};

const FIELDS = ['event', 'name', 'status', 'aimMs', 'weapon', 'courts', 'teams', 'draws', 'results', 'seeds', 'tieBreaks', 'audit'];
// Who made a host change (the host types a name once per device; one shared login otherwise).
const who = b => core.clean(b?.by).slice(0, 40) || 'host';
function plain(doc) {
  const o = doc.toObject({ minimize: false });
  const cup = Object.fromEntries(FIELDS.map(k => [k, o[k]]));
  cup.results ??= {};
  cup.tieBreaks ??= []; // older draws (before 2026-11-17) have no decisions or audit log yet
  cup.audit ??= [];
  cup.id = String(o._id);
  return cup;
}

async function activeDoc(ev) {
  const e = eventOf(ev);
  return (await Cup.findOne({ event: e }).sort({ _id: -1 })) ?? Cup.create(core.newCup({ event: e }));
}
async function load(ev) {
  const doc = await activeDoc(ev);
  return { doc, cup: plain(doc) };
}
async function store(doc, cup) {
  const set = Object.fromEntries(FIELDS.filter(k => k !== 'event').map(k => [k, cup[k]]));
  await Cup.updateOne({ _id: doc._id }, { $set: set });
}

// Public state, cached for 1 s against hundreds of phones; every change and reveal refreshes it.
const cache = new Map();
const publicOf = cup => ({ id: cup.id, ...core.view(cup, clock()) });
export async function cupState(ev = 'main') {
  const hit = cache.get(eventOf(ev));
  if (hit && clock() - hit.at < 1000) return { ...hit.value, now: clock() };
  const { cup } = await load(ev);
  const value = publicOf(cup);
  cache.set(eventOf(ev), { at: clock(), value });
  return value;
}
async function broadcast(ev) {
  if (!io) return;
  try {
    const { cup } = await load(ev);
    const value = publicOf(cup);
    cache.set(eventOf(ev), { at: clock(), value });
    io?.to(cupRoom(ev)).emit('cup:state', value);
  } catch (err) {
    console.error('cup broadcast failed', err);
  }
}

// Every screen learns a drawn team at the same moment: a fresh state goes out just after each
// reveal (and when the show ends). Nothing is sent early, so no phone can peek.
const timers = new Set();
function schedule(ev, d) {
  const now = clock();
  for (const at of new Set([d.revealA, d.revealB, d.doneAt])) {
    if (at <= now) continue;
    const id = setTimeout(() => {
      timers.delete(id);
      broadcast(ev);
    }, at - now + 30);
    timers.add(id);
  }
}
export function stopCupTimers() {
  timers.forEach(clearTimeout);
  timers.clear();
}
export async function resumeCupReveals() {
  for (const ev of ['main', 'kids']) {
    const doc = await Cup.findOne({ event: ev }).sort({ _id: -1 }).lean();
    for (const d of doc?.draws ?? []) if (!d.voided && d.doneAt > clock()) schedule(ev, d);
  }
}

const mutate = (ev, fn) => locked(async () => {
  const { doc, cup } = await load(ev);
  const out = await fn(cup);
  await store(doc, cup);
  await broadcast(ev);
  return out ?? { ok: true };
});

// data:image/png;base64,... -> stored logo hash (PNG / JPEG / WebP only, at most 400 KB).
const LOGO_MAX = 400 * 1024;
async function storeLogo(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m) throw core.cupError(400, 'Logos must be PNG, JPEG or WebP images');
  const data = Buffer.from(m[2], 'base64');
  if (!data.length || data.length > LOGO_MAX) throw core.cupError(400, 'A logo is too large (max 400 KB)');
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 32);
  await CupLogo.updateOne({ hash }, { $setOnInsert: { hash, type: m[1], data } }, { upsert: true });
  return hash;
}

const actions = {
  settings: (b, ev) => mutate(ev, cup => core.setSettings(cup, b)),
  // Colours / logo ids per team, any time (looks only).
  looks: (b, ev) => mutate(ev, cup => core.setLooks(cup, b.looks)),
  // Upload logos { teamKey: dataUrl | null }: stored first, then attached to the teams.
  logos: async (b, ev) => {
    const input = b.logos && typeof b.logos === 'object' && !Array.isArray(b.logos) ? Object.entries(b.logos).slice(0, core.MAX_TEAMS) : null;
    if (!input) throw core.cupError(400, 'logos must be an object');
    const looks = {};
    for (const [key, url] of input) looks[key] = { logo: url === null ? null : await storeLogo(url) };
    return mutate(ev, cup => core.setLooks(cup, looks));
  },
  teams: (b, ev) => mutate(ev, cup => core.setTeams(cup, b.teams)),
  open: (b, ev) => mutate(ev, cup => core.openArena(cup)),
  setup: (b, ev) => mutate(ev, cup => core.backToSetup(cup, clock())),
  draw: (b, ev) => mutate(ev, cup => {
    const d = core.drawMatch(cup, { tie: b.tie, weapon: b.weapon, now: clock(), rand: n => randomInt(n) });
    // Fairness seal: the hash is public when the show starts, the key only after the show.
    const name = key => cup.teams.find(t => t.key === key)?.name;
    d.salt = randomBytes(32).toString('hex');
    d.commitment = sha256(core.proofText({ seq: d.seq, tie: d.tie, a: name(d.a), b: name(d.b), salt: d.salt }));
    schedule(ev, d);
    return { seq: d.seq, tie: d.tie };
  }),
  undo: (b, ev) => mutate(ev, cup => core.undoMatch(cup, { seq: b.seq, now: clock() })),
  result: (b, ev) => mutate(ev, cup => core.setResult(cup, { tie: b.tie, games: b.games, decider: b.decider ?? null, deciderReason: b.deciderReason ?? null, confirm: b.confirm === true, by: who(b), now: clock() })),
  tiebreak: (b, ev) => mutate(ev, cup => core.setTieBreak(cup, { teams: b.teams, reason: b.reason, clear: b.clear === true, by: who(b), now: clock() })),
  seed: (b, ev) => mutate(ev, cup => core.lockKnockout(cup, { seeds: b.seeds, by: who(b), now: clock() })),
  unseed: (b, ev) => mutate(ev, cup => core.unlockKnockout(cup, { by: who(b), now: clock() })),
  // A new match draw for this event; the old one stays in the database as history.
  // keepTeams: the host's Restart — same teams, logos and settings, nothing drawn (rehearsals, then
  // one Restart before the real draw so the audience sees a clean start).
  fresh: (b, ev) => locked(async () => {
    const { cup } = await load(ev);
    if (cup.draws.some(d => !d.voided && d.doneAt > clock())) throw core.cupError(409, 'Wait for the show to finish');
    const next = core.newCup({ event: eventOf(ev), name: typeof b.name === 'string' && b.name.trim() ? b.name : cup.name });
    Object.assign(next, { aimMs: cup.aimMs, weapon: cup.weapon, courts: cup.courts });
    if (b.keepTeams === true) next.teams = JSON.parse(JSON.stringify(cup.teams ?? []));
    await Cup.create(next);
    await broadcast(ev);
    return { ok: true };
  }),
};

export function cupApi(ev) {
  const api = express.Router();
  api.get('/state', async (req, res) => res.json(await cupState(ev)));
  // Logos are immutable (content-addressed): cache them for a year everywhere.
  api.get('/logo/:hash', async (req, res) => {
    const logo = /^[0-9a-f]{16,64}$/.test(req.params.hash) && await CupLogo.findOne({ hash: req.params.hash }).lean();
    if (!logo) return res.status(404).json({ error: 'Not found' });
    res.set('Cache-Control', 'public, max-age=31536000, immutable').type(logo.type).send(Buffer.from(logo.data.buffer ?? logo.data));
  });
  const ok = name => async (req, res) => res.json(await actions[name](req.body ?? {}, ev));
  api.get('/admin', requireAdmin, async (req, res) => {
    const { cup } = await load(ev);
    res.json({ history: core.history(cup, clock()), audit: (cup.audit ?? []).slice(-300).reverse() });
  });
  api.patch('/settings', requireAdmin, ok('settings'));
  api.patch('/looks', requireAdmin, ok('looks'));
  api.put('/logos', requireAdmin, ok('logos'));
  api.put('/teams', requireAdmin, ok('teams'));
  api.post('/open', requireAdmin, ok('open'));
  api.post('/setup', requireAdmin, ok('setup'));
  api.post('/draw', requireAdmin, ok('draw'));
  api.post('/undo', requireAdmin, ok('undo'));
  api.put('/result', requireAdmin, ok('result'));
  api.post('/seed', requireAdmin, ok('seed'));
  api.post('/unseed', requireAdmin, ok('unseed'));
  api.post('/tiebreak', requireAdmin, ok('tiebreak'));
  api.post('/new', requireAdmin, ok('fresh'));
  api.use((req, res) => res.status(404).json({ error: 'Not found' }));
  return api;
}
