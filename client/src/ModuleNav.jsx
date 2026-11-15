import { getEvent } from './event.js';

// The app has two modules on one site: the Match Draw (teams drawn against each other — the main
// link) and the finished Team Auction (players drawn into teams, under /auction). Only the HOST
// pages show this bar; the audience on the main link sees the match draw only.
const MODULES = [
  { key: 'cup', icon: '🏓', label: 'Match Draw', audience: '/', host: '/admin' },
  { key: 'auction', icon: '🎰', label: 'Team Auction', audience: '/auction', host: '/auction/admin' },
];

export function ModuleNav({ current, host = false }) {
  const q = getEvent() === 'kids' ? '?draw=kids' : '';
  return (
    <nav className="module-nav" aria-label="Choose module">
      {MODULES.map(m => (
        <a
          key={m.key}
          href={`${host ? m.host : m.audience}${q}`}
          className={m.key === current ? 'active' : undefined}
          aria-current={m.key === current ? 'page' : undefined}
        >
          <span aria-hidden="true">{m.icon}</span> {m.label}
        </a>
      ))}
    </nav>
  );
}
