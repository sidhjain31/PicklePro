import { useCallback, useEffect, useRef, useState } from 'react';
import { Announce } from './Audience.jsx';
import { verify } from './fair.js';
import * as fx from './fx.js';

const SPEED = 16; // rows per second at full spin
const VISIBLE = 3; // rows rendered either side of the centre line
const mod = (a, n) => ((a % n) + n) % n;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Slot-machine reel. Spins until the server's result arrives, then eases out so the winner
// stops exactly on the centre line. Purely visual: the winner is given, never chosen here.
// Some spins "nearly" stop one name early, then creep onto the winner. Chosen from the draw's id
// so every screen plays the same tease; it only changes the animation, never the result.
const TEASE_MS = 1400;
const isTease = actionId => Boolean(actionId) && parseInt(actionId.replace(/-/g, '').slice(0, 6), 16) % 100 < 40;

function Reel({ names, phase, winner, onLanded, tease = false, onLandingStart }) {
  const n = names.length;
  const start = Math.max(0, names.indexOf(winner));
  const [pos, setPos] = useState(start);
  const motion = useRef({ pos: start });
  const landed = useRef(onLanded);
  landed.current = onLanded;
  const landingStart = useRef(onLandingStart);
  landingStart.current = onLandingStart;
  const [teasing, setTeasing] = useState(false);

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
    let teaseTimer;
    if (phase === 'landing') {
      // Travel at least one second's worth of rows, ending on the winner. Duration is set so
      // the ease-out starts at roughly the spinning speed (cubic ease: v0 = 3D/L).
      const base = Math.ceil(m.pos + SPEED);
      const distance = base + mod(target - base, n) - m.pos;
      plan = { from: m.pos, distance, ms: Math.min(5500, Math.max(2500, (3 * distance * 1000) / SPEED)), t0: performance.now() };
      plan.tease = tease && n > 2 ? 0.55 : 0;
      plan.total = plan.ms + (plan.tease ? TEASE_MS : 0);
      landingStart.current?.(plan.total);
      if (plan.tease) {
        teaseTimer = setTimeout(() => {
          setTeasing(true);
          fx.ohh();
        }, plan.ms);
      }
      // A timer, not the frame loop, ends the reveal: frames pause in background tabs.
      hold = setTimeout(() => landed.current?.(), plan.total + 500);
    }
    let raf;
    let last = performance.now();
    let lastRow = Math.floor(m.pos);
    let lastTick = 0;
    const tick = now => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (plan) {
        const elapsed = now - plan.t0;
        const main = plan.distance - plan.tease;
        if (elapsed < plan.ms) {
          const t = elapsed / plan.ms;
          m.pos = plan.from + main * (1 - (1 - t) ** 3);
        } else {
          // The tease: stalls just short of the line, then creeps over onto the winner.
          const t = Math.min(1, (elapsed - plan.ms) / TEASE_MS);
          const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          m.pos = plan.from + main + plan.tease * ease;
        }
      } else {
        m.pos += SPEED * dt;
      }
      // Click as each name crosses the line, so the slow-down is heard as well as seen.
      const row = Math.floor(m.pos + 0.5);
      if (row !== lastRow && now - lastTick > 45) {
        fx.tick();
        lastTick = now;
      }
      lastRow = row;
      setPos(m.pos);
      if (!plan || now - plan.t0 < plan.total) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hold);
      clearTimeout(teaseTimer);
    };
  }, [phase, names, winner, n, tease]);

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
    <div className={`machine machine-${phase}${teasing && phase === 'landing' ? ' machine-tease' : ''}`} aria-hidden="true">
      <Paddle side="left" />
      <div className={`reel reel-${phase}`}>
        <ul>{rows}</ul>
        <span className="pointer pointer-left" />
        <span className="pointer pointer-right" />
      </div>
      <Paddle side="right" />
      {(phase === 'spinning' || phase === 'landing') && <span className="rally-ball" />}
    </div>
  );
}

// A real pickleball paddle (face, edge guard, throat, wrapped grip), coloured like the logo's.
function Paddle({ side }) {
  const id = `paddle-${side}`;
  const [light, dark] = side === 'left' ? ['#3d82e6', '#173f97'] : ['#8bd660', '#3f8a26'];
  return (
    <svg className={`paddle paddle-${side}`} viewBox="0 0 64 170" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
      </defs>
      {/* handle + grip wrap */}
      <rect x="24" y="104" width="16" height="62" rx="6" fill="#1c2233" />
      {[112, 122, 132, 142, 152].map(y => <path key={y} d={`M24 ${y + 6} L40 ${y}`} stroke="#3a4560" strokeWidth="3" />)}
      <rect x="22" y="160" width="20" height="8" rx="3" fill="#0d1220" />
      {/* throat */}
      <path d="M22 100 Q32 112 42 100 L40 110 L24 110 Z" fill={dark} />
      {/* face with edge guard */}
      <rect x="3" y="3" width="58" height="102" rx="26" fill={`url(#${id})`} stroke="#0b1f52" strokeWidth="4" />
      <rect x="9" y="9" width="46" height="90" rx="21" fill="none" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="2" />
      <ellipse cx="22" cy="30" rx="9" ry="16" fill="#ffffff" opacity="0.18" />
    </svg>
  );
}

// Shows the sealed fingerprint while spinning, then checks it in this browser after the reveal.
function FairSeal({ show }) {
  const [verdict, setVerdict] = useState(null);
  const [open, setOpen] = useState(false);
  const done = show.phase === 'done';
  useEffect(() => {
    setVerdict(null);
    if (done) verify(show).then(setVerdict, () => setVerdict(null));
  }, [done, show]);
  if (!show.commitment) return null;
  const short = `${show.commitment.slice(0, 10)}…`;
  if (!done) return <p className="seal">🔒 Result sealed before the spin · <code>{short}</code></p>;
  if (verdict === null) return null;
  return (
    <div className={`seal seal-${verdict ? 'ok' : 'bad'}`}>
      <button type="button" className="seal-btn" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {verdict ? '✅ Verified fair' : '⚠️ Verification failed'} · <code>{short}</code>
      </button>
      {open && (
        <div className="seal-detail">
          <p>Before the spin, the server published this fingerprint (SHA-256) of the result and a secret key. After the reveal it published the key, and this screen re-computed the fingerprint{verdict ? ' — it matches, so the result was fixed before the spin and could not be changed.' : ' — it does NOT match.'}</p>
          <p><b>Fingerprint</b> <code>{show.commitment}</code></p>
          <p><b>Key</b> <code>{show.salt}</code></p>
          <p><b>Checked text</b> <code>PicklePro|v1|{show.actionId}|{show.category}|…|key</code></p>
        </div>
      )}
    </div>
  );
}

// While the reel spins: the crowd murmur swells, with a steady rally — or, when only a few
// names are left, a drumroll instead. All stop the moment the result lands.
function useSpinSounds(show, phase) {
  const spinning = phase === 'spinning';
  const active = spinning || phase === 'landing';
  const few = Boolean(show && show.mode === 'spin' && show.candidates.length <= 3);
  const id = show?.actionId;
  useEffect(() => {
    if (!active) return;
    return fx.crowdSwell(9000);
  }, [active, id]);
  useEffect(() => {
    if (!spinning) return;
    if (few) return fx.drumroll(15000);
    fx.pock();
    const timer = setInterval(fx.pock, 700);
    return () => clearInterval(timer);
  }, [spinning, few, id]);
}

// During the slow-down the rally speeds up and ends in a smash exactly as the reel stops.
function useLandingRally() {
  const stop = useRef(() => {});
  useEffect(() => () => stop.current(), []);
  return useCallback(ms => {
    stop.current();
    stop.current = fx.rallyToSmash(ms);
  }, []);
}

export const COUNTDOWN = 3;

// "3, 2, 1, GO!" over the machine before the reel moves. It only eats into the server's spin
// time (the result is still hidden on the server), so it never delays or changes the draw.
// Skipped for screens that joined mid-spin and for spins too short to fit it.
function useCountdown(show, spinMs) {
  const [count, setCount] = useState(null);
  const id = show?.live && show.phase !== 'done' && spinMs >= (COUNTDOWN + 1) * 1000 ? show.actionId : null;
  useEffect(() => {
    if (!id) return setCount(null);
    let n = COUNTDOWN;
    setCount(n);
    fx.beep(false);
    const timer = setInterval(() => {
      n -= 1;
      setCount(n);
      fx.beep(n === 0);
      if (n < 0) {
        clearInterval(timer);
        setCount(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [id]);
  return count === null || count < 0 ? null : count;
}

// The countdown, with every remaining name flashing past behind the number.
function Countdown({ count, names }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setI(x => x + 1), 110);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="countdown" role="status" aria-live="assertive">
      {names.length > 0 && <span className="flyby" aria-hidden="true">{names[i % names.length]}</span>}
      <span key={count} className="countdown-num">{count === 0 ? 'Go!' : count}</span>
    </div>
  );
}

// Celebrate once per draw, and only when this screen watched it land (not on a page load).
function useCelebration(show, ref) {
  const watched = useRef(new Set());
  const celebrated = useRef(new Set());
  useEffect(() => {
    if (!show) return;
    if (show.phase !== 'done') {
      watched.current.add(show.actionId);
      return;
    }
    if (!watched.current.has(show.actionId) || celebrated.current.has(show.actionId)) return;
    celebrated.current.add(show.actionId);
    if (show.mode === 'shuffle') fx.deal(show.teamNumbers.length);
    else fx.fanfare();
    fx.cheer();
    fx.confetti(ref.current);
  }, [show, ref]);
}

function SoundToggle() {
  const [on, setOn] = useState(fx.soundOn);
  const toggle = () => {
    fx.setSound(!on);
    setOn(!on);
    if (!on) fx.pock();
  };
  return (
    <button type="button" className="btn btn-small sound-toggle" aria-pressed={on} onClick={toggle}>
      {on ? '🔊 Sound on' : '🔇 Tap for sound'}
    </button>
  );
}

function Fullscreen() {
  if (!document.fullscreenEnabled) return null;
  const toggle = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  return <button type="button" className="btn btn-small" onClick={toggle}>⛶ Full screen</button>;
}

export function StageTools() {
  return (
    <div className="stage-tools">
      <SoundToggle />
      <Fullscreen />
    </div>
  );
}

// The A shuffle reveal: every team's card flips in, one after another, like a dealer.
function Deal({ assignments }) {
  return (
    <ol className="deal">
      {assignments.map((a, i) => (
        <li key={a.teamNumber} style={{ animationDelay: `${i * 90}ms` }}>
          <span className="deal-team">{a.teamNumber}</span>
          <span className="deal-name">{a.name}</span>
        </li>
      ))}
    </ol>
  );
}

// The team's A player leads it: shown as captain while the rest of the team is drawn.
function Captain({ state, category, team }) {
  const hasA = state.categories.some(c => c.key === 'A');
  const name = hasA && category !== 'A' && team ? state.teams[team - 1]?.players.A : null;
  if (!name) return null;
  return <p className="captain">🏓 Captain <b>{name}</b></p>;
}

// When the last category's pick lands, the whole team is complete: show it as one card.
function TeamComplete({ state, show, winner, team }) {
  if (show.category !== state.categories.at(-1)?.key) return null;
  const players = { ...state.teams[team - 1]?.players, [show.category]: winner };
  return (
    <div className="team-complete">
      <p className="team-complete-title">Team {team} complete!</p>
      <ul>
        {state.categories.map(c => (
          <li key={c.key}><span>{c.label}</span><b>{players[c.key] ?? '—'}</b></li>
        ))}
      </ul>
    </div>
  );
}

// The fairness seal is for the host (and the Excel audit trail); audience screens hide it.
export function Stage({ state, show, finish, children, big = false, announce = null, showSeal = false }) {
  const resultRef = useRef(null);
  const count = useCountdown(show, state?.spinMs ?? 0);
  // While counting down, the reel waits (even if the result already arrived) and then plays on.
  const phase = show && (count !== null ? 'countdown' : show.phase);
  useSpinSounds(show, phase);
  const startLandingRally = useLandingRally();
  useCelebration(show, resultRef);
  const cls = big ? ' stage-big' : '';

  if (!state) {
    return (
      <section className="stage stage-quiet">
        <img className="stage-logo" src="/logo.png" alt="" />
        <p className="stage-title">Connecting…</p>
        <p className="stage-note">If the draw server was asleep it can take up to a minute to wake. Keep this page open.</p>
      </section>
    );
  }
  const label = key => state.categories.find(c => c.key === key)?.label ?? key;

  if (state.status === 'DRAFT') {
    return (
      <section className={`stage stage-quiet${cls}`}>
        <img className="stage-logo" src="/logo.png" alt="" />
        <p className="eyebrow">Coming up</p>
        <h2 className="stage-title">The draw starts soon</h2>
        <p className="stage-note">Keep this page open. It updates live, no refresh needed.</p>
        <StageTools />
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
      <section className={`stage stage-live${done ? ' stage-done' : ''}${cls}`}>
        <Announce announce={announce} />
        <div className="stage-head">
          <p className="eyebrow">{label(show.category)} draw</p>
          <p className="eyebrow">{done ? show.candidates.length - show.teamNumbers.length : show.candidates.length} left</p>
        </div>
        <h2 className="stage-title">
          {isShuffle ? `Teams ${first}–${lastTeam}` : <>Team <span className="team-big">{first}</span></>}
        </h2>
        {!isShuffle && <Captain state={state} category={show.category} team={first} />}
        {!(done && isShuffle) && (
          <div className="machine-wrap">
            <Reel
              key={show.actionId}
              names={show.candidates}
              phase={phase === 'countdown' ? 'idle' : phase}
              winner={winner}
              tease={!isShuffle && isTease(show.actionId)}
              onLandingStart={isShuffle ? undefined : startLandingRally}
              onLanded={() => finish(show.actionId)}
            />
            {phase === 'countdown' && <Countdown count={count} names={show.candidates} />}
          </div>
        )}
        <div className="result" aria-live="polite" ref={resultRef}>
          {!done && (
            <p className="stage-note suspense">
              {phase === 'countdown' ? 'Get ready…' : isShuffle ? 'Shuffling all players…' : phase === 'spinning' ? 'Rally in progress…' : 'Here it comes…'}
            </p>
          )}
          {done && !isShuffle && (
            <div className="winner-card">
              <span className="smash">Smash!</span>
              <strong className="winner-name">{winner}</strong>
              <span className="badge">→ Team {first}</span>
            </div>
          )}
          {done && !isShuffle && <TeamComplete state={state} show={show} winner={winner} team={first} />}
          {done && isShuffle && (
            <>
              <p className="result-line"><span className="badge">All {show.teamNumbers.length} teams have their {label(show.category)} player</span></p>
              {show.assignments && <Deal assignments={show.assignments} />}
            </>
          )}
        </div>
        {showSeal && <FairSeal show={show} />}
        <StageTools />
        {children}
      </section>
    );
  }

  const current = state.categories.find(c => c.key === state.current);
  const last = state.last && state.last.category === state.current ? state.last : null;
  return (
    <section className={`stage${cls}`}>
      <Announce announce={announce} />
      {state.status === 'COMPLETED' ? (
        <>
          <img className="stage-logo" src="/logo.png" alt="" />
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
            {state.currentTeam
              ? (state.mode === 'shuffle' ? `Teams 1–${state.teamCount}` : <>Up next: Team <span className="team-big">{state.currentTeam}</span></>)
              : `All ${state.teamCount} teams filled`}
          </h2>
          {state.mode === 'spin' && <Captain state={state} category={state.current} team={state.currentTeam} />}
          {state.remaining.length > 0 && <Reel key={`idle-${state.current}`} names={state.remaining} phase="idle" />}
          <div className="result">
            {last && last.mode === 'spin' ? (
              <p className="stage-note">Last draw: <strong>{last.assignments[0].name}</strong> → Team {last.assignments[0].teamNumber}</p>
            ) : (
              <p className="stage-note">{state.currentTeam ? (state.mode === 'shuffle' ? 'Waiting for the host to shuffle.' : 'Waiting for the host to spin.') : `Waiting for the host to lock in ${current?.label}.`}</p>
            )}
          </div>
        </>
      )}
      <StageTools />
      {children}
    </section>
  );
}
