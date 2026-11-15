// Audience page of the match draw (the main link "/"; old /fixtures works): the arena show while matches are drawn, then
// live fixtures with results, standings, the knockout bracket and the champions.
import { useEffect, useMemo, useState } from 'react';
import { FloatingReactions, ReactionBar } from '../Audience.jsx';
import { BrandFooter, CreditStrip } from '../Brand.jsx';
import { useWakeLock } from '../Follow.jsx';
import { ConnectionBanner, Header } from '../Live.jsx';
import { ResumeSoundPrompt } from '../Stage.jsx';
import { useEvent } from '../event.js';
import { SmashArena } from './SmashArena.jsx';
import { Bracket, ChampionBanner, CupSteps, FindMatch, Standings, TeamsGrid, TieList } from './Boards.jsx';
import { cupUrl, switchCup, useCup } from './live.js';
import { Moments } from './Moments.jsx';

const SWITCH = [
  { key: 'main', label: 'Main', api: '/api/fixtures/state' },
  { key: 'kids', label: 'Kids', api: '/api/kids/fixtures/state' },
];
// Main / Kids match draw, plus a way back to the team auction. Badges refresh once a minute.
export function CupSwitch() {
  const ev = useEvent();
  const [phase, setPhase] = useState({});
  useEffect(() => {
    let alive = true;
    const load = () => Promise.all(SWITCH.map(d => fetch(d.api).then(r => r.json()).then(s => [d.key, s.phase], () => [d.key, null])))
      .then(pairs => alive && setPhase(Object.fromEntries(pairs)));
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return (
    <nav className="draw-switch cup-switch" aria-label="Choose match draw">
      {SWITCH.map(d => (
        <a
          key={d.key}
          href={cupUrl(location.pathname.replace(/^\/kids/, ''), d.key)}
          className={d.key === ev ? 'active' : undefined}
          aria-current={d.key === ev ? 'page' : undefined}
          onClick={e => { e.preventDefault(); switchCup(d.key); window.scrollTo(0, 0); }}
        >
          {d.label} matches
          {phase[d.key] === 'draw' && <span className="draw-badge live">LIVE</span>}
          {phase[d.key] === 'done' && <span className="draw-badge">Done</span>}
        </a>
      ))}
    </nav>
  );
}

// Before the first state: connecting, or (server not updated yet) a friendly "coming soon".
export function ComingSoon({ unavailable, host = false }) {
  // The free server sleeps when nobody has visited for a while: say so instead of looking stuck.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(t);
  }, []);
  if (!unavailable) {
    return (
      <p className="page-note">
        Connecting to the match draw…
        {slow && <><br />Waking up the server — the first visit can take up to a minute. Keep this page open.</>}
      </p>
    );
  }
  return (
    <main className="cup-main">
      <section className="cup-hero">
        <p className="cup-hero-kicker">Coming soon</p>
        <h2>The match draw</h2>
        <p>{host ? 'The server does not have the match draw yet — it goes live after the next update of the server (push to main → Render).' : 'Who plays whom will be drawn live, right here. Stay tuned!'}</p>
      </section>
    </main>
  );
}

export function CupLive() {
  const { state, connected, viewers, serverNow, send, onReaction, openedAt, unavailable } = useCup('audience');
  const [show, setShow] = useState(null);
  const hideSeq = show && show.phase !== 'done' ? show.seq : null;
  useWakeLock(Boolean(state && (state.phase === 'draw' || state.phase === 'knockout')));
  const visible = useMemo(() => (state && hideSeq ? { ...state, ties: state.ties.filter(t => t.seq !== hideSeq) } : state), [state, hideSeq]);
  const jump = id => {
    const el = document.getElementById(`tie-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.classList.add('flash');
    setTimeout(() => el?.classList.remove('flash'), 1600);
  };
  const p = state?.phase;
  return (
    <div className="audience cup-page">
      <Header state={state} connected={connected} viewers={viewers} kicker="Live match draw" />
      <CreditStrip />
      <CupSwitch />
      <ConnectionBanner connected={connected} />
      <CupSteps state={state} />
      {!state ? <ComingSoon unavailable={unavailable} /> : (
        <main className="cup-main">
          {p === 'setup' && (
            <section className="cup-hero">
              <p className="cup-hero-kicker">Coming up</p>
              <h2>The match draw</h2>
              <p>{state.teams.length ? `${state.teams.length} teams. One draw decides who plays whom — live, right here.` : 'The teams are being loaded. Keep this page open.'}</p>
              <p className="hint">Tap 🔇 for sound when the show starts.</p>
            </section>
          )}
          {p === 'draw' && <SmashArena state={state} serverNow={serverNow} onShow={setShow} openedAt={openedAt} />}
          {(p === 'knockout' || p === 'done') && <ChampionBanner state={state} />}
          {(p === 'knockout' || p === 'done') && <Bracket state={state} />}
          {p !== 'setup' && <TieList state={visible} title={p === 'draw' ? 'Matches drawn' : 'Matches'} empty={p === 'draw' ? 'The first match is about to be drawn…' : null} />}
          {p === 'league' && <Bracket state={state} />}
          {p !== 'setup' && p !== 'draw' && <Standings state={state} />}
          {p !== 'setup' && visible.ties.length > 0 && <FindMatch state={visible} onFound={jump} />}
          {p !== 'draw' && <TeamsGrid state={state} />}
        </main>
      )}
      <BrandFooter />
      <FloatingReactions onReaction={onReaction} />
      <ResumeSoundPrompt />
      {state && p !== 'setup' && <ReactionBar send={send} />}
      <Moments state={state} />
    </div>
  );
}
