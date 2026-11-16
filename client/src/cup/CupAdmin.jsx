// Host page of the match draw (/admin; old /fixtures/admin works): load the final teams (PDF), set up the show,
// draw the matches live, enter results, lock the knockout line-up. Same login as the auction.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Login, Waking } from '../Admin.jsx';
import { api } from '../api.js';
import { FloatingReactions } from '../Audience.jsx';
import { sha256 } from '../fair.js';
import { ConnectionBanner, Header } from '../Live.jsx';
import { ResumeSoundPrompt, StageTools } from '../Stage.jsx';
import { MusicToggle, SmashArena } from './SmashArena.jsx';
import { Bracket, ChampionBanner, CupSteps, Standings, TeamsGrid, TieCard, TieList } from './Boards.jsx';
import { AIM_MAX, AIM_MIN, GAMES, PALETTE, SLOTS, WEAPONS, proofText } from './core.js';
import { colorOf, prepareLogo, useLogo } from './looks.jsx';
import { ComingSoon, CupSwitch } from './CupLive.jsx';
import { ModuleNav } from '../ModuleNav.jsx';
import SEASON2 from './season2.json';
import { WEAPON_INFO } from './fx.js';
import { cupApi, cupUrl, teamOf, useCup } from './live.js';
import { Moments } from './Moments.jsx';

export function CupAdmin() {
  const [admin, setAdmin] = useState(null);
  const logout = useCallback(() => setAdmin(false), []);
  useEffect(() => {
    api('/auth/me').then(r => setAdmin(r.admin), () => setAdmin(false));
  }, []);
  if (admin === null) return <Waking />;
  return admin ? <Dashboard onLogout={logout} /> : <Login onLogin={() => setAdmin(true)} title="Match draw" />;
}

// Safety net: the organisers' final list ships with the app (season2.json). If the teams saved in
// this draw differ from it (e.g. replaced players after a rehearsal), say exactly what differs and
// what to tap — old names must never reach the real draw.
function seasonDiff(state) {
  const list = SEASON2[state.event === 'kids' ? 'kids' : 'main'] ?? [];
  if (!state.teams.length || !list.length) return null;
  const norm = x => String(x ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const byName = new Map(state.teams.map(t => [norm(t.name), t]));
  const out = [];
  let missing = 0;
  for (const f of list) {
    const t = byName.get(norm(f.name));
    if (!t) { missing++; continue; }
    for (const slot of SLOTS) {
      if (norm(t.players[slot]) !== norm(f.players[slot])) out.push(`${f.name} ${slot}: ${t.players[slot] || '—'} → ${f.players[slot]}`);
    }
  }
  // A different team list altogether (not the ICC Season 2 teams): nothing to compare.
  if (missing > list.length / 2) return null;
  if (missing) out.push(`${missing} team name${missing === 1 ? '' : 's'} differ from the final list`);
  return out.length ? out : null;
}

function SeasonCheck({ state }) {
  const diff = useMemo(() => seasonDiff(state), [state.teams, state.event]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!diff) return null;
  const setup = state.phase === 'setup';
  return (
    <div className="alert season-check" role="alert">
      <p><b>⚠️ This draw doesn't have the organisers' final team list yet</b> ({diff.length} difference{diff.length === 1 ? '' : 's'}):</p>
      <ul>{diff.slice(0, 8).map(d => <li key={d}>{d}</li>)}{diff.length > 8 && <li>…and {diff.length - 8} more</li>}</ul>
      <p>{setup
        ? 'Fix: below, tap ⭐ Load ICC Season 2 teams, then Save.'
        : 'Fix: Tools → ↺ Restart draw (type RESTART), then ⭐ Load ICC Season 2 teams → Save, then open the arena again.'}</p>
    </div>
  );
}

function Dashboard({ onLogout }) {
  const live = useCup('host');
  const { state, connected, serverNow, onReaction, openedAt } = live;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = useCallback(async fn => {
    setBusy(true);
    setError('');
    try {
      return await fn();
    } catch (err) {
      if (err.status === 401) onLogout();
      else setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }, [onLogout]);
  const logout = () => run(async () => {
    await api('/auth/logout', { method: 'POST' });
    onLogout();
  });
  const ctx = { state, run, busy, serverNow, openedAt };
  const p = state?.phase;
  return (
    <div className="cup-page cup-admin">
      <ModuleNav current="cup" host />
      <Header state={state} connected={connected} kicker="Match draw · host">
        <a className="btn btn-small" href={cupUrl('/')} target="_blank" rel="noreferrer">Audience view</a>
        <a className="btn btn-small" href={cupUrl('/tv')} target="_blank" rel="noreferrer">TV view</a>
        <button className="btn btn-small" onClick={logout}>Log out</button>
      </Header>
      <CupSwitch />
      <ConnectionBanner connected={connected} />
      {error && (
        <div className="alert" role="alert">
          <p>{error}</p>
          <button className="btn btn-small" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}
      <CupSteps state={state} />
      {state && <SeasonCheck state={state} />}
      {!state ? <ComingSoon unavailable={live.unavailable} host /> : (
        <main className="cup-main">
          {p === 'setup' && <Setup {...ctx} />}
          {p === 'draw' && <DrawDesk {...ctx} />}
          {(p === 'knockout' || p === 'done') && <ChampionBanner state={state} />}
          {(p === 'knockout' || p === 'done') && <KnockoutDesk {...ctx} />}
          {p === 'league' && <SeedDesk {...ctx} />}
          {p !== 'setup' && p !== 'draw' && <ResultsDesk {...ctx} />}
          {p !== 'setup' && p !== 'draw' && <Standings state={state} />}
          {p !== 'setup' && <LooksDesk state={state} run={run} busy={busy} />}
          {p !== 'setup' && <Fairness state={state} />}
          <Tools {...ctx} />
        </main>
      )}
      <FloatingReactions onReaction={onReaction} />
      <ResumeSoundPrompt />
      <Moments state={state} />
    </div>
  );
}

// ---------- Setup: teams + show settings ----------

function Setup({ state, run, busy }) {
  return (
    <>
      <TeamsDesk state={state} run={run} busy={busy} />
      <SettingsDesk state={state} run={run} busy={busy} />
      <section className="cup-card">
        <h2 className="card-title">3 · Open the arena</h2>
        <p className="hint">Locks the teams and puts the arena on every phone. Then draw the matches one by one.</p>
        <button
          className="btn btn-primary btn-big"
          disabled={busy || state.teams.length < 4 || state.teams.length % 2 !== 0}
          onClick={() => run(() => cupApi('/open', { method: 'POST' }))}
        >
          🏟️ Open the arena ({state.teams.length} teams · {Math.floor(state.teams.length / 2)} matches)
        </button>
        {state.teams.length % 2 !== 0 && <p className="error">The draw needs an even number of teams.</p>}
      </section>
    </>
  );
}

const blank = i => ({ name: `Team ${i + 1}`, players: { A: '', B: '', C: '', D: '' }, color: PALETTE[i % PALETTE.length], logo: null });
const norm = x => String(x).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '');

// Logo preview for an editor row: a freshly picked image, the saved logo, or the generated badge.
function RowLogo({ row, i, onPick, size = 40 }) {
  const team = useMemo(() => ({ key: `t${i + 1}`, name: row.name, color: row.color, logo: row.logo }), [row.name, row.color, row.logo, i]);
  const generated = useLogo(team, i);
  const src = row.logoData ?? generated;
  return (
    <label className="te-logo" title="Tap to choose a logo">
      <span className="team-logo" style={{ width: size, height: size, '--tc': row.color ?? colorOf(team, i) }}>{src && <img src={src} alt="" />}</span>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label={`Logo for ${row.name}`} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
    </label>
  );
}

function TeamsDesk({ state, run, busy }) {
  const saved = useMemo(() => state.teams.map(({ name, players, color, logo }) => ({ name, players: { ...players }, color, logo })), [state.teams]);
  const [draft, setDraft] = useState(null); // null = showing the saved teams
  const [note, setNote] = useState(null);
  const [paste, setPaste] = useState(false);
  const rows = draft ?? saved;
  const dirty = draft !== null;
  const withLogos = async teams => Promise.all(teams.map(async (t, i) => {
    const base = { ...blank(i), ...t };
    if (!t.logoData) return base;
    try {
      const { dataUrl, color } = await prepareLogo(t.logoData);
      return { ...base, logoData: dataUrl, color: color ?? base.color };
    } catch {
      return { ...base, logoData: null };
    }
  }));
  const onFile = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await run(async () => {
      const { readTeamsFile } = await import('./importTeams.js');
      const r = await readTeamsFile(file);
      if (!r.teams.length) throw new Error("Couldn't find any teams in that file. Try “Paste text”, or type them in.");
      setDraft(await withLogos(r.teams));
      setNote({ file: file.name, count: r.teams.length, warnings: r.warnings });
    });
  };
  const onLogos = async e => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!files.length) return;
    await run(async () => {
      const next = rows.map(r => ({ ...r }));
      const left = [];
      for (const f of files) {
        const key = norm(f.name);
        const num = /(\d+)/.exec(f.name)?.[1];
        const i = next.findIndex(r => key && (norm(r.name) === key || key.includes(norm(r.name)) || (num && norm(r.name) === `team${num}`)));
        if (i >= 0 && !next[i].pending) next[i].pending = f;
        else left.push(f);
      }
      // Unmatched pictures fill the teams still without a logo, in order.
      next.filter(r => !r.pending && !r.logo && !r.logoData).forEach(r => { if (left.length) r.pending = left.shift(); });
      for (const r of next) {
        if (!r.pending) continue;
        const { dataUrl, color } = await prepareLogo(r.pending);
        r.logoData = dataUrl;
        if (color) r.color = color;
        delete r.pending;
      }
      setDraft(next);
      setNote({ file: `${files.length} picture${files.length > 1 ? 's' : ''}`, count: next.filter(r => r.logoData).length, warnings: left.length ? [`${left.length} picture(s) matched no team`] : [], logos: true });
    });
  };
  const onPaste = async text => {
    const { parseText } = await import('./teamsPdf.js');
    const r = parseText(text);
    if (!r.teams.length) return setNote({ file: 'pasted text', count: 0, warnings: ['No teams found. Use “Team 1” then lines like “A: Name”, or rows “Team, A, B, C, D”.'] });
    setDraft(await withLogos(r.teams));
    setNote({ file: 'pasted text', count: r.teams.length, warnings: r.warnings });
    setPaste(false);
  };
  // The organisers' final teams (Excel + Drive logos), bundled with the app: one tap, no upload.
  const loadSeason = () => {
    const list = SEASON2[state.event === 'kids' ? 'kids' : 'main'] ?? [];
    setDraft(list.map(t => ({ name: t.name, players: { ...t.players }, color: t.color, logo: t.logo })));
    setNote({ file: `${SEASON2.season} (organisers' final list with replacements + logos)`, count: list.length, warnings: [] });
  };
  const edit = (i, field, value) => setDraft(rows.map((t, k) => (k !== i ? t : field === 'name' || field === 'color' ? { ...t, [field]: value } : { ...t, players: { ...t.players, [field]: value } })));
  const pickLogo = (i, file) => run(async () => {
    const { dataUrl, color } = await prepareLogo(file);
    setDraft(rows.map((t, k) => (k !== i ? t : { ...t, logoData: dataUrl, color: color ?? t.color })));
  });
  const save = () => run(async () => {
    await cupApi('/teams', { method: 'PUT', body: { teams: rows.map(({ name, players, color, logo, logoData }) => ({ name, players, color, logo: logoData ? null : logo })) } });
    const logos = Object.fromEntries(rows.map((r, i) => [`t${i + 1}`, r.logoData]).filter(([, v]) => v));
    if (Object.keys(logos).length) await cupApi('/logos', { method: 'PUT', body: { logos } });
    setDraft(null);
  });
  return (
    <section className="cup-card">
      <h2 className="card-title">1 · Final teams</h2>
      <p className="hint">Upload the organisers&apos; final teams file — <b>PDF, Excel (.xlsx), Word (.docx) or CSV</b>. Team names, players by category (A–D, or M1/M2/M3/W1, B1/G1/B2/G2) and logos inside the file are read automatically. Check the table, tap a logo to change it, then save.</p>
      <div className="row-actions">
        <label className="btn btn-primary">
          📄 Upload teams file
          <input type="file" accept=".pdf,.xlsx,.xlsm,.docx,.csv,.txt,application/pdf" onChange={onFile} hidden />
        </label>
        <label className="btn">
          🖼️ Upload logos
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={onLogos} hidden />
        </label>
        <button className="btn btn-primary" onClick={loadSeason}>⭐ Load ICC Season 2 teams</button>
        <button className="btn" onClick={() => setPaste(v => !v)}>Paste text</button>
        <button className="btn" onClick={() => setDraft([...rows, blank(rows.length)])}>+ Add team</button>
        {dirty && <button className="btn" onClick={() => { setDraft(null); setNote(null); }}>Discard changes</button>}
      </div>
      <p className="hint">Logo pictures named after the team (e.g. “Smash Titans.png”) are matched automatically; others fill teams without a logo in order.</p>
      {paste && <PasteBox onParse={onPaste} />}
      {note && (
        <div className={`import-note${note.warnings.length ? ' warn' : ''}`}>
          <p>{note.logos ? <>Matched <b>{note.count}</b> logos from {note.file}.</> : <>Read <b>{note.count}</b> teams from {note.file}.</>} {dirty ? 'Not saved yet — check and press Save.' : ''}</p>
          {note.warnings.length > 0 && <ul>{note.warnings.slice(0, 8).map(w => <li key={w}>⚠️ {w}</li>)}</ul>}
        </div>
      )}
      {rows.length > 0 ? (
        <div className="table-wrap">
          <table className="team-editor">
            <thead><tr><th>#</th><th>Logo</th><th aria-label="Colour" /><th>Team name</th>{SLOTS.map(s => <th key={s}>{s}</th>)}<th aria-label="Remove" /></tr></thead>
            <tbody>
              {rows.map((t, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td><RowLogo row={t} i={i} onPick={f => pickLogo(i, f)} /></td>
                  <td><input type="color" value={t.color ?? PALETTE[i % PALETTE.length]} onChange={e => edit(i, 'color', e.target.value)} aria-label={`${t.name} colour`} /></td>
                  <td><input value={t.name} onChange={e => edit(i, 'name', e.target.value)} aria-label={`Team ${i + 1} name`} maxLength={40} /></td>
                  {SLOTS.map(s => (
                    <td key={s}><input value={t.players[s]} onChange={e => edit(i, s, e.target.value)} aria-label={`Team ${i + 1} player ${s}`} maxLength={60} className={t.players[s] ? undefined : 'empty'} /></td>
                  ))}
                  <td><button className="btn btn-small" aria-label={`Remove ${t.name}`} onClick={() => setDraft(rows.filter((_, k) => k !== i))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="cup-empty">No teams yet.</p>}
      <div className="row-actions">
        <button className="btn btn-primary" disabled={busy || !dirty} onClick={save}>Save {rows.length} teams</button>
        {!dirty && state.teams.length > 0 && <span className="ok">✓ {state.teams.length} teams saved</span>}
      </div>
    </section>
  );
}

// After the arena opens, names are locked but logos and colours can still change (looks only).
function LooksDesk({ state, run, busy }) {
  const setColor = (key, color) => run(() => cupApi('/looks', { method: 'PATCH', body: { looks: { [key]: { color } } } }));
  const setLogo = (key, file) => run(async () => {
    const { dataUrl, color } = await prepareLogo(file);
    await cupApi('/logos', { method: 'PUT', body: { logos: { [key]: dataUrl } } });
    if (color) await cupApi('/looks', { method: 'PATCH', body: { looks: { [key]: { color } } } });
  });
  return (
    <details className="cup-card">
      <summary className="card-title">🎨 Logos &amp; colours</summary>
      <p className="hint">Tap a logo to replace it. Changes show on every screen straight away.</p>
      <div className="looks-grid">
        {state.teams.map((t, i) => (
          <div className="looks-row" key={t.key}>
            <RowLogo row={t} i={i} size={44} onPick={f => setLogo(t.key, f)} />
            <b>{t.name}</b>
            <input type="color" value={colorOf(t, i)} disabled={busy} onChange={e => setColor(t.key, e.target.value)} aria-label={`${t.name} colour`} />
          </div>
        ))}
      </div>
    </details>
  );
}

function PasteBox({ onParse }) {
  const [text, setText] = useState('');
  return (
    <div className="paste-box">
      <textarea rows={8} value={text} onChange={e => setText(e.target.value)} placeholder={'Team 1\nA: Name\nB: Name\nC: Name\nD: Name\nTeam 2\n…\n\nor one row per team: Team name, A, B, C, D'} />
      <button className="btn btn-primary" disabled={!text.trim()} onClick={() => onParse(text)}>Read teams</button>
    </div>
  );
}

function SettingsDesk({ state, run, busy }) {
  const [name, setName] = useState(state.name);
  useEffect(() => setName(state.name), [state.name]);
  const patch = body => run(() => cupApi('/settings', { method: 'PATCH', body }));
  const aims = [2000, 2500, 3500, 5000, 7000].filter(v => v >= AIM_MIN && v <= AIM_MAX);
  return (
    <section className="cup-card">
      <h2 className="card-title">2 · The show</h2>
      <form className="row-actions" onSubmit={e => { e.preventDefault(); patch({ name }); }}>
        <label className="grow">Title on every screen
          <input value={name} onChange={e => setName(e.target.value)} maxLength={100} />
        </label>
        <button className="btn" disabled={busy || name === state.name}>Save title</button>
      </form>
      <p className="field-label">Suspense before each team is revealed</p>
      <div className="chips">
        {aims.map(v => (
          <button key={v} className={`chip${state.aimMs === v ? ' on' : ''}`} disabled={busy} onClick={() => patch({ aimMs: v })}>{v / 1000} s</button>
        ))}
      </div>
      <p className="field-label">Weapon</p>
      <div className="chips">
        <button className={`chip${state.weapon === 'auto' ? ' on' : ''}`} disabled={busy} onClick={() => patch({ weapon: 'auto' })}>🎲 Surprise (changes every match)</button>
        {WEAPONS.map(w => (
          <button key={w} className={`chip${state.weapon === w ? ' on' : ''}`} disabled={busy} onClick={() => patch({ weapon: w })}>{WEAPON_INFO[w].emoji} {WEAPON_INFO[w].name}</button>
        ))}
      </div>
      <p className="hint">One show per match ≈ {Math.round((1800 + state.aimMs * 1.8 + 4200 + 8200) / 1000)} s. The last two teams are paired by fate.</p>
    </section>
  );
}

// ---------- Draw ----------

function DrawDesk({ state, run, busy, serverNow, openedAt }) {
  const [weapon, setWeapon] = useState('auto');
  const [show, setShow] = useState(null);
  const [left, setLeft] = useState(0);
  // Between "draw accepted" and the live state saying the show runs, keep the button locked so a
  // quick second tap doesn't hit the server's "show still running" refusal.
  const [justDrew, setJustDrew] = useState(false);
  const running = Boolean(state.current);
  useEffect(() => {
    if (!justDrew) return undefined;
    if (running) {
      setJustDrew(false);
      return undefined;
    }
    const t = setTimeout(() => setJustDrew(false), 4000);
    return () => clearTimeout(t);
  }, [justDrew, running]);
  useEffect(() => {
    if (!running) return setLeft(0);
    const tick = () => setLeft(Math.max(0, Math.ceil((state.current.doneAt - serverNow()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [running, state.current, serverNow]);
  const hideSeq = show && show.phase !== 'done' ? show.seq : null;
  const lastTwo = state.remaining.length === 2;
  return (
    <>
      <SmashArena state={state} serverNow={serverNow} mode="host" onShow={setShow} openedAt={openedAt} />
      <section className="cup-card draw-desk">
        <div className="draw-main">
          <button
            className="btn btn-primary btn-big"
            disabled={busy || running || justDrew || state.remaining.length < 2}
            onClick={() => run(async () => {
              const r = await cupApi('/draw', { method: 'POST', body: { tie: state.nextTie, weapon } });
              setJustDrew(true);
              return r;
            })}
          >
            {running ? `Show running… ${left}s` : justDrew ? 'Starting the show…' : lastTwo ? `🔗 Draw the last match (${state.ties.length}/${state.totalTies} drawn)` : `🎯 Draw the next match (${state.ties.length}/${state.totalTies} drawn)`}
          </button>
          <div className="row-actions"><StageTools /><MusicToggle /></div>
        </div>
        {!lastTwo && (
          <div className="chips" aria-label="Weapon for this match">
            <button className={`chip${weapon === 'auto' ? ' on' : ''}`} onClick={() => setWeapon('auto')}>{state.weapon === 'auto' ? '🎲 Surprise' : `${WEAPON_INFO[state.weapon].emoji} Default`}</button>
            {WEAPONS.map(w => <button key={w} className={`chip${weapon === w ? ' on' : ''}`} onClick={() => setWeapon(w)} title={WEAPON_INFO[w].name}>{WEAPON_INFO[w].emoji}</button>)}
          </div>
        )}
        <div className="row-actions">
          <button
            className="btn"
            disabled={busy || running || !state.lastSeq}
            onClick={() => window.confirm('Undo the latest match? Both teams go back into the arena.') && run(() => cupApi('/undo', { method: 'POST', body: { seq: state.lastSeq } }))}
          >↶ Undo last match</button>
          {!state.ties.length && !running && <button className="btn" disabled={busy} onClick={() => run(() => cupApi('/setup', { method: 'POST' }))}>Back to team setup</button>}
        </div>
      </section>
      <TieList state={state} hideSeq={hideSeq} title="Matches drawn" empty="No matches yet — press Draw." />
    </>
  );
}

// ---------- Results ----------

function TieEditor({ state, tie, run, busy }) {
  const A = teamOf(state, tie.a);
  const B = teamOf(state, tie.b);
  const [scores, setScores] = useState(() => tie.games.map(g => [g.sa ?? '', g.sb ?? '']));
  const sig = JSON.stringify(tie.games);
  useEffect(() => setScores(tie.games.map(g => [g.sa ?? '', g.sb ?? ''])), [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!A || !B) return <TieCard state={state} tie={tie} />;
  const send = (games, decider = tie.decider) => run(() => cupApi('/result', { method: 'PUT', body: { tie: tie.id, games, decider } }));
  const setWinner = (i, side) => {
    const games = tie.games.map((g, k) => (k !== i ? g : g.w === side ? { w: null, sa: null, sb: null } : { w: side, sa: null, sb: null }));
    send(games);
  };
  const commitScore = i => {
    const [sa, sb] = scores[i];
    const g = tie.games[i];
    if (String(sa) === String(g.sa ?? '') && String(sb) === String(g.sb ?? '')) return;
    const both = sa !== '' && sb !== '';
    send(tie.games.map((x, k) => (k !== i ? x : both ? { w: null, sa: Number(sa), sb: Number(sb) } : { w: x.w, sa: null, sb: null })));
  };
  const pair = (T, g) => `${T.players[g[0]] || g[0]} & ${T.players[g[1]] || g[1]}`;
  return (
    <TieCard state={state} tie={tie}>
      <ol className="tie-editor">
        {GAMES.map((g, i) => {
          const r = tie.games[i];
          return (
            <li key={g.join()}>
              <b className="te-code">{g.join('/')}</b>
              <button className={`te-side${r.w === 'a' ? ' on' : ''}`} disabled={busy} onClick={() => setWinner(i, 'a')}>{pair(A, g)}</button>
              <span className="te-score">
                <input inputMode="numeric" value={scores[i][0]} aria-label={`${g.join('/')} ${A.name} points`} onChange={e => setScores(s => s.map((x, k) => (k === i ? [e.target.value.replace(/\D/g, '').slice(0, 2), x[1]] : x)))} onBlur={() => commitScore(i)} />
                –
                <input inputMode="numeric" value={scores[i][1]} aria-label={`${g.join('/')} ${B.name} points`} onChange={e => setScores(s => s.map((x, k) => (k === i ? [x[0], e.target.value.replace(/\D/g, '').slice(0, 2)] : x)))} onBlur={() => commitScore(i)} />
              </span>
              <button className={`te-side${r.w === 'b' ? ' on' : ''}`} disabled={busy} onClick={() => setWinner(i, 'b')}>{pair(B, g)}</button>
            </li>
          );
        })}
      </ol>
      {(tie.needsDecider || tie.decider) && (
        <div className="te-decider">
          <span>3–3 decider:</span>
          <button className={`chip${tie.decider === 'a' ? ' on' : ''}`} disabled={busy} onClick={() => send(tie.games, tie.decider === 'a' ? null : 'a')}>{A.name}</button>
          <button className={`chip${tie.decider === 'b' ? ' on' : ''}`} disabled={busy} onClick={() => send(tie.games, tie.decider === 'b' ? null : 'b')}>{B.name}</button>
        </div>
      )}
      <p className="hint">Tap the winning pair, or type the points (the winner follows the score).</p>
    </TieCard>
  );
}

function ResultsDesk({ state, run, busy }) {
  const done = state.ties.filter(t => t.winner).length;
  return (
    <>
      <p className="desk-note">League results: <b>{done}/{state.ties.length}</b> matches decided</p>
      <TieList state={state} title="Matches · enter results" render={t => <TieEditor key={t.id} state={state} tie={t} run={run} busy={busy} />} />
    </>
  );
}

function SeedDesk({ state, run, busy }) {
  const n = state.knockout.seedCount;
  const fromTable = useCallback(() => state.standings.slice(0, n).map(r => r.key), [state.standings, n]);
  const [order, setOrder] = useState(fromTable);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setOrder(fromTable());
  }, [fromTable, touched]);
  const undecided = state.ties.filter(t => !t.winner).length;
  const move = (i, d) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setOrder(next);
    setTouched(true);
  };
  const ok = new Set(order).size === n;
  return (
    <section className="cup-card">
      <h2 className="card-title">🔒 Knockout line-up</h2>
      <p className="hint">
        Taken from the standings ({state.knockout.format === 'qf' ? 'QF: 1st v 8th, 2nd v 7th, 3rd v 6th, 4th v 5th' : 'Final: 1st v 2nd · 3rd place: 3rd v 4th'}). Change any position if your tie-break rules differ.
      </p>
      {undecided > 0 && <p className="warn-text">⚠️ {undecided} league {undecided === 1 ? 'match is' : 'matches are'} not decided yet.</p>}
      <ol className="seed-list">
        {order.map((key, i) => (
          <li key={i}>
            <b>{i + 1}</b>
            <select value={key} onChange={e => { setOrder(order.map((k, x) => (x === i ? e.target.value : k))); setTouched(true); }} aria-label={`Position ${i + 1}`}>
              {state.standings.map(r => <option key={r.key} value={r.key}>{r.rank}. {teamOf(state, r.key)?.name} ({r.w}W · {r.gw} games)</option>)}
            </select>
            <button className="btn btn-small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button className="btn btn-small" disabled={i === n - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
          </li>
        ))}
      </ol>
      {!ok && <p className="error">Each position needs a different team.</p>}
      <div className="row-actions">
        <button
          className="btn btn-primary btn-big"
          disabled={busy || !ok}
          onClick={() => {
            if (undecided > 0 && !window.confirm(`${undecided} league ${undecided === 1 ? 'match is' : 'matches are'} not decided yet (a 3–3 needs points or a decider tap). Lock the knockout anyway?`)) return;
            run(() => cupApi('/seed', { method: 'POST', body: { seeds: order } }));
          }}
        >🔒 Lock &amp; reveal the knockout</button>
        {touched && <button className="btn" onClick={() => { setTouched(false); setOrder(fromTable()); }}>Reset to standings</button>}
      </div>
    </section>
  );
}

function KnockoutDesk({ state, run, busy }) {
  const any = state.knockout.ties.some(t => t.played || t.decider);
  return (
    <>
      <Bracket state={state} />
      <section className="cup-section">
        <h2 className="section-title">Knockout · enter results</h2>
        <div className="tie-grid">
          {state.knockout.ties.map(t => <TieEditor key={t.id} state={state} tie={t} run={run} busy={busy} />)}
        </div>
        {!any && (
          <button className="btn" disabled={busy} onClick={() => window.confirm('Unlock the knockout line-up? You can then change it and lock it again.') && run(() => cupApi('/unseed', { method: 'POST' }))}>
            🔓 Unlock line-up
          </button>
        )}
      </section>
    </>
  );
}

// ---------- Fairness + tools ----------

// Host only: every finished match's sealed result is checked in this browser.
function Fairness({ state }) {
  const [ok, setOk] = useState({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const out = {};
      for (const t of state.ties) {
        if (!t.salt || !t.commitment) continue;
        const text = proofText({ seq: t.seq, tie: t.no, a: teamOf(state, t.a)?.name, b: teamOf(state, t.b)?.name, salt: t.salt });
        out[t.id] = (await sha256(text)) === t.commitment;
      }
      if (alive) setOk(out);
    })();
    return () => { alive = false; };
  }, [state]);
  const checked = Object.values(ok);
  if (!checked.length) return null;
  const good = checked.filter(Boolean).length;
  return (
    <p className={`fair-note${good === checked.length ? '' : ' bad'}`}>
      {good === checked.length ? '✅' : '❌'} Fairness seal: {good}/{checked.length} matches verified — each pair was sealed (SHA-256) before its show started.
    </p>
  );
}

function Tools({ state, run, busy }) {
  const [name, setName] = useState('');
  const running = Boolean(state.current);
  const fresh = state.phase === 'setup';
  // Typed confirmation: a stray tap during the live event must never wipe the drawn matches.
  const restart = () => {
    const typed = window.prompt('Restart the match draw?\n\nEvery drawn match and result is cleared (teams, logos and settings stay) and everyone watching sees a fresh draw.\n\nType RESTART to confirm.');
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== 'RESTART') {
      window.alert('Not restarted — type RESTART to confirm.');
      return;
    }
    run(() => cupApi('/new', { method: 'POST', body: { keepTeams: true } }));
  };
  return (
    <section className="cup-card">
      <h2 className="card-title">Tools</h2>
      <div className="restart-box">
        <button className="btn btn-primary" disabled={busy || running || fresh} onClick={restart}>↺ Restart draw</button>
        <p className="hint">
          {running ? 'Wait for this match’s show to finish.'
            : fresh ? 'Nothing drawn yet — this is a fresh start.'
              : 'Rehearse as often as you like. On the day, press Restart once: same teams and settings, nothing drawn, and the audience sees a clean start.'}
        </p>
      </div>
      <div className="row-actions">
        <button
          className="btn"
          disabled={busy || state.phase === 'setup' || state.phase === 'draw'}
          title={state.phase === 'setup' || state.phase === 'draw' ? 'Available once every team is drawn' : 'Every match as a VS card'}
          onClick={() => run(async () => (await import('./fixturesPdf.js')).downloadFixtures(state))}
        >📄 Matches PDF</button>
        <a className="btn" href={cupUrl('/tv')} target="_blank" rel="noreferrer">📺 TV view</a>
      </div>
      <details className="danger-zone">
        <summary>Start a new match draw (empty, new name)</summary>
        <p className="hint">For a different event: no teams, starts at team setup. The current one is kept in the database.</p>
        <form className="row-actions" onSubmit={e => {
          e.preventDefault();
          const typed = window.prompt('Start a new, EMPTY match draw (no teams)? Everyone will see the new one.\n\nType NEW to confirm.');
          if (typed?.trim().toUpperCase() === 'NEW') run(() => cupApi('/new', { method: 'POST', body: { name: name || state.name } }));
        }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={state.name} maxLength={100} aria-label="Name of the new match draw" />
          <button className="btn" disabled={busy || running}>Start new</button>
        </form>
      </details>
      {state.phase !== 'setup' && <TeamsGrid state={state} />}
    </section>
  );
}
