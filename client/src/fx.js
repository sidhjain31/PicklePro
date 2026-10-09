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
