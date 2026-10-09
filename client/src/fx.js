// Presentation-only effects: synthesized sounds (no audio files) and a confetti burst.
// Nothing here touches the draw; it only decorates what the server already decided.

const SOUND_KEY = 'team-draw:sound';
let ctx = null;
let enabled = (() => {
  try {
    return localStorage.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
})();

export const soundOn = () => enabled;
export function setSound(on) {
  enabled = on;
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch { /* storage unavailable */ }
  // Browsers only allow audio after a tap, and this is always called from one.
  if (on) audio()?.resume();
}

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function tone({ freq, to = freq, type = 'sine', ms = 120, gain = 0.2, delay = 0 }) {
  const a = enabled && audio();
  if (!a || a.state !== 'running') return;
  const t = a.currentTime + delay / 1000;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + ms / 1000);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + ms / 1000 + 0.02);
}

// A name passing the centre line: a soft slot-machine click.
export const tick = () => tone({ freq: 1800, to: 900, type: 'square', ms: 25, gain: 0.04 });
// Paddle hitting the ball: a hollow "pock".
export const pock = () => tone({ freq: 420, to: 160, type: 'triangle', ms: 90, gain: 0.35 });
// Countdown beeps: 3, 2, 1 low, then a high "go".
export const beep = go => tone({ freq: go ? 1320 : 660, type: 'square', ms: go ? 380 : 160, gain: 0.12 });
// Winner fanfare: a rising major arpeggio.
export function fanfare() {
  [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', ms: 260, gain: 0.18, delay: i * 110 }));
  tone({ freq: 1047, to: 1568, type: 'sine', ms: 600, gain: 0.12, delay: 440 });
}
// The whole-category shuffle: a quick cascade, one note per team dealt.
export function deal(count) {
  for (let i = 0; i < Math.min(count, 28); i++) tone({ freq: 500 + i * 22, type: 'triangle', ms: 70, gain: 0.08, delay: i * 90 });
}

// ---------- Crowd & stadium sounds (all synthesized) ----------

const live = () => {
  const a = enabled && audio();
  return a && a.state === 'running' ? a : null;
};
let noise = null;
function noiseBuffer(a) {
  if (!noise) {
    noise = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}
// Filtered noise with a gain envelope: [[time ms, gain], ...]. Returns a stop function.
function noiseShape({ type = 'bandpass', freq = 800, q = 0.7, env, delay = 0 }) {
  const a = live();
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
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
  const end = env.at(-1)[0];
  src.stop(t + end / 1000 + 0.05);
  return () => {
    try {
      g.gain.cancelScheduledValues(a.currentTime);
      g.gain.setTargetAtTime(0.0001, a.currentTime, 0.15);
      src.stop(a.currentTime + 0.6);
    } catch { /* already stopped */ }
  };
}

// Stadium murmur that swells while the reel spins. Returns stop().
export const crowdSwell = ms => noiseShape({ freq: 650, q: 0.5, env: [[200, 0.05], [ms, 0.22], [ms + 4000, 0.22]] });

// The roar on a reveal: a crowd burst plus a few "woo!" whistles.
export function cheer() {
  noiseShape({ freq: 1100, q: 0.4, env: [[60, 0.45], [700, 0.3], [2200, 0.0001]] });
  noiseShape({ type: 'highpass', freq: 3000, env: [[80, 0.12], [1500, 0.0001]] });
  [0, 180, 420].forEach((d, i) => tone({ freq: 700 + i * 160, to: 1400 + i * 200, type: 'sine', ms: 380, gain: 0.05, delay: 150 + d }));
}

// "Ohhh!" on a near miss: a falling vowel-ish groan from a crowd.
export function ohh() {
  const a = live();
  if (!a) return;
  const t = a.currentTime;
  [196, 220, 247, 175].forEach((base, i) => {
    const o = a.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 1.25, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.8, t + 1.1);
    const f = a.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 600 + i * 90;
    f.Q.value = 4;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(f).connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + 1.25);
  });
  noiseShape({ freq: 500, q: 1, env: [[150, 0.12], [1200, 0.0001]] });
}

// Snare drumroll that crescendos for `ms` (used when only a few names are left). Returns stop().
export function drumroll(ms) {
  const a = live();
  if (!a) return () => {};
  const timers = [];
  const hits = Math.floor(ms / 45);
  for (let i = 0; i < hits; i++) {
    const gain = 0.04 + 0.22 * (i / hits);
    timers.push(setTimeout(() => noiseShape({ type: 'highpass', freq: 1800, env: [[3, gain], [40, 0.0001]] }), i * 45));
  }
  return () => timers.forEach(clearTimeout);
}

// A pickleball rally that speeds up over `ms` and ends in a smash. Returns stop().
export function rallyToSmash(ms) {
  const timers = [];
  let at = 0;
  let gap = 420;
  while (at + gap < ms - 150) {
    at += gap;
    timers.push(setTimeout(pock, at));
    gap = Math.max(110, gap * 0.82);
  }
  timers.push(setTimeout(smash, ms));
  return () => timers.forEach(clearTimeout);
}
export function smash() {
  tone({ freq: 300, to: 90, type: 'triangle', ms: 160, gain: 0.5 });
  noiseShape({ type: 'highpass', freq: 2000, env: [[5, 0.35], [120, 0.0001]] });
}

// Walk-out jingle per category, so the room hears which round is starting.
const JINGLES = {
  A: [[392, 0], [523, 140], [659, 280], [784, 420], [1047, 620]],
  WOMEN: [[659, 0], [784, 160], [988, 320], [1175, 480], [1319, 700]],
  B: [[440, 0], [554, 150], [659, 300], [880, 520]],
  C: [[349, 0], [440, 150], [523, 300], [698, 520]],
  D: [[330, 0], [415, 150], [494, 300], [659, 520]],
};
export function jingle(category) {
  for (const [f, d] of JINGLES[category] ?? JINGLES.B) {
    tone({ freq: f, type: 'square', ms: 170, gain: 0.07, delay: d });
    tone({ freq: f / 2, type: 'triangle', ms: 200, gain: 0.1, delay: d });
  }
}

// Referee whistle (three blasts) then a trophy fanfare: a category is locked in.
export function whistleAndTrophy() {
  const a = live();
  if (!a) return;
  [0, 260, 520].forEach((d, i) => {
    const t = a.currentTime + d / 1000;
    const o = a.createOscillator();
    const lfo = a.createOscillator();
    const lfoGain = a.createGain();
    o.type = 'sine';
    o.frequency.value = 2900;
    lfo.frequency.value = 38;
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(o.frequency);
    const g = a.createGain();
    const len = i === 2 ? 0.55 : 0.18;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.02);
    g.gain.setValueAtTime(0.1, t + len - 0.03);
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(a.destination);
    o.start(t);
    lfo.start(t);
    o.stop(t + len + 0.02);
    lfo.stop(t + len + 0.02);
  });
  const notes = [[523, 0, 220], [523, 230, 120], [523, 360, 120], [698, 500, 700], [784, 1250, 260], [880, 1520, 260], [1047, 1800, 900]];
  for (const [f, d, ms] of notes) {
    tone({ freq: f, type: 'sawtooth', ms, gain: 0.06, delay: 1100 + d });
    tone({ freq: f / 2, type: 'triangle', ms, gain: 0.1, delay: 1100 + d });
  }
  setTimeout(cheer, 2600);
}

// A tiny "pop" for an emoji reaction (quiet, so a busy room doesn't get noisy).
export const plip = () => tone({ freq: 1400, to: 2100, type: 'sine', ms: 60, gain: 0.025 });

const COLORS = ['#1f5fc6', '#6cc04a', '#f4e04d', '#ffffff', '#0f2a6b'];
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Confetti + pickleballs from a point on screen. Self-cleaning canvas, ~2.5 s.
export function confetti(originEl) {
  if (reducedMotion()) return;
  const rect = originEl?.getBoundingClientRect() ?? { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  document.body.append(canvas);
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const ox = rect.left + rect.width / 2;
  const oy = rect.top + rect.height / 2;
  const bits = Array.from({ length: 140 }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 9;
    return {
      x: ox, y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6,
      size: 5 + Math.random() * 7,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      color: COLORS[i % COLORS.length],
      ball: i % 12 === 0,
    };
  });
  const t0 = performance.now();
  const frame = now => {
    const life = (now - t0) / 2500;
    g.clearRect(0, 0, innerWidth, innerHeight);
    g.globalAlpha = Math.max(0, 1 - life ** 3);
    for (const b of bits) {
      b.vy += 0.35;
      b.vx *= 0.985;
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.vr;
      if (b.ball) {
        g.fillStyle = '#f4e04d';
        g.beginPath();
        g.arc(b.x, b.y, b.size, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#0f2a6b';
        for (const [dx, dy] of [[-0.35, -0.3], [0.3, -0.25], [0, 0.35]]) {
          g.beginPath();
          g.arc(b.x + dx * b.size, b.y + dy * b.size, b.size * 0.16, 0, Math.PI * 2);
          g.fill();
        }
      } else {
        g.save();
        g.translate(b.x, b.y);
        g.rotate(b.rot);
        g.fillStyle = b.color;
        g.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
        g.restore();
      }
    }
    if (life < 1) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
