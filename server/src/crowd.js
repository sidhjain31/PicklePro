// Audience participation: emoji reactions and pick predictions.
// Neither can choose or change a result: reactions are only relayed, and guesses are scored
// against revealed picks only.
import * as engine from './draw.js';
import { HttpError } from './draw.js';
import { Guess, LABELS, eventOf, poolOf } from './models.js';

export const REACTIONS = ['🔥', '😂', '👏', '🎉', '😱', '❤️'];
const REACTIONS_PER_SEC = 4;

const fail = (status, message) => { throw new HttpError(status, message); };

// Simple per-key rate window.
function limiter(max, ms) {
  const hits = new Map();
  return key => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || now - h.t > ms) {
      hits.set(key, { t: now, n: 1 });
      if (hits.size > 5000) hits.clear();
      return true;
    }
    return ++h.n <= max;
  };
}

// With hundreds of phones, relaying every tap to every phone multiplies (taps x phones). Instead,
// each event relays at most RELAY_MAX reactions per RELAY_MS window; extra taps are dropped.
const RELAY_MS = 500;
const RELAY_MAX = 4;
const relayed = new Map(); // room -> { t, n }
const relayOk = room => {
  const now = Date.now();
  const r = relayed.get(room);
  if (!r || now - r.t >= RELAY_MS) { relayed.set(room, { t: now, n: 1 }); return true; }
  return ++r.n <= RELAY_MAX;
};

export function attachCrowd(io) {
  io.on('connection', socket => {
    const canReact = limiter(REACTIONS_PER_SEC, 1000);
    const auth = socket.handshake.auth ?? {};
    // Match-draw screens react in their own room (cup:<event>), auction screens in event:<event>.
    const room = auth.module === 'cup' ? `cup:${eventOf(auth.event)}` : engine.roomOf(eventOf(auth.event));
    socket.on('reaction', emoji => {
      if (typeof emoji !== 'string' || !REACTIONS.includes(emoji) || !canReact(socket.id) || !relayOk(room)) return;
      io.to(room).emit('reaction', { emoji }); // only screens of the same event
    });
  });
}

// ---------- Predictions ----------

// Per viewer, not per IP: a whole venue shares one Wi-Fi IP, and Vercel's rewrite shares one more.
const guessPerViewer = limiter(12, 60 * 1000);
const guessOverall = limiter(5000, 60 * 1000);

function nextGuessable(s) {
  const { t, current, revealed, players } = s;
  if (t.status !== 'LIVE' || !current || engine.isShuffle(current)) return null;
  const filled = revealed.filter(e => e.category === current).length;
  if (filled >= t.teamCount) return null;
  const taken = new Set(revealed.map(e => String(e.playerId)));
  const pool = players.filter(p => p.category === poolOf(current) && !taken.has(String(p._id))).map(p => p.name);
  return { category: current, team: filled + 1, pool };
}

export async function submitGuess(body = {}, ev = 'main') {
  const { voterId, category, team } = body;
  if (typeof voterId !== 'string' || !/^[\w-]{8,64}$/.test(voterId)) fail(400, 'Bad voter id');
  if (!guessOverall('all') || !guessPerViewer(voterId)) fail(429, 'Slow down a little');
  if (typeof body.nickname !== 'string' || typeof body.name !== 'string') fail(400, 'Nickname and player name must be text');
  const nickname = engine.cleanName(body.nickname);
  if (!nickname || nickname.length > 24) fail(400, 'Nickname must be 1–24 characters');
  const name = engine.cleanName(body.name);
  const s = await engine.snapshot(undefined, ev);
  // The host can switch predictions off; enforced here, not just hidden in the page.
  if (s.t.predictions === false) fail(409, 'Predictions are closed by the host');
  const open = nextGuessable(s);
  if (!open) fail(409, 'Predictions are closed right now');
  // Guesses stay open while the reel spins: the result is hidden on the server until the reveal.
  if (category !== open.category || team !== open.team) fail(409, `Predictions are for ${LABELS[open.category]} · Team ${open.team}`);
  if (!open.pool.includes(name)) fail(400, 'Pick a player who is still in the draw');
  await Guess.updateOne(
    { tournamentId: s.t._id, category, teamNumber: team, voterId },
    { nickname, playerName: name },
    { upsert: true },
  );
  return { ok: true, category, team, name };
}

// Every phone asks for the leaderboard right after a reveal. The ranking is computed once per
// change (cached by the engine's change counter, max 2 s) and only "me" is computed per request.
const boardCache = new Map(); // ev -> { epoch, at, value }
export async function leaderboard({ voter } = {}, ev = 'main') {
  const key = eventOf(ev);
  const hit = boardCache.get(key);
  let base = hit && hit.epoch === engine.changeEpoch(key) && Date.now() - hit.at < 2000 ? hit.value : null;
  if (!base) {
    base = await computeBoard(ev);
    boardCache.set(key, { epoch: engine.changeEpoch(key), at: Date.now(), value: base });
  }
  const meIndex = voter ? base.ranked.findIndex(r => r.voterId === voter) : -1;
  const me = meIndex >= 0 ? { rank: meIndex + 1, correct: base.ranked[meIndex].correct, total: base.ranked[meIndex].total } : null;
  return { top: base.top, last: base.last, me, players: base.ranked.length };
}

async function computeBoard(ev) {
  const s = await engine.snapshot(undefined, ev);
  const guesses = await Guess.find({ tournamentId: s.t._id }).sort({ updatedAt: 1 }).lean();
  const result = new Map(s.revealed.map(e => [`${e.category}:${e.teamNumber}`, e.playerName]));
  const scores = new Map();
  for (const g of guesses) {
    const answer = result.get(`${g.category}:${g.teamNumber}`);
    if (answer === undefined) continue; // not revealed yet: never scored early
    const row = scores.get(g.voterId) ?? { voterId: g.voterId, nickname: g.nickname, correct: 0, total: 0 };
    row.nickname = g.nickname;
    row.total += 1;
    if (answer === g.playerName) row.correct += 1;
    scores.set(g.voterId, row);
  }
  const ranked = [...scores.values()].sort((a, b) => b.correct - a.correct || a.total - b.total);
  const top = ranked.slice(0, 10).map(({ voterId, ...r }) => r);
  const lastSpin = s.revealed.filter(e => !engine.isShuffle(e.category)).at(-1);
  let last = null;
  if (lastSpin) {
    const onIt = guesses.filter(g => g.category === lastSpin.category && g.teamNumber === lastSpin.teamNumber);
    last = { category: lastSpin.category, team: lastSpin.teamNumber, total: onIt.length, correct: onIt.filter(g => g.playerName === lastSpin.playerName).length };
  }
  return { top, last, ranked };
}
