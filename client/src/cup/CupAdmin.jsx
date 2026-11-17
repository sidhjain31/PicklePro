// Host page of the match draw (/admin; old /fixtures/admin works): load the final teams (PDF), set up the show,
// draw the matches live, enter results, lock the knockout line-up. Same login as the auction.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Login, Waking } from '../Admin.jsx';
import { api } from '../api.js';
import { FloatingReactions } from '../Audience.jsx';
import { sha256 } from '../fair.js';
import { ConnectionBanner, Header } from '../Live.jsx';
import { ResumeSoundPrompt, StageTools } from '../Stage.jsx';
import { MusicToggle, SmashArena } from './SmashArena.jsx';
import { Bracket, ChampionBanner, CupSteps, MatchFoot, Standings, TeamsGrid, TieCard, TieList } from './Boards.jsx';
import { AIM_MAX, AIM_MIN, GAMES, PALETTE, SLOTS, WEAPONS, ordinal, proofText } from './core.js';
import { ADULT_FORMAT } from './qualify.js';
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

// In-page confirmation dialog. Browser prompt()/confirm() boxes are blocked or unreliable in some
// browsers (in-app browsers on phones), which made Restart silently do nothing. Optional `word`:
// the host must type it (e.g. RESTART) before the button enables.
function useConfirm() {
  const [ask, setAsk] = useState(null);
  const [typed, setTyped] = useState('');
  const confirm = useCallback(opts => new Promise(resolve => {
    setTyped('');
    setAsk({ ...opts, resolve });
  }), []);
  const close = ok => {
    ask?.resolve(ok && ask.input ? typed.trim() : ok);
    setAsk(null);
  };
  const ready = ask?.input ? typed.trim().length >= 3 : !ask?.word || typed.trim().toUpperCase() === ask.word;
  const dialog = ask && createPortal(
    <div className="confirm-back" role="dialog" aria-modal="true" aria-label={ask.title} onClick={e => e.target === e.currentTarget && close(false)}>
      <form className="confirm-card" onSubmit={e => { e.preventDefault(); if (ready) close(true); }}>
        <h3>{ask.title}</h3>
        {ask.body && <p>{ask.body}</p>}
        {ask.list?.length > 0 && <ul className="confirm-list">{ask.list.map(x => <li key={x}>{x}</li>)}</ul>}
        {ask.input && (
          <label className="confirm-word">
            <span>{ask.input}</span>
            <input value={typed} onChange={e => setTyped(e.target.value)} autoFocus maxLength={200} aria-label={ask.input} />
          </label>
        )}
        {ask.word && (
          <label className="confirm-word">
            <span>Type <b>{ask.word}</b> to confirm</span>
            <input value={typed} onChange={e => setTyped(e.target.value)} autoFocus autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} aria-label={`Type ${ask.word}`} />
          </label>
        )}
        <div className="row-actions confirm-actions">
          <button type="button" className="btn" onClick={() => close(false)}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!ready}>{ask.okLabel ?? 'OK'}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
  return [confirm, dialog];
}

// Who is entering scores (one shared host login): typed once per device, sent with every change.
const HOST_NAME = 'team-draw:cup-host-name';
const hostName = () => {
  try {
    return localStorage.getItem(HOST_NAME) || '';
  } catch {
    return '';
  }
};
function HostName() {
  const [v, setV] = useState(hostName);
  return (
    <label className="host-name">
      <span>Your name (score log)</span>
      <input value={v} maxLength={40} placeholder="e.g. Sidh" onChange={e => { setV(e.target.value); try { localStorage.setItem(HOST_NAME, e.target.value.trim()); } catch { /* storage blocked */ } }} />
    </label>
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
  const [confirm, confirmDialog] = useConfirm();
  const ctx = { state, run, busy, serverNow, openedAt, confirm };
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
          {p === 'league' && (state.qualification ? <QualifyDesk {...ctx} /> : <SeedDesk {...ctx} />)}
          {p !== 'setup' && p !== 'draw' && <ResultsDesk {...ctx} />}
          {p !== 'setup' && p !== 'draw' && <Standings state={state} />}
          {p !== 'setup' && <LooksDesk state={state} run={run} busy={busy} />}
          {p !== 'setup' && <Fairness state={state} />}
          {p !== 'setup' && <ScoreLog state={state} />}
          <Tools {...ctx} />
        </main>
      )}
      {confirmDialog}
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
    // The organisers' list loaded: give the draw its proper name (Adults / Kids), unless the host
    // already typed a custom one.
    const kids = state.event === 'kids';
    const seasonName = `ICC Season 2 · ${kids ? 'Kids' : 'Adults'} Match Draw`;
    if (note?.file?.startsWith(SEASON2.season) && /^(icc season 2 · )?((adults|main|kids) )?match draw$/i.test(String(state.name).trim()) && state.name !== seasonName) {
      await cupApi('/settings', { method: 'PATCH', body: { name: seasonName } });
    }
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

function DrawDesk({ state, run, busy, serverNow, openedAt, confirm }) {
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
            onClick={async () => {
              if (await confirm({ title: 'Undo the latest match?', body: 'Both teams go back into the arena.', okLabel: '↶ Undo' })) run(() => cupApi('/undo', { method: 'POST', body: { seq: state.lastSeq } }));
            }}
          >↶ Undo last match</button>
          {!state.ties.length && !running && <button className="btn" disabled={busy} onClick={() => run(() => cupApi('/setup', { method: 'POST' }))}>Back to team setup</button>}
        </div>
      </section>
      <TieList state={state} hideSeq={hideSeq} title="Matches drawn" empty="No matches yet — press Draw." />
    </>
  );
}

// ---------- Results ----------

// Score entry built for speed: what the host types or taps shows at once (winner in green), saves in
// the background (one save at a time per match, always the latest), and the boxes never lock or
// reset while typing. A half-typed game (one side only, or a level score) is not sent.
const draftOf = g => ({ w: g.w ?? null, sa: g.sa ?? '', sb: g.sb ?? '' });
const ready = g => g.sa !== '' && g.sb !== '' && Number(g.sa) !== Number(g.sb);
const filled = v => v !== '' && v != null;
const gameKey = g => (filled(g.sa) && filled(g.sb) ? `${Number(g.sa)}-${Number(g.sb)}` : `${g.w ?? ''}|${g.sa ?? ''}|${g.sb ?? ''}`);
// A draft game as the server would store it (null = not ready to send).
const toGame = g => (ready(g) ? { w: Number(g.sa) > Number(g.sb) ? 'a' : 'b', sa: Number(g.sa), sb: Number(g.sb) } : g.sa === '' && g.sb === '' ? { w: g.w, sa: null, sb: null } : null);

// Totals, games won and the result from the games on screen, so a typed score shows at once.
function onScreen(tie, games) {
  const ga = games.filter(g => g.w === 'a').length;
  const gb = games.filter(g => g.w === 'b').length;
  const pa = games.reduce((x, g) => x + (g.sa ?? 0), 0);
  const pb = games.reduce((x, g) => x + (g.sb ?? 0), 0);
  if (games.every((g, i) => gameKey(g) === gameKey(tie.games[i]))) return { ...tie, games, pa, pb };
  // Not saved yet: a clear win shows straight away; a 3-3 waits for the server's rules.
  return { ...tie, games, ga, gb, pa, pb, winner: ga >= 4 ? 'a' : gb >= 4 ? 'b' : null, draw: false, needsPoints: false, needsDecider: false, deciderNote: null };
}

const TieEditor = memo(function TieEditor({ state, tie, run, busy, confirm }) {
  const A = teamOf(state, tie.a);
  const B = teamOf(state, tie.b);
  const [draft, setDraft] = useState(() => tie.games.map(draftOf));
  const [status, setStatus] = useState(null); // null | 'saving' | 'saved' | { error }
  const live = useRef(tie);
  live.current = tie;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const base = useRef(tie.games.map(draftOf)); // the server's games the draft was built on
  const timer = useRef(0);
  const saving = useRef(false);
  const again = useRef(false);
  const sig = JSON.stringify(tie.games);
  // New server data: take it for every game the host hasn't changed locally (keeps half-typed games).
  useEffect(() => {
    const next = live.current.games.map(draftOf);
    setDraft(d => d.map((g, i) => (gameKey(g) === gameKey(base.current[i]) ? next[i] : g)));
    base.current = next;
  }, [sig]);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!A || !B) return <TieCard state={state} tie={tie} />;

  const post = body => cupApi('/result', { method: 'PUT', body: { tie: tie.id, by: hostName(), ...body } });
  // Corrections that change the top 8, the seeding or a later knockout round come back with the list
  // of changes: show it and send again only if the host confirms.
  const confirmed = async body => {
    try {
      return await post(body);
    } catch (err) {
      if (err.data?.code !== 'CONFIRM') throw err;
      const ok = await confirm({ title: 'Confirm this correction', body: err.message, list: err.data.changes, okLabel: 'Apply the correction' });
      if (!ok) throw Object.assign(new Error('correction cancelled — the saved result is unchanged'), { cancelled: true });
      return post({ ...body, confirm: true });
    }
  };
  const payload = () => draftRef.current.map((g, i) => {
    const x = toGame(g);
    return x ? { ...x, w: ready(g) ? null : x.w } : live.current.games[i];
  });
  const save = async () => {
    clearTimeout(timer.current);
    if (saving.current) { again.current = true; return; }
    const games = payload();
    if (games.every((g, i) => gameKey(g) === gameKey(live.current.games[i]))) return;
    saving.current = true;
    setStatus('saving');
    try {
      await confirmed({ games, decider: live.current.decider });
      setStatus('saved');
    } catch (err) {
      if (err.status === 401) location.reload();
      setStatus({ error: err.message });
      if (err.cancelled || err.status === 400 || err.status === 409) {
        // Refused: show what is really saved again.
        base.current = live.current.games.map(draftOf);
        draftRef.current = base.current;
        setDraft(base.current);
        again.current = false;
      }
    } finally {
      saving.current = false;
      if (again.current) { again.current = false; save(); }
    }
  };
  const later = ms => { clearTimeout(timer.current); timer.current = setTimeout(save, ms); };
  const tap = (i, side) => {
    const won = toGame(draftRef.current[i])?.w ?? live.current.games[i].w;
    draftRef.current = draftRef.current.map((g, k) => (k === i ? { w: won === side ? null : side, sa: '', sb: '' } : g));
    setDraft(draftRef.current);
    later(0);
  };
  const type = (i, j, v) => {
    const val = v.replace(/\D/g, '').slice(0, 2);
    draftRef.current = draftRef.current.map((g, k) => (k !== i ? g : j === 0 ? { ...g, sa: val } : { ...g, sb: val }));
    setDraft(draftRef.current);
    later(1500); // phone keyboards: saves after a short pause even without leaving the box
  };
  const next = e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const all = [...e.currentTarget.closest('.tie-editor').querySelectorAll('input')];
    (all[all.indexOf(e.currentTarget) + 1] ?? e.currentTarget).focus();
    later(150);
  };

  const adultKnockout = Boolean(state.qualification) && tie.stage !== 'L';
  const send = (games, decider, deciderReason = null) => run(() => confirmed({ games, decider, deciderReason }));
  const decide = async side => {
    if (tie.decider === side) return send(tie.games, null);
    if (!adultKnockout) return send(tie.games, side);
    const name = teamOf(state, tie[side])?.name;
    const reason = await confirm({ title: `${name} wins this 3–3?`, body: 'Only when the points can’t decide it. Everyone will see the reason.', input: 'Reason (e.g. golden point, agreed by both captains)', okLabel: 'Record decision' });
    if (reason) send(tie.games, side, reason);
  };
  const pair = (T, g) => `${T.players[g[0]] || g[0]} & ${T.players[g[1]] || g[1]}`;
  // What the card shows right now: the draft (typed or tapped), not only what the server has.
  const shown = onScreen(tie, draft.map((g, i) => toGame(g) ?? tie.games[i]));
  return (
    <TieCard state={state} tie={shown}>
      <ol className="tie-editor">
        {GAMES.map((g, i) => {
          const r = shown.games[i];
          const level = filled(draft[i].sa) && filled(draft[i].sb) && Number(draft[i].sa) === Number(draft[i].sb);
          return (
            <li key={g.join()} className={level ? 'level' : undefined}>
              <b className="te-code">{g.join('/')}</b>
              {/* tabIndex -1: Tab / the keyboard's "next" goes score box to score box. */}
              <button type="button" tabIndex={-1} className={`te-side${r.w === 'a' ? ' on' : ''}`} onClick={() => tap(i, 'a')}>{pair(A, g)}</button>
              <span className="te-score">
                <input inputMode="numeric" enterKeyHint="next" value={draft[i].sa} aria-label={`${g.join('/')} ${A.name} points`} onChange={e => type(i, 0, e.target.value)} onBlur={() => later(150)} onKeyDown={next} />
                –
                <input inputMode="numeric" enterKeyHint="next" value={draft[i].sb} aria-label={`${g.join('/')} ${B.name} points`} onChange={e => type(i, 1, e.target.value)} onBlur={() => later(150)} onKeyDown={next} />
              </span>
              <button type="button" tabIndex={-1} className={`te-side${r.w === 'b' ? ' on' : ''}`} onClick={() => tap(i, 'b')}>{pair(B, g)}</button>
            </li>
          );
        })}
      </ol>
      {(tie.needsDecider || tie.decider) && (
        <div className="te-decider">
          <span>3–3 decider:</span>
          <button className={`chip${tie.decider === 'a' ? ' on' : ''}`} disabled={busy} onClick={() => decide('a')}>{A.name}</button>
          <button className={`chip${tie.decider === 'b' ? ' on' : ''}`} disabled={busy} onClick={() => decide('b')}>{B.name}</button>
        </div>
      )}
      <MatchFoot state={state} tie={shown} />
      <p className={`te-status${status?.error ? ' err' : ''}`} aria-live="polite">
        {status === 'saving' ? 'Saving…' : status === 'saved' ? '✓ Saved' : status?.error ? <>⚠ Not saved: {status.error} <button type="button" className="link" onClick={() => save()}>Try again</button></> : null}
      </p>
      <p className="hint">Tap the winning pair, or type the points (the winner follows the score; Enter jumps to the next box). {state.qualification ? 'Points rank the draws and equal winners and decide a knockout 3–3 — enter them whenever you can.' : ''}</p>
    </TieCard>
  );
  // Re-render only when this match, its teams or the host's busy state change (not on every update).
}, (p, n) => p.busy === n.busy && p.run === n.run && p.confirm === n.confirm && Boolean(p.state.qualification) === Boolean(n.state.qualification)
  && (p.tie === n.tie || JSON.stringify(p.tie) === JSON.stringify(n.tie))
  && JSON.stringify([teamOf(p.state, p.tie.a), teamOf(p.state, p.tie.b)]) === JSON.stringify([teamOf(n.state, n.tie.a), teamOf(n.state, n.tie.b)]));

function ResultsDesk({ state, run, busy, confirm }) {
  const q = state.qualification;
  const done = q ? q.complete : state.ties.filter(t => t.winner).length;
  return (
    <>
      <div className="desk-note results-head">
        <span>League results: <b>{done}/{q ? q.total : state.ties.length}</b> matches complete{q ? ' (all 6 games have a winner)' : ''}</span>
        <HostName />
      </div>
      <TieList state={state} title="Matches · enter results" render={t => <TieEditor key={t.id} state={state} tie={t} run={run} busy={busy} confirm={confirm} />} />
    </>
  );
}

// Adults: the quarter-final line-up comes from the final league standings (never hand-picked).
// Teams level on games and points where it matters are decided here, with a reason.
function TieDecision({ state, group, run, busy }) {
  const nameOf = k => teamOf(state, k)?.name ?? k;
  const [order, setOrder] = useState(group.teams);
  const [reason, setReason] = useState(group.reason ?? '');
  const [open, setOpen] = useState(!group.resolved);
  const move = (i, d) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setOrder(next);
  };
  const where = group.kind === 'cut' ? `ranks ${group.from}–${group.to}: the top-${ADULT_FORMAT.qualifiers} cut` : `ranks ${group.from}–${group.to}: seeding`;
  return (
    <div className={`tie-decision${group.resolved ? ' done' : ''}`}>
      <p><b>{group.resolved ? '✅ Decided' : '⚠️ Level on games and points'}</b> ({where}){group.pointsMissing ? ' — some game points are missing; entering them may settle it' : ''}</p>
      {group.resolved && !open && (
        <p className="hint">
          Order: {group.teams.map(nameOf).join(' › ')} — “{group.reason}” ({group.by}, {new Date(group.at).toLocaleString()})
          {' '}<button type="button" className="link" onClick={() => setOpen(true)}>Change</button>
          {' '}<button type="button" className="link" disabled={busy} onClick={() => run(() => cupApi('/tiebreak', { method: 'POST', body: { teams: group.teams, clear: true, by: hostName() } }))}>Clear</button>
        </p>
      )}
      {open && (
        <>
          <ol className="seed-list">
            {order.map((k, i) => (
              <li key={k}>
                <b>{group.from + i}</b>
                <span>{nameOf(k)}</span>
                <button className="btn btn-small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button className="btn btn-small" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
              </li>
            ))}
          </ol>
          <div className="row-actions">
            <input value={reason} onChange={e => setReason(e.target.value)} maxLength={200} placeholder="Reason (shown to everyone)" aria-label="Reason for this order" />
            <button className="btn btn-primary" disabled={busy || reason.trim().length < 3} onClick={() => run(() => cupApi('/tiebreak', { method: 'POST', body: { teams: order, reason, by: hostName() } }))}>Save decision</button>
          </div>
        </>
      )}
    </div>
  );
}

function QualifyDesk({ state, run, busy, confirm }) {
  const q = state.qualification;
  const nameOf = k => (k ? teamOf(state, k)?.name : '—');
  const ranked = q.rows.filter(r => r.tier < 4).map(r => r.key);
  const top = q.top ?? ranked.slice(0, q.qualifiers);
  const decisions = q.tieGroups.filter(g => g.kind !== 'below');
  return (
    <section className="cup-card">
      <h2 className="card-title">🔒 Quarter-final line-up</h2>
      <p className="hint">
        {q.final
          ? (q.top ? 'All league matches are complete — the line-up below comes straight from the standings.' : 'All league matches are complete, but some teams are level — decide them below.')
          : `Provisional: ${q.complete} of ${q.total} league matches complete. The line-up is set from the standings once every match is complete.`}
      </p>
      {decisions.map(g => <TieDecision key={`${g.teams.join()}|${g.resolved}`} state={state} group={g} run={run} busy={busy} />)}
      {!q.top && <p className="hint">Preview — not final until every league match is complete and level teams are decided.</p>}
      <ol className="qf-preview">
        {ADULT_FORMAT.qfPairs.map(([x, y], i) => (
          <li key={i}><b>QF{i + 1}</b> <span>{ordinal(x)} {nameOf(top[x - 1])}</span> <i>vs</i> <span>{ordinal(y)} {nameOf(top[y - 1])}</span></li>
        ))}
      </ol>
      <div className="row-actions">
        <button
          className="btn btn-primary btn-big"
          disabled={busy || !q.top}
          onClick={async () => {
            if (await confirm({ title: 'Lock & reveal the quarter-finals?', body: 'Everyone sees the line-up now. You can unlock it again until a quarter-final has a result.', okLabel: '🔒 Lock & reveal' })) {
              run(() => cupApi('/seed', { method: 'POST', body: { by: hostName() } }));
            }
          }}
        >🔒 Lock &amp; reveal the quarter-finals</button>
      </div>
    </section>
  );
}

// Every score change and decision: who, when, before → after (host only).
const gamesText = games => (games ?? []).map(g => (g.sa != null && g.sb != null ? `${g.sa}-${g.sb}` : g.w ? (g.w === 'a' ? 'W·' : '·W') : '—')).join('  ');
function ScoreLog({ state }) {
  const [log, setLog] = useState(null);
  const [error, setError] = useState('');
  const load = () => cupApi('/admin').then(d => { setLog(d.audit ?? []); setError(''); }, e => setError(e.message));
  useEffect(() => { if (log) load(); }, [state.lastChangeAt]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="cup-card">
      <h2 className="card-title">📝 Score log</h2>
      {!log ? <button className="btn" onClick={load}>Show every score change</button> : (
        <ol className="score-log">
          {log.length === 0 && <li className="hint">No changes yet.</li>}
          {log.map((e, i) => (
            <li key={i}>
              <small>{new Date(e.at).toLocaleString()} · {e.by}</small>
              {e.kind === 'result' && <span><b>{e.label}</b> ({e.a} vs {e.b}): {e.before ? gamesText(e.before.games) : 'empty'} → {e.after ? gamesText(e.after.games) : 'cleared'}{e.reason ? ` · host decision: ${e.reason}` : ''}</span>}
              {e.kind === 'tiebreak' && <span><b>Level teams decided</b>: {e.teams.join(' › ')} — “{e.reason}”</span>}
              {e.kind === 'tiebreak-cleared' && <span><b>Decision cleared</b>: {e.teams.join(', ')}</span>}
              {e.kind === 'lock' && <span><b>Knockout locked</b>: {e.seeds.join(', ')}</span>}
              {e.kind === 'unlock' && <span><b>Knockout unlocked</b></span>}
              {e.changes?.length > 0 && <ul>{e.changes.map(c => <li key={c}>{c}</li>)}</ul>}
            </li>
          ))}
        </ol>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function SeedDesk({ state, run, busy, confirm }) {
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
          onClick={async () => {
            if (undecided > 0 && !(await confirm({ title: 'Lock the knockout anyway?', body: `${undecided} league ${undecided === 1 ? 'match is' : 'matches are'} not decided yet (a 3–3 needs points or a decider tap).`, okLabel: '🔒 Lock' }))) return;
            run(() => cupApi('/seed', { method: 'POST', body: { seeds: order } }));
          }}
        >🔒 Lock &amp; reveal the knockout</button>
        {touched && <button className="btn" onClick={() => { setTouched(false); setOrder(fromTable()); }}>Reset to standings</button>}
      </div>
    </section>
  );
}

function KnockoutDesk({ state, run, busy, confirm }) {
  const any = state.knockout.ties.some(t => t.played || t.decider);
  return (
    <>
      <Bracket state={state} />
      <section className="cup-section">
        <h2 className="section-title">Knockout · enter results</h2>
        <div className="tie-grid">
          {state.knockout.ties.map(t => <TieEditor key={t.id} state={state} tie={t} run={run} busy={busy} confirm={confirm} />)}
        </div>
        {!any && (
          <button className="btn" disabled={busy} onClick={async () => { if (await confirm({ title: 'Unlock the knockout line-up?', body: 'You can then change it and lock it again.', okLabel: '🔓 Unlock' })) run(() => cupApi('/unseed', { method: 'POST', body: { by: hostName() } })); }}>
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

function Tools({ state, run, busy, confirm }) {
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const running = Boolean(state.current);
  const fresh = state.phase === 'setup';
  // Typed confirmation (in-page): a stray tap during the live event must never wipe the drawn
  // matches. The result shows right here, not only in the banner at the top of the page.
  const restart = async () => {
    setMsg('');
    const ok = await confirm({
      title: 'Restart the match draw?',
      body: 'Every drawn match and result is cleared. Teams, logos and settings stay. Everyone watching sees a fresh draw.',
      word: 'RESTART',
      okLabel: '↺ Restart now',
    });
    if (!ok) return;
    const r = await run(async () => {
      try {
        return await cupApi('/new', { method: 'POST', body: { keepTeams: true } });
      } catch (err) {
        setMsg(`❌ Not restarted: ${err.message}`);
        throw err;
      }
    });
    if (r) setMsg('✅ Restarted — same teams, nothing drawn. Load the final teams if the warning at the top says so, then open the arena when ready.');
  };
  const startNew = async () => {
    setMsg('');
    const ok = await confirm({ title: 'Start a new, EMPTY match draw?', body: 'No teams. Everyone will see the new one. The current draw stays in the database.', word: 'NEW', okLabel: 'Start new' });
    if (ok && await run(() => cupApi('/new', { method: 'POST', body: { name: name || state.name } }))) setMsg('✅ New empty draw started.');
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
        {msg && <p className="restart-msg" role="status">{msg}</p>}
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
          startNew();
        }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={state.name} maxLength={100} aria-label="Name of the new match draw" />
          <button className="btn" disabled={busy || running}>Start new</button>
        </form>
      </details>
      {state.phase !== 'setup' && <TeamsGrid state={state} />}
    </section>
  );
}
