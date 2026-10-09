import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import * as fx from './fx.js';

export const REACTIONS = ['🔥', '😂', '👏', '🎉', '😱', '❤️'];

// ---------- Live reactions ----------

// Everyone's emojis float up on every screen (phones and projector).
export function FloatingReactions({ onReaction, big = false }) {
  const [items, setItems] = useState([]);
  const next = useRef(0);
  useEffect(() => onReaction(({ emoji }) => {
    const id = next.current++;
    const item = { id, emoji, left: 6 + Math.random() * 88, drift: (Math.random() - 0.5) * 80, size: (big ? 2.6 : 1.7) + Math.random() * (big ? 1.6 : 0.9) };
    setItems(list => [...list.slice(-40), item]);
    setTimeout(() => setItems(list => list.filter(i => i.id !== id)), 3200);
    fx.plip();
  }), [onReaction, big]);
  return (
    <div className="floaters" aria-hidden="true">
      {items.map(i => (
        <span key={i.id} style={{ left: `${i.left}%`, fontSize: `${i.size}rem`, '--drift': `${i.drift}px` }}>{i.emoji}</span>
      ))}
    </div>
  );
}

export function ReactionBar({ send }) {
  return (
    <div className="reaction-bar" role="group" aria-label="Send a reaction">
      {REACTIONS.map(e => (
        <button key={e} type="button" onClick={() => send('reaction', e)} aria-label={`React ${e}`}>{e}</button>
      ))}
    </div>
  );
}

// ---------- Crowd spin ----------

const tapsFor = (state, crowd) => {
  const round = state && `${state.id}:${state.current}:${state.currentTeam}`;
  return crowd.round === round ? crowd.taps : 0;
};
export const crowdOpen = state => Boolean(state?.crowd?.enabled && state.status === 'LIVE' && state.currentTeam && !state.pending);

export function CrowdMeter({ state, crowd, send, big = false }) {
  if (!crowdOpen(state)) return null;
  const taps = tapsFor(state, crowd);
  const pct = Math.min(100, Math.round((taps / state.crowd.target) * 100));
  const label = state.mode === 'shuffle' ? 'shuffle' : `spin for Team ${state.currentTeam}`;
  return (
    <div className={`crowd${big ? ' crowd-big' : ''}`}>
      <div className="crowd-bar"><span style={{ width: `${pct}%` }} /></div>
      {big ? (
        <p className="crowd-text">Tap your phones to {label}! <b>{taps}/{state.crowd.target}</b></p>
      ) : (
        <button type="button" className="crowd-btn" onClick={() => { send('tap'); navigator.vibrate?.(15); }}>
          👆 Tap to {label} <b>{taps}/{state.crowd.target}</b>
        </button>
      )}
    </div>
  );
}

// ---------- Predict the pick ----------

const VOTER_KEY = 'team-draw:voter';
const NICK_KEY = 'team-draw:nickname';
const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };
function voterId() {
  let id = read(VOTER_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    write(VOTER_KEY, id);
  }
  return id;
}

export function useLeaderboard(state) {
  const [board, setBoard] = useState(null);
  const lastKey = state?.last ? `${state.id}:${state.last.actionId}` : state?.id;
  useEffect(() => {
    if (!state || state.status === 'DRAFT') return;
    api(`/leaderboard?voter=${encodeURIComponent(voterId())}`).then(setBoard, () => {});
  }, [lastKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return board;
}

export function Predict({ state, show, board }) {
  const [nick, setNick] = useState(() => read(NICK_KEY) ?? '');
  const [draftNick, setDraftNick] = useState('');
  // "category:team" -> name, kept per tournament on this phone so it survives re-renders and refreshes.
  const guessKey = `team-draw:guesses:${state?.id}`;
  const [mine, setMineState] = useState(() => { try { return JSON.parse(read(guessKey)) ?? {}; } catch { return {}; } });
  useEffect(() => {
    try { setMineState(JSON.parse(read(guessKey)) ?? {}); } catch { setMineState({}); }
  }, [guessKey]);
  const setMine = fn => setMineState(m => {
    const next = fn(m);
    write(guessKey, JSON.stringify(next));
    return next;
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showBoard, setShowBoard] = useState(false);

  if (!state || state.status !== 'LIVE' || state.mode !== 'spin') return board?.players ? <Board board={board} open={showBoard} toggle={() => setShowBoard(o => !o)} /> : null;
  // While a pick is spinning, guesses are still for that (hidden) team.
  const team = state.pending ? state.pending.teamNumbers[0] : state.currentTeam;
  const key = `${state.current}:${team}`;
  const lastSpin = state.last?.mode === 'spin' && state.last.category === state.current ? state.last.assignments[0] : null;
  const lastKey = lastSpin && `${state.current}:${lastSpin.teamNumber}`;
  const revealedNow = show?.phase === 'done' || !show;
  const verdict = lastKey && mine[lastKey] && revealedNow ? (mine[lastKey] === lastSpin.name ? 'right' : 'wrong') : null;
  const pool = show && show.phase !== 'done' ? show.candidates : state.remaining;

  const guess = async name => {
    setBusy(true);
    setError('');
    try {
      await api('/guess', { method: 'POST', body: { voterId: voterId(), nickname: nick, category: state.current, team, name } });
      setMine(m => ({ ...m, [key]: name }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="predict">
      {verdict && (
        <p className={`predict-verdict ${verdict}`}>
          {verdict === 'right' ? `✅ You called it! ${lastSpin.name} → Team ${lastSpin.teamNumber}` : `❌ Not this time — you picked ${mine[lastKey]}`}
        </p>
      )}
      {team && (
        !nick ? (
          <form className="predict-nick" onSubmit={e => { e.preventDefault(); const n = draftNick.trim().slice(0, 24); if (n) { write(NICK_KEY, n); setNick(n); } }}>
            <p><b>🔮 Predict the pick</b> — guess who goes to each team and top the leaderboard.</p>
            <input value={draftNick} onChange={e => setDraftNick(e.target.value)} placeholder="Your name" maxLength={24} aria-label="Your name" />
            <button className="btn btn-small" disabled={!draftNick.trim()}>Play</button>
          </form>
        ) : (
          <label className="predict-pick">
            <span>🔮 Who goes to <b>Team {team}</b>?</span>
            <select value={mine[key] ?? ''} disabled={busy} onChange={e => e.target.value && guess(e.target.value)}>
              <option value="">{mine[key] ? mine[key] : 'Pick a player…'}</option>
              {pool.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {mine[key] && <span className="predict-locked">Locked in: <b>{mine[key]}</b> (you can change it until the reveal)</span>}
          </label>
        )
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {board?.players > 0 && <Board board={board} open={showBoard} toggle={() => setShowBoard(o => !o)} />}
    </section>
  );
}

function Board({ board, open, toggle }) {
  return (
    <div className="leader">
      <button type="button" className="leader-toggle" onClick={toggle} aria-expanded={open}>
        🏆 Leaderboard{board.me ? (board.me.correct ? ` · you're #${board.me.rank} with ${board.me.correct} right` : ` · ${board.me.total} guess${board.me.total === 1 ? '' : 'es'}, no hits yet`) : ''} {open ? '▴' : '▾'}
      </button>
      {open && <LeaderList board={board} />}
    </div>
  );
}

export function LeaderList({ board, limit = 10 }) {
  return (
    <ol className="leader-list">
      {board.top.slice(0, limit).map((r, i) => (
        <li key={`${r.nickname}-${i}`}><span className="leader-rank">{i + 1}</span><span className="leader-name">{r.nickname}</span><b>{r.correct}</b></li>
      ))}
    </ol>
  );
}

// ---------- Round / trophy announcements ----------

export function Announce({ announce }) {
  if (!announce) return null;
  return (
    <div key={announce.key} className={`announce announce-${announce.kind}`} role="status">
      {announce.kind === 'trophy' ? (
        <>
          <span className="announce-icon">🏆</span>
          <strong>{announce.label} locked in!</strong>
          <span>All teams have their {announce.label} player</span>
        </>
      ) : (
        <>
          <span className="announce-icon">🏓</span>
          <span>Next round</span>
          <strong>{announce.label}</strong>
          <span>{announce.mode === 'shuffle' ? 'All 28 teams in one shuffle' : 'One spin per team'}</span>
        </>
      )}
    </div>
  );
}

