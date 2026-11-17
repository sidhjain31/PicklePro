// Read-only boards shared by the audience, host and big screen: progress steps, fixtures with
// live results, standings, the knockout bracket, "find my match" and the teams.
import { memo, useMemo, useState } from 'react';
import { GAMES } from './core.js';
import { WEAPON_INFO } from './fx.js';
import { teamOf } from './live.js';
import { TeamLogo } from './looks.jsx';

const STEPS = [
  ['setup', 'Teams'],
  ['draw', 'Draw'],
  ['league', 'Matches'],
  ['knockout', 'Knockout'],
  ['done', 'Champion'],
];
export function CupSteps({ state }) {
  if (!state) return null;
  const at = STEPS.findIndex(([k]) => k === state.phase);
  return (
    <ol className="steps cup-steps" aria-label="Stages">
      {STEPS.map(([k, label], i) => (
        <li key={k} className={`step step-${i < at ? 'done' : i === at ? 'active' : 'upcoming'}`} aria-current={i === at ? 'step' : undefined}>
          <span className="step-label">{label}</span>
          {i < at && <span className="step-count">✓</span>}
        </li>
      ))}
    </ol>
  );
}

const pairOf = (team, [x, y]) => (team ? `${team.players[x] || x} & ${team.players[y] || y}` : `${x} & ${y}`);
const sideName = (state, key, fallback) => teamOf(state, key)?.name ?? fallback;

// One tie: header, the two teams with games won, and the six games (tap to open).
export const TieCard = memo(function TieCard({ state, tie, mine = null, open = false, children }) {
  const A = teamOf(state, tie.a);
  const B = teamOf(state, tie.b);
  const started = tie.played > 0;
  const tbd = !A || !B;
  return (
    <article className={`tie${tie.winner ? ' decided' : ''}${mine && (tie.a === mine || tie.b === mine) ? ' mine' : ''}`} id={`tie-${tie.id}`}>
      <header className="tie-head">
        {/* Knockout ties keep their name (QF1, Final…); league matches have no number or court. */}
        {tie.stage !== 'L' && <span className="tie-label">{tie.label}</span>}
        {tie.weapon && WEAPON_INFO[tie.weapon] && <span className="tie-weapon" title={WEAPON_INFO[tie.weapon].name}>{WEAPON_INFO[tie.weapon].emoji}</span>}
        {tie.note && <span className="tie-note">{tie.note}</span>}
      </header>
      <div className="tie-teams">
        <p className={`tie-side${tie.winner === 'a' ? ' won' : tie.winner === 'b' ? ' lost' : ''}`}>
          {A && <TeamLogo team={A} size={30} />}
          <b>{A?.name ?? (tie.stage === 'L' ? '—' : 'To be decided')}</b>
          {started && <span className="tie-score">{tie.ga}</span>}
        </p>
        <span className="tie-vs">vs</span>
        <p className={`tie-side${tie.winner === 'b' ? ' won' : tie.winner === 'a' ? ' lost' : ''}`}>
          {B && <TeamLogo team={B} size={30} />}
          <b>{B?.name ?? (tie.stage === 'L' ? '—' : 'To be decided')}</b>
          {started && <span className="tie-score">{tie.gb}</span>}
        </p>
      </div>
      {/* With children (the host's editor) the result is in its footer instead. */}
      {!children && tie.draw && <p className="tie-flag draw">3–3 · draw (placed after all league matches)</p>}
      {!children && tie.needsPoints && <p className="tie-flag">3–3 · the points of every game decide — waiting for the scores</p>}
      {!children && tie.needsDecider && <p className="tie-flag">3–3 and level on points · the host decides</p>}
      {!children && tie.deciderNote && <p className="tie-flag ok">Host decision: {tie.deciderNote.reason}</p>}
      {children ?? (!tbd && (
        <details className="tie-games" open={open}>
          <summary>Games</summary>
          <ol>
            {GAMES.map((g, i) => {
              const r = tie.games[i];
              return (
                <li key={g.join()} className={r.w ? `w-${r.w}` : undefined}>
                  <b>{g.join('/')}</b>
                  <span className="g-a">{pairOf(A, g)}</span>
                  <span className="g-score">{r.sa != null && r.sb != null ? `${r.sa}–${r.sb}` : r.w ? (r.w === 'a' ? '◀ won' : 'won ▶') : 'vs'}</span>
                  <span className="g-b">{pairOf(B, g)}</span>
                </li>
              );
            })}
          </ol>
        </details>
      ))}
    </article>
  );
});

// ---------- Live score cards (match day) ----------

const hasPoints = g => g.sa != null && g.sb != null;
// What a match stands at, in plain words — the same line on the audience cards and the host's.
export function resultOf(state, tie) {
  const name = s => teamOf(state, tie[s])?.name ?? '';
  const played = tie.ga + tie.gb;
  if (tie.winner) {
    const w = tie.winner;
    const l = w === 'a' ? 'b' : 'a';
    if (tie.ga === tie.gb) {
      // 3–3: kids — the host's decider first, else points; adults knockout — points first.
      const byPoints = state.qualification ? tie.games.every(hasPoints) && tie.pa !== tie.pb : !tie.decider;
      return { kind: 'won', text: `🏆 ${name(w)} won ${byPoints ? 'on total points' : 'by the organisers’ decision'} (3–3 in games)` };
    }
    return { kind: 'won', text: `🏆 ${name(w)} won ${tie[`g${w}`]}–${tie[`g${l}`]}` };
  }
  if (tie.draw) return { kind: 'draw', text: '🤝 Draw · 3–3' };
  if (tie.needsPoints) return { kind: 'wait', text: '3–3 · waiting for the points of every game' };
  if (tie.needsDecider) return { kind: 'wait', text: '3–3 and level on points · the organisers decide' };
  if (!played) return { kind: 'idle', text: 'Not started yet' };
  return { kind: 'live', text: `● Live · ${played} of 6 games played` };
}

// Under every card: total points of both teams and the result.
export function MatchFoot({ state, tie }) {
  const r = resultOf(state, tie);
  const points = tie.games.some(hasPoints);
  const partial = points && tie.games.some(g => g.w && !hasPoints(g));
  return (
    <div className={`sc-foot sc-${r.kind}`}>
      {points && (
        <p className="sc-total">
          <b className={tie.pa > tie.pb ? 'hi' : undefined}>{tie.pa}</b>
          <span>Total points{partial ? ' (some games without points)' : ''}</span>
          <b className={tie.pb > tie.pa ? 'hi' : undefined}>{tie.pb}</b>
        </p>
      )}
      <p className="sc-result">{r.text}</p>
      {tie.deciderNote && <p className="sc-note">Organisers’ decision: {tie.deciderNote.reason}</p>}
    </div>
  );
}

// Audience score card: both teams in full, every game with both pairs (full names) and the
// points, totals and the result. Read only.
// Both teams (logos, full names) and the games won, big — top of a score card and the My team panel.
export function ScoreHead({ state, tie }) {
  const A = teamOf(state, tie.a);
  const B = teamOf(state, tie.b);
  const side = s => (tie.winner === s ? ' won' : tie.winner ? ' lost' : '');
  return (
    <div className="sc-teams">
      <p className={`sc-team${side('a')}`}>{A && <TeamLogo team={A} size={34} />}<b>{A?.name ?? 'To be decided'}</b></p>
      <p className="sc-games" aria-label={`Games ${tie.ga} to ${tie.gb}`}><b>{tie.ga}</b><span>–</span><b>{tie.gb}</b></p>
      <p className={`sc-team sc-b${side('b')}`}><b>{B?.name ?? 'To be decided'}</b>{B && <TeamLogo team={B} size={34} />}</p>
    </div>
  );
}

export const ScoreCard = memo(function ScoreCard({ state, tie, mine = null }) {
  const A = teamOf(state, tie.a);
  const B = teamOf(state, tie.b);
  return (
    <article className={`tie score-card${tie.winner ? ' decided' : ''}${mine && (tie.a === mine || tie.b === mine) ? ' mine' : ''}`} id={`tie-${tie.id}`}>
      {tie.stage !== 'L' && <header className="tie-head"><span className="tie-label">{tie.label}</span>{tie.note && <span className="tie-note">{tie.note}</span>}</header>}
      <ScoreHead state={state} tie={tie} />
      {A && B && (
        <ol className="sc-rows">
          {GAMES.map((g, i) => {
            const x = tie.games[i];
            return (
              <li key={g.join()}>
                <span className={`sc-pair${x.w === 'a' ? ' on' : ''}`}>{pairOf(A, g)}</span>
                <span className="sc-mid"><i>{g.join('/')}</i><b>{hasPoints(x) ? `${x.sa}–${x.sb}` : x.w ? 'won' : '–'}</b></span>
                <span className={`sc-pair sc-b${x.w === 'b' ? ' on' : ''}`}>{pairOf(B, g)}</span>
              </li>
            );
          })}
        </ol>
      )}
      {A && B && <MatchFoot state={state} tie={tie} />}
    </article>
  );
});

// Live first, then results, then matches still to play (stable inside each group).
const RANK = { live: 0, wait: 1, won: 2, draw: 2, idle: 3 };
export function ScoreBoard({ state, ties, mine = null, title, note = null }) {
  const list = useMemo(() => ties.map((t, i) => ({ t, i, r: RANK[resultOf(state, t).kind] }))
    .sort((x, y) => x.r - y.r || x.i - y.i).map(x => x.t), [state, ties]);
  if (!list.length) return null;
  const done = ties.filter(t => t.winner || t.draw).length;
  return (
    <section className="cup-section" aria-label={title}>
      <h2 className="section-title">{title} <span className="section-count">{done}/{ties.length} finished</span></h2>
      {note && <p className="hint">{note}</p>}
      <div className="tie-grid score-grid">
        {list.map(t => <ScoreCard key={t.id} state={state} tie={t} mine={mine} />)}
      </div>
    </section>
  );
}

// League matches in draw order (no match numbers, courts or rounds — the organisers schedule them).
export function TieList({ state, hideSeq = null, mine = null, title = 'Matches', empty, render }) {
  const ties = state.ties.filter(t => t.seq !== hideSeq);
  if (!ties.length) return empty ? <p className="cup-empty">{empty}</p> : null;
  return (
    <section className="cup-section" aria-label={title}>
      <h2 className="section-title">{title} <span className="section-count">{ties.length}/{state.totalTies}</span></h2>
      <div className="tie-grid">
        {ties.map(t => (render ? render(t) : <TieCard key={t.id} state={state} tie={t} mine={mine} />))}
      </div>
    </section>
  );
}

// Adults: league standings with the quarter-final qualification (qualify.js) — result, games,
// points, status and the reason for every rank.
export const STATUS = { qualified: ['Qualified', 'q'], out: ['Out', 'o'], pending: ['Pending', 'p'], tie: ['Level · host decides', 't'] };
function QualifyTable({ state, mine, limit }) {
  const q = state.qualification;
  if (!q.complete) return null;
  const rows = limit ? q.rows.slice(0, limit) : q.rows;
  return (
    <section className="cup-section" aria-label="Standings">
      <h2 className="section-title">
        Standings <span className={`st-badge${q.final ? ' final' : ''}`}>{q.final ? 'Final' : `Provisional: ${q.complete} of ${q.total} matches complete`}</span>
      </h2>
      <details className="st-rules">
        <summary>How the top {q.qualifiers} is decided</summary>
        <ol>
          <li>Every team plays one league match of 6 games: 4–2, 5–1 or 6–0 is a win, 3–3 is a draw.</li>
          <li><b>Winners first</b>: 6–0, then 5–1, then 4–2; same score → more total points.</li>
          <li><b>Draws</b> come after every winner, by total points — both teams of a drawn match can go through.</li>
          <li><b>Losers</b> can’t qualify.</li>
          <li>Still level on games and points → the host decides (the reason is shown).</li>
          <li>Top {q.qualifiers} → quarter-finals 1v8 · 2v7 · 3v6 · 4v5. Semi-finals: the 4 winners by league rank, best v 4th-best and 2nd v 3rd.</li>
        </ol>
      </details>
      <div className="table-wrap">
        <table className="standings qualify">
          <thead>
            <tr><th>#</th><th className="st-team">Team</th><th title="Result: won, drew, lost">Res</th><th title="Games won–lost">Games</th><th title="Total points in the 6 games">Pts</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} className={[r.pos === q.qualifiers && q.final ? 'cutline' : '', r.key === mine ? 'mine' : '', `st-${r.status}`].filter(Boolean).join(' ')}>
                <td>{r.rank == null ? '–' : `${r.shared ? '=' : ''}${r.rank}`}</td>
                <td className="st-team"><b>{teamOf(state, r.key)?.name}</b><small className="st-why">{r.reason}</small></td>
                <td>{r.result ?? '–'}</td>
                <td>{r.tier < 4 ? `${r.gw}–${r.gl}` : '–'}</td>
                <td>{r.tier < 4 ? r.pf : '–'}</td>
                <td><span className={`st-chip ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function Standings({ state, mine = null, limit = null }) {
  if (state.qualification) return <QualifyTable state={state} mine={mine} limit={limit} />;
  const rows = limit ? state.standings.slice(0, limit) : state.standings;
  const cut = state.knockout.seedCount;
  if (!state.ties.some(t => t.played)) return null;
  return (
    <section className="cup-section" aria-label="Standings">
      <h2 className="section-title">Standings</h2>
      <div className="table-wrap">
        <table className="standings kids-table">
          <thead>
            <tr><th>#</th><th className="st-team">Team</th><th>Wins</th><th>Games won</th><th>Games lost</th><th>Total points</th><th>Points +/−</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} className={`${r.rank === cut ? 'cutline ' : ''}${r.key === mine ? 'mine' : ''}`}>
                <td>{r.rank}</td>
                <td className="st-team">{teamOf(state, r.key)?.name}</td>
                <td>{r.w}</td>
                <td>{r.gw}</td>
                <td>{r.gl}</td>
                <td>{r.pf}</td>
                <td>{r.pd > 0 ? `+${r.pd}` : r.pd}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Top {cut} go to the {state.knockout.format === 'qf' ? 'quarter-finals' : 'final and 3rd place match'}. Order: wins, then games won, then points +/− (points scored minus points conceded).</p>
    </section>
  );
}

// Knockout bracket: columns per round (QF → SF → Final), or Final + 3rd place for 4 teams.
export function Bracket({ state, mine = null, render }) {
  const k = state.knockout;
  const cols = k.format === 'qf'
    ? [['Quarter-finals', ['QF1', 'QF2', 'QF3', 'QF4']], ['Semi-finals', ['SF1', 'SF2']], ['Final', ['F']]]
    : [['Final', ['F']], ['3rd place', ['3P']]];
  const byId = new Map(k.ties.map(t => [t.id, t]));
  return (
    <section className="cup-section" aria-label="Knockout">
      <h2 className="section-title">Knockout</h2>
      {!k.locked && <p className="hint">The line-up is set from the standings once every match is played.</p>}
      <div className={`bracket bracket-${k.format}`}>
        {cols.map(([label, ids]) => (
          <div className="bracket-col" key={label}>
            <p className="bracket-label">{label}</p>
            {ids.map(id => {
              const t = byId.get(id);
              return render ? render(t) : <BracketTie key={id} state={state} tie={t} mine={mine} />;
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function BracketTie({ state, tie, mine }) {
  const row = side => {
    const key = tie[side];
    const won = tie.winner === side;
    return (
      <p className={`bt-side${won ? ' won' : tie.winner ? ' lost' : ''}${key && key === mine ? ' mine' : ''}`}>
        <span>{key && <TeamLogo team={teamOf(state, key)} size={22} />}{key ? sideName(state, key) : <em>{tie.note?.split(' vs ')[side === 'a' ? 0 : 1] ?? 'TBD'}</em>}</span>
        {tie.played > 0 && <b>{side === 'a' ? tie.ga : tie.gb}</b>}
      </p>
    );
  };
  return (
    <div className={`bt${tie.winner ? ' decided' : ''}${tie.id === 'F' ? ' bt-final' : ''}`}>
      <p className="bt-label">{tie.label}</p>
      {row('a')}
      {row('b')}
    </div>
  );
}

export function ChampionBanner({ state }) {
  const k = state.knockout;
  if (!k.champion) return null;
  const T = teamOf(state, k.champion);
  return (
    <section className="champ-banner" aria-label="Champions">
      {T && <TeamLogo team={T} size={96} className="champ-logo" />}
      <p className="champ-kicker">🏆 Champions</p>
      <h2>{T?.name}</h2>
      <p className="champ-roster">{['A', 'B', 'C', 'D'].map(s => T?.players[s]).filter(Boolean).join(' · ')}</p>
      <p className="champ-more">
        Runners-up: <b>{sideName(state, k.runnerUp, '—')}</b>
        {k.third && <> · Third: <b>{sideName(state, k.third)}</b></>}
      </p>
    </section>
  );
}

// "Where do I play?" — type your name (or a team) and see your match and partners. Works before
// and during the draw: "Alert me" pops up the match the moment it's drawn (MyMatch.jsx).
export function FindMatch({ state, onFound, follow = null, onFollow = null }) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const found = useMemo(() => {
    if (query.length < 2) return [];
    return state.teams.filter(t => t.name.toLowerCase().includes(query) || Object.values(t.players).some(p => p.toLowerCase().includes(query))).slice(0, 4);
  }, [query, state.teams]);
  return (
    <section className="cup-card find" aria-label="Find my match">
      <h2 className="card-title">⭐ Find my match</h2>
      {follow && (
        <p className="follow-note">
          🔔 Alerts on for <b>{follow.team}</b>{follow.playerName ? ` (${follow.playerName})` : ''} — keep this page open.
          {' '}<button type="button" className="link" onClick={() => onFollow?.(null)}>Turn off</button>
        </p>
      )}
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Type your name or team" aria-label="Your name or team" autoComplete="off" />
      {found.map(t => {
        const tie = state.ties.find(x => x.a === t.key || x.b === t.key);
        const me = Object.entries(t.players).find(([, p]) => p.toLowerCase().includes(query))?.[0] ?? null;
        const ko = state.knockout.ties.filter(x => x.a === t.key || x.b === t.key);
        const other = tie && teamOf(state, tie.a === t.key ? tie.b : tie.a);
        const on = follow?.team === t.name;
        return (
          <div className={`find-hit${on ? ' following' : ''}`} key={t.key}>
            <p className="find-team"><b>{t.name}</b> · {Object.values(t.players).filter(Boolean).join(', ')}</p>
            {onFollow && (
              <button
                type="button"
                className={`btn btn-small follow-btn${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={() => onFollow(on ? null : { key: t.key, team: t.name, player: me, playerName: me ? t.players[me] : null })}
              >{on ? '🔔 Alerts on' : '🔔 Alert me'}</button>
            )}
            {tie ? (
              <>
                <p className="find-match">
                  Plays <b>{other?.name}</b>
                  <button type="button" className="link" onClick={() => onFound?.(tie.id)}>Show</button>
                </p>
                {me && (
                  <ul className="find-games">
                    {GAMES.filter(g => g.includes(me)).map(g => {
                      const partner = g.find(x => x !== me);
                      return <li key={g.join()}><b>{g.join('/')}</b> with {t.players[partner]} vs {pairOf(other, g)}</li>;
                    })}
                  </ul>
                )}
              </>
            ) : <p className="find-match muted">Not drawn yet — {on ? 'you will get a pop-up the moment it is drawn.' : 'tap 🔔 Alert me and this page tells you the moment it is drawn.'}</p>}
            {ko.map(x => <p className="find-match" key={x.id}>🏆 {x.label} vs <b>{sideName(state, x.a === t.key ? x.b : x.a, 'TBD')}</b></p>)}
          </div>
        );
      })}
      {query.length >= 2 && !found.length && <p className="hint">No team or player matches “{q}”.</p>}
    </section>
  );
}

export function TeamsGrid({ state, title = 'Teams' }) {
  if (!state.teams.length) return null;
  return (
    <section className="cup-section" aria-label={title}>
      <h2 className="section-title">{title} <span className="section-count">{state.teams.length}</span></h2>
      <div className="team-cards">
        {state.teams.map(t => (
          <div className="team-card" key={t.key}>
            <p className="team-card-name"><TeamLogo team={t} size={34} />{t.name}</p>
            <ul>{['A', 'B', 'C', 'D'].map(s => <li key={s}><i>{s}</i>{t.players[s] || '—'}</li>)}</ul>
          </div>
        ))}
      </div>
    </section>
  );
}
