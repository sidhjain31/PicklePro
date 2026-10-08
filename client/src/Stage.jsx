import { useEffect, useRef, useState } from 'react';

const SPEED = 16; // rows per second at full spin
const VISIBLE = 3; // rows rendered either side of the centre line
const mod = (a, n) => ((a % n) + n) % n;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Slot-machine reel. Spins until the server's result arrives, then eases out so the winner
// stops exactly on the centre line. Purely visual: the winner is given, never chosen here.
function Reel({ names, phase, winner, onLanded }) {
  const n = names.length;
  const start = Math.max(0, names.indexOf(winner));
  const [pos, setPos] = useState(start);
  const motion = useRef({ pos: start });
  const landed = useRef(onLanded);
  landed.current = onLanded;

  useEffect(() => {
    if (phase !== 'spinning' && phase !== 'landing') return;
    const m = motion.current;
    const target = names.indexOf(winner);
    if (reducedMotion()) {
      if (phase === 'landing') {
        setPos((m.pos = target));
        landed.current?.();
      }
      return;
    }
    let plan = null;
    let hold;
    if (phase === 'landing') {
      // Travel at least one second's worth of rows, ending on the winner. Duration is set so
      // the ease-out starts at roughly the spinning speed (cubic ease: v0 = 3D/L).
      const base = Math.ceil(m.pos + SPEED);
      const distance = base + mod(target - base, n) - m.pos;
      plan = { from: m.pos, distance, ms: Math.min(5500, Math.max(2500, (3 * distance * 1000) / SPEED)), t0: performance.now() };
      // A timer, not the frame loop, ends the reveal: frames pause in background tabs.
      hold = setTimeout(() => landed.current?.(), plan.ms + 500);
    }
    let raf;
    let last = performance.now();
    const tick = now => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (plan) {
        const t = Math.min(1, (now - plan.t0) / plan.ms);
        m.pos = plan.from + plan.distance * (1 - (1 - t) ** 3);
      } else {
        m.pos += SPEED * dt;
      }
      setPos(m.pos);
      if (!plan || now - plan.t0 < plan.ms) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hold);
    };
  }, [phase, names, winner, n]);

  const shown = phase === 'done' && names.includes(winner) ? names.indexOf(winner) : pos;
  const base = Math.floor(shown);
  const frac = shown - base;
  const rows = [];
  for (let k = -VISIBLE; k <= VISIBLE; k++) {
    const offset = k - frac;
    const isCentre = Math.abs(offset) < 0.5;
    rows.push(
      <li key={k} className={isCentre && phase === 'done' ? 'winner' : undefined} style={{ transform: `translateY(${offset * 100}%)` }}>
        {names[mod(base + k, n)]}
      </li>,
    );
  }
  return (
    <div className={`reel reel-${phase}`} aria-hidden="true">
      <ul>{rows}</ul>
    </div>
  );
}

export function Stage({ state, show, finish, children }) {
  if (!state) {
    return (
      <section className="stage stage-quiet">
        <p className="stage-title">Connecting…</p>
      </section>
    );
  }
  const label = key => state.categories.find(c => c.key === key)?.label ?? key;

  if (state.status === 'DRAFT') {
    return (
      <section className="stage stage-quiet">
        <p className="eyebrow">Coming up</p>
        <h2 className="stage-title">The draw starts soon</h2>
        <p className="stage-note">Keep this page open. It updates live, no refresh needed.</p>
        {children}
      </section>
    );
  }

  if (show) {
    const isShuffle = show.mode === 'shuffle';
    const first = show.teamNumbers[0];
    const lastTeam = show.teamNumbers.at(-1);
    const winner = show.assignments?.[0]?.name;
    const done = show.phase === 'done';
    return (
      <section className="stage">
        <div className="stage-head">
          <p className="eyebrow">{label(show.category)} draw</p>
          <p className="eyebrow">{done ? show.candidates.length - show.teamNumbers.length : show.candidates.length} left</p>
        </div>
        <h2 className="stage-title">
          {isShuffle ? `Teams ${first}–${lastTeam}` : `Team ${first}`}
        </h2>
        <Reel key={show.actionId} names={show.candidates} phase={show.phase} winner={winner} onLanded={() => finish(show.actionId)} />
        <div className="result" aria-live="polite">
          {!done && <p className="stage-note">{isShuffle ? 'Shuffling…' : show.phase === 'spinning' ? 'Spinning…' : 'Slowing down…'}</p>}
          {done && !isShuffle && (
            <p className="result-line">
              <strong>{winner}</strong>
              <span className="arrow" aria-hidden="true">→</span>
              <span className="badge">Team {first}</span>
            </p>
          )}
          {done && isShuffle && <p className="result-line"><span className="badge">All {show.teamNumbers.length} teams have their {label(show.category)} player</span></p>}
        </div>
        {children}
      </section>
    );
  }

  const current = state.categories.find(c => c.key === state.current);
  const last = state.last && state.last.category === state.current ? state.last : null;
  return (
    <section className="stage">
      {state.status === 'COMPLETED' ? (
        <>
          <p className="eyebrow">Final</p>
          <h2 className="stage-title">Draw complete</h2>
          <p className="stage-note">All {state.teamCount} teams are set. See every team below.</p>
        </>
      ) : (
        <>
          <div className="stage-head">
            <p className="eyebrow">{current?.label} draw</p>
            <p className="eyebrow">{state.remaining.length} left</p>
          </div>
          <h2 className="stage-title">
            {state.currentTeam ? (state.mode === 'shuffle' ? `Teams 1–${state.teamCount}` : `Team ${state.currentTeam}`) : `All ${state.teamCount} teams filled`}
          </h2>
          {state.remaining.length > 0 && <Reel key={`idle-${state.current}`} names={state.remaining} phase="idle" />}
          <div className="result">
            {last && last.mode === 'spin' ? (
              <p className="stage-note">Last draw: <strong>{last.assignments[0].name}</strong> → Team {last.assignments[0].teamNumber}</p>
            ) : (
              <p className="stage-note">{state.currentTeam ? (state.mode === 'shuffle' ? 'Waiting for the host to shuffle.' : 'Up next. Waiting for the host to spin.') : `Waiting for the host to lock in ${current?.label}.`}</p>
            )}
          </div>
        </>
      )}
      {children}
    </section>
  );
}
