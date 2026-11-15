// Draw audio: synthesized with Web Audio (no audio files), all routed through one master gain so
// muting silences everything instantly. Presentation only — nothing here touches the draw.
//
// Mobile rules this follows:
// - Browsers (iOS Safari, Android Chrome) only start audio inside a user gesture, so the
//   AudioContext is created/resumed and an unlock buffer is played inside the tap handler.
// - iPhone's ring/silent switch mutes Web Audio unless the page declares media playback
//   (navigator.audioSession, Safari 16.4+); we set it when available.
// - A saved "sound on" preference is only a wish: after a refresh the context is locked again,
//   so the UI shows "Tap to resume sound" until the next tap actually unlocks it.

const SOUND_KEY = 'team-draw:sound';
let ctx = null;
let master = null;
let wanted = (() => {
  try {
    return localStorage.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
})();
const listeners = new Set();
const timers = new Set(); // every scheduled sound timer, so mute can cancel them
const live = new Set(); // stop() functions of long-running sounds (reel, crowd, drumroll)

const running = () => Boolean(ctx && ctx.state === 'running');
export const soundStatus = () => (wanted ? (running() ? 'on' : 'locked') : 'off');
export const soundOn = () => soundStatus() === 'on';
const notify = () => listeners.forEach(fn => fn(soundStatus()));
export function onSoundChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function save() {
  try {
    localStorage.setItem(SOUND_KEY, wanted ? 'on' : 'off');
  } catch { /* storage unavailable */ }
}

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = wanted ? 1 : 0;
  // Gentle limiter so stacked effects never clip on phone speakers.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.ratio.value = 8;
  master.connect(limiter).connect(ctx.destination);
  // iOS can suspend/interrupt the context (calls, Siri, backgrounding): keep the UI honest.
  ctx.onstatechange = notify;
  return ctx;
}

// Must be called from inside a tap/click handler.
async function unlock() {
  const a = ensureContext();
  if (!a) return false;
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch { /* not supported */ }
  try {
    // A 1-sample silent buffer started in the gesture is what iOS needs to unlock output.
    const b = a.createBuffer(1, 1, a.sampleRate);
    const src = a.createBufferSource();
    src.buffer = b;
    src.connect(a.destination);
    src.start(0);
    if (a.state !== 'running') await a.resume();
  } catch {
    return false;
  }
  return a.state === 'running';
}

// Turn sound on/off from a tap. Returns the resulting status ('on' | 'off' | 'locked').
export async function setSound(on) {
  wanted = on;
  save();
  if (!on) {
    stopAll();
    if (master && ctx) master.gain.setValueAtTime(0, ctx.currentTime);
    notify();
    return 'off';
  }
  const ok = await unlock();
  if (master && ctx) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(1, ctx.currentTime);
  }
  notify();
  return ok ? 'on' : 'locked';
}

// After a refresh with sound "on", the first tap anywhere on the page re-unlocks audio.
if (typeof window !== 'undefined') {
  const resumeOnGesture = () => {
    if (wanted && !running()) unlock().then(notify);
  };
  window.addEventListener('pointerdown', resumeOnGesture, { capture: true, passive: true });
  window.addEventListener('keydown', resumeOnGesture, { capture: true });
  // Coming back from another app/tab: phones suspend audio while hidden. Try to resume; if the
  // browser insists on a tap, the status becomes 'locked' and the page shows a resume button.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !wanted || !ctx) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => {}).finally(notify);
    notify();
  });
}

// Silence everything now: cancel scheduled sounds and stop long-running ones.
export function stopAll() {
  timers.forEach(clearTimeout);
  timers.clear();
  live.forEach(stop => stop());
  live.clear();
}

const later = (fn, ms) => {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
};
const ready = () => (wanted && running() ? ctx : null);

function tone({ freq, to = freq, type = 'sine', ms = 120, gain = 0.2, delay = 0, attack = 0.004 }) {
  const a = ready();
  if (!a) return;
  const t = a.currentTime + delay / 1000;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, t + ms / 1000);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + ms / 1000 + 0.03);
}

let noise = null;
function noiseBuffer(a) {
  if (!noise) {
    noise = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}
// Filtered noise with an envelope [[ms, gain], ...]. Returns stop().
function noiseShape({ type = 'bandpass', freq = 800, q = 0.7, env, delay = 0 }) {
  const a = ready();
  if (!a) return () => {};
  const t = a.currentTime + delay / 1000;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a);
  src.loop = true;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  for (const [ms, v] of env) g.gain.linearRampToValueAtTime(v, t + ms / 1000);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + env.at(-1)[0] / 1000 + 0.05);
  return () => {
    try {
      g.gain.cancelScheduledValues(a.currentTime);
      g.gain.setTargetAtTime(0.0001, a.currentTime, 0.05);
      src.stop(a.currentTime + 0.3);
    } catch { /* already stopped */ }
  };
}
const track = stop => {
  live.add(stop);
  return () => {
    live.delete(stop);
    stop();
  };
};

// ---------- The slot machine (primary draw sound) ----------
// A real mechanical slot machine, synthesized (original, no samples, no arcade melody):
// lever spring + gear catch → motor hum and reel mechanism whirr, slowing into distinct clacks →
// reel thunk → ringing bell and a coin cascade.

// One reel symbol box knocking past the stop arm: a hard, short, pitched tick with a small
// wooden body thump. No noise source, so it never sounds like a "shh" hiss.
function knock(a, at, loud, pitch = 1) {
  const parts = [[2400 * pitch, 0.012, loud], [820 * pitch, 0.03, loud * 0.6], [190 * pitch, 0.05, loud * 0.5]];
  for (const [f, len, g0] of parts) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = f > 1000 ? 'square' : 'triangle';
    o.frequency.setValueAtTime(f, at);
    o.frequency.exponentialRampToValueAtTime(f * 0.7, at + len);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(g0, at + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + len + 0.02);
  }
}

// Lever pull, purely mechanical: the arm's spring stretching, then the gears catching (no beeps).
export function leverPull() {
  const a = ready();
  if (!a) return;
  // Ratchet: the lever arm clicking down through its teeth, then the heavy catch.
  for (let i = 0; i < 6; i++) knock(a, a.currentTime + i * 0.035, 0.05, 0.8 + i * 0.03);
  later(() => tone({ freq: 95, to: 55, type: 'triangle', ms: 160, gain: 0.22 }), 220); // gear catch
}

// Mechanical reels. A low motor hum plus the reel mechanism: a click every time a symbol passes
// the pawl. At full speed the clicks run ~30/s and blur into a "rrrrr" whirr (not separate
// ticks); as the reel slows they space out into distinct clacks, like a real slot machine.
// Returns a controller: setSpeed(rowsPerSecond), clunk(), stop().
export function slotReel() {
  const a = ready();
  if (!a) return { setSpeed() {}, clunk() {}, stop() {} };
  leverPull();
  const t = a.currentTime;

  // Motor hum: a low, slightly rough drone through a low-pass, pitch following the speed.
  const motor = a.createOscillator();
  const motor2 = a.createOscillator();
  motor.type = 'sine';
  motor2.type = 'triangle';
  motor.frequency.value = 58;
  motor2.frequency.value = 87;
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  lp.Q.value = 0.7;
  const hum = a.createGain();
  hum.gain.setValueAtTime(0.0001, t);
  hum.gain.linearRampToValueAtTime(0.035, t + 0.45);
  motor.connect(lp);
  motor2.connect(lp);
  lp.connect(hum).connect(master);
  motor.start(t + 0.2);
  motor2.start(t + 0.2);

  // Reel mechanism: short, dark, filtered clicks scheduled on the audio clock.
  let speed = 13;
  let nextAt = t + 0.3;
  let stopped = false;
  const schedule = () => {
    if (stopped) return;
    // One knock per symbol box passing the window; capped at 16/s so it is a clatter of boxes,
    // never a hiss. Fast = lighter knocks, slow = heavy individual clacks.
    const perSec = Math.min(16, Math.max(2, speed * 1.2));
    const loud = speed > 6 ? 0.04 : 0.07;
    while (nextAt < a.currentTime + 0.1) {
      knock(a, nextAt, loud, 0.95 + Math.random() * 0.1);
      nextAt += 1 / perSec;
    }
  };
  const timer = setInterval(schedule, 25);
  schedule();

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    try {
      const n = a.currentTime;
      hum.gain.cancelScheduledValues(n);
      hum.gain.setTargetAtTime(0.0001, n, 0.05);
      motor.stop(n + 0.3);
      motor2.stop(n + 0.3);
    } catch { /* already stopped */ }
  };
  const untrack = track(stop);
  return {
    setSpeed(rps) {
      if (stopped) return;
      speed = Math.max(0, rps);
      const n = a.currentTime;
      const s = Math.min(1, speed / 13);
      motor.frequency.setTargetAtTime(38 + 28 * s, n, 0.1);
      motor2.frequency.setTargetAtTime(57 + 42 * s, n, 0.1);
      lp.frequency.setTargetAtTime(260 + 260 * s, n, 0.1);
      hum.gain.setTargetAtTime(0.012 + 0.025 * s, n, 0.12);
    },
    // A symbol locking past the window in the final crawl: a solid mechanical clack.
    clunk() {
      if (stopped) return;
      knock(a, a.currentTime, 0.1, 0.75);
      tone({ freq: 210, to: 120, type: 'triangle', ms: 60, gain: 0.1 });
    },
    stop: untrack,
  };
}

// The reel stops on the winner: heavy thunk, then ringing jackpot bells and a coin cascade.
export function jackpot() {
  const a = ready();
  if (a) knock(a, a.currentTime, 0.12, 0.6);
  tone({ freq: 120, to: 60, type: 'triangle', ms: 180, gain: 0.25 });
  // Ringing bells: two bright pitches alternating fast, like a slot's win bell.
  for (let i = 0; i < 18; i++) {
    const f = i % 2 ? 2093 : 1760;
    later(() => {
      tone({ freq: f, type: 'triangle', ms: 160, gain: 0.07 });
      tone({ freq: f * 2.76, type: 'sine', ms: 110, gain: 0.02 }); // metallic overtone
    }, 180 + i * 75);
  }
  // Coins dropping into the tray: short metallic pings at slightly random times and pitches.
  for (let i = 0; i < 22; i++) {
    const f = 3000 + ((i * 523) % 1700);
    later(() => {
      tone({ freq: f, to: f * 0.92, type: 'sine', ms: 70, gain: 0.03 });
      tone({ freq: f * 1.5, type: 'sine', ms: 40, gain: 0.012 });
    }, 300 + i * 60 + ((i * 37) % 40));
  }
}

// Near-miss: the reel shuddering against the pawl before it settles (mechanical, no beep).
export function nearMiss() {
  for (let i = 0; i < 3; i++) {
    later(() => { const a = ready(); if (a) knock(a, a.currentTime, 0.07, 0.85); }, i * 90);
  }
  tone({ freq: 140, to: 110, type: 'triangle', ms: 260, gain: 0.06 });
}

// ---------- Secondary effects ----------

// Subtle paddle-on-ball impact: short, soft, wooden. Throttled so impacts never stack.
let lastPock = 0;
export function pock() {
  const now = performance.now();
  if (now - lastPock < 600) return;
  lastPock = now;
  tone({ freq: 380, to: 190, type: 'triangle', ms: 55, gain: 0.07, attack: 0.002 });
  noiseShape({ type: 'bandpass', freq: 1600, q: 2, env: [[2, 0.04], [30, 0.0001]] });
}

// Countdown beeps: 3, 2, 1 low, then a high "go".
export const beep = go => tone({ freq: go ? 1320 : 660, type: 'square', ms: go ? 320 : 140, gain: 0.08 });

// Soft stadium murmur under the reel. Returns stop().
export const crowdSwell = ms => track(noiseShape({ freq: 650, q: 0.5, env: [[200, 0.02], [ms, 0.07], [ms + 4000, 0.07]] }));

export function cheer() {
  noiseShape({ freq: 1100, q: 0.4, env: [[60, 0.22], [700, 0.14], [2000, 0.0001]] });
}

export function fanfare() {
  [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', ms: 260, gain: 0.12, delay: i * 110 }));
}

// The whole-category shuffle: a quick cascade, one note per team dealt.
export function deal(count) {
  for (let i = 0; i < Math.min(count, 28); i++) later(() => tone({ freq: 500 + i * 22, type: 'triangle', ms: 70, gain: 0.06 }), i * 90);
}

// Snare roll for the last few names (replaces the rally). Returns stop().
export function drumroll(ms) {
  const ids = [];
  const hits = Math.floor(ms / 50);
  for (let i = 0; i < hits; i++) {
    const g = 0.02 + 0.08 * (i / hits);
    ids.push(later(() => noiseShape({ type: 'highpass', freq: 1800, env: [[3, g], [40, 0.0001]] }), i * 50));
  }
  return track(() => ids.forEach(id => { clearTimeout(id); timers.delete(id); }));
}

const JINGLES = {
  A: [[392, 0], [523, 140], [659, 280], [784, 420], [1047, 620]],
  WOMEN: [[659, 0], [784, 160], [988, 320], [1175, 480], [1319, 700]],
  B: [[440, 0], [554, 150], [659, 300], [880, 520]],
  C: [[349, 0], [440, 150], [523, 300], [698, 520]],
  D: [[330, 0], [415, 150], [494, 300], [659, 520]],
};
export function jingle(category) {
  for (const [f, d] of JINGLES[category] ?? JINGLES.B) {
    tone({ freq: f, type: 'square', ms: 170, gain: 0.05, delay: d });
    tone({ freq: f / 2, type: 'triangle', ms: 200, gain: 0.07, delay: d });
  }
}

// Referee whistle then a trophy fanfare: a category is locked in.
export function whistleAndTrophy() {
  [0, 260, 520].forEach((d, i) => tone({ freq: 2900, type: 'sine', ms: i === 2 ? 520 : 170, gain: 0.06, delay: d }));
  const notes = [[523, 0, 220], [523, 230, 120], [523, 360, 120], [698, 500, 700], [784, 1250, 260], [880, 1520, 260], [1047, 1800, 900]];
  for (const [f, d, ms] of notes) {
    tone({ freq: f, type: 'sawtooth', ms, gain: 0.04, delay: 1100 + d });
    tone({ freq: f / 2, type: 'triangle', ms, gain: 0.07, delay: 1100 + d });
  }
  later(cheer, 2600);
}

// A tiny pop for an emoji reaction.
export const plip = () => tone({ freq: 1400, to: 2100, type: 'sine', ms: 50, gain: 0.015 });

// ---------- Match draw (arena) effects ----------
// Same rules as above: synthesized, through the master gain, cancelled by mute.

// Filtered noise whose filter frequency glides from -> (mid) -> to over the envelope.
function sweep({ type = 'bandpass', from, mid, to, q = 1, env, delay = 0 }) {
  const a = ready();
  if (!a) return () => {};
  const t = a.currentTime + delay / 1000;
  const end = env.at(-1)[0] / 1000;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a);
  src.loop = true;
  const f = a.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  if (mid) f.frequency.exponentialRampToValueAtTime(mid, t + end / 2);
  f.frequency.exponentialRampToValueAtTime(to, t + end);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  for (const [ms, v] of env) g.gain.linearRampToValueAtTime(v, t + ms / 1000);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + end + 0.05);
  return () => {
    try {
      g.gain.cancelScheduledValues(a.currentTime);
      g.gain.setTargetAtTime(0.0001, a.currentTime, 0.04);
      src.stop(a.currentTime + 0.2);
    } catch { /* already stopped */ }
  };
}

// Rising whoosh under a title card ("MATCH 4 — THUNDERSTRIKE").
export function riser(ms = 1200) {
  sweep({ from: 300, to: 4200, q: 1.4, env: [[ms * 0.8, 0.12], [ms, 0.0001]] });
  tone({ freq: 180, to: 720, type: 'sawtooth', ms, gain: 0.025, attack: ms / 1000 * 0.7 });
}

// Heavy hit when a title or card lands.
export function slam(power = 1) {
  tone({ freq: 140, to: 38, type: 'sine', ms: 420, gain: 0.32 * power, attack: 0.002 });
  noiseShape({ type: 'highpass', freq: 1800, env: [[3, 0.18 * power], [90, 0.0001]] });
  noiseShape({ type: 'lowpass', freq: 500, env: [[5, 0.16 * power], [380, 0.0001]] });
}

// Crosshair gliding over a team tile.
export const scanTick = () => tone({ freq: 1900, to: 1500, type: 'sine', ms: 28, gain: 0.025 });

// Tension: a heartbeat whose pace the caller raises as the reveal nears. Returns { setRate, stop }.
export function heartbeat() {
  let bpm = 70;
  let stopped = false;
  const beat = () => {
    if (stopped || !ready()) return;
    tone({ freq: 70, to: 40, type: 'sine', ms: 140, gain: 0.22, attack: 0.003 });
    later(() => tone({ freq: 60, to: 38, type: 'sine', ms: 120, gain: 0.14, attack: 0.003 }), 170);
  };
  let id;
  const loop = () => {
    beat();
    id = later(loop, 60000 / bpm);
  };
  loop();
  const stop = () => {
    stopped = true;
    clearTimeout(id);
    timers.delete(id);
  };
  const untrack = track(stop);
  return { setRate(b) { bpm = Math.max(50, Math.min(190, b)); }, stop: untrack };
}

// Target locked: two fast beeps and a held tone.
export function lockOn() {
  tone({ freq: 1760, type: 'square', ms: 60, gain: 0.05 });
  tone({ freq: 1760, type: 'square', ms: 60, gain: 0.05, delay: 90 });
  tone({ freq: 2349, type: 'square', ms: 200, gain: 0.05, delay: 180 });
}

// Something fast flying past.
export function whoosh(ms = 520) {
  sweep({ from: 500, mid: 2600, to: 700, q: 2, env: [[ms * 0.55, 0.16], [ms, 0.0001]] });
}

// A dart or arrow biting into the board.
export function thunk() {
  const a = ready();
  if (a) knock(a, a.currentTime, 0.16, 0.55);
  tone({ freq: 160, to: 62, type: 'triangle', ms: 200, gain: 0.3 });
  noiseShape({ type: 'bandpass', freq: 420, q: 3, env: [[4, 0.16], [160, 0.0001]] });
  // The shaft quivering.
  for (let i = 0; i < 5; i++) tone({ freq: 210, to: 190, type: 'triangle', ms: 70, gain: 0.04 / (i + 1), delay: 120 + i * 70 });
}

// Bow string released.
export function twang() {
  tone({ freq: 196, to: 150, type: 'triangle', ms: 420, gain: 0.16, attack: 0.002 });
  tone({ freq: 392, to: 300, type: 'sine', ms: 260, gain: 0.05, attack: 0.002 });
  whoosh(420);
}

// Lightning: a sharp crack, then the rumble rolling away.
export function thunder() {
  noiseShape({ type: 'highpass', freq: 2500, env: [[2, 0.4], [60, 0.05], [140, 0.0001]] });
  noiseShape({ type: 'bandpass', freq: 1200, q: 0.6, env: [[5, 0.28], [260, 0.02], [400, 0.0001]] });
  sweep({ type: 'lowpass', from: 900, to: 90, q: 0.5, env: [[40, 0.4], [600, 0.28], [1300, 0.14], [2600, 0.0001]] });
  tone({ freq: 55, to: 30, type: 'sine', ms: 1400, gain: 0.25 });
}

// Static crackle while the storm gathers (short).
export function crackle() {
  for (let i = 0; i < 6; i++) {
    later(() => noiseShape({ type: 'highpass', freq: 3500, env: [[2, 0.05 + Math.random() * 0.05], [25, 0.0001]] }), i * 45 + Math.random() * 30);
  }
}

// Explosion: crack, fireball roar and a sub-bass drop.
export function boom(power = 1) {
  noiseShape({ type: 'highpass', freq: 1500, env: [[2, 0.3 * power], [80, 0.0001]] });
  sweep({ type: 'lowpass', from: 2200, to: 120, q: 0.4, env: [[10, 0.5 * power], [500, 0.25 * power], [1600, 0.0001]] });
  tone({ freq: 90, to: 28, type: 'sine', ms: 900, gain: 0.4 * power, attack: 0.003 });
}

// Missile / rocket launch roar, rising.
export function launch(ms = 700) {
  sweep({ type: 'bandpass', from: 250, to: 1800, q: 0.8, env: [[80, 0.14], [ms, 0.2], [ms + 120, 0.0001]] });
  tone({ freq: 70, to: 140, type: 'sawtooth', ms, gain: 0.04 });
}

// Falling-from-the-sky whistle (meteor).
export function fall(ms = 800) {
  tone({ freq: 2200, to: 260, type: 'sine', ms, gain: 0.06, attack: 0.05 });
  sweep({ type: 'lowpass', from: 400, to: 2500, q: 0.6, env: [[ms * 0.9, 0.18], [ms, 0.0001]] });
}

// Pickleball: paddle smash, then a ricochet "pyew" off a wall.
export function smashHit() {
  tone({ freq: 520, to: 210, type: 'triangle', ms: 70, gain: 0.22, attack: 0.001 });
  noiseShape({ type: 'bandpass', freq: 1700, q: 2, env: [[2, 0.18], [45, 0.0001]] });
}
export function ricochet() {
  tone({ freq: 420, to: 260, type: 'triangle', ms: 50, gain: 0.14, attack: 0.001 });
  tone({ freq: 2800, to: 900, type: 'sine', ms: 240, gain: 0.05, delay: 20 });
}

// Electric arc between the last two teams.
export function zap(ms = 400) {
  const steps = Math.max(3, Math.round(ms / 40));
  for (let i = 0; i < steps; i++) {
    const f = 80 + Math.random() * 260;
    tone({ freq: f, to: f * (0.7 + Math.random() * 0.6), type: 'sawtooth', ms: 45, gain: 0.04, delay: i * 40 });
  }
  noiseShape({ type: 'highpass', freq: 3000, env: [[10, 0.06], [ms, 0.04], [ms + 60, 0.0001]] });
}

// VERSUS: the two teams collide. Sub drop, crash and a metallic ring.
export function versus() {
  slam(1.3);
  sweep({ type: 'bandpass', from: 5200, to: 1800, q: 0.7, env: [[8, 0.22], [900, 0.04], [1500, 0.0001]] });
  for (const [f, g] of [[523, 0.06], [784, 0.05], [1047, 0.04], [1568, 0.025]]) {
    tone({ freq: f, type: 'triangle', ms: 1500, gain: g, attack: 0.004 });
    tone({ freq: f * 2.76, type: 'sine', ms: 700, gain: g * 0.3, attack: 0.002 });
  }
  later(cheer, 250);
}

// The arena opens: drum hits building up, then a horn chord.
export function arenaOpen() {
  [0, 260, 520, 700, 840, 960].forEach((d, i) => later(() => {
    tone({ freq: 110 - i * 6, to: 50, type: 'sine', ms: 260, gain: 0.26, attack: 0.002 });
    noiseShape({ type: 'lowpass', freq: 700, env: [[3, 0.09], [140, 0.0001]] });
  }, d));
  for (const f of [262, 330, 392, 523]) {
    tone({ freq: f, type: 'sawtooth', ms: 1300, gain: 0.03, delay: 1150, attack: 0.04 });
    tone({ freq: f / 2, type: 'triangle', ms: 1300, gain: 0.06, delay: 1150, attack: 0.04 });
  }
  later(cheer, 1300);
}

// ---------- Access for recorded sounds (cup/sfx.js) ----------
// The context (created suspended if needed, for decoding files) and the master gain everything
// must go through, so mute keeps silencing recorded sounds too.
export const audioContext = () => ensureContext();
export const playable = () => (wanted && running() ? { ctx, master } : null);
// Register a long-running sound so stopAll() (mute) stops it.
export const trackSound = stop => track(stop);

// Diagnostics (used by tests/QA): how many long-running sounds and scheduled sound timers exist.
export const activeSounds = () => ({ live: live.size, scheduled: timers.size, context: ctx?.state ?? 'none', status: soundStatus() });
