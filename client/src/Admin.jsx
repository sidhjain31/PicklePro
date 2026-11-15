import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { apiBase, pageUrl } from './event.js';
import { DrawSwitch } from './DrawSwitch.jsx';
import { FloatingReactions } from './Audience.jsx';
import { downloadGallery } from './gallery.js';
import { downloadReport } from './report.js';
import { Board } from './Board.jsx';
import { ConnectionBanner, Header, Steps } from './Live.jsx';
import { ResumeSoundPrompt, Stage } from './Stage.jsx';
import { useLive } from './useLive.js';
import { ModuleNav } from './ModuleNav.jsx';

// Labels come from the server per event (letters A–D: main D = W1 women; kids A = B1, B = G1, C = B2, D = G2).
const labelOf = (data, key) => data.pools.find(p => p.key === key)?.label ?? data.available.find(c => c.key === key)?.label ?? key;
const toNames = text => text.split('\n').map(s => s.trim()).filter(Boolean);

export function Admin() {
  const [admin, setAdmin] = useState(null);
  const logout = useCallback(() => setAdmin(false), []);
  useEffect(() => {
    api('/auth/me').then(r => setAdmin(r.admin), () => setAdmin(false));
  }, []);
  if (admin === null) return <Waking />;
  return admin ? <Dashboard onLogout={logout} /> : <Login onLogin={() => setAdmin(true)} />;
}

// Render's free tier sleeps after 15 idle minutes and takes up to a minute to wake.
export function Waking() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 2500);
    return () => clearTimeout(timer);
  }, []);
  return (
    <main className="login">
      <div className="card" role="status">
        <p className="eyebrow">Team draw</p>
        <h1>Connecting…</h1>
        {slow && <p className="hint">The server is waking up. This can take up to a minute — keep this page open.</p>}
      </div>
    </main>
  );
}

export function Login({ onLogin, title = 'Team draw' }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/login', { method: 'POST', body: { password: new FormData(e.target).get('password') } });
      onLogin();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <main className="login">
      <form className="card" onSubmit={submit}>
        <p className="eyebrow">{title}</p>
        <h1>Host login</h1>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required autoFocus />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
    </main>
  );
}

function Dashboard({ onLogout }) {
  const { state, connected, show, finish, onReaction, announce } = useLive('host');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(
    () => api('/admin').then(setData, err => (err.status === 401 ? onLogout() : setError(err.message))),
    [onLogout],
  );
  useEffect(() => {
    refresh();
  }, [state, refresh]);

  const run = async fn => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      if (err.status === 401) onLogout();
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const logout = () => run(async () => {
    await api('/auth/logout', { method: 'POST' });
    onLogout();
  });

  const ctx = { state, data, run, busy, refresh };
  return (
    <>
      <ModuleNav current="auction" host />
      <Header state={state} connected={connected}>
        <a className="btn btn-small" href={pageUrl('/auction')} target="_blank" rel="noreferrer">Audience view</a>
        <a className="btn btn-small" href={pageUrl('/auction/tv')} target="_blank" rel="noreferrer">TV view</a>
        <button className="btn btn-small" onClick={logout}>Log out</button>
      </Header>
      <DrawSwitch />
      <ConnectionBanner connected={connected} />
      {error && (
        <div className="alert" role="alert">
          <p>{error}</p>
          <button className="btn btn-small" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}
      {!state || !data ? (
        <Waking />
      ) : state.status === 'DRAFT' ? (
        <>
          <Setup {...ctx} />
          <section className="admin-extras">
            <Archive state={state} />
          </section>
        </>
      ) : (
        <>
          <Steps state={state} />
          <main className="layout">
            <Stage state={state} show={show} finish={finish} announce={announce} showSeal>
              <Controls {...ctx} show={show} connected={connected} />
            </Stage>
            <Board state={state} show={show} />
          </main>
          <FloatingReactions onReaction={onReaction} />
          <ResumeSoundPrompt />
          <section className="admin-extras">
            <UpcomingLists {...ctx} />
            <PlayerContacts {...ctx} />
            <History history={data.history} />
            <Archive state={state} />
            <NewTournament {...ctx} />
          </section>
        </>
      )}
    </>
  );
}

function Controls({ state, data, run, busy, show, connected }) {
  if (state.status === 'COMPLETED') {
    return (
      <div className="controls">
        <button className="btn btn-spin" disabled={busy} onClick={() => run(() => downloadReport(state, { details: data?.details }))}>Download PDF report</button>
        <div className="controls-row">
          <button className="btn btn-small" disabled={busy} onClick={() => run(() => downloadGallery(state))}>Teams gallery image</button>
          <a className="btn btn-small" href={`${apiBase()}/export.xlsx`}>Export Excel</a>
        </div>
      </div>
    );
  }
  const cat = state.categories.find(c => c.key === state.current);
  const animating = Boolean(show && show.phase !== 'done') || Boolean(state.pending);
  const needed = cat.needed ?? state.teamCount;
  const notReady = cat.ready === undefined ? cat.players !== needed : !cat.ready; // server's own rule
  const filled = !state.currentTeam && !state.pending;
  const canUndo = state.last && state.last.category === state.current && !animating;
  const reason = !connected
    ? 'Reconnecting. Draws are paused until the connection is back.'
    : notReady
      ? `${cat.label} needs ${needed} players in its list (has ${cat.players}). Fix the list below before drawing.`
      : filled
        ? `All ${state.teamCount} teams have their ${cat.label} player. Finalize to lock them in.`
        : null;

  const drawNext = () => run(() => api('/draw', { method: 'POST', body: { category: state.current, team: state.currentTeam } }));
  const undo = () => {
    const what = state.last.mode === 'shuffle'
      ? `the whole ${cat.label} shuffle`
      : `${state.last.assignments[0].name} → Team ${state.last.assignments[0].teamNumber}`;
    if (prompt(`Undo ${what}? Everyone watching will see it removed.\n\nType UNDO to confirm.`)?.trim().toUpperCase() !== 'UNDO') return;
    run(() => api('/undo', { method: 'POST', body: { actionId: state.last.actionId } }));
  };
  const finalize = () => {
    if (!confirm(`Finalize ${cat.label}? Its ${state.teamCount} picks are locked for good.`)) return;
    run(() => api('/finalize', { method: 'POST', body: { category: state.current } }));
  };

  return (
    <div className="controls">
      {filled ? (
        <button className="btn btn-spin" disabled={busy || animating || !connected} onClick={finalize}>Finalize {cat.label}</button>
      ) : (
        <button className="btn btn-spin" disabled={busy || animating || notReady || !connected} onClick={drawNext}>
          {animating ? 'Drawing…' : state.mode === 'shuffle' ? `Shuffle ${cat.label} players` : `Spin for Team ${state.currentTeam}`}
        </button>
      )}
      {reason && <p className="controls-note">{reason}</p>}
      <div className="controls-row">
        <button className="btn btn-small" disabled={busy || !canUndo || !connected} onClick={undo}>Undo last draw</button>
        <a className="btn btn-small" href={`${apiBase()}/export.xlsx`}>Export Excel</a>
        <button className="btn btn-small" disabled={busy} onClick={() => run(() => downloadReport(state, { details: data?.details }))}>PDF report</button>
      </div>
      {data.history.length === 0 && <p className="controls-note">Spin results are saved the moment they're drawn.</p>}
      <PredictionSwitch state={state} run={run} busy={busy} />
    </div>
  );
}

// Audience "Predict the pick" on/off. Off hides it on phones and the server refuses new guesses;
// existing guesses and the leaderboard are kept.
function PredictionSwitch({ state, run, busy }) {
  const on = state.predictions !== false;
  return (
    <div className="host-setting">
      <label className="check">
        <input type="checkbox" checked={on} disabled={busy} onChange={e => run(() => api('/tournament', { method: 'PATCH', body: { predictions: e.target.checked } }))} />
        Audience predictions {on ? 'open' : 'closed'}
      </label>
      <span className="hint">{on ? 'Phones can predict each pick.' : 'Hidden on phones; past predictions and the leaderboard are kept.'}</span>
    </div>
  );
}

function Setup({ state, data, run, busy, refresh }) {
  const enabled = state.categories.map(c => c.key);
  const ALL = data.available.map(c => c.key);
  const LABELS = Object.fromEntries(data.available.map(c => [c.key, c.label]));
  const [order, setOrder] = useState(() => [...enabled, ...ALL.filter(k => !enabled.includes(k))]);
  const [on, setOn] = useState(() => new Set(enabled));
  const [name, setName] = useState(state.name);
  const [seconds, setSeconds] = useState(state.spinMs / 1000);
  const [dirtyLists, setDirtyLists] = useState(false);

  const move = (i, delta) => setOrder(o => {
    const next = [...o];
    [next[i], next[i + delta]] = [next[i + delta], next[i]];
    return next;
  });
  const toggle = key => setOn(s => {
    const next = new Set(s);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  const saveSettings = e => {
    e.preventDefault();
    run(() => api('/tournament', {
      method: 'PATCH',
      body: { name, spinMs: Math.round(Number(seconds) * 1000), ...(data.fixed ? {} : { categories: order.filter(k => on.has(k)) }) },
    }));
  };
  const settingsDirty = name !== state.name
    || Number(seconds) * 1000 !== state.spinMs
    || (!data.fixed && order.filter(k => on.has(k)).join() !== enabled.join());
  const first = state.categories[0];
  const startBlock = settingsDirty || dirtyLists
    ? 'Save your changes first.'
    : first.players !== (first.needed ?? state.teamCount)
      ? `${first.label} needs exactly ${first.needed ?? state.teamCount} players (has ${first.players}).`
      : null;
  const start = () => {
    if (!confirm(`Start the draw? Categories and their order are locked from here, and the audience sees the ${first.label} draw next.`)) return;
    run(() => api('/start', { method: 'POST' }));
  };

  return (
    <main className="setup">
      <form className="card" onSubmit={saveSettings}>
        <h2>Tournament</h2>
        <label>
          Name
          <input value={name} maxLength={100} onChange={e => setName(e.target.value)} required />
        </label>
        <label>
          Spin length (seconds)
          <input type="number" min="1" max="30" step="0.5" value={seconds} onChange={e => setSeconds(e.target.value)} required />
        </label>
        {data.fixed ? (
          <div className="fixed-format">
            <p className="legend">Draw format ({state.teamCount} teams)</p>
            <ol>
              {state.categories.map(c => <li key={c.key}>{c.label}{c.shuffle && <span className="hint"> · shuffled in one go</span>}</li>)}
            </ol>
            <p className="hint">Each team gets one player from each list: A = B1 (shuffled onto all teams at once), B = G1, C = B2, D = G2 — drawn in that order. 4 names per list.</p>
          </div>
        ) : (
        <fieldset>
          <legend>Categories, in draw order</legend>
          <ol className="cat-order">
            {order.map((key, i) => (
              <li key={key}>
                <label className="check">
                  <input type="checkbox" checked={on.has(key)} onChange={() => toggle(key)} />
                  {LABELS[key]}
                  {data.available.find(c => c.key === key)?.shuffle && <span className="hint">shuffled in one go</span>}
                </label>
                <button type="button" className="icon-btn" aria-label={`Move ${LABELS[key]} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="icon-btn" aria-label={`Move ${LABELS[key]} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
              </li>
            ))}
          </ol>
        </fieldset>
        )}
        <button className="btn btn-primary" disabled={busy || !settingsDirty || on.size === 0}>Save settings</button>
      </form>

      <PlayerLists categories={[...new Set(data.pools.filter(p => p.needed).map(p => p.key))]} state={state} data={data} run={run} busy={busy} refresh={refresh} onDirty={setDirtyLists} />

      <div className="card start-card">
        <h2>Ready?</h2>
        <ul className="readiness">
          {data.pools.filter(p => p.needed).map(p => {
            const n = data.lists[p.key]?.length ?? 0;
            return (
              <li key={p.key} className={n === p.needed ? 'ok' : 'bad'}>
                {p.label}: {n}/{p.needed} players
              </li>
            );
          })}
        </ul>
        {startBlock && <p className="controls-note">{startBlock}</p>}
        <button className="btn btn-primary btn-big" disabled={busy || Boolean(startBlock)} onClick={start}>Start draw</button>
        <p className="hint">Other categories can still be edited until their first spin.</p>
      </div>
    </main>
  );
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

// Ages and contact numbers (for the PDF): fix one player, or reload them from the organisers'
// Excel files. Works at any time, even after the draw, and never changes teams.
function PlayerContacts({ data, run, busy, refresh }) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const all = Object.values(data.lists ?? {}).flat();
  const pick = value => {
    setName(value);
    const d = data.details?.[value];
    if (d) { setAge(d.age ?? ''); setPhone(d.phone ?? ''); }
  };
  const save = () => run(async () => {
    const r = await api('/players/details', { method: 'PUT', body: { details: { [name]: { age, phone } } } });
    setNote(r.updated ? `Saved ${name}.` : `No player called "${name}".`);
    await refresh();
  });
  const fromFile = file => run(async () => {
    const { details } = await api('/players/import', { method: 'POST', body: { filename: file.name, data: await readBase64(file) } });
    if (!details) throw new Error('That file has no AGE / CONTACT NUMBER columns.');
    const r = await api('/players/details', { method: 'PUT', body: { details } });
    setNote(`Updated ages / numbers for ${r.updated} players from ${file.name}.`);
    await refresh();
  });
  return (
    <section className="card">
      <h2>Ages &amp; phone numbers (PDF)</h2>
      <p className="hint">{Object.keys(data.details ?? {}).length} of {all.length} players have an age or number. They appear only in the PDF and Excel, never on screens.</p>
      <label className="btn btn-small">
        Load from Excel file
        <input type="file" accept=".xlsx,.csv" hidden disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) fromFile(f); }} />
      </label>
      <div className="contact-edit">
        <input list="contact-names" placeholder="Player name" value={name} onChange={e => pick(e.target.value)} />
        <datalist id="contact-names">{all.map(n => <option key={n} value={n} />)}</datalist>
        <input placeholder="Age" value={age} onChange={e => setAge(e.target.value)} style={{ width: '5em' }} />
        <input placeholder="Phone number" value={phone} onChange={e => setPhone(e.target.value)} />
        <button className="btn btn-small" disabled={busy || !name} onClick={save}>Save</button>
      </div>
      {note && <p className="hint">{note}</p>}
    </section>
  );
}

function PlayerLists({ categories, state, data, run, busy, refresh, onDirty }) {
  const [drafts, setDrafts] = useState({});
  const [details, setDetails] = useState({}); // name -> { age, phone } from an imported spreadsheet
  const [note, setNote] = useState('');
  const dirty = Object.keys(drafts).length > 0;
  useEffect(() => onDirty?.(dirty), [dirty, onDirty]);
  if (!categories.length) return null;

  const text = key => drafts[key] ?? data.lists[key].join('\n');
  const save = () => run(async () => {
    await api('/players', { method: 'PUT', body: { lists: Object.fromEntries(Object.keys(drafts).map(k => [k, toNames(drafts[k])])), details } });
    await refresh();
    setDrafts({});
    setNote('Players saved.');
  });
  const importFile = e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    run(async () => {
      const { lists, details: imported } = await api('/players/import', { method: 'POST', body: { filename: file.name, data: await readBase64(file) } });
      if (imported) setDetails(d => ({ ...d, ...imported }));
      const usable = Object.keys(lists).filter(k => categories.includes(k));
      if (!usable.length) throw new Error(`None of the file's columns match these lists: ${categories.map(k => labelOf(data, k)).join(', ')}.`);
      setDrafts(d => ({ ...d, ...Object.fromEntries(usable.map(k => [k, lists[k].join('\n')])) }));
      setNote(`Imported ${usable.map(k => `${labelOf(data, k)} (${lists[k].length})`).join(', ')}. Check the lists, then save.`);
    });
  };

  return (
    <section className="card lists-card">
      <div className="card-head">
        <h2>Players</h2>
        <label className="btn btn-small file-btn">
          Import .xlsx / .csv
          <input type="file" accept=".xlsx,.csv" onChange={importFile} disabled={busy} />
        </label>
      </div>
      <p className="hint">One name per line. In a spreadsheet, put the list names ({data.pools.map(p => p.label).join(', ')}) in the first row and names below.</p>
      <div className="lists">
        {categories.map(key => {
          const count = toNames(text(key)).length;
          const locked = !data.editable[key];
          const need = data.pools.find(p => p.key === key)?.needed ?? state.teamCount;
          return (
            <label key={key} className="list">
              <span className="list-head">
                {labelOf(data, key)}
                <span className={count === need ? 'count ok' : 'count bad'}>{count}/{need}</span>
              </span>
              <textarea
                value={text(key)}
                readOnly={locked}
                rows={12}
                spellCheck={false}
                onChange={e => setDrafts(d => ({ ...d, [key]: e.target.value }))}
              />
              {locked && <span className="hint">Locked: drawing has started.</span>}
            </label>
          );
        })}
      </div>
      {note && <p className="hint" role="status">{note}</p>}
      <div className="controls-row">
        <button className="btn btn-primary" disabled={busy || !dirty} onClick={save}>Save players</button>
        {dirty && <button className="btn btn-small" onClick={() => { setDrafts({}); setNote(''); }}>Discard changes</button>}
      </div>
    </section>
  );
}

function UpcomingLists(ctx) {
  const editable = ctx.data.pools.filter(p => p.needed && ctx.data.editable[p.key]).map(p => p.key);
  if (!editable.length || ctx.state.status !== 'LIVE') return null;
  return (
    <details className="panel">
      <summary>Edit players for categories not yet drawn</summary>
      <PlayerLists categories={editable} {...ctx} />
    </details>
  );
}

function History({ history }) {
  return (
    <details className="panel">
      <summary>Draw history ({history.length})</summary>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>#</th><th>Time</th><th>Category</th><th>Player</th><th>Team</th><th>Status</th></tr>
          </thead>
          <tbody>
            {history.toReversed().map(h => (
              <tr key={h.eventId} className={h.voided ? 'voided' : undefined}>
                <td>{h.sequence}</td>
                <td>{new Date(h.at).toLocaleTimeString()}</td>
                <td>{h.category}</td>
                <td>{h.player}</td>
                <td>{h.teamNumber}</td>
                <td>{h.voided ? 'Undone' : 'Final'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const STATUS = { DRAFT: 'Not started', LIVE: 'Stopped mid-draw', COMPLETED: 'Complete' };

// Earlier tournaments (rehearsals, past events). Read-only: the host can only export them.
function Archive({ state }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/tournaments').then(all => setList(all.filter(t => !t.active)), err => setError(err.message));
  }, [state?.id]);
  if (!error && !list?.length) return null;
  return (
    <details className="panel">
      <summary>Past tournaments{list ? ` (${list.length})` : ''}</summary>
      <div className="card table-wrap">
        {error ? <p className="error" role="alert">{error}</p> : (
          <table>
            <thead>
              <tr><th>Name</th><th>Created</th><th>Status</th><th>Draws</th><th /></tr>
            </thead>
            <tbody>
              {list.map(t => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{new Date(t.createdAt).toLocaleString()}</td>
                  <td>{STATUS[t.status]}</td>
                  <td>{t.draws}/{t.teamCount * t.categories.length}</td>
                  <td><a className="btn btn-small" href={`${apiBase()}/export.xlsx?tournament=${t.id}`}>Export Excel</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  );
}

function NewTournament({ run, busy }) {
  const [name, setName] = useState('');
  const create = e => {
    e.preventDefault();
    if (!confirm(`Create "${name}"? Every screen switches to it. Export this draw to Excel first if you need it.`)) return;
    run(async () => {
      await api('/tournaments', { method: 'POST', body: { name } });
      setName('');
    });
  };
  return (
    <details className="panel">
      <summary>Start a new tournament</summary>
      <form className="card" onSubmit={create}>
        <p className="hint">Use this after a rehearsal. The current draw stays saved in the database, but screens switch to the new one.</p>
        <label>
          New tournament name
          <input value={name} onChange={e => setName(e.target.value)} maxLength={100} required />
        </label>
        <button className="btn btn-danger" disabled={busy}>Create new tournament</button>
      </form>
    </details>
  );
}
