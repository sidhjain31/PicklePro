// "Alert me" for Find my match: when the team this viewer follows gets its match (after that
// match's show ends — never a spoiler) or its knockout tie, a pop-up shows the opponent and, if a
// player name was searched, that player's own games. Plus a buzz and a fanfare (sound on only).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fanfare } from '../sound.js';
import { GAMES } from './core.js';
import * as fx from './fx.js';
import { teamOf } from './live.js';
import { TeamLogo } from './looks.jsx';

// The followed team in this draw: by name first (a reloaded team list may renumber keys), else key.
export const followedTeam = (state, follow) => (follow && state
  ? state.teams.find(t => t.name === follow.team) ?? state.teams.find(t => t.key === follow.key) ?? null
  : null);

export function MyMatchAlert({ state, follow, onShow }) {
  const team = followedTeam(state, follow);
  const tie = team ? state.ties.find(t => t.a === team.key || t.b === team.key) : null;
  // Knockout: only once the opponent is known (a semi-final waits for the other quarter-final).
  const ko = team && state.knockout.locked ? state.knockout.ties.find(t => (t.a === team.key || t.b === team.key) && t.a && t.b && !t.winner) : null;
  const seen = useRef(null);
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    if (!team) {
      seen.current = null;
      return;
    }
    const now = { cup: state.id, team: team.key, tie: tie?.id ?? null, ko: ko?.id ?? null };
    const before = seen.current;
    seen.current = now;
    // First look (page opened, alert just switched on, new draw): nothing to announce yet.
    if (!before || before.cup !== now.cup || before.team !== now.team) return;
    if (now.tie && !before.tie) setAlert({ tieId: now.tie, kind: 'draw' });
    else if (now.ko && now.ko !== before.ko) setAlert({ tieId: now.ko, kind: 'knockout' });
  }, [state.id, team?.key, tie?.id, ko?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A Restart / new draw: an open alert from the previous draw must go.
  useEffect(() => setAlert(null), [state.id]);

  useEffect(() => {
    if (!alert) return undefined;
    fx.buzz([90, 60, 90, 60, 220]);
    try {
      fanfare();
    } catch { /* sound off */ }
    const t = setTimeout(() => setAlert(null), 15000);
    return () => clearTimeout(t);
  }, [alert]);

  if (!alert || !team) return null;
  const t = [...state.ties, ...state.knockout.ties].find(x => x.id === alert.tieId);
  if (!t || !t.a || !t.b) return null;
  const other = teamOf(state, t.a === team.key ? t.b : t.a);
  const me = follow?.player && team.players[follow.player] ? follow.player : null;
  return createPortal(
    <div className="my-match" role="alertdialog" aria-label="Your match">
      <div className="mm-card">
        <p className="mm-kicker">⭐ {alert.kind === 'draw' ? 'Your match is drawn!' : `Knockout · ${t.label}`}</p>
        <div className="mm-teams">
          <span className="mm-team"><TeamLogo team={team} size={0} className="mm-logo" /><b>{team.name}</b></span>
          <span className="mm-vs">VS</span>
          <span className="mm-team"><TeamLogo team={other} size={0} className="mm-logo" /><b>{other?.name ?? 'To be decided'}</b></span>
        </div>
        {me && other && alert.kind === 'draw' && (
          <ul className="mm-games" aria-label={`${team.players[me]}'s games`}>
            {GAMES.filter(g => g.includes(me)).map(g => {
              const partner = g.find(x => x !== me);
              return (
                <li key={g.join()}>
                  <b>{g.join('/')}</b> {team.players[me]} &amp; {team.players[partner]} <i>vs</i> {other.players[g[0]]} &amp; {other.players[g[1]]}
                </li>
              );
            })}
          </ul>
        )}
        <div className="mm-actions">
          <button type="button" className="btn btn-primary" onClick={() => { setAlert(null); onShow?.(t.id); }}>See the match</button>
          <button type="button" className="btn" onClick={() => setAlert(null)}>Close</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
