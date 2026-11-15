// Fixtures PDF: the organisers' sheet with real names — every match (court, the six games with
// both pairs, scores when entered), then the knockout. Same navy look as the team PDF.
import { GAMES } from './core.js';
import { teamOf } from './live.js';

const PAGE_BG = [17, 48, 128];
const CARD = [11, 31, 82];
const WHITE = [255, 255, 255];
const MUTED = [170, 184, 214];
const YELLOW = [244, 224, 77];
const GREEN = [108, 192, 74];

export async function downloadFixtures(state) {
  let jsPDF;
  try {
    ({ jsPDF } = await import('jspdf'));
  } catch {
    throw new Error('The app was just updated. Refresh this page and tap Fixtures PDF again.');
  }
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 10;
  const GAP = 5;
  const HEADER = 28;
  const colW = (W - 2 * M - GAP) / 2;
  const blockH = 15 + GAMES.length * 6.2 + 3;

  const page = subtitle => {
    doc.setFillColor(...PAGE_BG);
    doc.rect(0, 0, W, H, 'F');
    doc.setFillColor(...CARD);
    doc.rect(0, 0, W, HEADER - 6, 'F');
    doc.setFillColor(...GREEN);
    doc.rect(0, HEADER - 6, W, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...YELLOW);
    doc.text('MATCH DRAW · FIXTURES', M, 9);
    doc.setFontSize(15);
    doc.setTextColor(...WHITE);
    doc.text(String(state.name ?? 'Match Draw').toUpperCase(), M, 16.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(subtitle, W - M, 16.5, { align: 'right' });
  };
  const fit = (text, room, size) => {
    let s = size;
    while (s > 5 && doc.getStringUnitWidth(text) * s / doc.internal.scaleFactor > room) s -= 0.25;
    doc.setFontSize(s);
    return text;
  };

  const block = (tie, x, y) => {
    const A = teamOf(state, tie.a);
    const B = teamOf(state, tie.b);
    doc.setFillColor(...CARD);
    doc.roundedRect(x, y, colW, blockH, 2, 2, 'F');
    doc.setFillColor(...GREEN);
    doc.roundedRect(x, y, colW, 6, 2, 2, 'F');
    doc.rect(x, y + 3, colW, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(11, 31, 82);
    doc.text(`${tie.label.toUpperCase()}${tie.court ? ` · COURT ${tie.court}` : ''}`, x + 3, y + 4.3);
    if (tie.note) doc.text(tie.note, x + colW - 3, y + 4.3, { align: 'right' });
    doc.setTextColor(...WHITE);
    const an = A?.name ?? 'To be decided';
    const bn = B?.name ?? 'To be decided';
    const score = tie.played ? `  ${tie.ga} – ${tie.gb}` : '';
    fit(`${an}  vs  ${bn}${score}`, colW - 6, 10.5);
    doc.text(`${an}  vs  ${bn}${score}`, x + 3, y + 11.5);
    GAMES.forEach((g, i) => {
      const ry = y + 17.5 + i * 6.2;
      const r = tie.games[i];
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...YELLOW);
      doc.text(g.join('/'), x + 3, ry);
      doc.setTextColor(...MUTED);
      doc.setFont('helvetica', 'normal');
      doc.text(`G${i + 1}`, x + 11, ry);
      const pa = A ? `${A.players[g[0]] || g[0]} & ${A.players[g[1]] || g[1]}` : '';
      const pb = B ? `${B.players[g[0]] || g[0]} & ${B.players[g[1]] || g[1]}` : '';
      const room = (colW - 34) / 2;
      doc.setFont('helvetica', r.w === 'a' ? 'bold' : 'normal');
      doc.setTextColor(...(r.w === 'b' ? MUTED : WHITE));
      fit(pa, room, 7.5);
      doc.text(pa, x + 17, ry);
      doc.setFont('helvetica', r.w === 'b' ? 'bold' : 'normal');
      doc.setTextColor(...(r.w === 'a' ? MUTED : WHITE));
      fit(pb, room, 7.5);
      doc.text(pb, x + 19 + room, ry);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...YELLOW);
      const sc = r.sa != null && r.sb != null ? `${r.sa}–${r.sb}` : r.w ? (r.w === 'a' ? 'W–L' : 'L–W') : '';
      if (sc) doc.text(sc, x + colW - 3, ry, { align: 'right' });
    });
  };

  const sections = [];
  if (state.ties.length) sections.push(['League matches', state.ties]);
  if (state.phase !== 'setup' && state.phase !== 'draw') sections.push(['Knockout', state.knockout.ties]);
  const perPage = 2 * Math.floor((H - HEADER - M + GAP) / (blockH + GAP));
  let first = true;
  for (const [title, ties] of sections) {
    ties.forEach((tie, i) => {
      const slot = i % perPage;
      if (slot === 0) {
        if (!first) doc.addPage();
        first = false;
        page(`${title} · ${state.ties.length} matches · ${state.teams.length} teams`);
      }
      block(tie, M + (slot % 2) * (colW + GAP), HEADER + Math.floor(slot / 2) * (blockH + GAP));
    });
  }
  if (first) page('No matches drawn yet');

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`Each match: six doubles games, same categories against each other. Generated ${new Date().toLocaleString()}`, M, H - 4);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 4, { align: 'right' });
  }
  doc.save(`${String(state.name ?? '').replace(/[^\w -]+/g, '').trim() || 'match-draw'} - fixtures.pdf`);
}
