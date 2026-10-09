// Audience participation: emoji reactions, crowd spin taps and pick predictions.
// None of this can choose or change a result: reactions are only relayed, taps can at most start
// the next draw (through the normal guarded draw()), and guesses are scored against revealed picks.
import * as engine from './draw.js';
import { HttpError } from './draw.js';
import { Guess, LABELS } from './models.js';

export const REACTIONS = ['🔥', '😂', '👏', '🎉', '😱', '❤️'];
const REACTIONS_PER_SEC = 4;
const TAPS_PER_SEC = 10;
const TAPS_PER_ROUND = 15; // per screen, so one phone can't fill the meter alone

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

export function attachCrowd(io) {
  let round = null;
  let taps = 0;
  let perScreen = new Map();
  let firing = false;
  let pendingEmit = null;
  const announce = target => {
    if (pendingEmit) return;
    pendingEmit = setTimeout(() => {
      pendingEmit = null;
      io.emit('crowd:taps', { round, taps, target });
    }, 150);
  };

  io.on('connection', socket => {
    const canReact = limiter(REACTIONS_PER_SEC, 1000);
    const canTap = limiter(TAPS_PER_SEC, 1000);

    socket.on('reaction', emoji => {
      if (typeof emoji !== 'string' || !REACTIONS.includes(emoji) || !canReact(socket.id)) return;
      io.emit('reaction', { emoji });
    });

    socket.on('tap', async () => {
      const s = engine.cachedState();
      if (!s?.crowd?.enabled || s.status !== 'LIVE' || s.pending || !s.currentTeam || firing) return;
      if (!canTap(socket.id)) return;
      const key = `${s.id}:${s.current}:${s.currentTeam}`;
      if (key !== round) {
        round = key;
        taps = 0;
        perScreen = new Map();
      }
      const mine = (perScreen.get(socket.id) ?? 0) + 1;
      if (mine > TAPS_PER_ROUND) return;
      perScreen.set(socket.id, mine);
      taps += 1;
      announce(s.crowd.target);
      if (taps < s.crowd.target) return;
      firing = true;
      io.emit('crowd:fired', { round });
      try {
        await engine.draw({ category: s.current, team: s.currentTeam });
      } catch {
        // Host spun at the same moment, or the round moved on: the guarded draw refused. Fine.
      } finally {
        firing = false;
        round = null;
        taps = 0;
      }
    });
  });
}

// ---------- Predictions ----------

// Per viewer, not per IP: a whole venue shares one Wi-Fi IP, and Vercel's rewrite shares one more.
const guessPerViewer = limiter(12, 60 * 1000);
const guessOverall = limiter(5000, 60 * 1000);

function nextGuessable(s) {
  const { t, current, revealed, players } = s;
  if (t.status !== 'LIVE' || !current || current === 'A') return null;
  const filled = revealed.filter(e => e.category === current).length;
  if (filled >= t.teamCount) return null;
  const taken = new Set(revealed.map(e => String(e.playerId)));
  const pool = players.filter(p => p.category === current && !taken.has(String(p._id))).map(p => p.name);
  return { category: current, team: filled + 1, pool };
}

export async function submitGuess(body = {}) {
  const { voterId, category, team } = body;
  if (typeof voterId !== 'string' || !/^[\w-]{8,64}$/.test(voterId)) fail(400, 'Bad voter id');
  if (!guessOverall('all') || !guessPerViewer(voterId)) fail(429, 'Slow down a little');
  const nickname = engine.cleanName(body.nickname);
  if (!nickname || nickname.length > 24) fail(400, 'Nickname must be 1–24 characters');
  const name = engine.cleanName(body.name);
  const s = await engine.snapshot();
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

export async function leaderboard({ voter } = {}) {
  const s = await engine.snapshot();
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
  const lastSpin = s.revealed.filter(e => e.category !== 'A').at(-1);
  let last = null;
  if (lastSpin) {
    const onIt = guesses.filter(g => g.category === lastSpin.category && g.teamNumber === lastSpin.teamNumber);
    last = { category: lastSpin.category, team: lastSpin.teamNumber, total: onIt.length, correct: onIt.filter(g => g.playerName === lastSpin.playerName).length };
  }
  const meIndex = voter ? ranked.findIndex(r => r.voterId === voter) : -1;
  const me = meIndex >= 0 ? { rank: meIndex + 1, correct: ranked[meIndex].correct, total: ranked[meIndex].total } : null;
  return { top, last, me, players: ranked.length };
}
