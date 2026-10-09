import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { CrowdMeter, FloatingReactions } from './Audience.jsx';
import { downloadGallery } from './gallery.js';
import { downloadReport } from './report.js';
import { Board } from './Board.jsx';
import { ConnectionBanner, Header, Steps } from './Live.jsx';
import { Stage } from './Stage.jsx';
import { useLive } from './useLive.js';

const LABELS = { A: 'A', WOMEN: 'Women', B: 'B', C: 'C', D: 'D' };
const ALL = Object.keys(LABELS);
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

function Login({ onLogin }) {
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
        <p className="eyebrow">Team draw</p>
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
  const { state, connected, show, finish, send, onReaction, crowd, announce } = useLive();
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
      <Header state={state} connected={connected}>
        <a className="btn btn-small" href="/" target="_blank" rel="noreferrer">Audience view</a>
        <a className="btn btn-small" href="/screen" target="_blank" rel="noreferrer">Big screen</a>
        <button className="btn btn-small" onClick={logout}>Log out</button>
      </Header>
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
              <CrowdMeter state={state} crowd={crowd} send={send} big />
              <Controls {...ctx} show={show} connected={connected} />
            </Stage>
            <Board state={state} show={show} />
          </main>
          <FloatingReactions onReaction={onReaction} />
          <section className="admin-extras">
            <UpcomingLists {...ctx} />
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
        <button className="btn btn-spin" disabled={busy} onClick={() => run(() => downloadReport(state))}>Download PDF report</button>
        <div className="controls-row">
          <button className="btn btn-small" disabled={busy} onClick={() => run(() => downloadGallery(state))}>Teams gallery image</button>
          <a className="btn btn-small" href="/api/export.xlsx">Export Excel</a>
        </div>
      </div>
    );
  }
  const cat = state.categories.find(c => c.key === state.current);
  const animating = Boolean(show && show.phase !== 'done') || Boolean(state.pending);
  const notReady = cat.players !== state.teamCount;
  const filled = !state.currentTeam && !state.pending;
  const canUndo = state.last && state.last.category === state.current && !animating;
  const reason = !connected
    ? 'Reconnecting. Draws are paused until the connection is back.'
    : notReady
      ? `${cat.label} has ${cat.players} of ${state.teamCount} players. Fix the list below before drawing.`
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
        <a className="btn btn-small" href="/api/export.xlsx">Export Excel</a>
        <button className="btn btn-small" disabled={busy} onClick={() => run(() => downloadReport(state))}>PDF report</button>
      </div>
      {data.history.length === 0 && <p className="controls-note">Spin results are saved the moment they're drawn.</p>}
      <CrowdSettings state={state} run={run} busy={busy} />
    </div>
  );
}

// Crowd spin: the audience's taps start the next draw (the server still picks the result).
function CrowdSettings({ state, run, busy }) {
  const [target, setTarget] = useState(state.crowd?.target ?? 50);
  const on = Boolean(state.crowd?.enabled);
  const save = enabled => run(() => api('/tournament', { method: 'PATCH', body: { crowdSpin: enabled, crowdTarget: Math.round(Number(target)) } }));
  return (
    <div className="crowd-settings">
      <label className="check">
        <input type="checkbox" checked={on} disabled={busy} onChange={e => save(e.target.checked)} />
        Crowd spin: audience taps start the next draw
      </label>
      <label className="crowd-target">
        Taps needed
        <input type="number" min="5" max="1000" value={target} onChange={e => setTarget(e.target.value)} />
        <button type="button" className="btn btn-small" disabled={busy || Number(target) === state.crowd?.target} onClick={() => save(on)}>Set</button>
      </label>
    </div>
  );
}

function Setup({ state, data, run, busy, refresh }) {
  const enabled = state.categories.map(c => c.key);
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
      body: { name, categories: order.filter(k => on.has(k)), spinMs: Math.round(Number(seconds) * 1000) },
    }));
  };
  const settingsDirty = name !== state.name
    || Number(seconds) * 1000 !== state.spinMs
    || order.filter(k => on.has(k)).join() !== enabled.join();
  const first = state.categories[0];
  const startBlock = settingsDirty || dirtyLists
    ? 'Save your changes first.'
    : first.players !== state.teamCount
      ? `${first.label} needs exactly ${state.teamCount} players (has ${first.players}).`
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
        <fieldset>
          <legend>Categories, in draw order</legend>
          <ol className="cat-order">
            {order.map((key, i) => (
              <li key={key}>
                <label className="check">
                  <input type="checkbox" checked={on.has(key)} onChange={() => toggle(key)} />
                  {LABELS[key]}
                  {key === 'A' && <span className="hint">shuffled in one go</span>}
                </label>
                <button type="button" className="icon-btn" aria-label={`Move ${LABELS[key]} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="icon-btn" aria-label={`Move ${LABELS[key]} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
              </li>
            ))}
          </ol>
        </fieldset>
        <button className="btn btn-primary" disabled={busy || !settingsDirty || on.size === 0}>Save settings</button>
      </form>

      <PlayerLists categories={enabled} state={state} data={data} run={run} busy={busy} refresh={refresh} onDirty={setDirtyLists} />

      <div className="card start-card">
        <h2>Ready?</h2>
        <ul className="readiness">
          {state.categories.map(c => (
            <li key={c.key} className={c.players === state.teamCount ? 'ok' : 'bad'}>
              {c.label}: {c.players}/{state.teamCount} players
            </li>
          ))}
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

function PlayerLists({ categories, state, data, run, busy, refresh, onDirty }) {
  const [drafts, setDrafts] = useState({});
  const [note, setNote] = useState('');
  const dirty = Object.keys(drafts).length > 0;
  useEffect(() => onDirty?.(dirty), [dirty, onDirty]);
  if (!categories.length) return null;

  const text = key => drafts[key] ?? data.lists[key].join('\n');
  const save = () => run(async () => {
    await api('/players', { method: 'PUT', body: { lists: Object.fromEntries(Object.keys(drafts).map(k => [k, toNames(drafts[k])])) } });
    await refresh();
    setDrafts({});
    setNote('Players saved.');
  });
  const importFile = e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    run(async () => {
      const { lists } = await api('/players/import', { method: 'POST', body: { filename: file.name, data: await readBase64(file) } });
      const usable = Object.keys(lists).filter(k => categories.includes(k));
      if (!usable.length) throw new Error(`None of the file's columns match these categories: ${categories.map(k => LABELS[k]).join(', ')}.`);
      setDrafts(d => ({ ...d, ...Object.fromEntries(usable.map(k => [k, lists[k].join('\n')])) }));
      setNote(`Imported ${usable.map(k => `${LABELS[k]} (${lists[k].length})`).join(', ')}. Check the lists, then save.`);
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
      <p className="hint">One name per line. In a spreadsheet, put the category names (A, Women, B, C, D) in the first row and names below.</p>
      <div className="lists">
        {categories.map(key => {
          const count = toNames(text(key)).length;
          const locked = !data.editable[key];
          return (
            <label key={key} className="list">
              <span className="list-head">
                {LABELS[key]}
                <span className={count === state.teamCount ? 'count ok' : 'count bad'}>{count}/{state.teamCount}</span>
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
  const editable = ctx.state.categories.map(c => c.key).filter(k => ctx.data.editable[k]);
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
                  <td><a className="btn btn-small" href={`/api/export.xlsx?tournament=${t.id}`}>Export Excel</a></td>
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
