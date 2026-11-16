// VERSUS: fighting-game style face-off. The two teams slide in from opposite sides, "VS" slams
// down with sparks and a shake, then the six games of the tie (same categories against each
// other) cascade in with the real player names. Full screen, a few seconds, tap to close.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as sfx from './sfx.js';
import { GAMES } from './core.js';
import * as fx from './fx.js';
import { splitName } from './live.js';
import { TeamLogo, colorOf } from './looks.jsx';

function Side({ team, side }) {
  const { kicker, big } = splitName(team.name);
  return (
    <div className={`vs-card vs-card-${side}`}>
      <TeamLogo team={team} size={0} className="vs-logo" />
      <p className="vs-team">
        {kicker && <span>{kicker}</span>}
        <b className={big.length > 10 ? 'long' : undefined}>{big}</b>
      </p>
      <ul className="vs-roster">
        {['A', 'B', 'C', 'D'].map(s => (
          <li key={s}><i>{s}</i>{team.players[s] || '—'}</li>
        ))}
      </ul>
    </div>
  );
}

export function Versus({ a, b, title, note, ms = 7000, games = true, onClose }) {
  const ref = useRef(null);
  const markRef = useRef(null);
  useEffect(() => {
    const t1 = setTimeout(() => {
      sfx.versus();
      const r = markRef.current?.getBoundingClientRect();
      fx.versusBurst(r ? r.left + r.width / 2 : innerWidth / 2, r ? r.top + r.height / 2 : innerHeight / 2);
      fx.shake(ref.current, 16, 620);
      fx.buzz([60, 40, 160]);
    }, 560);
    const t2 = setTimeout(() => ref.current?.classList.add('vs-out'), Math.max(1600, ms - 600));
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [ms]);
  return createPortal(
    <div ref={ref} className="vs" style={{ '--ca': colorOf(a), '--cb': colorOf(b) }} role="dialog" aria-label={`${title ? `${title}: ` : ''}${a.name} versus ${b.name}`} onClick={onClose}>
      <div className="vs-bg" aria-hidden="true">
        <i className="vs-half vs-half-a" />
        <i className="vs-half vs-half-b" />
        <i className="vs-lines" />
      </div>
      {/* League matches have no title (no match numbers / courts); knockout ties show QF1, Final… */}
      {title && (
        <p className="vs-title">
          {title}
          {note ? <span> · {note}</span> : null}
        </p>
      )}
      <Side team={a} side="a" />
      <div ref={markRef} className="vs-mark" aria-hidden="true"><span>V</span><span>S</span></div>
      <Side team={b} side="b" />
      {games && (
        <ol className="vs-games" aria-label="Games in this match">
          {GAMES.map(([x, y], i) => (
            <li key={`${x}${y}`} style={{ '--d': i }}>
              <b>{x}/{y}</b>
              <span className="g-a">{a.players[x]} &amp; {a.players[y]}</span>
              <i>vs</i>
              <span className="g-b">{b.players[x]} &amp; {b.players[y]}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="vs-skip">Tap to close</p>
    </div>,
    document.body,
  );
}
