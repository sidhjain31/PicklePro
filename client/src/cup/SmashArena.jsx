// Smash Arena: the 3D match-draw show (stage3d.js) with its on-screen captions. Runs one show per
// match, in step with the server's reveal times. Falls back to the 2D arena when WebGL is missing,
// the 3D library can't load or the GPU drops the context — the draw itself never depends on it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as sfx from './sfx.js';
import { StageTools } from '../Stage.jsx';
import { Arena } from './Arena.jsx';
import { TIMING } from './core.js';
import { teamOf } from './live.js';
import { SHOTS, colorOf, logoFor } from './looks.jsx';
import { Versus } from './Versus.jsx';

const ACTIVE = new Set(['intro', 'aimA', 'strikeA', 'aimB', 'strikeB', 'fate', 'clash', 'collide', 'vs']);

function webgl() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
const coarse = () => window.matchMedia?.('(pointer: coarse)').matches;

// Each viewer chooses for their own device: background music, and the crowd (murmur + cheers).
export function MusicToggle() {
  const [music, setMusic] = useState(sfx.musicOn);
  const [crowd, setCrowd] = useState(sfx.crowdOn);
  useEffect(() => sfx.onMusicChange(setMusic), []);
  useEffect(() => sfx.onCrowdChange(setCrowd), []);
  return (
    <>
      <button type="button" className={`btn btn-small music-toggle${music ? '' : ' off'}`} aria-pressed={music} onClick={() => sfx.setMusic(!music)} title={music ? 'Music on — tap to turn off' : 'Music off — tap to turn on'} aria-label={music ? 'Music on' : 'Music off'}>
        <span aria-hidden="true">🎵</span><span className="mt-label"> Music {music ? 'on' : 'off'}</span>
      </button>
      <button type="button" className={`btn btn-small music-toggle${crowd ? '' : ' off'}`} aria-pressed={crowd} onClick={() => sfx.setCrowd(!crowd)} title={crowd ? 'Crowd on — tap to turn off' : 'Crowd off — tap to turn on'} aria-label={crowd ? 'Crowd on' : 'Crowd off'}>
        <span aria-hidden="true">👥</span><span className="mt-label"> Crowd {crowd ? 'on' : 'off'}</span>
      </button>
    </>
  );
}

export function SmashArena(props) {
  const [mode3d, setMode3d] = useState(() => webgl() && !new URLSearchParams(location.search).has('2d'));
  const fail = useCallback(() => setMode3d(false), []);
  return mode3d ? <Smash3D {...props} onFail={fail} /> : <Arena {...props} />;
}

function Smash3D({ state, serverNow, mode = 'audience', onShow, openedAt, onFail }) {
  const rootRef = useRef(null);
  const holderRef = useRef(null);
  const stageRef = useRef(null);
  const readyRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [loaded, setLoaded] = useState(false);
  const [ui, setUiRaw] = useState(null);
  const [minimised, setMinimised] = useState(false);
  const [opening, setOpening] = useState(false);
  const [vsClosed, setVsClosed] = useState(false);
  // The page only needs to know which match is on and when it ends, so it re-renders twice per
  // match instead of at every step of the show.
  const shownKey = useRef('none');
  const setUi = useCallback(next => {
    setUiRaw(next);
    if (typeof next === 'function') return;
    const key = next ? `${next.seq}:${next.phase === 'done'}` : 'none';
    if (key === shownKey.current) return;
    shownKey.current = key;
    onShow?.(next);
  }, [onShow]);

  // Load the 3D engine once (big library, separate chunk).
  useEffect(() => {
    let stage = null;
    let dead = false;
    readyRef.current = import('./stage3d.js')
      .then(m => (dead || !holderRef.current ? null : m.createStage(holderRef.current, { low: coarse(), onLost: onFail })))
      .then(s => {
        if (!s) return null;
        if (dead) { s.dispose(); return null; }
        stage = s;
        stageRef.current = s;
        if (import.meta.env.DEV) window.__cupStage = s;
        setLoaded(true);
        return s;
      })
      .catch(err => {
        console.error('3D arena unavailable, using 2D', err);
        if (!dead) onFail();
        return null;
      });
    return () => {
      dead = true;
      stage?.dispose();
      stageRef.current = null;
    };
  }, [onFail]);

  // Music (and the crowd during the hunt) while the arena is on screen (only with sound on).
  useEffect(() => {
    sfx.beds(true);
    return () => sfx.beds(false);
  }, []);

  // Team looks for the crests.
  const [logos, setLogos] = useState({});
  const teams = state?.teams;
  useEffect(() => {
    let alive = true;
    if (!teams) return undefined;
    Promise.all(teams.map((t, i) => logoFor(t, i).then(u => [t.key, u]))).then(pairs => alive && setLogos(Object.fromEntries(pairs)));
    return () => { alive = false; };
  }, [teams]);

  // Which crests stand on the court: every team not yet drawn, plus the pair of the running show.
  const showTie = ui && ACTIVE.has(ui.phase) ? ui.tie : null;
  const live = useMemo(() => (teams ?? []).filter(t => !t.tie || t.tie === showTie).map(t => t.key), [teams, showTie]);
  const liveSig = live.join();
  const looksSig = (teams ?? []).map(t => `${t.key}:${t.color}:${logos[t.key]?.length ?? 0}`).join();
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !teams) return;
    const rise = Boolean(openedAt?.current && Date.now() - openedAt.current < 2500);
    stage.sync(teams.map((t, i) => ({ key: t.key, name: t.name, color: colorOf(t, i), logoUrl: logos[t.key] ?? null })), live, { rise });
  }, [loaded, liveSig, looksSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // The host opened the arena while this screen watched: crests rise, camera swoops in.
  useEffect(() => {
    if (!loaded) return undefined;
    const at = openedAt?.current ?? 0;
    if (!at || Date.now() - at > 2500) return undefined;
    setOpening(true);
    sfx.arenaOpen();
    stageRef.current?.opening();
    const t = setTimeout(() => setOpening(false), 3400);
    return () => clearTimeout(t);
  }, [loaded, openedAt]);

  // ---------- The director: one run per match ----------
  const cur = state?.current;
  const runKey = cur ? `${state.id}:${cur.seq}` : null;
  useEffect(() => {
    if (!runKey) {
      setUi(null);
      return undefined;
    }
    const c0 = stateRef.current.current;
    const seq = c0.seq;
    const info = { seq, tie: c0.tie, weapon: c0.weapon, last: c0.last, total: stateRef.current.totalTies };
    let dead = false;
    const stops = [];
    const sleep = ms => new Promise(resolve => {
      const id = setTimeout(resolve, Math.max(0, ms));
      stops.push(() => clearTimeout(id));
    });
    const pairNow = () => {
      const s = stateRef.current;
      if (s?.current?.seq === seq) return s.current;
      return s?.ties.find(x => x.seq === seq) ?? null;
    };
    const waitSide = side => new Promise(resolve => {
      const tick = () => {
        if (dead) return;
        const v = pairNow()?.[side];
        if (v) resolve(v);
        else {
          const id = setTimeout(tick, 50);
          stops.push(() => clearTimeout(id));
        }
      };
      tick();
    });
    (async () => {
      setVsClosed(false);
      setMinimised(false);
      const stage = await readyRef.current;
      if (dead || !stage) return;
      const shot = SHOTS[info.weapon] ?? SHOTS.fireball;
      const elapsed = serverNow() - c0.startAt;
      const fresh = elapsed < TIMING.introMs - 250;
      let a = pairNow()?.a ?? null;
      let b = pairNow()?.b ?? null;
      stage.jumbo(`MATCH ${info.tie} OF ${info.total}`, shot.name.toUpperCase());
      if (fresh) {
        setUi({ ...info, phase: 'intro' });
        sfx.title();
        await sleep(TIMING.introMs - elapsed);
        if (dead) return;
      }
      const strikeFresh = at => serverNow() - at < TIMING.strikeMs - 400;
      if (c0.last) {
        if (!(a && b) || fresh) {
          setUi({ ...info, phase: 'fate' });
          const two = (stateRef.current?.teams ?? []).filter(t => !t.tie || t.tie === info.tie).map(t => t.key);
          const stop = stage.fate(two);
          stops.push(stop);
          a = await waitSide('a');
          b = await waitSide('b');
          stop();
          if (dead) return;
        }
        if (strikeFresh(c0.revealB)) {
          setUi({ ...info, phase: 'clash', a, b });
          await stage.clashFate(a, b, () => !dead && setUi(u => ({ ...u, reveal: 'both' })));
        } else {
          stage.place(a, 'a');
          stage.place(b, 'b');
        }
      } else {
        if (!a) {
          setUi({ ...info, phase: 'aimA' });
          const stop = stage.hunt(c0.revealA, serverNow);
          stops.push(stop);
          a = await waitSide('a');
          stop();
          if (dead) return;
        }
        if (strikeFresh(c0.revealA)) {
          setUi({ ...info, phase: 'strikeA', a });
          await stage.strike(a, 'a', info.weapon, () => !dead && setUi(u => ({ ...u, reveal: 'a' })));
        } else stage.place(a, 'a');
        if (dead) return;
        b = pairNow()?.b ?? null;
        if (!b) {
          setUi({ ...info, phase: 'aimB', a });
          const stop = stage.hunt(c0.revealB, serverNow, [a]);
          stops.push(stop);
          b = await waitSide('b');
          stop();
          if (dead) return;
        }
        if (strikeFresh(c0.revealB)) {
          setUi({ ...info, phase: 'strikeB', a, b });
          await stage.strike(b, 'b', info.weapon, () => !dead && setUi(u => ({ ...u, reveal: 'b' })));
        } else stage.place(b, 'b');
      }
      if (dead) return;
      let left = c0.doneAt - serverNow();
      if (left > 2400) {
        setUi({ ...info, phase: 'collide', a, b });
        await stage.collide();
        if (dead) return;
        left = c0.doneAt - serverNow();
        setUi({ ...info, phase: 'vs', a, b, vsMs: left });
        // The VERSUS screen covers the arena: stop drawing 3D underneath it.
        sleep(450).then(() => !dead && stage.pause(true));
        await sleep(left);
        if (dead) return;
      }
      stage.pause(false);
      stage.finish();
      setUi({ ...info, phase: 'done', a, b });
      await sleep(350);
      if (!dead) setUi(null);
    })();
    return () => {
      dead = true;
      stops.forEach(fn => fn());
      stageRef.current?.pause(false);
      stageRef.current?.finish();
    };
  }, [runKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return null;
  const phase = ui?.phase ?? 'idle';
  const shot = SHOTS[ui?.weapon] ?? null;
  const theatre = mode !== 'host' && ACTIVE.has(phase) && !minimised;
  const A = teamOf(state, ui?.a);
  const B = teamOf(state, ui?.b);
  const total = state.totalTies;
  const drawn = state.ties.filter(t => !(ui && ACTIVE.has(phase) && t.seq === ui.seq)).length;
  const message = {
    // (The instant a draw arrives, nextTie already counts it: name the running match instead.)
    idle: state.current ? `Match ${state.current.tie} of ${total}…`
      : state.phase === 'draw'
        ? (mode === 'host' ? `Ready for match ${state.nextTie} of ${total}` : `Waiting for match ${state.nextTie} of ${total}…`)
        : 'Every team has a match!',
    intro: shot ? `${shot.emoji} ${shot.name}` : '',
    aimA: 'The spotlight is hunting…',
    strikeA: 'Locked on — SMASH!',
    aimB: A ? `${A.name} ${A.name.endsWith('s') ? 'are' : 'is'} in — who faces them?` : 'Who is next?',
    strikeB: 'Locked on — SMASH!',
    fate: 'Only two teams left… fate decides',
    clash: 'Fated rivals!',
    collide: "It's on!",
    vs: "It's on!",
    done: "It's on!",
  }[phase];
  const revealTeam = ui?.reveal === 'a' ? A : ui?.reveal === 'b' ? B : null;
  return (
    <section
      ref={rootRef}
      className={`arena arena3d arena-${mode} phase-${phase}${theatre ? ' theatre' : ''}${opening ? ' opening' : ''}`}
      aria-label="Smash Arena — live match draw"
    >
      <div ref={holderRef} className="stage3d" />
      {!loaded && <div className="stage3d-loading" role="status"><span className="spinner" /> Building the arena…</div>}
      <header className="arena-hud">
        <div className="hud-count">
          <span>Match</span>
          <b>{ui ? ui.tie : Math.min(state.nextTie, total)}</b>
          <span>of {total}</span>
        </div>
        <p className="hud-msg" aria-live="polite">{opening ? 'Let the draw begin!' : message}</p>
        <div className="hud-tools">
          {mode === 'audience' && <StageTools />}
          {mode !== 'host' && <MusicToggle />}
          {theatre && <button type="button" className="btn btn-small hud-min" onClick={() => setMinimised(true)} aria-label="Minimise the show">✕</button>}
        </div>
      </header>
      <div className="hud-progress" aria-hidden="true"><i style={{ width: `${(drawn / Math.max(1, total)) * 100}%` }} /></div>

      {phase === 'intro' && shot && (
        <div className="arena-intro arena-intro-3d" role="status">
          <p className="ai-match">Match {ui.tie} <span>of {ui.total}</span></p>
          <div className="ai-emoji" aria-hidden="true">{shot.emoji}</div>
          <h3 className="ai-name">{shot.name}</h3>
          <p className="ai-line">{shot.line}</p>
        </div>
      )}
      {opening && (
        <div className="arena-intro arena-intro-3d arena-open" role="status">
          <h3 className="ai-name">Let the draw begin</h3>
          <p className="ai-line">{state.teams.length} teams · {total} matches</p>
        </div>
      )}
      {revealTeam && (phase === 'strikeA' || phase === 'strikeB') && (
        <div className={`reveal-name reveal-${ui.reveal}`} style={{ '--tc': colorOf(revealTeam) }} role="status" key={`${ui.seq}-${ui.reveal}`}>
          <b>{revealTeam.name}</b>
          <span>{ui.reveal === 'a' ? 'is in!' : 'will face them!'}</span>
        </div>
      )}
      {phase === 'vs' && A && B && !vsClosed && (
        <Versus
          a={A}
          b={B}
          title={`Match ${ui.tie}`}
          court={((ui.tie - 1) % (state.courts || 2)) + 1}
          ms={ui.vsMs}
          onClose={() => { setVsClosed(true); stageRef.current?.pause(false); }}
        />
      )}
    </section>
  );
}
