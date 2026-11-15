import { useEffect, useState } from 'react';

// Which draw (auction mode) this page shows. One link for everyone: the in-page switch changes
// it WITHOUT reloading the page, so unlocked audio keeps playing in either mode. The URL gets
// ?draw=kids so a refresh or shared link opens the same mode (older /kids links still work).
const fromUrl = () => (/^\/kids(\/|$)/.test(location.pathname) || new URLSearchParams(location.search).get('draw') === 'kids' ? 'kids' : 'main');
let current = fromUrl();
const listeners = new Set();

export const getEvent = () => current;
export const apiBase = () => (current === 'kids' ? '/api/kids' : '/api');
// Per-event browser storage keys, so the two draws never mix cached state or follows.
export const storeKey = name => (current === 'kids' ? `team-draw:kids:${name}` : `team-draw:${name}`);
// The page without the old /kids prefix: '/', '/admin', '/tv', '/auction', '/auction/admin', …
export const pagePath = () => location.pathname.replace(/^\/kids/, '') || '/';
export const urlFor = (ev, page = pagePath()) => (ev === 'kids' ? `${page}?draw=kids` : page);
export const pageUrl = page => urlFor(current, page);

export function setEvent(ev) {
  if (ev === current) return;
  current = ev;
  history.pushState(null, '', urlFor(ev));
  listeners.forEach(fn => fn(ev));
}
window.addEventListener('popstate', () => {
  const ev = fromUrl();
  if (ev === current) return;
  current = ev;
  listeners.forEach(fn => fn(ev));
});

// React: re-render (and remount the page) when the mode changes.
export function useEvent() {
  const [ev, setEv] = useState(current);
  useEffect(() => {
    listeners.add(setEv);
    return () => listeners.delete(setEv);
  }, []);
  return ev;
}
