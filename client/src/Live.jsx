import { FloatingReactions, Predict, ReactionBar, TapGame, useIdentity, useLeaderboard } from './Audience.jsx';
import { BrandCard, CreditStrip } from './Brand.jsx';
import { Board } from './Board.jsx';
import { FollowCard, TeamSearch, useFollow, useTeamSearch, useWakeLock } from './Follow.jsx';
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
  const identity = useIdentity();
  const live = state && state.status !== 'DRAFT';
  const follow = useFollow(state, show);
  const search = useTeamSearch(follow.teams);
  useWakeLock(state?.status === 'LIVE');
  return (
    <div className="audience">
      <Header state={state} connected={connected} />
      <CreditStrip />
      <ConnectionBanner connected={connected} />
      <Steps state={state} />
      <main className="layout layout-audience">
        <div className="audience-col">
          <Stage state={state} show={show} finish={finish} announce={announce} />
          {live && (
            <div className="play">
              <FollowCard state={state} follow={follow} />
              <TapGame state={state} crowd={crowd} send={send} identity={identity} />
              <Predict state={state} show={show} board={board} identity={identity} />
            </div>
          )}
          <BrandCard />
        </div>
        {live && (
          <section className="teams-section" aria-label="Teams">
            <h2 className="section-title">All teams</h2>
            <TeamSearch search={search} />
            <Board state={state} show={show} mine={follow.team?.number ?? null} matches={search.matches} />
          </section>
        )}
      </main>
      <FloatingReactions onReaction={onReaction} />
      {live && <ReactionBar send={send} />}
    </div>
  );
}

