import { useEffect, useState } from 'react';

const labelOf = (state, key) => state.categories.find(c => c.key === key)?.label ?? key;

// ---------- 3. Last picks ticker ----------

// The latest one-by-one picks, newest first. A pick still landing on this phone's reel is held
// back so the ticker never spoils it.
export function Ticker({ state, show }) {
  const landing = show && show.phase !== 'done';
  const items = (state.recent ?? []).filter(r => !(landing && r.category === show.category && show.teamNumbers.includes(r.teamNumber)));
  if (!items.length) return null;
  return (
    <section className="ticker" aria-label="Latest picks">
      <span className="ticker-label">Latest</span>
      <ol>
        {items.map((r, i) => (
          <li key={`${r.category}-${r.teamNumber}`} className={i === 0 ? 'newest' : undefined}>
            <b>T{r.teamNumber}</b> {r.name} <small>{r.label}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------- 8. Sticky "Now drawing" bar ----------

// When the stage scrolls out of view (people checking the teams), a slim bar keeps the live
// status on screen; tapping it jumps back to the reel.
export function NowBar({ state, show, stageRef }) {
  const [offscreen, setOffscreen] = useState(false);
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setOffscreen(!e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [stageRef]);
  if (!offscreen || !state || state.status !== 'LIVE') return null;

  let icon = '🏓';
  let text;
  if (show && show.phase !== 'done') {
    icon = '🎰';
    text = show.mode === 'shuffle' ? `${labelOf(state, show.category)} · shuffling all teams…` : `${labelOf(state, show.category)} · Team ${show.teamNumbers[0]} · spinning…`;
  } else if (show?.phase === 'done' && show.mode === 'spin' && show.assignments) {
    icon = '✅';
    text = `${show.assignments[0].name} → Team ${show.assignments[0].teamNumber}`;
  } else if (state.currentTeam) {
    text = state.mode === 'shuffle' ? `Up next: ${labelOf(state, state.current)} shuffle` : `Up next: ${labelOf(state, state.current)} · Team ${state.currentTeam}`;
  } else {
    text = `${labelOf(state, state.current)} complete · waiting for the host`;
  }
  const live = show && show.phase !== 'done';
  return (
    <button type="button" className={`now-bar${live ? ' live' : ''}`} onClick={() => stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
      <span className="now-icon">{icon}</span>
      <span className="now-text">{text}</span>
      <span className="now-go">Watch ↑</span>
    </button>
  );
}
