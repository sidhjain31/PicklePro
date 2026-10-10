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

// The prediction card owns its own state (nickname, picks, open list), so typing a name or
// picking a player re-renders only this card, never the stage, reel or team board.
export function Predict({ state, show, board }) {
  const identity = useIdentity();
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
  const [saved, setSaved] = useState('');
  const [pendingName, setPendingName] = useState(null); // the name being saved right now
  const inFlight = useRef(false); // blocks double taps before React re-renders
  const [openList, setOpenList] = useState(false);
  const [query, setQuery] = useState('');
  const [showBoard, setShowBoard] = useState(false);

  // If the host closes predictions while this phone is mid-pick, say so instead of vanishing.
  const open = state?.predictions !== false;
  const wasOpen = useRef(open);
  const [closedNotice, setClosedNotice] = useState(false);
  useEffect(() => {
    if (wasOpen.current && !open && (openList || pendingName)) setClosedNotice(true);
    if (open) setClosedNotice(false);
    if (!open) setOpenList(false);
    wasOpen.current = open;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const boardView = board?.players > 0 && (
    <div className="leader">
      <button type="button" className="leader-toggle" onClick={() => setShowBoard(o => !o)} aria-expanded={showBoard}>
        🏆 Prediction leaderboard{board.me ? (board.me.correct ? ` · you're #${board.me.rank} (${board.me.correct} right)` : ` · ${board.me.total} guess${board.me.total === 1 ? '' : 'es'}, no hits yet`) : ''} <span>{showBoard ? '▴' : '▾'}</span>
      </button>
      {showBoard && <LeaderList rows={board.top.map(r => ({ nickname: r.nickname, score: r.correct }))} />}
    </div>
  );

  if (!state || state.status !== 'LIVE') return null;
  if (!open) {
    // Closed: no empty card. Only a slim note (if someone was mid-pick) and the kept leaderboard.
    if (!closedNotice && !board?.players) return null;
    return (
      <section className="panel-card predict predict-closed">
        {closedNotice && <p className="predict-closed-note" role="status">🔒 Predictions are closed by the host. Your earlier picks still count.</p>}
        {boardView}
      </section>
    );
  }
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
    if (inFlight.current) return;
    inFlight.current = true;
    setPendingName(name);
    setError('');
    setSaved('');
    try {
      // Only marked as your pick once the server has confirmed it.
      await api('/guess', { method: 'POST', body: { voterId: identity.voterId, nickname: identity.nickname, category: state.current, team, name } });
      setMine(m => ({ ...m, [key]: name }));
      setSaved(`✓ Locked in ${name} for Team ${team}`);
      setOpenList(false);
      setQuery('');
    } catch (err) {
      setError(err.message);
    } finally {
      inFlight.current = false;
      setPendingName(null);
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
            <button type="button" className="btn btn-primary predict-open" onClick={() => { setOpenList(o => !o); setSaved(''); }} aria-expanded={openList}>
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
                      <button
                        type="button"
                        disabled={Boolean(pendingName)}
                        aria-busy={pendingName === n}
                        className={[mine[key] === n && 'picked', pendingName === n && 'saving'].filter(Boolean).join(' ') || undefined}
                        onClick={() => guess(n)}
                      >
                        {n}{pendingName === n && <span className="spinner" aria-hidden="true" />}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="panel-note">You can change your pick until the reel stops.</p>
              </div>
            )}
          </>
        )
      )}
      {saved && !error && <p className="predict-saved" role="status">{saved}</p>}
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
