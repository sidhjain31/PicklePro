import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import * as fx from './fx.js';

export const REACTIONS = ['🔥', '😂', '👏', '🎉', '😱', '❤️'];

// ---------- Identity (one nickname for every game on this phone) ----------

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

export function useIdentity() {
  const [nickname, setNick] = useState(() => read(NICK_KEY) ?? '');
  const id = useMemo(voterId, []);
  const save = name => {
    const n = name.trim().replace(/\s+/g, ' ').slice(0, 24);
    if (!n) return;
    write(NICK_KEY, n);
    setNick(n);
  };
  return { voterId: id, nickname, save };
}

function JoinGame({ identity, prompt }) {
  const [draft, setDraft] = useState('');
  return (
    <form className="join" onSubmit={e => { e.preventDefault(); identity.save(draft); }}>
      <p>{prompt}</p>
      <div className="join-row">
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Your name" maxLength={24} aria-label="Your name" autoComplete="nickname" />
        <button className="btn btn-primary" disabled={!draft.trim()}>Join</button>
      </div>
    </form>
  );
}

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

// ---------- Crowd spin: the tap game ----------

const roundOf = state => state && `${state.id}:${state.current}:${state.currentTeam}`;
export const crowdOpen = state => Boolean(state?.crowd?.enabled && state.status === 'LIVE' && state.currentTeam && !state.pending);

// Projector / host view of the meter.
export function CrowdMeter({ state, crowd }) {
  if (!crowdOpen(state)) return null;
  const taps = crowd.round === roundOf(state) ? crowd.taps : 0;
  const pct = Math.min(100, Math.round((taps / state.crowd.target) * 100));
  const label = state.mode === 'shuffle' ? 'shuffle' : `spin for Team ${state.currentTeam}`;
  const leader = crowd.round === roundOf(state) ? crowd.top?.[0] : null;
  return (
    <div className="crowd crowd-big">
      <div className="crowd-bar"><span style={{ width: `${pct}%` }} /></div>
      <p className="crowd-text">Tap your phones to {label}! <b>{taps}/{state.crowd.target}</b></p>
      {leader && <p className="crowd-leader">👑 Fastest thumb: <b>{leader.nickname}</b> · {leader.taps} taps</p>}
    </div>
  );
}

function useTapBoard(open, identity, refreshKey) {
  const [board, setBoard] = useState(null);
  useEffect(() => {
    const load = () => api(`/tappers?voter=${encodeURIComponent(identity.voterId)}`).then(setBoard, () => {});
    load();
    if (!open) return;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [open, identity.voterId, refreshKey]);
  return board;
}

// Phone view: a big tap button, this round's top thumbs, and the tournament tap leaderboard.
export function TapGame({ state, crowd, send, identity }) {
  const open = crowdOpen(state);
  const round = roundOf(state);
  const [mine, setMine] = useState({ round: null, n: 0 });
  const [showBoard, setShowBoard] = useState(false);
  const board = useTapBoard(open, identity, crowd.fired ? crowd.round : null);
  if (!state?.crowd?.enabled || state.status !== 'LIVE') return null;
  const taps = crowd.round === round ? crowd.taps : 0;
  const myTaps = mine.round === round ? mine.n : 0;
  const pct = Math.min(100, Math.round((taps / state.crowd.target) * 100));
  const label = state.mode === 'shuffle' ? 'shuffle' : `spin Team ${state.currentTeam}`;
  const top = crowd.round === round ? crowd.top ?? [] : [];
  const tap = () => {
    send('tap', { voterId: identity.voterId, nickname: identity.nickname });
    setMine(m => ({ round, n: (m.round === round ? m.n : 0) + 1 }));
    navigator.vibrate?.(12);
  };

  return (
    <section className="panel-card tap-game">
      <header className="panel-head">
        <span className="panel-icon">👆</span>
        <div>
          <h3>Tap battle</h3>
          <p>Tap as fast as you can — the crowd starts the spin. Most taps tops the leaderboard.</p>
        </div>
      </header>
      {!identity.nickname ? (
        <JoinGame identity={identity} prompt="Enter your name to get on the tap leaderboard." />
      ) : open ? (
        <>
          <div className="crowd-bar"><span style={{ width: `${pct}%` }} /></div>
          <button type="button" className="crowd-btn" onClick={tap}>
            TAP to {label}
            <small>{taps}/{state.crowd.target} · you {myTaps}</small>
          </button>
          {top.length > 0 && (
            <ol className="round-top">
              {top.map((r, i) => <li key={r.nickname + i}><span>{['🥇', '🥈', '🥉'][i]}</span>{r.nickname}<b>{r.taps}</b></li>)}
            </ol>
          )}
        </>
      ) : (
        <p className="panel-note">{state.pending ? 'Spinning… get ready for the next round!' : 'Waiting for the next round.'}</p>
      )}
      {board?.players > 0 && (
        <div className="leader">
          <button type="button" className="leader-toggle" onClick={() => setShowBoard(o => !o)} aria-expanded={showBoard}>
            🏆 Top tappers{board.me ? ` · you're #${board.me.rank} (${board.me.taps})` : ''} <span>{showBoard ? '▴' : '▾'}</span>
          </button>
          {showBoard && <LeaderList rows={board.top.map(r => ({ nickname: r.nickname, score: r.taps }))} />}
        </div>
      )}
    </section>
  );
}

// ---------- Predict the pick ----------

export function useLeaderboard(state) {
  const [board, setBoard] = useState(null);
  const lastKey = state?.last ? `${state.id}:${state.last.actionId}` : state?.id;
  useEffect(() => {
    if (!state || state.status === 'DRAFT') return;
    api(`/leaderboard?voter=${encodeURIComponent(voterId())}`).then(setBoard, () => {});
  }, [lastKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return board;
}

export function Predict({ state, show, board, identity }) {
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
  const [openList, setOpenList] = useState(false);
  const [query, setQuery] = useState('');
  const [showBoard, setShowBoard] = useState(false);

  const boardView = board?.players > 0 && (
    <div className="leader">
      <button type="button" className="leader-toggle" onClick={() => setShowBoard(o => !o)} aria-expanded={showBoard}>
        🏆 Prediction leaderboard{board.me ? (board.me.correct ? ` · you're #${board.me.rank} (${board.me.correct} right)` : ` · ${board.me.total} guess${board.me.total === 1 ? '' : 'es'}, no hits yet`) : ''} <span>{showBoard ? '▴' : '▾'}</span>
      </button>
      {showBoard && <LeaderList rows={board.top.map(r => ({ nickname: r.nickname, score: r.correct }))} />}
    </div>
  );

  if (!state || state.status !== 'LIVE') return null;
  const label = state.categories.find(c => c.key === state.current)?.label;
  const isSpin = state.mode === 'spin';
  // While a pick is spinning, guesses are still for that (hidden) team.
  const team = state.pending ? state.pending.teamNumbers[0] : state.currentTeam;
  const key = `${state.current}:${team}`;
  const lastSpin = state.last?.mode === 'spin' && state.last.category === state.current ? state.last.assignments[0] : null;
  const lastKey = lastSpin && `${state.current}:${lastSpin.teamNumber}`;
  const revealedNow = show?.phase === 'done' || !show;
  const verdict = lastKey && mine[lastKey] && revealedNow ? (mine[lastKey] === lastSpin.name ? 'right' : 'wrong') : null;
  const pool = show && show.phase !== 'done' && show.mode === 'spin' ? show.candidates : state.remaining;
  const shown = query ? pool.filter(n => n.toLowerCase().includes(query.toLowerCase())) : pool;

  const guess = async name => {
    setBusy(true);
    setError('');
    try {
      await api('/guess', { method: 'POST', body: { voterId: identity.voterId, nickname: identity.nickname, category: state.current, team, name } });
      setMine(m => ({ ...m, [key]: name }));
      setOpenList(false);
      setQuery('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel-card predict">
      <header className="panel-head">
        <span className="panel-icon">🔮</span>
        <div>
          <h3>Predict the pick</h3>
          <p>{isSpin ? `${pool.length} ${label} players still pending. Guess who goes to each team.` : `Predictions open when the one-by-one rounds start (${label} is shuffled in one go).`}</p>
        </div>
      </header>

      {verdict && (
        <p className={`predict-verdict ${verdict}`}>
          {verdict === 'right' ? `✅ You called it! ${lastSpin.name} → Team ${lastSpin.teamNumber}` : `❌ Not this time — you picked ${mine[lastKey]}`}
        </p>
      )}

      {isSpin && team && (
        !identity.nickname ? (
          <JoinGame identity={identity} prompt="Enter your name to start predicting and get on the leaderboard." />
        ) : (
          <>
            <div className="predict-current">
              <span>Team <b>{team}</b> · {label}</span>
              {mine[key] ? <span className="predict-mine">Your pick: <b>{mine[key]}</b></span> : <span className="predict-mine muted">No pick yet</span>}
            </div>
            <button type="button" className="btn btn-primary predict-open" onClick={() => setOpenList(o => !o)} aria-expanded={openList}>
              {openList ? 'Close' : mine[key] ? `Change pick for Team ${team}` : `Predict Team ${team}`}
            </button>
            {openList && (
              <div className="pending">
                <div className="pending-head">
                  <b>Pending in {label}</b>
                  <span>{pool.length} left</span>
                </div>
                {pool.length > 10 && (
                  <input className="pending-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search a name…" aria-label="Search pending players" />
                )}
                <ul className="pending-list">
                  {shown.map(n => (
                    <li key={n}>
                      <button type="button" disabled={busy} className={mine[key] === n ? 'picked' : undefined} onClick={() => guess(n)}>{n}</button>
                    </li>
                  ))}
                </ul>
                <p className="panel-note">You can change your pick until the reel stops.</p>
              </div>
            )}
          </>
        )
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {boardView}
    </section>
  );
}

export function LeaderList({ rows, limit = 10 }) {
  return (
    <ol className="leader-list">
      {rows.slice(0, limit).map((r, i) => (
        <li key={`${r.nickname}-${i}`}><span className="leader-rank">{i + 1}</span><span className="leader-name">{r.nickname}</span><b>{r.score}</b></li>
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
