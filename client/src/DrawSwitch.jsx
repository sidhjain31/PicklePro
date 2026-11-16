import { useEffect, useState } from 'react';
import { setEvent, urlFor, useEvent } from './event.js';

const DRAWS = [
  { key: 'main', label: 'Adults draw', api: '/api/state' },
  { key: 'kids', label: 'Kids draw', api: '/api/kids/state' },
];

// One link for everyone: tabs to switch between the main and kids draws (different auction
// modes). Each tab shows that draw's live status. Switching swaps the page in place (no reload),
// so sound that was turned on keeps working in either mode.
export function DrawSwitch() {
  const ev = useEvent();
  const [status, setStatus] = useState({});
  useEffect(() => {
    let alive = true;
    const load = () => Promise.all(DRAWS.map(d => fetch(d.api).then(r => r.json()).then(s => [d.key, s.status], () => [d.key, null])))
      .then(pairs => alive && setStatus(Object.fromEntries(pairs)));
    load();
    // Badges only: refresh once a minute, and only while the page is visible (1,000 phones x
    // 2 requests every 20 s would be a constant load on a small server).
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <nav className="draw-switch" aria-label="Choose draw">
      {DRAWS.map(d => {
        const active = d.key === ev;
        const s = status[d.key];
        return (
          <a
            key={d.key}
            href={urlFor(d.key)}
            className={active ? 'active' : undefined}
            aria-current={active ? 'page' : undefined}
            onClick={e => { e.preventDefault(); setEvent(d.key); window.scrollTo(0, 0); }}
          >
            {d.label}
            {s === 'LIVE' && <span className="draw-badge live">LIVE</span>}
            {s === 'COMPLETED' && <span className="draw-badge">Done</span>}
          </a>
        );
      })}
    </nav>
  );
}
