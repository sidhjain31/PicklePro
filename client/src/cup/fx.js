// Arena effects: one full-screen canvas (pointer-events: none) for everything that flies or
// explodes — darts, arrows, lightning, pickleball ricochets, missiles, meteors, sparks, smoke,
// shockwaves. Viewport coordinates. Presentation only: the server already chose the teams.
import * as sound from '../sound.js';
import { SHOTS } from './looks.jsx';

// Phone buzz on a reveal — only once the viewer has tapped the page (browsers refuse it before).
export const buzz = pattern => { if (navigator.userActivation?.hasBeenActive ?? true) navigator.vibrate?.(pattern); };

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let canvas = null;
let g = null;
let W = 0;
let H = 0;
let raf = 0;
let lastT = 0;
const items = new Set();

function resize() {
  if (!canvas) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function ensure() {
  if (canvas?.isConnected) return;
  canvas = document.createElement('canvas');
  canvas.className = 'arena-fx';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  g = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}
function frame(t) {
  const dt = Math.min(3, (t - lastT) / 16.67);
  lastT = t;
  g.clearRect(0, 0, W, H);
  for (const it of items) if (it(g, t, dt) === false) items.delete(it);
  if (items.size) raf = requestAnimationFrame(frame);
  else {
    raf = 0;
    g.clearRect(0, 0, W, H);
  }
}
function add(item) {
  ensure();
  items.add(item);
  if (!raf) {
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
  }
  return item;
}
export function clearFx() {
  items.clear();
}
export const viewport = () => ({ w: window.innerWidth, h: window.innerHeight });

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = list => list[Math.floor(Math.random() * list.length)];
const easeOut = t => 1 - (1 - t) ** 3;
const easeIn = t => t * t;
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- Particles ----------

export function burst(x, y, opts = {}) {
  if (reduced()) return;
  const {
    n = 40, colors = ['#ffffff'], speed = [2, 9], life = [450, 1100], size = [2, 5], gravity = 0.12,
    drag = 0.95, shape = 'spark', angle = 0, spread = Math.PI * 2, glow = false,
  } = opts;
  const t0 = performance.now();
  const ps = Array.from({ length: n }, () => {
    const a = angle + (Math.random() - 0.5) * spread;
    const v = rnd(speed[0], speed[1]);
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(life[0], life[1]), s: rnd(size[0], size[1]), c: pick(colors), r: Math.random() * 6, vr: rnd(-0.3, 0.3) };
  });
  add((ctx, t, dt) => {
    let alive = false;
    if (glow) ctx.globalCompositeOperation = 'lighter';
    for (const p of ps) {
      const age = (t - t0) / p.life;
      if (age >= 1) continue;
      alive = true;
      p.vx *= drag ** dt;
      p.vy = p.vy * drag ** dt + gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      const fade = 1 - age;
      ctx.globalAlpha = Math.max(0, shape === 'smoke' ? fade * 0.45 : fade);
      ctx.fillStyle = p.c;
      ctx.strokeStyle = p.c;
      if (shape === 'spark') {
        ctx.lineWidth = p.s * 0.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 2.4, p.y - p.vy * 2.4);
        ctx.stroke();
      } else if (shape === 'chip') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillRect(-p.s, -p.s / 2, p.s * 2, p.s);
        ctx.restore();
      } else {
        const grow = shape === 'smoke' ? 1 + age * 3 : shape === 'fire' ? fade : 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.s * grow), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return alive;
  });
}

export function ring(x, y, { color = '#ffffff', r = 90, ms = 600, width = 6 } = {}) {
  if (reduced()) return;
  const t0 = performance.now();
  add((ctx, t) => {
    const k = (t - t0) / ms;
    if (k >= 1) return false;
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * (1 - k) + 1;
    ctx.beginPath();
    ctx.arc(x, y, 8 + easeOut(k) * r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return true;
  });
}

// ---------- Lightning ----------

function boltPath(x1, y1, x2, y2, rough) {
  let pts = [[x1, y1], [x2, y2]];
  let off = rough;
  for (let k = 0; k < 6; k++) {
    const next = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / len;
      const ny = (bx - ax) / len;
      const d = rnd(-off, off);
      next.push(pts[i], [(ax + bx) / 2 + nx * d, (ay + by) / 2 + ny * d]);
    }
    next.push(pts.at(-1));
    pts = next;
    off /= 2;
  }
  return pts;
}
function strokePath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.stroke();
}
// A flickering bolt from (x1, y1) to (x2, y2), regenerated every few frames, with side branches.
export function bolt(x1, y1, x2, y2, { ms = 500, color = '#9fd8ff', width = 3, branches = 3 } = {}) {
  const t0 = performance.now();
  const len = Math.hypot(x2 - x1, y2 - y1);
  let pts = null;
  let forks = [];
  let lastGen = 0;
  add((ctx, t) => {
    const k = (t - t0) / ms;
    if (k >= 1) return false;
    if (!pts || t - lastGen > 55) {
      lastGen = t;
      pts = boltPath(x1, y1, x2, y2, len * 0.18);
      forks = Array.from({ length: branches }, () => {
        const from = pick(pts.slice(2, -4));
        const a = Math.atan2(y2 - y1, x2 - x1) + rnd(-0.9, 0.9);
        const l = len * rnd(0.12, 0.3);
        return boltPath(from[0], from[1], from[0] + Math.cos(a) * l, from[1] + Math.sin(a) * l, l * 0.25);
      });
    }
    const flicker = Math.random() < 0.18 ? 0.35 : 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [w, a, c] of [[width * 7, 0.12, color], [width * 3, 0.35, color], [width, 1, '#ffffff']]) {
      ctx.globalAlpha = a * flicker * (1 - k * 0.6);
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      strokePath(ctx, pts);
      ctx.lineWidth = w * 0.5;
      forks.forEach(f => strokePath(ctx, f));
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return true;
  });
}

// ---------- Projectiles ----------

const paths = {
  arc: (a, b, lift) => t => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) - Math.sin(Math.PI * t) * lift }),
  line: (a, b) => t => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }),
  cubic: (a, c1, c2, b) => t => {
    const u = 1 - t;
    return {
      x: u ** 3 * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x,
      y: u ** 3 * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y,
    };
  },
  poly: pts => {
    const segs = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
    const total = segs.reduce((s, l) => s + l, 0);
    return t => {
      let d = t * total;
      for (let i = 0; i < segs.length; i++) {
        if (d <= segs[i] || i === segs.length - 1) {
          const k = Math.min(1, d / segs[i]);
          return { x: lerp(pts[i].x, pts[i + 1].x, k), y: lerp(pts[i].y, pts[i + 1].y, k), seg: i };
        }
        d -= segs[i];
      }
      return pts.at(-1);
    };
  },
};

// Moves a drawn projectile along `path` over `ms`; resolves on arrival.
function fly({ path, ms, ease = t => t, draw, trail, scale = () => 1 }) {
  return new Promise(resolve => {
    const t0 = performance.now();
    const hist = [];
    add((ctx, t, dt) => {
      const raw = Math.min(1, (t - t0) / ms);
      const k = ease(raw);
      const p = path(k);
      const q = path(Math.min(1, k + 0.01));
      const ang = raw >= 1 ? Math.atan2(p.y - path(k - 0.01).y, p.x - path(k - 0.01).x) : Math.atan2(q.y - p.y, q.x - p.x);
      hist.push(p);
      if (hist.length > 14) hist.shift();
      trail?.(ctx, p, ang, hist, dt);
      draw(ctx, p.x, p.y, ang, scale(raw), raw);
      if (raw >= 1) {
        resolve(p);
        return false;
      }
      return true;
    });
  });
}

function drawDart(ctx, x, y, ang, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(s, s);
  // tip
  ctx.fillStyle = '#e8eef5';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-12, -1.6);
  ctx.lineTo(-12, 1.6);
  ctx.fill();
  // barrel
  const grd = ctx.createLinearGradient(0, -4, 0, 4);
  grd.addColorStop(0, '#9aa7b8');
  grd.addColorStop(0.5, '#2b3646');
  grd.addColorStop(1, '#6c7a8d');
  ctx.fillStyle = grd;
  ctx.fillRect(-30, -3.6, 18, 7.2);
  ctx.fillStyle = '#f4e04d';
  for (let i = 0; i < 3; i++) ctx.fillRect(-28 + i * 5, -3.6, 1.6, 7.2);
  // shaft
  ctx.fillStyle = '#0f2a6b';
  ctx.fillRect(-44, -1.4, 14, 2.8);
  // flights
  ctx.fillStyle = '#6cc04a';
  ctx.beginPath();
  ctx.moveTo(-40, 0);
  ctx.lineTo(-58, -11);
  ctx.lineTo(-62, -11);
  ctx.lineTo(-54, 0);
  ctx.lineTo(-62, 11);
  ctx.lineTo(-58, 11);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function drawArrow(ctx, x, y, ang, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(s, s);
  ctx.fillStyle = '#d9dee6';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-14, -6);
  ctx.lineTo(-11, 0);
  ctx.lineTo(-14, 6);
  ctx.fill();
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(-82, -1.6, 70, 3.2);
  ctx.fillStyle = '#e8442e';
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-70, 0);
    ctx.lineTo(-86, sgn * 9);
    ctx.lineTo(-94, sgn * 9);
    ctx.lineTo(-82, 0);
    ctx.fill();
  }
  ctx.restore();
}
function drawBall(ctx, x, y, ang, s, squash = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(s * (1 + squash), s * (1 - squash * 0.6));
  ctx.fillStyle = '#f4e04d';
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0f2a6b';
  for (const [dx, dy] of [[-4, -4], [4, -3], [0, 4], [-6, 2], [6, 3]]) {
    ctx.beginPath();
    ctx.arc(dx, dy, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
function drawMissile(ctx, x, y, ang, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(s, s);
  // flame
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = ['#ffef9a', '#ffb02e', '#ff5a1f'][i];
    ctx.beginPath();
    ctx.moveTo(-34, -4 + i);
    ctx.lineTo(-34 - rnd(14, 26) + i * 4, 0);
    ctx.lineTo(-34, 4 - i);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#e9edf2';
  ctx.fillRect(-34, -5, 26, 10);
  ctx.fillStyle = '#c2412d';
  ctx.beginPath();
  ctx.moveTo(-8, -5);
  ctx.quadraticCurveTo(6, 0, -8, 5);
  ctx.fill();
  ctx.fillStyle = '#55657a';
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-34, sgn * 5);
    ctx.lineTo(-40, sgn * 12);
    ctx.lineTo(-26, sgn * 5);
    ctx.fill();
  }
  ctx.restore();
}
function drawMeteor(ctx, x, y, ang, s) {
  const r = 15 * s;
  const grd = ctx.createRadialGradient(x, y, 1, x, y, r * 2.4);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.25, '#ffe27a');
  grd.addColorStop(0.55, 'rgba(255,120,30,0.8)');
  grd.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#5a3a2a';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.75, 0, Math.PI * 2);
  ctx.fill();
}

// Trails
const ghostTrail = color => (ctx, p, ang, hist) => {
  hist.forEach((h, i) => {
    ctx.globalAlpha = (i / hist.length) * 0.35;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(h.x, h.y, 2 + i * 0.6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
};
const speedLines = (ctx, p, ang, hist) => {
  if (hist.length < 2) return;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hist[0].x, hist[0].y);
  for (const h of hist) ctx.lineTo(h.x, h.y);
  ctx.stroke();
};
const emitter = (spawn, every = 1) => {
  let acc = 0;
  return (ctx, p, ang, hist, dt) => {
    acc += dt;
    while (acc >= every) {
      acc -= every;
      spawn(p, ang);
    }
  };
};

// Flash the whole screen.
export function flash(color = '#ffffff', ms = 320, opacity = 0.85) {
  if (reduced()) return;
  const el = document.createElement('div');
  el.className = 'arena-flash';
  el.style.background = color;
  document.body.append(el);
  el.animate([{ opacity }, { opacity: 0 }], { duration: ms, easing: 'ease-out' }).finished.finally(() => el.remove());
}
// Shake an element (the arena, the VS overlay).
export function shake(el, power = 10, ms = 450) {
  if (!el || reduced() || !el.animate) return;
  const frames = Array.from({ length: 9 }, (_, i) => {
    const k = 1 - i / 9;
    return { transform: `translate(${rnd(-power, power) * k}px, ${rnd(-power, power) * k}px) rotate(${rnd(-0.6, 0.6) * k}deg)` };
  });
  el.animate([...frames, { transform: 'none' }], { duration: ms, easing: 'linear' });
}
// Big comic-style word popping at a point ("BULLSEYE!").
export function pop(x, y, text, tone = 'a') {
  const el = document.createElement('div');
  el.className = `arena-pop arena-pop-${tone}`;
  el.textContent = text;
  // Keep the word on screen when the target tile sits at an edge.
  const half = Math.min(window.innerWidth / 2 - 8, 110);
  el.style.left = `${Math.max(half, Math.min(window.innerWidth - half, x))}px`;
  el.style.top = `${y}px`;
  document.body.append(el);
  setTimeout(() => el.remove(), 1300);
}

// ---------- Weapons ----------
// strike() flies the weapon from off-screen into the target point (tx, ty), plays the impact and
// resolves just after impact. `side` 'a' | 'b' picks the launch side so the two strikes differ.

const SPARKS = ['#ffffff', '#f4e04d', '#9fd8ff'];
const FIRE = ['#fff2b0', '#ffc93c', '#ff8a2a', '#ff4d1f'];
const SMOKE = ['#6b7280', '#4b5563', '#9ca3af'];
const CHIPS = ['#f4e9d0', '#d9c39a', '#ffffff', '#b89b6a'];
export { SHOTS as WEAPON_INFO } from './looks.jsx';
// 2D fallback (no WebGL): each Smash Arena shot borrows the closest 2D effect.
const STYLE_2D = { fireball: 'meteor', laser: 'dart', rocket: 'missile', curve: 'smash' };

export async function strike(shot, { tx, ty, side = 'a', shakeEl, onImpact }) {
  const { w, h } = viewport();
  const word = SHOTS[shot]?.word ?? 'HIT!';
  const weapon = STYLE_2D[shot] ?? shot;
  const left = side === 'a';
  const impact = (fn, power = 10) => {
    onImpact?.();
    fn?.();
    shake(shakeEl, power, 520);
    pop(tx, ty, word, side);
    buzz([30, 30, 90]);
  };
  if (reduced()) {
    impact(null, 0);
    return;
  }
  switch (weapon) {
    case 'dart': {
      sound.whoosh(600);
      await fly({ path: paths.arc({ x: w / 2 + (left ? -60 : 60), y: h + 90 }, { x: tx, y: ty }, Math.min(220, h * 0.25)), ms: 640, ease: easeOut, draw: drawDart, trail: speedLines, scale: k => lerp(2.8, 1, easeOut(k)) });
      impact(() => {
        sound.thunk();
        burst(tx, ty, { n: 22, colors: CHIPS, shape: 'chip', speed: [2, 7], size: [2, 4], gravity: 0.3 });
        ring(tx, ty, { color: '#ffffff', r: 60, width: 4 });
      }, 7);
      break;
    }
    case 'arrow': {
      sound.twang();
      const from = { x: left ? -100 : w + 100, y: ty - h * 0.18 };
      await fly({ path: paths.arc(from, { x: tx, y: ty }, 70), ms: 520, ease: t => t, draw: drawArrow, trail: speedLines, scale: () => 1.1 });
      impact(() => {
        sound.thunk();
        burst(tx, ty, { n: 18, colors: CHIPS, shape: 'chip', speed: [2, 6], gravity: 0.3, angle: left ? Math.PI : 0, spread: 1.6 });
        ring(tx, ty, { color: '#ffffff', r: 50, width: 3 });
      }, 6);
      break;
    }
    case 'thunder': {
      sound.crackle();
      flash('#0b1f52', 260, 0.55);
      await new Promise(r => setTimeout(r, 260));
      const x0 = tx + rnd(-w * 0.15, w * 0.15);
      bolt(x0, -20, tx, ty, { ms: 520, width: 3.2, branches: 4 });
      bolt(tx + rnd(-60, 60), -20, tx, ty, { ms: 300, width: 1.6, branches: 1 });
      impact(() => {
        sound.thunder();
        flash('#e8f4ff', 380, 0.9);
        burst(tx, ty, { n: 60, colors: SPARKS, speed: [3, 12], life: [300, 900], glow: true });
        ring(tx, ty, { color: '#9fd8ff', r: 140, width: 7 });
      }, 13);
      await new Promise(r => setTimeout(r, 120));
      break;
    }
    case 'smash': {
      sound.smashHit();
      const y1 = rnd(h * 0.25, h * 0.75);
      const y2 = rnd(h * 0.2, h * 0.7);
      const pts = left
        ? [{ x: w / 2, y: h + 30 }, { x: 14, y: y1 }, { x: w - 14, y: y2 }, { x: tx, y: ty }]
        : [{ x: w / 2, y: h + 30 }, { x: w - 14, y: y1 }, { x: 14, y: y2 }, { x: tx, y: ty }];
      const path = paths.poly(pts);
      let seg = 0;
      await fly({
        path,
        ms: 980,
        ease: t => t,
        draw: (ctx, x, y, ang, s) => drawBall(ctx, x, y, ang, s),
        trail: (ctx, p, ang, hist) => {
          if (p.seg !== undefined && p.seg !== seg) {
            seg = p.seg;
            sound.ricochet();
            burst(hist.at(-2)?.x ?? p.x, hist.at(-2)?.y ?? p.y, { n: 10, colors: ['#f4e04d', '#ffffff'], speed: [2, 5], life: [200, 450] });
          }
          ghostTrail('#f4e04d')(ctx, p, ang, hist);
        },
        scale: k => lerp(1.8, 1.2, k),
      });
      impact(() => {
        sound.smashHit();
        sound.boom(0.4);
        burst(tx, ty, { n: 34, colors: ['#f4e04d', '#6cc04a', '#ffffff'], shape: 'dot', speed: [3, 10], size: [2, 4] });
        ring(tx, ty, { color: '#f4e04d', r: 110, width: 6 });
      }, 9);
      break;
    }
    case 'missile': {
      sound.launch(820);
      const from = { x: left ? -40 : w + 40, y: h + 40 };
      const c1 = { x: from.x + (left ? 60 : -60), y: h * 0.25 };
      const c2 = { x: tx + (left ? 240 : -240), y: ty - h * 0.35 };
      const smoke = emitter(p => burst(p.x, p.y, { n: 1, colors: SMOKE, shape: 'smoke', speed: [0, 0.6], size: [4, 7], life: [600, 900], gravity: -0.02 }), 1);
      await fly({ path: paths.cubic(from, c1, c2, { x: tx, y: ty }), ms: 950, ease: easeIn, draw: drawMissile, trail: smoke, scale: () => 1.15 });
      impact(() => {
        sound.boom(1);
        flash('#ffb347', 300, 0.5);
        burst(tx, ty, { n: 60, colors: FIRE, shape: 'fire', speed: [2, 9], size: [5, 11], life: [400, 900], gravity: -0.05, glow: true });
        burst(tx, ty, { n: 18, colors: SMOKE, shape: 'smoke', speed: [1, 3], size: [6, 10], life: [800, 1400], gravity: -0.03 });
        burst(tx, ty, { n: 16, colors: ['#ffffff', '#cfd6df'], shape: 'chip', speed: [4, 10], gravity: 0.3 });
        ring(tx, ty, { color: '#ffb347', r: 150, width: 8 });
      }, 16);
      break;
    }
    case 'meteor': {
      sound.fall(820);
      const from = { x: left ? -120 : w + 120, y: -140 };
      const fire = emitter(p => {
        burst(p.x, p.y, { n: 3, colors: FIRE, shape: 'fire', speed: [0, 1.5], size: [4, 9], life: [250, 550], gravity: -0.02, glow: true });
      }, 1);
      await fly({ path: paths.line(from, { x: tx, y: ty }), ms: 820, ease: easeIn, draw: drawMeteor, trail: fire, scale: k => lerp(0.8, 1.3, k) });
      impact(() => {
        sound.boom(1.3);
        flash('#fff1d6', 420, 0.8);
        burst(tx, ty, { n: 80, colors: FIRE, shape: 'fire', speed: [3, 12], size: [5, 12], life: [500, 1100], glow: true, gravity: 0.05 });
        burst(tx, ty, { n: 24, colors: ['#5a3a2a', '#8a5a3a', '#2b1d14'], shape: 'chip', speed: [4, 12], gravity: 0.35 });
        ring(tx, ty, { color: '#ffd27a', r: 220, width: 10, ms: 750 });
      }, 20);
      break;
    }
    default:
      impact(null, 6);
  }
}

// The last two teams: electric arcs jump between them until fate is revealed. Returns stop().
export function arcBetween(getPoints, { every = 260 } = {}) {
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const [p, q] = getPoints();
    if (p && q) {
      bolt(p.x, p.y, q.x, q.y, { ms: 240, width: 2.2, branches: 2, color: '#d8b4ff' });
      sound.zap(200);
    }
    setTimeout(tick, every * rnd(0.7, 1.3));
  };
  tick();
  return () => { stopped = true; };
}

// VS moment: sparks out of the centre.
export function versusBurst(x, y) {
  burst(x, y, { n: 70, colors: ['#ffffff', '#f4e04d', '#6cc04a', '#5ab0ff'], speed: [4, 15], life: [400, 1000], glow: true });
  ring(x, y, { color: '#ffffff', r: Math.max(window.innerWidth, window.innerHeight) * 0.6, width: 12, ms: 700 });
}

// Celebration: a few firework bursts over the screen.
export function fireworks(count = 6) {
  const { w, h } = viewport();
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const x = rnd(w * 0.15, w * 0.85);
      const y = rnd(h * 0.15, h * 0.5);
      burst(x, y, { n: 50, colors: [pick(['#f4e04d', '#6cc04a', '#5ab0ff', '#ff6b9a', '#ffffff']), '#ffffff'], speed: [2, 7], life: [700, 1300], gravity: 0.06, glow: true, shape: 'dot', size: [1.5, 3] });
    }, i * 280);
  }
}
