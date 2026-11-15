// Big live moments, detected from state changes (only while the page is open, never replayed on
// load): a match result toast, "all matches set", the knockout line-up reveal (one VS per tie)
// and the champions celebration.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as sfx from './sfx.js';
import { soundStatus } from '../sound.js';
import { confetti } from '../fx.js';
import * as fx from './fx.js';
import { teamOf } from './live.js';
import { TeamLogo } from './looks.jsx';
import { Versus } from './Versus.jsx';

export function Moments({ state }) {
  const prev = useRef(null);
  const [toast, setToast] = useState(null);
  const [reveal, setReveal] = useState(null);
  const [champ, setChamp] = useState(null);
  const [allSet, setAllSet] = useState(null);
  // Moment timers live until they fire (or the page closes): a new state arriving a moment later
  // (a result, a reconnect) must not cancel them — that used to leave "All matches set" stuck.
  const timers = useRef(new Set());
  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const closeChamp = useCallback(() => setChamp(null), []);

  // Recorded sounds for the big moments (fetched only when this phone has sound on).
  useEffect(() => {
    if (soundStatus() !== 'off') sfx.preload();
  }, []);

  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    if (!state || !before) return;
    if (before.id !== state.id) {
      // Restart / new draw: nothing from the previous draw may stay on screen.
      timers.current.forEach(clearTimeout);
      timers.current.clear();
      setToast(null);
      setReveal(null);
      setChamp(null);
      setAllSet(null);
      return;
    }
    const all = s => [...s.ties, ...s.knockout.ties];
    const old = new Map(all(before).map(t => [t.id, t]));
    for (const t of all(state)) {
      const o = old.get(t.id);
      if (t.winner && o && !o.winner && t.id !== 'F') {
        const w = teamOf(state, t[t.winner]);
        const l = teamOf(state, t[t.winner === 'a' ? 'b' : 'a']);
        const score = t.winner === 'a' ? `${t.ga}–${t.gb}` : `${t.gb}–${t.ga}`;
        setToast({ key: `${t.id}-${Date.now()}`, text: `${w?.name} beat ${l?.name} ${score}`, label: t.label });
        sfx.result();
      }
    }
    if (before.phase === 'draw' && state.phase === 'league') {
      later(() => {
        setAllSet({ n: state.ties.length });
        sfx.allSet();
        fx.fireworks(8);
      }, 300);
    }
    if (!before.knockout.locked && state.knockout.locked) {
      const first = state.knockout.ties.filter(t => t.a && t.b);
      setReveal({ ties: first, i: 0 });
    }
    if (!before.knockout.champion && state.knockout.champion) {
      setChamp(state.knockout.champion);
      sfx.champion();
      later(() => fx.fireworks(10), 900);
      later(() => fx.fireworks(10), 4200);
    }
  }, [state, later]);

  useEffect(() => {
    if (!allSet) return undefined;
    const t = setTimeout(() => setAllSet(null), 4900);
    return () => clearTimeout(t);
  }, [allSet]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Knockout line-up: one short VS per tie, back to back.
  const STEP = 3400;
  useEffect(() => {
    if (!reveal) return undefined;
    const t = setTimeout(() => setReveal(r => (r && r.i + 1 < r.ties.length ? { ...r, i: r.i + 1 } : null)), STEP);
    return () => clearTimeout(t);
  }, [reveal]);

  const cur = reveal?.ties[reveal.i];
  return (
    <>
      {toast && (
        <div className="cup-toast" role="status" key={toast.key}>
          <span>🏓 {toast.label}</span>
          <b>{toast.text}</b>
        </div>
      )}
      {allSet && createPortal(
        <div className="moment" role="status" onClick={() => setAllSet(null)}>
          <p className="moment-kicker">The draw is complete</p>
          <h2>All {allSet.n} matches are set!</h2>
          <p className="moment-line">Find your match below 👇</p>
        </div>,
        document.body,
      )}
      {cur && (
        <Versus
          key={`${cur.id}-${reveal.i}`}
          a={teamOf(state, cur.a)}
          b={teamOf(state, cur.b)}
          title={cur.label}
          note={cur.note}
          court={cur.court}
          ms={STEP}
          games={false}
          onClose={() => setReveal(null)}
        />
      )}
      {champ && <ChampionOverlay state={state} team={teamOf(state, champ)} onClose={closeChamp} />}
    </>
  );
}

function ChampionOverlay({ team, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const t1 = setTimeout(() => confetti(ref.current?.querySelector('.cw-trophy')), 700);
    const t2 = setTimeout(() => confetti(ref.current?.querySelector('h2')), 2200);
    const t3 = setTimeout(onClose, 14000);
    return () => [t1, t2, t3].forEach(clearTimeout);
  }, [onClose]);
  if (!team) return null;
  return createPortal(
    <div ref={ref} className="champ-overlay" role="dialog" aria-label={`Champions: ${team.name}`} onClick={onClose}>
      <div className="cw-rays" aria-hidden="true" />
      <div className="cw-trophy" aria-hidden="true">🏆</div>
      <TeamLogo team={team} size={0} className="cw-logo" />
      <p className="cw-kicker">Champions</p>
      <h2>{team.name}</h2>
      <ul className="cw-roster">{['A', 'B', 'C', 'D'].map(s => team.players[s] && <li key={s}><i>{s}</i>{team.players[s]}</li>)}</ul>
      <p className="vs-skip">Tap to close</p>
    </div>,
    document.body,
  );
}
