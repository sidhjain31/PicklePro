// "My team" (match day): the viewer picks their team once (or taps 🔔 in Find my match) and gets one
// panel at the top of the page with what matters to them: their match live (games, total points,
// result), where they stand and why, the teams around them and the last quarter-final place (to plan
// their game), and what comes next. Read only; the choice is remembered on the phone (useFollow).
import { ordinal } from './core.js';
import { MatchFoot, STATUS, ScoreHead, resultOf } from './Boards.jsx';
import { followedTeam } from './MyMatch.jsx';
import { teamOf } from './live.js';
import { TeamLogo } from './looks.jsx';

const involves = (t, key) => t.a === key || t.b === key;

// The match to show: one being played now, else the latest knockout tie, else the league match.
function currentMatch(state, key) {
  const ko = state.knockout.locked ? state.knockout.ties.filter(t => involves(t, key) && t.a && t.b) : [];
  const all = [...state.ties.filter(t => involves(t, key)), ...ko];
  return all.find(t => resultOf(state, t).kind === 'live') ?? ko.at(-1) ?? all[0] ?? null;
}

// What comes next for the team once the knockout line-up is set (null before).
function nextStep(state, key) {
  const k = state.knockout;
  const name = x => teamOf(state, x)?.name ?? 'to be decided';
  if (k.champion === key) return '🏆 Champions!';
  if (!k.locked) return null;
  const mine = k.ties.filter(t => involves(t, key));
  if (!mine.length) return state.qualification ? 'Not in the quarter-finals this time — thanks for playing!' : null;
  const last = mine.at(-1);
  const other = last.a === key ? last.b : last.a;
  if (!last.winner) return other ? `⚔️ Next: ${last.label} vs ${name(other)}` : `⚔️ Next: ${last.label} — waiting for the other match`;
  const won = last[last.winner] === key;
  if (last.id === '3P') return won ? '🥉 Third place!' : 'Fourth place — well played!';
  if (last.id === 'F') return won ? '🏆 Champions!' : '🥈 Runners-up — well played!';
  if (!won) return `Out in the ${last.label.toLowerCase()} — ${name(last[last.winner])} won`;
  return `✅ Through! Next round: waiting for the other ${last.stage === 'QF' ? 'quarter-finals' : 'semi-final'}`;
}

function PickTeam({ state, onFollow }) {
  return (
    <section className="cup-card my-team pick" id="my-team" aria-label="My team">
      <h2 className="card-title">⭐ My team</h2>
      <p className="mt-lead">Pick your team: its match, its rank and its rivals stay right here at the top.</p>
      <select
        value=""
        aria-label="Choose your team"
        onChange={e => {
          const t = state.teams.find(x => x.key === e.target.value);
          if (t) onFollow({ key: t.key, team: t.name, player: null, playerName: null });
        }}
      >
        <option value="">Choose your team…</option>
        {state.teams.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
      </select>
    </section>
  );
}

// Adults: rank, status, the teams around and the last quarter-final place.
function AdultStanding({ state, team }) {
  const q = state.qualification;
  const row = q.rows.find(r => r.key === team.key);
  if (!row || !q.complete) return null;
  const ranked = q.rows.filter(r => r.tier < 4);
  const i = ranked.findIndex(r => r.key === team.key);
  const Q = q.qualifiers;
  const around = i >= 0 ? ranked.slice(Math.max(0, i - 2), i + 3) : ranked.filter(r => r.pos >= Q - 1 && r.pos <= Q + 1);
  const cut = ranked.find(r => r.pos === Q);
  const name = k => teamOf(state, k)?.name ?? '';
  // If the league ended now: the quarter-final this rank would play (1v8, 2v7, 3v6, 4v5).
  const vs = !state.knockout.locked && row.tier <= 2 && row.pos && row.pos <= Q && row.status !== 'out' ? ranked.find(r => r.pos === Q + 1 - row.pos) : null;
  return (
    <div className="mt-block">
      <div className="mt-rank">
        <b>{row.rank == null ? '–' : `${row.shared ? '=' : ''}${row.rank}`}</b>
        <div>
          <span className={`st-chip ${STATUS[row.status][1]}`}>{STATUS[row.status][0]}</span>
          <p>{row.reason}</p>
          <small>{q.final ? 'Final league standings' : `Provisional · ${q.complete} of ${q.total} matches complete`}</small>
        </div>
      </div>
      {vs && <p className="mt-if">If it ended now: <b>quarter-final vs {name(vs.key)}</b> ({ordinal(row.pos)} v {ordinal(vs.pos)})</p>}
      <p className="mt-sub">{i >= 0 ? 'Around you' : 'The race for the top 8'}</p>
      <table className="mt-table">
        <tbody>
          {around.map(r => (
            <tr key={r.key} className={r.key === team.key ? 'me' : undefined}>
              <td>{`${r.shared ? '=' : ''}${r.rank}`}</td>
              <td className="mt-name">{name(r.key)}</td>
              <td>{r.result} {r.gw}–{r.gl}</td>
              <td>{r.pf} pts</td>
              <td><span className={`st-chip ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {cut && !around.includes(cut) && <p className="mt-if">Last quarter-final place ({ordinal(Q)}): <b>{name(cut.key)}</b> · {cut.result === 'W' ? 'Won' : 'Drew'} {cut.gw}–{cut.gl} · {cut.pf} pts</p>}
    </div>
  );
}

// Kids: rank among the 4 and where that leads (Final or 3rd place match).
function KidsStanding({ state, team }) {
  if (!state.ties.some(t => t.played)) return null;
  const rows = state.standings;
  const me = rows.find(r => r.key === team.key);
  if (!me) return null;
  const name = k => teamOf(state, k)?.name ?? '';
  return (
    <div className="mt-block">
      <div className="mt-rank">
        <b>{me.rank}</b>
        <div>
          <p>{me.w} {me.w === 1 ? 'win' : 'wins'} · games {me.gw}–{me.gl} · {me.pf} points</p>
          {!state.knockout.locked && <small>Right now: {me.rank <= 2 ? 'heading for the Final' : 'heading for the 3rd place match'}</small>}
        </div>
      </div>
      <table className="mt-table">
        <tbody>
          {rows.map(r => (
            <tr key={r.key} className={r.key === team.key ? 'me' : undefined}>
              <td>{r.rank}</td>
              <td className="mt-name">{name(r.key)}</td>
              <td>{r.w} W</td>
              <td>{r.gw}–{r.gl}</td>
              <td>{r.pf} pts</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MyTeamPanel({ state, follow, onFollow, onShow }) {
  const team = followedTeam(state, follow);
  if (!team) return <PickTeam state={state} onFollow={onFollow} />;
  const tie = currentMatch(state, team.key);
  const next = nextStep(state, team.key);
  return (
    <section className="cup-card my-team" id="my-team" aria-label="My team">
      <header className="mt-head">
        <TeamLogo team={team} size={44} />
        <div>
          <p className="mt-kicker">⭐ My team</p>
          <h2>{team.name}</h2>
          <p className="mt-players">{['A', 'B', 'C', 'D'].map(s => team.players[s]).filter(Boolean).join(' · ')}</p>
        </div>
        <button type="button" className="link" onClick={() => onFollow(null)}>Change</button>
      </header>
      {next && <p className="mt-next">{next}</p>}
      {tie && (
        <div className={`mt-match${resultOf(state, tie).kind === 'live' ? ' is-live' : ''}`}>
          <p className="mt-sub">{tie.stage === 'L' ? 'League match' : tie.label}</p>
          <ScoreHead state={state} tie={tie} />
          {tie.a && tie.b && <MatchFoot state={state} tie={tie} />}
          {tie.a && tie.b && <button type="button" className="link mt-see" onClick={() => onShow?.(tie.id)}>See every game ›</button>}
        </div>
      )}
      {state.qualification ? <AdultStanding state={state} team={team} /> : <KidsStanding state={state} team={team} />}
    </section>
  );
}
