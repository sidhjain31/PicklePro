import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CrowdMeter, FloatingReactions, LeaderList, useLeaderboard } from './Audience.jsx';
import { ConnectionBanner } from './Live.jsx';
import { Stage } from './Stage.jsx';
import { useLive } from './useLive.js';

// Projector / TV view at /screen: a giant reel, the current category's picks, and a QR code
// so the room can follow on their phones. Read-only, like the audience page.
export function Screen() {
  const { state, connected, show, finish, send, onReaction, crowd, announce } = useLive();
  const board = useLeaderboard(state);
  const joinUrl = `${location.origin}/`;
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(joinUrl, { margin: 1, width: 360, color: { dark: '#0b1f52', light: '#ffffff' } }).then(setQr, () => {});
  }, [joinUrl]);

  // Hide the cursor when it sits still, so it never hangs over the projected reel.
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer;
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), 2500);
    };
    wake();
    addEventListener('pointermove', wake);
    return () => {
      removeEventListener('pointermove', wake);
      clearTimeout(timer);
    };
  }, []);

  const category = show?.category ?? state?.current;
  const label = state?.categories.find(c => c.key === category)?.label;
  const animating = show && show.phase !== 'done' ? new Set(show.teamNumbers) : null;
  const picks = state && category
    ? state.teams.map(t => ({ team: t.number, name: animating?.has(t.number) ? null : t.players[category] }))
    : [];
  const filled = picks.filter(p => p.name).length;

  return (
    <div className={`screen${idle ? ' screen-idle' : ''}`}>
      <ConnectionBanner connected={connected} />
      <header className="screen-head">
        <img src="/logo.png" alt="" />
        <div>
          <p className="brand-kicker">Live team draw</p>
          <h1>{state?.name ?? 'Team Draw'}</h1>
        </div>
        {state && state.status !== 'DRAFT' && (
          <ol className="screen-steps">
            {state.categories.map(c => (
              <li key={c.key} className={`step-${c.state}`}>{c.label}</li>
            ))}
          </ol>
        )}
      </header>
      <main className="screen-main">
        <Stage state={state} show={show} finish={finish} big announce={announce}>
          <CrowdMeter state={state} crowd={crowd} send={send} big />
        </Stage>
        <aside className="screen-side">
          {label && state.status !== 'DRAFT' && (
            <section className="screen-picks">
              <h2>{label} <span>{filled}/{state.teamCount}</span></h2>
              <ol>
                {picks.map(p => (
                  <li key={p.team} className={[p.name ? 'has' : '', show?.phase === 'done' && show.teamNumbers.includes(p.team) ? 'fresh' : ''].join(' ')}>
                    <span className="pick-team">{p.team}</span>
                    <span className="pick-name">{p.name ?? (animating?.has(p.team) ? '???' : '—')}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {board?.players > 0 && (
            <section className="screen-leaders">
              <h2>🔮 Top predictors</h2>
              {board.last && board.last.total > 0 && (
                <p className="screen-leaders-last"><b>{board.last.correct}</b> of {board.last.total} called Team {board.last.team} right</p>
              )}
              <LeaderList rows={board.top.map(r => ({ nickname: r.nickname, score: r.correct }))} limit={5} />
            </section>
          )}
          <section className="screen-join">
            {qr && <img src={qr} alt={`QR code for ${joinUrl}`} />}
            <p>Watch on your phone</p>
            <strong>{location.host}</strong>
          </section>
        </aside>
      </main>
      <FloatingReactions onReaction={onReaction} big />
    </div>
  );
}
