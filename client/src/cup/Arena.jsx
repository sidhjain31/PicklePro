// The Arena: every team not yet drawn is a tile. For each match a weapon is announced, a
// crosshair hunts across the tiles (faster and faster as the reveal nears), locks on, and the
// weapon strikes the team the server revealed — twice — then the two teams collide in a VERSUS
// screen. The server decides and reveals; this only stages it, in sync on every screen because
// all timing comes from the server's clock.
import { useCallback, useEffect, useRef, useState } from 'react';
import * as sound from '../sound.js';
import { StageTools } from '../Stage.jsx';
import { TIMING } from './core.js';
import * as fx from './fx.js';
import { WEAPON_INFO } from './fx.js';
import { splitName, teamOf } from './live.js';
import { Versus } from './Versus.jsx';

const ACTIVE = new Set(['intro', 'aimA', 'strikeA', 'aimB', 'strikeB', 'fate', 'clash', 'vs']);
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function Arena({ state, serverNow, mode = 'audience', onShow, openedAt }) {
  const rootRef = useRef(null);
  const xhRef = useRef(null);
  const tiles = useRef(new Map());
  const xhPos = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [ui, setUiRaw] = useState(null);
  const [marks, setMarks] = useState({});
  const [minimised, setMinimised] = useState(false);
  const [opening, setOpening] = useState(false);
  const [vsClosed, setVsClosed] = useState(false);
  const setUi = useCallback(next => {
    setUiRaw(next);
    onShow?.(next);
  }, [onShow]);

  // ---------- DOM helpers (no React re-render while things move) ----------
  const localCenter = useCallback(key => {
    const el = tiles.current.get(key);
    const root = rootRef.current;
    if (!el || !root) return null;
    const r = el.getBoundingClientRect();
    const o = root.getBoundingClientRect();
    return { x: r.left - o.left + r.width / 2, y: r.top - o.top + r.height / 2 };
  }, []);
  const viewCenter = useCallback(key => {
    const r = tiles.current.get(key)?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, []);
  const placeXh = useCallback((x, y) => {
    xhPos.current = { x, y };
    if (xhRef.current) xhRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);
  const setScan = useCallback(key => {
    tiles.current.forEach((el, k) => el.classList.toggle('scan', k === key));
  }, []);

  // ---------- The director: one run per match, keyed by the draw ----------
  const cur = state?.current;
  const runKey = cur ? `${state.id}:${cur.seq}` : null;
  useEffect(() => {
    if (!runKey) {
      // No show running (or one was interrupted, e.g. reconnect): back to the idle arena.
      setUi(null);
      setMarks({});
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
      return s?.ties.find(t => t.seq === seq) ?? null;
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
    // Tiles the crosshair may visit: not yet drawn (from this screen's point of view).
    const marked = new Set();
    const liveKeys = () => (stateRef.current?.teams ?? [])
      .filter(t => (!t.tie || t.tie === info.tie) && !marked.has(t.key) && tiles.current.has(t.key))
      .map(t => t.key);

    const glide = (to, ms) => new Promise(resolve => {
      const from = xhPos.current ?? to;
      const t0 = performance.now();
      const step = now => {
        if (dead) return resolve();
        const k = Math.min(1, (now - t0) / ms);
        const e = easeInOut(k);
        placeXh(lerp(from.x, to.x, e), lerp(from.y, to.y, e));
        if (k < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    // Crosshair roams tile to tile; hops get quicker and the heartbeat faster towards `until`.
    const hunt = until => {
      const xh = xhRef.current;
      xh?.classList.add('on');
      xh?.classList.remove('locked');
      const beat = sound.heartbeat();
      const start = serverNow();
      let from = xhPos.current;
      let to = null;
      let key = null;
      let segStart = 0;
      let segDur = 600;
      let raf = 0;
      let stopped = false;
      if (!from) {
        const root = rootRef.current;
        from = { x: (root?.clientWidth ?? 300) / 2, y: (root?.clientHeight ?? 300) / 2 };
        placeXh(from.x, from.y);
      }
      const step = now => {
        if (stopped) return;
        const prog = Math.min(1, Math.max(0, (serverNow() - start) / Math.max(800, until - start)));
        if (!to || now - segStart >= segDur) {
          if (to) {
            from = to;
            setScan(key);
            sound.scanTick();
          }
          const keys = liveKeys().filter(k => k !== key);
          key = keys[Math.floor(Math.random() * keys.length)] ?? key;
          to = localCenter(key) ?? from;
          segStart = now;
          segDur = lerp(760, 210, prog ** 1.2);
          beat.setRate(72 + prog * 110);
        }
        const k = easeInOut(Math.min(1, (now - segStart) / segDur));
        placeXh(lerp(from.x, to.x, k), lerp(from.y, to.y, k));
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      const stop = () => {
        stopped = true;
        cancelAnimationFrame(raf);
        beat.stop();
        setScan(null);
      };
      stops.push(stop);
      return stop;
    };

    const mark = (key, side) => {
      marked.add(key);
      setMarks(m => ({ ...m, [key]: side }));
    };

    const strikeAt = async (key, side) => {
      const el = tiles.current.get(key);
      const to = localCenter(key);
      if (to && !reduced()) await glide(to, 380);
      if (dead) return;
      xhRef.current?.classList.add('locked');
      el?.classList.add('locked');
      sound.lockOn();
      await sleep(340);
      if (dead) return;
      const c = viewCenter(key);
      await fx.strike(info.weapon, {
        tx: c?.x ?? innerWidth / 2,
        ty: c?.y ?? innerHeight / 2,
        side,
        shakeEl: rootRef.current,
        onImpact: () => {
          xhRef.current?.classList.remove('on', 'locked');
          el?.classList.remove('locked');
          mark(key, side);
        },
      });
    };

    (async () => {
      setMarks({});
      setVsClosed(false);
      setMinimised(false);
      const elapsed = serverNow() - c0.startAt;
      const live = elapsed < TIMING.introMs - 250;
      let a = pairNow()?.a ?? null;
      let b = pairNow()?.b ?? null;
      if (live) {
        setUi({ ...info, phase: 'intro', a: null, b: null });
        sound.riser(1100);
        setTimeout(() => !dead && sound.slam(0.9), 380);
        await sleep(TIMING.introMs - elapsed);
        if (dead) return;
      }

      if (c0.last) {
        // The last two: no hunt — fate links them with lightning, then they collide.
        const two = liveKeys();
        if (!(a && b) || live) {
          setUi({ ...info, phase: 'fate', a: null, b: null });
          two.forEach(k => tiles.current.get(k)?.classList.add('fated'));
          const stopArcs = fx.arcBetween(() => two.map(viewCenter));
          stops.push(stopArcs);
          a = await waitSide('a');
          b = await waitSide('b');
          stopArcs();
          two.forEach(k => tiles.current.get(k)?.classList.remove('fated'));
          if (dead) return;
        }
        mark(a, 'a');
        mark(b, 'b');
        if (serverNow() - c0.revealB < TIMING.strikeMs) {
          setUi({ ...info, phase: 'clash', a, b });
          const p = viewCenter(a);
          const q = viewCenter(b);
          if (p && q) {
            fx.bolt(p.x, p.y, q.x, q.y, { ms: 500, width: 4, branches: 4, color: '#d8b4ff' });
            fx.ring((p.x + q.x) / 2, (p.y + q.y) / 2, { color: '#d8b4ff', r: 180, width: 8 });
          }
          fx.flash('#f3e8ff', 360, 0.85);
          fx.shake(rootRef.current, 14, 520);
          sound.thunder();
          await sleep(Math.max(600, c0.revealB + TIMING.strikeMs - serverNow()));
        }
      } else {
        // First team.
        if (!a) {
          setUi({ ...info, phase: 'aimA', a: null, b: null });
          const stop = hunt(c0.revealA);
          a = await waitSide('a');
          stop();
          if (dead) return;
        }
        if (serverNow() - c0.revealA < TIMING.strikeMs) {
          setUi({ ...info, phase: 'strikeA', a, b: null });
          await strikeAt(a, 'a');
          if (dead) return;
        } else mark(a, 'a');
        // Second team.
        b = pairNow()?.b ?? null;
        if (!b) {
          setUi({ ...info, phase: 'aimB', a, b: null });
          const stop = hunt(c0.revealB);
          b = await waitSide('b');
          stop();
          if (dead) return;
        }
        if (serverNow() - c0.revealB < TIMING.strikeMs) {
          setUi({ ...info, phase: 'strikeB', a, b });
          await strikeAt(b, 'b');
          if (dead) return;
          await sleep(Math.min(700, c0.revealB + TIMING.strikeMs - serverNow()));
        } else mark(b, 'b');
      }
      if (dead) return;
      xhRef.current?.classList.remove('on', 'locked');

      const left = c0.doneAt - serverNow();
      if (left > 1500) {
        setUi({ ...info, phase: 'vs', a, b, vsMs: left });
        await sleep(left);
        if (dead) return;
      }
      setUi({ ...info, phase: 'done', a, b });
      setMarks({});
      await sleep(400);
      if (!dead) setUi(null);
    })();

    return () => {
      dead = true;
      stops.forEach(fn => fn());
      xhRef.current?.classList.remove('on', 'locked');
      tiles.current.forEach(el => el.classList.remove('scan', 'locked', 'fated'));
    };
  }, [runKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The moment the host opens the arena (seen live on this screen): every tile flies in.
  useEffect(() => {
    const at = openedAt?.current ?? 0;
    if (!at || Date.now() - at > 2500) return undefined;
    setOpening(true);
    sound.arenaOpen();
    const t = setTimeout(() => setOpening(false), 3200);
    return () => clearTimeout(t);
  }, [openedAt]);

  if (!state) return null;
  const phase = ui?.phase ?? 'idle';
  const info = WEAPON_INFO[ui?.weapon] ?? null;
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
    intro: `${info?.emoji ?? ''} ${info?.name ?? ''}`,
    aimA: `${info?.emoji ?? ''} Hunting the first team…`,
    strikeA: 'Locked on!',
    aimB: `${A?.name ?? 'They'} ${A?.name?.endsWith('s') ? 'are' : 'is'} in — who will face them?`,
    strikeB: 'Locked on!',
    fate: 'Only two teams left… fate has decided',
    clash: 'Fated rivals!',
    vs: "It's on!",
    done: "It's on!",
  }[phase];

  return (
    <section
      ref={rootRef}
      className={`arena arena-${mode} phase-${phase}${ui ? ` w-${ui.weapon}` : ''}${theatre ? ' theatre' : ''}${opening ? ' opening' : ''}`}
      aria-label="Match draw arena"
    >
      <div className="arena-bg" aria-hidden="true"><i className="beam beam-1" /><i className="beam beam-2" /><i className="floor" /></div>
      <header className="arena-hud">
        <div className="hud-count">
          <span>Match</span>
          <b>{ui ? ui.tie : Math.min(state.nextTie, total)}</b>
          <span>of {total}</span>
        </div>
        <p className="hud-msg" aria-live="polite">{opening ? 'Let the draw begin!' : message}</p>
        <div className="hud-tools">
          {mode === 'audience' && <StageTools />}
          {theatre && <button type="button" className="btn btn-small hud-min" onClick={() => setMinimised(true)} aria-label="Minimise the show">✕</button>}
        </div>
      </header>
      <div className="hud-progress" aria-hidden="true"><i style={{ width: `${(drawn / Math.max(1, total)) * 100}%` }} /></div>

      <div className={`arena-grid n-${state.teams.length > 16 ? 'many' : state.teams.length > 6 ? 'some' : 'few'}`}>
        {state.teams.map((t, i) => {
          const side = marks[t.key];
          const inShow = ui && ACTIVE.has(phase) && t.tie === ui.tie;
          const ghost = Boolean(t.tie) && !side && !inShow;
          const { kicker, big } = splitName(t.name);
          return (
            <div
              key={t.key}
              ref={el => (el ? tiles.current.set(t.key, el) : tiles.current.delete(t.key))}
              className={`tile${ghost ? ' ghost' : ''}${side ? ` hit hit-${side}` : ''}`}
              style={{ '--i': i, '--fx': `${((i * 73) % 200) - 100}vw`, '--fy': `${((i * 151) % 160) - 80}vh`, '--fr': `${((i * 47) % 140) - 70}deg` }}
            >
              {kicker && <span className="tile-kicker">{kicker}</span>}
              <span className={`tile-name${big.length > 9 ? ' long' : ''}`}>{big}</span>
              <span className="tile-cap">{t.players.A}</span>
              {ghost && <span className="tile-tie">M{t.tie}</span>}
              {side && <Mark weapon={ui?.weapon} side={side} />}
            </div>
          );
        })}
      </div>

      <div ref={xhRef} className={`xh${ui ? ` xh-${ui.weapon}` : ''}`} aria-hidden="true">
        <i className="xh-ring" /><i className="xh-ring xh-ring-2" /><i className="xh-cross" /><b className="xh-label">LOCKED</b>
      </div>

      {phase === 'intro' && info && (
        <div className="arena-intro" role="status">
          <p className="ai-match">Match {ui.tie} <span>of {ui.total}</span></p>
          <div className="ai-emoji" aria-hidden="true">{info.emoji}</div>
          <h3 className="ai-name">{info.name}</h3>
          <p className="ai-line">{info.line}</p>
        </div>
      )}
      {(phase === 'aimB' || phase === 'strikeB') && A && (
        <div className="arena-waiting" role="status"><i /> <b>{A.name}</b> awaits a rival…</div>
      )}
      {opening && (
        <div className="arena-intro arena-open" role="status">
          <div className="ai-emoji" aria-hidden="true">🏟️</div>
          <h3 className="ai-name">Let the draw begin</h3>
          <p className="ai-line">{state.teams.length} teams · {total} matches</p>
        </div>
      )}
      {phase === 'vs' && A && B && !vsClosed && (
        <Versus
          state={state}
          a={A}
          b={B}
          title={`Match ${ui.tie}`}
          court={((ui.tie - 1) % (state.courts || 2)) + 1}
          ms={ui.vsMs}
          onClose={() => setVsClosed(true)}
        />
      )}
    </section>
  );
}

// What stays on a hit tile: the dart / arrow stuck in it, a scorch, a ball, a spark.
function Mark({ weapon, side }) {
  if (weapon === 'dart') {
    return (
      <svg className={`mark mark-dart mark-${side}`} viewBox="0 0 64 64" aria-hidden="true">
        <g transform="rotate(-40 32 32)">
          <rect x="20" y="30" width="14" height="5" rx="1" fill="#2b3646" />
          <rect x="34" y="31.4" width="10" height="2.2" fill="#0f2a6b" />
          <path d="M44 32.5 L58 22 L61 22 L54 32.5 L61 43 L58 43 Z" fill="#6cc04a" />
          <path d="M20 32.5 L12 31.2 L12 33.8 Z" fill="#e8eef5" />
        </g>
      </svg>
    );
  }
  if (weapon === 'arrow') {
    return (
      <svg className={`mark mark-arrow mark-${side}`} viewBox="0 0 120 40" aria-hidden="true">
        <rect x="22" y="18.6" width="78" height="2.8" fill="#8a5a2b" />
        <path d="M100 20 L114 11 L119 11 L108 20 L119 29 L114 29 Z" fill="#e8442e" />
        <path d="M22 20 L30 15 L30 25 Z" fill="#d9dee6" />
      </svg>
    );
  }
  return <span className={`mark mark-${weapon ?? 'hit'} mark-${side}`} aria-hidden="true" />;
}
