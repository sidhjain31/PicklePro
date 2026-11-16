// Matches PDF for the host (owner's format, 2026-11-17): one VS card per drawn league match — both
// teams' logos, names and players A–D, a big VS, and the six games with the real pairs. Two cards
// per A4 page. Only the league matches (the knockout is known only once they're played); no match
// numbers, courts or fairness hashes.
import { GAMES, SLOTS } from './core.js';
import { teamOf } from './live.js';
import { colorOf, logoFor } from './looks.jsx';

const NAVY = [8, 22, 64];
const PAGE_BG = [17, 48, 128];
const CARD = [11, 31, 82];
const ROW = [20, 46, 108];
const WHITE = [255, 255, 255];
const MUTED = [176, 190, 220];
const YELLOW = [244, 224, 77];
const GREEN = [108, 192, 74];

const hexRgb = hex => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!m) return GREEN;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// A team's logo as a square JPEG (white background) for the PDF, from the same image the app shows.
async function logoJpeg(team, i) {
  try {
    const url = await logoFor(team, i);
    if (!url) return null;
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });
    const S = 360;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, S, S);
    const k = Math.min(S / img.naturalWidth, S / img.naturalHeight);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
    return c.toDataURL('image/jpeg', 0.9);
  } catch {
    return null; // no logo: the card shows the team colour instead
  }
}

export async function downloadFixtures(state) {
  let jsPDF;
  try {
    ({ jsPDF } = await import('jspdf'));
  } catch {
    throw new Error('The app was just updated. Refresh this page and tap the PDF button again.');
  }
  const ties = state.ties.filter(t => t.a && t.b);
  if (!ties.length) throw new Error('No matches drawn yet.');
  const logos = new Map();
  await Promise.all(state.teams.map(async (t, i) => logos.set(t.key, await logoJpeg(t, i))));

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(); // 210
  const H = doc.internal.pageSize.getHeight(); // 297
  const M = 8;
  const HEADER = 16;
  const GAP = 5;
  const cardH = (H - HEADER - M - GAP - 6) / 2; // ~131 mm
  const cardW = W - 2 * M;

  const fit = (text, room, size, min = 6) => {
    let s = size;
    while (s > min && doc.getStringUnitWidth(text) * s / doc.internal.scaleFactor > room) s -= 0.25;
    doc.setFontSize(s);
  };
  const page = n => {
    doc.setFillColor(...PAGE_BG);
    doc.rect(0, 0, W, H, 'F');
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, HEADER - 4, 'F');
    doc.setFillColor(...GREEN);
    doc.rect(0, HEADER - 4, W, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...WHITE);
    doc.text(String(state.name ?? 'Match Draw').toUpperCase(), M, 8.2);
    doc.setFontSize(7.5);
    doc.setTextColor(...YELLOW);
    doc.text(`LEAGUE MATCHES · ${ties.length} MATCHES · ${state.teams.length} TEAMS`, W - M, 8.2, { align: 'right' });
    return n;
  };

  // One team block: logo, name, players A–D in two columns.
  const teamBlock = (team, x, y, w) => {
    const L = 30;
    const colour = hexRgb(colorOf(team));
    doc.setFillColor(...colour);
    doc.roundedRect(x - 0.8, y - 0.8, L + 1.6, L + 1.6, 4, 4, 'F');
    doc.setFillColor(...WHITE);
    doc.roundedRect(x, y, L, L, 3.4, 3.4, 'F');
    const img = logos.get(team.key);
    if (img) doc.addImage(img, 'JPEG', x + 1, y + 1, L - 2, L - 2, undefined, 'FAST');
    const tx = x + L + 6;
    const room = w - L - 8;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...WHITE);
    fit(team.name.toUpperCase(), room, 20, 10);
    doc.text(team.name.toUpperCase(), tx, y + 9);
    doc.setFontSize(10);
    SLOTS.forEach((s, i) => {
      const px = tx + (i % 2) * (room / 2);
      const py = y + 18 + Math.floor(i / 2) * 8;
      doc.setFillColor(...YELLOW);
      doc.roundedRect(px, py - 4, 5, 5, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...NAVY);
      doc.text(s, px + 2.5, py - 0.2, { align: 'center' });
      doc.setTextColor(...WHITE);
      const name = team.players[s] || '—';
      fit(name, room / 2 - 8, 10.5, 6.5);
      doc.text(name, px + 7, py);
    });
  };

  const card = (tie, y) => {
    const A = teamOf(state, tie.a);
    const B = teamOf(state, tie.b);
    const x = M;
    doc.setFillColor(...CARD);
    doc.roundedRect(x, y, cardW, cardH, 3, 3, 'F');
    // Team-colour edges.
    doc.setFillColor(...hexRgb(colorOf(A)));
    doc.rect(x, y + 3, 1.6, 34, 'F');
    doc.setFillColor(...hexRgb(colorOf(B)));
    doc.rect(x, y + 47, 1.6, 34, 'F');
    teamBlock(A, x + 6, y + 5, cardW - 10);
    // VS
    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(20);
    doc.setTextColor(...YELLOW);
    doc.text('VS', x + 6 + 15, y + 44.2, { align: 'center' });
    doc.setDrawColor(...YELLOW);
    doc.setLineWidth(0.3);
    doc.line(x + 32, y + 41.5, x + cardW - 6, y + 41.5);
    teamBlock(B, x + 6, y + 49, cardW - 10);
    // The six games.
    const gy = y + 84;
    const rowH = (cardH - (gy - y) - 4) / GAMES.length;
    GAMES.forEach((g, i) => {
      const ry = gy + i * rowH;
      doc.setFillColor(...ROW);
      doc.roundedRect(x + 4, ry, cardW - 8, rowH - 1.2, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...YELLOW);
      doc.text(g.join('/'), x + 8, ry + rowH / 2 + 1.2);
      const pa = `${A.players[g[0]] || g[0]} & ${A.players[g[1]] || g[1]}`;
      const pb = `${B.players[g[0]] || g[0]} & ${B.players[g[1]] || g[1]}`;
      const room = (cardW - 36) / 2;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...WHITE);
      fit(pa, room, 9.5, 6);
      doc.text(pa, x + 22, ry + rowH / 2 + 1);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text('vs', x + 22 + room + 2, ry + rowH / 2 + 1);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...WHITE);
      fit(pb, room, 9.5, 6);
      doc.text(pb, x + 30 + room, ry + rowH / 2 + 1);
    });
  };

  ties.forEach((tie, i) => {
    const slot = i % 2;
    if (slot === 0) {
      if (i) doc.addPage();
      page(i / 2 + 1);
    }
    card(tie, HEADER + 2 + slot * (cardH + GAP));
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text('Each match: six doubles games, same categories against each other (A/B, C/D, A/C, B/D, A/D, B/C).', M, H - 3.5);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 3.5, { align: 'right' });
  }
  doc.save(`${String(state.name ?? '').replace(/[^\w -]+/g, ' ').replace(/\s+/g, ' ').trim() || 'match-draw'} - matches.pdf`);
}
