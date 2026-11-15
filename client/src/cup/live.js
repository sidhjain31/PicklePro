// Live connection for the match draw: Socket.IO room cup:<event>, the
// server clock offset (shows are timed by the server), reactions and viewer count.
import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../api.js';
import { getEvent, pagePath, setEvent, storeKey } from '../event.js';

// The in-browser demo is gone: drop what it left in this browser (state, logos).
try {
  for (const k of Object.keys(localStorage)) if (k.includes('cup-demo') || k.endsWith(':cup-state')) localStorage.removeItem(k);
} catch { /* storage unavailable */ }

// Links between the match-draw pages, keeping the mode (kids).
export function cupUrl(page = '/', ev = getEvent()) {
  const q = new URLSearchParams();
  if (ev === 'kids') q.set('draw', 'kids');
  const s = q.toString();
  return s ? `${page}?${s}` : page;
}
export function switchCup(ev) {
  setEvent(ev);
  history.replaceState(null, '', cupUrl(pagePath(), ev));
}

// Host and public calls: /api/fixtures/* (main) or /api/kids/fixtures/*.
export const cupApi = (path, { method = 'GET', body } = {}) => api(`/fixtures${path}`, { method, body });

function viewerId() {
  try {
    let id = localStorage.getItem('team-draw:viewer');
    if (!id) {
      id = crypto.randomUUID?.() ?? `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('team-draw:viewer', id);
    }
    return id;
  } catch {
    return `v-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}

// The last state seen, for an instant first paint on reload. Only if recent: a phone that watched a
// rehearsal must not show those old matches on the day while the (possibly sleeping) server wakes.
const cacheKey = () => storeKey('cup-state-v2');
const CACHE_MS = 10 * 60 * 1000;
function cached() {
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey()));
    if (!c?.s || !(Date.now() - c.at < CACHE_MS)) return null;
    // A cached show is long over: drop it, the live state arrives in a moment.
    return { ...c.s, current: null };
  } catch {
    return null;
  }
}

// role: 'audience' | 'host' | 'screen' (only audience is counted as a viewer).
export function useCup(role = 'audience') {
  const [state, setState] = useState(cached);
  const [connected, setConnected] = useState(null);
  const [viewers, setViewers] = useState(null);
  // The server answers 404 when it doesn't have the match draw yet (client deployed first).
  const [unavailable, setUnavailable] = useState(false);
  const offset = useRef(0); // server clock - this device's clock
  const last = useRef(null);
  const openedAt = useRef(0); // when this screen saw the host open the arena (for the fly-in)
  const socketRef = useRef(null);
  const listeners = useRef(new Set());

  useEffect(() => {
    const onState = s => {
      if (typeof s.now === 'number') offset.current = s.now - Date.now();
      if (last.current?.id === s.id && last.current.phase === 'setup' && s.phase === 'draw') openedAt.current = Date.now();
      last.current = s;
      setState(s);
      try {
        localStorage.setItem(cacheKey(), JSON.stringify({ at: Date.now(), s }));
      } catch { /* storage unavailable */ }
    };
    const socket = io(import.meta.env.VITE_SOCKET_URL || undefined, {
      transports: ['websocket', 'polling'],
      auth: { role, viewer: viewerId(), event: getEvent(), module: 'cup' },
    });
    socketRef.current = socket;
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('cup:state', onState);
    socket.on('viewers', v => setViewers(v.count));
    socket.on('reaction', r => listeners.current.forEach(fn => fn(r)));
    // First state over HTTP too (quick, and tells us if the server has the match draw at all).
    let alive = true;
    cupApi('/state').then(s => alive && onState(s), err => alive && err.status === 404 && setUnavailable(true));
    return () => {
      alive = false;
      socket.close();
    };
  }, [role]);

  const send = useCallback((event, data) => socketRef.current?.emit(event, data), []);
  const onReaction = useCallback(fn => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);
  const serverNow = useCallback(() => Date.now() + offset.current, []);

  return { state, connected, viewers, offset, serverNow, send, onReaction, openedAt, unavailable };
}

export const teamOf = (state, key) => state?.teams.find(t => t.key === key) ?? null;
// "Team 7" -> { kicker: 'TEAM', big: '7' } so tiles can show the number large.
export function splitName(name = '') {
  const m = /^team\s*#?\s*(\d+)$/i.exec(name.trim());
  return m ? { kicker: 'Team', big: m[1] } : { kicker: '', big: name };
}
