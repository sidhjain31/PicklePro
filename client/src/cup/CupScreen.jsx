// TV view of the match draw (/tv; old /fixtures/tv and /fixtures/screen still work): the arena fills the screen during
// the draw; afterwards the bracket, matches and standings. QR code so the room can follow.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { FloatingReactions } from '../Audience.jsx';
import { useWakeLock } from '../Follow.jsx';
import { ConnectionBanner } from '../Live.jsx';
import { ResumeSoundPrompt, StageTools } from '../Stage.jsx';
import { SmashArena } from './SmashArena.jsx';
import { Bracket, ChampionBanner, CupSteps, Standings, TieList } from './Boards.jsx';
import { cupUrl, useCup } from './live.js';
import { Moments } from './Moments.jsx';
import { ComingSoon, CupSwitch } from './CupLive.jsx';

export function CupScreen() {
  const { state, connected, serverNow, onReaction, openedAt, unavailable } = useCup('screen');
  const [show, setShow] = useState(null);
  const [qr, setQr] = useState('');
  const joinUrl = `${location.origin}${cupUrl('/')}`;
  useWakeLock(true);
  useEffect(() => {
    QRCode.toDataURL(joinUrl, { margin: 1, width: 320, color: { dark: '#0b1f52', light: '#ffffff' } }).then(setQr, () => {});
  }, [joinUrl]);
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 2500);
    };
    wake();
    addEventListener('pointermove', wake);
    return () => {
      removeEventListener('pointermove', wake);
      clearTimeout(t);
    };
  }, []);
  const hideSeq = show && show.phase !== 'done' ? show.seq : null;
  const p = state?.phase;
  return (
    <div className={`cup-screen${idle ? ' screen-idle' : ''}`}>
      <ConnectionBanner connected={connected} />
      <header className="screen-head">
        <img src="/logo.png" alt="" />
        <div>
          <p className="brand-kicker">Live match draw</p>
          <h1>{state?.name ?? 'Match Draw'}</h1>
        </div>
        <CupSteps state={state} />
        <div className="screen-tools"><StageTools /></div>
        {/* Adults / Kids on the TV without reloading: a reload would block the sound until someone
            taps the screen again (browser rule), and nobody taps a TV. */}
        <CupSwitch />
      </header>
      {!state && <ComingSoon unavailable={unavailable} />}
      {state && (
        <div className={`cs-body cs-${p}`}>
          <div className="cs-main">
            {p === 'setup' && (
              <section className="cup-hero">
                <p className="cup-hero-kicker">Coming up</p>
                <h2>The match draw</h2>
                <p>{state.teams.length} teams · scan to watch on your phone</p>
              </section>
            )}
            {p === 'draw' && <SmashArena state={state} serverNow={serverNow} mode="screen" onShow={setShow} openedAt={openedAt} />}
            {(p === 'knockout' || p === 'done') && <ChampionBanner state={state} />}
            {p !== 'setup' && p !== 'draw' && <Bracket state={state} />}
            {p === 'league' && <Standings state={state} limit={12} />}
          </div>
          <aside className="cs-side">
            {qr && <img className="cs-qr" src={qr} alt={`Scan to follow: ${joinUrl}`} />}
            <p className="cs-join">{joinUrl.replace(/^https?:\/\//, '')}</p>
            <TieList state={state} hideSeq={hideSeq} title="Matches" empty="Matches appear here as they are drawn." />
          </aside>
        </div>
      )}
      <FloatingReactions onReaction={onReaction} big />
      <ResumeSoundPrompt />
      <Moments state={state} />
    </div>
  );
}
