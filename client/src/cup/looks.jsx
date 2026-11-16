// Team identity for the match draw: colours, logos (uploaded or generated badges) and the shots.
import { useEffect, useState } from 'react';
import { apiBase } from '../event.js';
import { PALETTE } from './core.js';

// Older phones lack canvas roundRect (used by the badges and 3D labels).
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, w, h, r = 0) {
    const rr = Math.min(Number(r) || 0, w / 2, h / 2);
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
  };
}

export const SHOTS = {
  fireball: { emoji: '🔥', name: 'Fireball Smash', line: 'Hit it hot.', word: 'SMASH!' },
  thunder: { emoji: '⚡', name: 'Thunder Smash', line: 'The sky joins in.', word: 'THUNDER!' },
  laser: { emoji: '💠', name: 'Laser Drive', line: 'Faster than light.', word: 'ZAP!' },
  rocket: { emoji: '🚀', name: 'Rocket Serve', line: 'Lift-off in 3… 2… 1…', word: 'BOOM!' },
  meteor: { emoji: '☄️', name: 'Sky Lob', line: 'Up into orbit… and down.', word: 'IMPACT!' },
  curve: { emoji: '🌀', name: 'Banana Curve', line: 'Watch it bend.', word: 'CURVED!' },
  fate: { emoji: '🔗', name: 'Last Two Standing', line: 'Fate has already decided.', word: 'FATED!' },
};

export const colorOf = (team, i = 0) => team?.color ?? PALETTE[(Number(/\d+/.exec(team?.key ?? '')?.[0] ?? i + 1) - 1) % PALETTE.length];

// Uploaded logos are served by the server; the ICC Season 2 logos ship with the app.
export function uploadedLogoUrl(hash) {
  if (!hash) return null;
  if (hash.startsWith('s:')) return `/season2/logos/${hash.slice(2)}`;
  return `${apiBase()}/fixtures/logo/${hash}`;
}

// ---------- Generated badges (teams without an uploaded logo) ----------

const fontsReady = (async () => {
  try {
    await Promise.all([
      document.fonts?.load('900 80px "Big Shoulders Variable"'),
      document.fonts?.load('800 30px "Archivo Variable"'),
    ]);
  } catch { /* fonts unavailable: canvas falls back */ }
})();

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(c + (amt > 0 ? (255 - c) * amt : c * amt))));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}
const initials = name => {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(w => !/^team$/i.test(w));
  if (!words.length) return '?';
  if (words.length === 1) return /^\d+$/.test(words[0]) ? words[0] : words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

// Small vector icons for the badge centre.
const ICONS = [
  (g, s) => { // pickleball
    g.beginPath(); g.arc(0, 0, s, 0, Math.PI * 2); g.fillStyle = '#f4e04d'; g.fill();
    g.fillStyle = 'rgba(15,42,107,0.85)';
    for (const [x, y] of [[-0.4, -0.35], [0.35, -0.4], [0, 0.05], [-0.45, 0.4], [0.42, 0.38], [0, -0.7], [0, 0.72]]) { g.beginPath(); g.arc(x * s, y * s, s * 0.12, 0, Math.PI * 2); g.fill(); }
  },
  (g, s) => { // crossed paddles
    for (const r of [-0.6, 0.6]) {
      g.save(); g.rotate(r); g.fillStyle = '#ffffff';
      g.beginPath(); g.roundRect(-s * 0.32, -s * 1.05, s * 0.64, s * 1.15, s * 0.28); g.fill();
      g.fillRect(-s * 0.09, s * 0.05, s * 0.18, s * 0.75); g.restore();
    }
  },
  (g, s) => { // lightning
    g.fillStyle = '#ffe14d';
    g.beginPath(); g.moveTo(s * 0.2, -s); g.lineTo(-s * 0.55, s * 0.12); g.lineTo(-s * 0.02, s * 0.12); g.lineTo(-s * 0.25, s); g.lineTo(s * 0.6, -s * 0.18); g.lineTo(s * 0.05, -s * 0.18); g.closePath(); g.fill();
  },
  (g, s) => { // crown
    g.fillStyle = '#ffd34d';
    g.beginPath(); g.moveTo(-s, s * 0.55); g.lineTo(-s, -s * 0.45); g.lineTo(-s * 0.5, s * 0.05); g.lineTo(0, -s * 0.75); g.lineTo(s * 0.5, s * 0.05); g.lineTo(s, -s * 0.45); g.lineTo(s, s * 0.55); g.closePath(); g.fill();
  },
  (g, s) => { // star
    g.fillStyle = '#ffffff'; g.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.45 : s; const a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fill();
  },
  (g, s) => { // flame
    g.fillStyle = '#ff8a2a';
    g.beginPath(); g.moveTo(0, -s); g.bezierCurveTo(s * 0.9, -s * 0.2, s * 0.8, s, 0, s); g.bezierCurveTo(-s * 0.8, s, -s * 0.9, -s * 0.1, -s * 0.15, -s * 0.45); g.bezierCurveTo(-s * 0.1, -s * 0.1, s * 0.15, -s * 0.2, 0, -s); g.fill();
    g.fillStyle = '#ffe27a'; g.beginPath(); g.ellipse(0, s * 0.45, s * 0.32, s * 0.45, 0, 0, Math.PI * 2); g.fill();
  },
  (g, s) => { // wings
    g.fillStyle = '#ffffff';
    for (const d of [-1, 1]) {
      g.beginPath(); g.moveTo(0, s * 0.2);
      for (let i = 0; i < 4; i++) g.lineTo(d * s * (0.35 + i * 0.22), -s * (0.7 - i * 0.12)), g.lineTo(d * s * (0.3 + i * 0.22), -s * (0.35 - i * 0.12));
      g.lineTo(d * s * 0.2, s * 0.45); g.closePath(); g.fill();
    }
  },
  (g, s) => { // trophy
    g.fillStyle = '#ffd34d';
    g.beginPath(); g.moveTo(-s * 0.6, -s * 0.85); g.lineTo(s * 0.6, -s * 0.85); g.quadraticCurveTo(s * 0.6, s * 0.1, 0, s * 0.25); g.quadraticCurveTo(-s * 0.6, s * 0.1, -s * 0.6, -s * 0.85); g.fill();
    g.fillRect(-s * 0.12, s * 0.2, s * 0.24, s * 0.4); g.fillRect(-s * 0.45, s * 0.6, s * 0.9, s * 0.22);
    g.lineWidth = s * 0.12; g.strokeStyle = '#ffd34d';
    g.beginPath(); g.arc(-s * 0.62, -s * 0.5, s * 0.28, Math.PI * 0.5, Math.PI * 1.5); g.stroke();
    g.beginPath(); g.arc(s * 0.62, -s * 0.5, s * 0.28, -Math.PI * 0.5, Math.PI * 0.5); g.stroke();
  },
];

const badgeCache = new Map();
// A round crest: team colour ring, dark centre, icon, initials, team name around the bottom.
export async function badge(team, i = 0, size = 256) {
  const color = colorOf(team, i);
  const key = `${team.name}|${color}|${size}`;
  if (badgeCache.has(key)) return badgeCache.get(key);
  await fontsReady;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const R = size / 2;
  g.translate(R, R);
  // Outer ring.
  const ring = g.createLinearGradient(-R, -R, R, R);
  ring.addColorStop(0, shade(color, 0.45));
  ring.addColorStop(0.5, color);
  ring.addColorStop(1, shade(color, -0.45));
  g.beginPath(); g.arc(0, 0, R * 0.98, 0, Math.PI * 2); g.fillStyle = ring; g.fill();
  g.lineWidth = R * 0.03; g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.arc(0, 0, R * 0.9, 0, Math.PI * 2); g.stroke();
  // Centre.
  const inner = g.createRadialGradient(-R * 0.2, -R * 0.3, R * 0.1, 0, 0, R * 0.72);
  inner.addColorStop(0, shade(color, -0.35));
  inner.addColorStop(1, '#07112e');
  g.beginPath(); g.arc(0, 0, R * 0.72, 0, Math.PI * 2); g.fillStyle = inner; g.fill();
  g.lineWidth = R * 0.025; g.strokeStyle = shade(color, 0.3);
  g.stroke();
  // Icon + initials.
  const seed = [...team.name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, i);
  g.save(); g.translate(0, -R * 0.3); ICONS[seed % ICONS.length](g, R * 0.2); g.restore();
  const text = initials(team.name);
  g.font = `900 ${R * (text.length > 2 ? 0.48 : 0.62)}px "Big Shoulders Variable", Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = R * 0.05; g.strokeStyle = shade(color, -0.6);
  g.strokeText(text, 0, R * 0.2);
  g.fillStyle = '#ffffff';
  g.fillText(text, 0, R * 0.2);
  // Name around the bottom of the ring.
  const name = team.name.toUpperCase().slice(0, 24);
  g.font = `800 ${R * 0.12}px "Archivo Variable", Arial, sans-serif`;
  g.fillStyle = '#ffffff';
  const radius = R * 0.81;
  const widths = [...name].map(ch => g.measureText(ch).width + R * 0.012);
  const total = widths.reduce((a, b) => a + b, 0);
  let angle = Math.PI / 2 + total / radius / 2;
  for (let k = 0; k < name.length; k++) {
    const a = angle - widths[k] / radius / 2;
    g.save(); g.rotate(a); g.translate(radius, 0); g.rotate(-Math.PI / 2); g.fillText(name[k], 0, 0); g.restore();
    angle -= widths[k] / radius;
  }
  // Two stars at the sides.
  for (const d of [-1, 1]) { g.save(); g.translate(d * R * 0.81, 0); ICONS[4](g, R * 0.05); g.restore(); }
  const url = c.toDataURL('image/png');
  badgeCache.set(key, url);
  return url;
}

// Image URL for a team: its uploaded logo, else a generated badge.
export async function logoFor(team, i = 0) {
  return uploadedLogoUrl(team?.logo) ?? badge(team, i);
}

export function useLogo(team, i = 0) {
  const [url, setUrl] = useState(() => uploadedLogoUrl(team?.logo));
  useEffect(() => {
    let alive = true;
    if (!team) return undefined;
    logoFor(team, i).then(u => alive && setUrl(u));
    return () => { alive = false; };
  }, [team?.name, team?.logo, team?.color, i]); // eslint-disable-line react-hooks/exhaustive-deps
  return url;
}

export function TeamLogo({ team, size = 40, className = '' }) {
  const url = useLogo(team);
  return (
    <span className={`team-logo ${className}`} style={{ ...(size ? { width: size, height: size } : {}), '--tc': colorOf(team) }} aria-hidden="true">
      {url && <img src={url} alt="" loading="lazy" decoding="async" />}
    </span>
  );
}

// ---------- Uploaded logos: square, max 640 px, WebP (PNG fallback) + its main colour ----------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That image could not be read'));
    img.src = src;
  });
}
export async function prepareLogo(source) {
  const src = typeof source === 'string' ? source : URL.createObjectURL(source);
  try {
    const img = await loadImage(src);
    const S = 640; // sharp on 3x phones and 4K TVs (stored WebP stays well under the 400 KB limit)
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const k = Math.min(S / img.naturalWidth, S / img.naturalHeight);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
    const color = mainColor(g, S);
    let dataUrl = c.toDataURL('image/webp', 0.86);
    // Safari can't encode WebP: PNG, or JPEG (on white) if the PNG would pass the server's 400 KB limit.
    if (!dataUrl.startsWith('data:image/webp')) dataUrl = c.toDataURL('image/png');
    if (dataUrl.length * 0.75 > 380 * 1024) {
      g.globalCompositeOperation = 'destination-over';
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, S, S);
      dataUrl = c.toDataURL('image/jpeg', 0.88);
    }
    return { dataUrl, color };
  } finally {
    if (typeof source !== 'string') URL.revokeObjectURL(src);
  }
}
// The most common saturated colour of the logo (ignores white, black, grey and transparent).
function mainColor(g, S) {
  const d = g.getImageData(0, 0, S, S).data;
  const buckets = new Map();
  for (let i = 0; i < d.length; i += 16) {
    const [r, gr, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
    if (a < 128) continue;
    const max = Math.max(r, gr, b);
    const min = Math.min(r, gr, b);
    if (max < 50 || max - min < 45) continue;
    const key = ((r >> 5) << 6) | ((gr >> 5) << 3) | (b >> 5);
    const cur = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cur.n++; cur.r += r; cur.g += gr; cur.b += b;
    buckets.set(key, cur);
  }
  const best = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
  if (!best) return null;
  const hex = v => Math.round(v / best.n).toString(16).padStart(2, '0');
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}
export async function sha256Hex(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
