// Audience participation: emoji reactions, crowd spin taps and pick predictions.
// None of this can choose or change a result: reactions are only relayed, taps can at most start
// the next draw (through the normal guarded draw()), and guesses are scored against revealed picks.
import * as engine from './draw.js';
import { HttpError } from './draw.js';
import { Guess, LABELS, TapScore } from './models.js';

export const REACTIONS = ['🔥', '😂', '👏', '🎉', '😱', '❤️'];
const REACTIONS_PER_SEC = 4;
// Tapping is a game: no per-round cap, but faster than a human thumb (~12/s) is ignored.
const TAPS_PER_SEC = 12;
const VOTER = /^[\w-]{8,64}$/;

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

// Tournament-long tap totals per player: buffered in memory, flushed to Mongo once a second.
let tapBuffer = new Map();
async function flushTaps() {
  if (!tapBuffer.size) return;
  const batch = tapBuffer;
  tapBuffer = new Map();
  try {
    await TapScore.bulkWrite([...batch.values()].map(b => ({
      updateOne: {
        filter: { tournamentId: b.tournamentId, voterId: b.voterId },
        update: { $inc: { taps: b.n }, $set: { nickname: b.nickname } },
        upsert: true,
      },
    })));
  } catch (err) {
    console.error('tap flush failed', err);
  }
}
export const flushTapScores = flushTaps;

export function attachCrowd(io) {
  let round = null;
  let taps = 0;
  let tappers = new Map(); // this round: voterId -> { nickname, taps }
  let firing = false;
  let pendingEmit = null;
  const flusher = setInterval(flushTaps, 1000);
  flusher.unref();
  const announce = target => {
    if (pendingEmit) return;
    pendingEmit = setTimeout(() => {
      pendingEmit = null;
      const top = [...tappers.values()].sort((a, b) => b.taps - a.taps).slice(0, 3);
      io.emit('crowd:taps', { round, taps, target, top });
    }, 150);
  };

  io.on('connection', socket => {
    const canReact = limiter(REACTIONS_PER_SEC, 1000);
    const canTap = limiter(TAPS_PER_SEC, 1000);

    socket.on('reaction', emoji => {
      if (typeof emoji !== 'string' || !REACTIONS.includes(emoji) || !canReact(socket.id)) return;
      io.emit('reaction', { emoji });
    });

    socket.on('tap', async who => {
      const s = engine.cachedState();
      if (!s?.crowd?.enabled || s.status !== 'LIVE' || s.pending || !s.currentTeam || firing) return;
      if (!canTap(socket.id)) return;
      const key = `${s.id}:${s.current}:${s.currentTeam}`;
      if (key !== round) {
        round = key;
        taps = 0;
        tappers = new Map();
      }
      taps += 1;
      // Named players score on the tap leaderboard; anonymous taps still fill the meter.
      const voterId = typeof who?.voterId === 'string' && VOTER.test(who.voterId) ? who.voterId : null;
      const nickname = engine.cleanName(who?.nickname).slice(0, 24);
      if (voterId && nickname) {
        const r = tappers.get(voterId) ?? { nickname, taps: 0 };
        r.nickname = nickname;
        r.taps += 1;
        tappers.set(voterId, r);
        const b = tapBuffer.get(`${s.id}:${voterId}`) ?? { tournamentId: s.id, voterId, nickname, n: 0 };
        b.nickname = nickname;
        b.n += 1;
        tapBuffer.set(`${s.id}:${voterId}`, b);
      }
      announce(s.crowd.target);
      if (taps < s.crowd.target) return;
      firing = true;
      // Final tally for the round (who tapped most) goes out before the round resets.
      clearTimeout(pendingEmit);
      pendingEmit = null;
      const top = [...tappers.values()].sort((a, b) => b.taps - a.taps).slice(0, 3);
      io.emit('crowd:taps', { round, taps, target: s.crowd.target, top });
      io.emit('crowd:fired', { round, top });
      try {
        await engine.draw({ category: s.current, team: s.currentTeam });
      } catch {
        // Host spun at the same moment, or the round moved on: the guarded draw refused. Fine.
      } finally {
        firing = false;
        round = null;
        taps = 0;
        tappers = new Map();
      }
    });
  });
  return async () => {
    clearInterval(flusher);
    await flushTaps();
  };
}

// Top tappers for the whole tournament (plus this viewer's rank).
export async function tapLeaderboard({ voter } = {}) {
  await flushTaps();
  const t = await engine.activeTournament();
  const all = await TapScore.find({ tournamentId: t._id }).sort({ taps: -1, updatedAt: 1 }).lean();
  const top = all.slice(0, 10).map(r => ({ nickname: r.nickname, taps: r.taps }));
  const i = voter ? all.findIndex(r => r.voterId === voter) : -1;
  return { top, me: i >= 0 ? { rank: i + 1, taps: all[i].taps } : null, players: all.length };
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
