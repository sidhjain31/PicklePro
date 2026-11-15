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
        <span className="tie-label">{tie.label}</span>
        {tie.court && <span className="tie-court">Court {tie.court}</span>}
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
      {tie.needsDecider && <p className="tie-flag">3–3 · waiting for the decider</p>}
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

// League fixtures in draw order, grouped into rounds of `courts` matches played side by side.
export function TieList({ state, hideSeq = null, mine = null, title = 'Matches', empty, render }) {
  const ties = state.ties.filter(t => t.seq !== hideSeq);
  if (!ties.length) return empty ? <p className="cup-empty">{empty}</p> : null;
  const rounds = [];
  for (const t of ties) {
    const r = rounds[t.round - 1] ?? (rounds[t.round - 1] = []);
    r.push(t);
  }
  return (
    <section className="cup-section" aria-label={title}>
      <h2 className="section-title">{title} <span className="section-count">{ties.length}/{state.totalTies}</span></h2>
      {rounds.filter(Boolean).map((r, i) => (
        <div className="tie-round" key={i}>
          {state.courts > 1 && <p className="tie-round-label">Round {r[0].round}</p>}
          <div className="tie-grid">
            {r.map(t => (render ? render(t) : <TieCard key={t.id} state={state} tie={t} mine={mine} />))}
          </div>
        </div>
      ))}
    </section>
  );
}

export function Standings({ state, mine = null, limit = null }) {
  const rows = limit ? state.standings.slice(0, limit) : state.standings;
  const cut = state.knockout.seedCount;
  if (!state.ties.some(t => t.played)) return null;
  return (
    <section className="cup-section" aria-label="Standings">
      <h2 className="section-title">Standings</h2>
      <div className="table-wrap">
        <table className="standings">
          <thead>
            <tr><th>#</th><th className="st-team">Team</th><th title="Matches won">W</th><th title="Games won">G+</th><th title="Games lost">G−</th><th title="Points difference">±</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} className={`${r.rank === cut ? 'cutline ' : ''}${r.key === mine ? 'mine' : ''}`}>
                <td>{r.rank}</td>
                <td className="st-team">{teamOf(state, r.key)?.name}</td>
                <td>{r.w}</td>
                <td>{r.gw}</td>
                <td>{r.gl}</td>
                <td>{r.pd > 0 ? `+${r.pd}` : r.pd}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Top {cut} go to the {state.knockout.format === 'qf' ? 'quarter-finals' : 'final and 3rd place match'}. Order: matches won, games won, points difference.</p>
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

// "Where do I play?" — type your name (or a team) and see your match and partners.
export function FindMatch({ state, onFound }) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const found = useMemo(() => {
    if (query.length < 2) return [];
    return state.teams.filter(t => t.name.toLowerCase().includes(query) || Object.values(t.players).some(p => p.toLowerCase().includes(query))).slice(0, 4);
  }, [query, state.teams]);
  return (
    <section className="cup-card find" aria-label="Find my match">
      <h2 className="card-title">⭐ Find my match</h2>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Type your name or team" aria-label="Your name or team" autoComplete="off" />
      {found.map(t => {
        const tie = state.ties.find(x => x.a === t.key || x.b === t.key);
        const me = Object.entries(t.players).find(([, p]) => p.toLowerCase().includes(query))?.[0] ?? null;
        const ko = state.knockout.ties.filter(x => x.a === t.key || x.b === t.key);
        const other = tie && teamOf(state, tie.a === t.key ? tie.b : tie.a);
        return (
          <div className="find-hit" key={t.key}>
            <p className="find-team"><b>{t.name}</b> · {Object.values(t.players).filter(Boolean).join(', ')}</p>
            {tie ? (
              <>
                <p className="find-match">
                  {tie.label} · Court {tie.court} vs <b>{other?.name}</b>
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
            ) : <p className="find-match muted">Not drawn yet — stay tuned!</p>}
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
