import { CrowdMeter, FloatingReactions, Predict, ReactionBar, useLeaderboard } from './Audience.jsx';
import { Board } from './Board.jsx';
import { Stage } from './Stage.jsx';
import { useLive } from './useLive.js';

export function ConnectionBanner({ connected }) {
  if (connected) return null;
  return (
    <div className="offline" role="status">
      {connected === null ? 'Connecting to the live draw…' : 'Connection lost. Reconnecting…'}
    </div>
  );
}

// Category progress in draw order.
export function Steps({ state }) {
  if (!state || state.status === 'DRAFT') return null;
  return (
    <ol className="steps" aria-label="Categories">
      {state.categories.map(c => (
        <li key={c.key} className={`step step-${c.state}`} aria-current={c.state === 'active' ? 'step' : undefined}>
          <span className="step-label">{c.label}</span>
          <span className="step-count">{c.state === 'done' ? '✓' : `${c.assigned}/${state.teamCount}`}</span>
        </li>
      ))}
    </ol>
  );
}

export function Header({ state, connected, children }) {
  return (
    <header className="topbar">
      <div className="brand">
        <img className="brand-logo" src="/logo.png" alt="" />
        <div>
          <p className="brand-kicker">Live team draw</p>
          <h1 className="brand-name">{state?.name ?? 'Team Draw'}</h1>
        </div>
      </div>
      <div className="topbar-right">
        <span className={`live-dot ${connected ? 'on' : 'off'}`}>{connected ? 'Live' : 'Offline'}</span>
        {children}
      </div>
    </header>
  );
}

export function Live() {
  const { state, connected, show, finish, send, onReaction, crowd, announce } = useLive();
  const board = useLeaderboard(state);
  const live = state && state.status !== 'DRAFT';
  return (
    <>
      <Header state={state} connected={connected} />
      <ConnectionBanner connected={connected} />
      <Steps state={state} />
      <main className="layout layout-audience">
        <Stage state={state} show={show} finish={finish} announce={announce}>
          <CrowdMeter state={state} crowd={crowd} send={send} />
          <Predict state={state} show={show} board={board} />
        </Stage>
        {live && <Board state={state} show={show} />}
      </main>
      <FloatingReactions onReaction={onReaction} />
      {live && <ReactionBar send={send} />}
    </>
  );
}

