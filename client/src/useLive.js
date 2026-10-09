import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import * as fx from './fx.js';

const CACHE_KEY = 'team-draw:last-state';
function cachedState() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

// `show` is what the stage animates: { actionId, category, mode, teamNumbers, candidates, assignments?, phase }
// phase: 'spinning' (server picked, result still hidden) -> 'landing' (result known, reel slows) -> 'done'.
// The server decides everything; this only sequences the presentation, keyed by actionId so a
// repeated or late event never replays an animation.
export function useLive() {
  const [state, setState] = useState(cachedState);
  const [connected, setConnected] = useState(null); // null = not connected yet
  const [show, setShow] = useState(null);
  const stateRef = useRef(state);
  const socketRef = useRef(null);
  const listeners = useRef(new Set());
  const [crowd, setCrowd] = useState({ round: null, taps: 0, target: 0, fired: false });
  // Big on-screen announcements: a category's walk-out, or its trophy moment.
  const [announce, setAnnounce] = useState(null);

  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL || undefined);
    socketRef.current = socket;
    const say = (a, ms) => {
      setAnnounce({ ...a, key: Date.now() });
      setTimeout(() => setAnnounce(cur => (cur?.kind === a.kind && cur.category === a.category ? null : cur)), ms);
    };
    let trophyUntil = 0;
    const land = (prev, reveal) => {
      if (prev?.actionId === reveal.actionId && prev.phase !== 'spinning') return prev;
      const names = reveal.assignments.map(a => a.name);
      const candidates = prev?.actionId === reveal.actionId
        ? prev.candidates
        : [...new Set([...(stateRef.current?.remaining ?? []), ...names])];
      return { ...reveal, teamNumbers: reveal.assignments.map(a => a.teamNumber), candidates, phase: 'landing' };
    };

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    // `live` = this screen saw the spin start, so it may play the countdown (late joiners skip it).
    socket.on('draw:spinning', e => setShow(prev => (prev?.actionId === e.actionId ? prev : { ...e, phase: 'spinning', live: true })));
    socket.on('draw:revealed', e => setShow(prev => land(prev, e)));
    socket.on('draw:undone', () => setShow(null));
    // Every screen sees every reaction: the server relays each one to all connected phones.
    socket.on('reaction', r => listeners.current.forEach(fn => fn(r)));
    socket.on('crowd:taps', c => setCrowd({ ...c, fired: false }));
    socket.on('crowd:fired', c => setCrowd(prev => ({ ...prev, ...c, fired: true })));
    socket.on('category:finalized', ({ category }) => {
      const label = stateRef.current?.categories.find(c => c.key === category)?.label ?? category;
      trophyUntil = Date.now() + 3600;
      fx.whistleAndTrophy();
      say({ kind: 'trophy', category, label }, 3600);
    });
    socket.on('tournament:state', s => {
      const before = stateRef.current;
      stateRef.current = s;
      // A new round starts (Start draw, or the next category after Finalize): walk-out jingle.
      if (s.status === 'LIVE' && s.current && before && before.id === s.id && before.current !== s.current) {
        const label = s.categories.find(c => c.key === s.current)?.label ?? s.current;
        const wait = Math.max(0, trophyUntil - Date.now());
        setTimeout(() => {
          fx.jingle(s.current);
          say({ kind: 'round', category: s.current, label, mode: s.mode }, 3000);
        }, wait);
      }
      setState(s);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(s));
      } catch { /* storage unavailable: live state still works */ }
      setShow(prev => {
        if (s.pending) return prev?.actionId === s.pending.actionId ? prev : { ...s.pending, candidates: s.remaining, phase: 'spinning' };
        if (!prev || before?.id !== s.id) return null;
        // Missed the reveal event (e.g. while reconnecting): finish from the authoritative state.
        if (prev.phase === 'spinning') return s.last?.actionId === prev.actionId ? land(prev, s.last) : null;
        if (prev.phase === 'done' && prev.category !== s.current) return null; // category moved on
        return prev;
      });
    });
    return () => socket.close();
  }, []);

  const finish = useCallback(actionId => setShow(prev => (prev?.actionId === actionId ? { ...prev, phase: 'done' } : prev)), []);

  // Presentation must never block the draw: if an animation stalls, reveal anyway.
  useEffect(() => {
    if (show?.phase !== 'landing') return;
    const timer = setTimeout(() => finish(show.actionId), 12000);
    return () => clearTimeout(timer);
  }, [show, finish]);

  const send = useCallback((event, data) => socketRef.current?.emit(event, data), []);
  const onReaction = useCallback(fn => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  return { state, connected, show, finish, send, onReaction, crowd, announce };
}
