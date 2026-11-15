// Reads the final-teams PDF in the browser (pdf.js, loaded only on the host page). Understands:
//  1. the app's own team-card PDF ("7" then rows "A  Name", "B  Name" … per card, any columns),
//  2. tables with a header row A | B | C | D (team name in the first column),
//  3. plain text lists ("Team 7" / "A: Name" lines, or "Team, A, B, C, D" rows).
// Category codes M1/M2/M3/W1 (main) and B1/G1/B2/G2 (kids) are read as A/B/C/D. The host always
// reviews (and can edit) the result before saving, so a slightly odd PDF is never a dead end.
import { SLOTS } from './core.js';

const SLOT_OF = { A: 'A', B: 'B', C: 'C', D: 'D', W: 'D', W1: 'D', M1: 'A', M2: 'B', M3: 'C', B1: 'A', G1: 'B', B2: 'C', G2: 'D' };
const LABEL = /^(A|B|C|D|W|W1|M1|M2|M3|B1|G1|B2|G2)\s*[:.)\-–]?$/i;
const INLINE = /^(A|B|C|D|W1|M1|M2|M3|B1|G1|B2|G2)(?:\s*[:.)\-–]\s*|\s+)(\S.*)$/i;
const NOISE = /^(age\b|generated\b|page \d|live team draw|final teams|in progress|contact|phone|mobile)/i;
const slotOf = label => SLOT_OF[label.toUpperCase().replace(/[^A-Z0-9]/g, '')] ?? null;
const titleOf = (raw, i) => {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (/^\d{1,3}$/.test(t)) return `Team ${Number(t)}`;
  const m = /^team\s*#?\s*(\d{1,3})\b\s*[:.\-–]?\s*(.*)$/i.exec(t);
  if (m) return m[2] ? `Team ${Number(m[1])} ${m[2]}`.trim() : `Team ${Number(m[1])}`;
  return t || `Team ${i + 1}`;
};
const cleanPlayer = s => s.replace(/\s+/g, ' ').replace(/[·•|]+$/, '').trim();

const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];

// A decoded pdf.js image object -> PNG data URL.
function imageUrl(obj) {
  if (!obj) return null;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  if (obj.bitmap) {
    c.width = obj.bitmap.width;
    c.height = obj.bitmap.height;
    g.drawImage(obj.bitmap, 0, 0);
  } else if (obj.data && obj.width && obj.height) {
    c.width = obj.width;
    c.height = obj.height;
    const out = g.createImageData(obj.width, obj.height);
    const src = obj.data;
    const px = obj.width * obj.height;
    if (obj.kind === 3 || src.length === px * 4) out.data.set(src.subarray(0, px * 4));
    else if (obj.kind === 2 || src.length === px * 3) {
      for (let i = 0, j = 0; i < px; i++, j += 3) out.data.set([src[j], src[j + 1], src[j + 2], 255], i * 4);
    } else return null;
    g.putImageData(out, 0, 0);
  } else return null;
  if (c.width < 16 || c.height < 16) return null;
  return c.toDataURL('image/png');
}

async function pagePictures(pdfjs, page, p) {
  const { OPS } = pdfjs;
  const ops = await page.getOperatorList();
  const found = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      const w = Math.hypot(ctm[0], ctm[1]);
      const h = Math.hypot(ctm[2], ctm[3]);
      found.push({ page: p, ref: args[0], inline: fn === OPS.paintInlineImageXObject, x: ctm[4] + (ctm[0] + ctm[2]) / 2, y: ctm[5] + (ctm[1] + ctm[3]) / 2, w, h });
    }
  }
  const view = page.view;
  const pageW = view[2] - view[0];
  const out = [];
  for (const f of found) {
    if (f.w < 18 || f.h < 18 || f.w > pageW * 0.6) continue;
    let obj = f.inline ? f.ref : null;
    if (!obj) {
      const store = String(f.ref).startsWith('g_') ? page.commonObjs : page.objs;
      obj = await Promise.race([
        new Promise(res => { try { store.get(f.ref, res); } catch { res(null); } }),
        new Promise(res => setTimeout(() => res(null), 3000)),
      ]);
    }
    const url = imageUrl(obj);
    if (url) out.push({ ...f, ref: undefined, url });
  }
  return out;
}

export async function readPdf(file, { images = false } = {}) {
  let pdfjs;
  let worker;
  try {
    pdfjs = await import('pdfjs-dist');
    worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  } catch {
    throw new Error('The app was just updated. Refresh this page and try the PDF again.');
  }
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  let pics = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    pages.push(tc.items.filter(i => i.str?.trim()).map(i => ({
      s: i.str,
      x: i.transform[4],
      y: i.transform[5],
      w: i.width ?? 0,
      size: Math.abs(i.transform[3]) || i.height || 10,
      page: p,
    })));
    if (images) {
      try {
        pics.push(...await pagePictures(pdfjs, page, p));
      } catch (err) {
        console.warn('PDF pictures skipped on page', p, err);
      }
    }
  }
  const result = parseItems(pages);
  if (!images) return result;
  // A picture at the same place on several pages is page decoration (e.g. a header logo).
  const sig = x => `${Math.round(x.x / 4)}:${Math.round(x.y / 4)}:${Math.round(x.w / 4)}`;
  const count = new Map();
  pics.forEach(x => count.set(sig(x), (count.get(sig(x)) ?? 0) + 1));
  if (doc.numPages > 1) pics = pics.filter(x => count.get(sig(x)) < 2);
  // Each picture goes to the nearest team card on its page (closest pairs first).
  const pairs = [];
  pics.forEach((x, pi) => result.teams.forEach((t, ti) => {
    if (!t.at || t.at.page !== x.page) return;
    const d = Math.hypot(t.at.x - x.x, t.at.y - x.y);
    if (d < 260) pairs.push({ pi, ti, d });
  }));
  pairs.sort((a, b) => a.d - b.d);
  const usedP = new Set();
  const usedT = new Set();
  const pictures = [];
  for (const { pi, ti } of pairs) {
    if (usedP.has(pi) || usedT.has(ti)) continue;
    usedP.add(pi);
    usedT.add(ti);
    pictures.push({ row: ti, url: pics[pi].url });
  }
  return { ...result, pictures };
}

// Items -> lines (same baseline) -> runs (words close together on a line).
function runsOf(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const line = lines.find(l => Math.abs(l.y - it.y) < Math.max(2, it.size * 0.35));
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  const runs = [];
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    let cur = null;
    for (const it of line.items) {
      const gap = cur ? it.x - (cur.x + cur.w) : Infinity;
      if (cur && gap < cur.size * 0.9) {
        cur.s += (gap > cur.size * 0.12 && !cur.s.endsWith(' ') && !it.s.startsWith(' ') ? ' ' : '') + it.s;
        cur.w = it.x + it.w - cur.x;
      } else {
        cur = { ...it, y: line.y };
        runs.push(cur);
      }
    }
  }
  for (const r of runs) r.s = r.s.replace(/\s+/g, ' ').trim();
  return runs.filter(r => r.s);
}

export function parseItems(pages) {
  const all = pages.map(runsOf);
  // 2. Table: a line holding three or more standalone category labels is a header row.
  const table = all.flatMap(parseTable);
  if (table.length >= 2) return finish(table, 'table');
  // 1. Cards: label runs with the name to their right, grouped per column.
  const cards = all.flatMap(parseCards);
  if (cards.length >= 2) return finish(cards, 'cards');
  // 3. Plain text, in reading order.
  const text = all.map(runs => {
    const lines = [];
    for (const r of [...runs].sort((a, b) => b.y - a.y || a.x - b.x)) {
      const l = lines.find(x => Math.abs(x.y - r.y) < 2);
      if (l) l.parts.push(r.s);
      else lines.push({ y: r.y, parts: [r.s] });
    }
    return lines.map(l => l.parts.join('\t')).join('\n');
  }).join('\n');
  return { ...parseText(text), mode: 'text' };
}

function parseTable(runs) {
  const byLine = new Map();
  for (const r of runs) {
    const k = Math.round(r.y);
    if (!byLine.has(k)) byLine.set(k, []);
    byLine.get(k).push(r);
  }
  // Three or more *different* letters (a card page has "A … A … A" on one line: not a header).
  const header = [...byLine.values()].find(line => new Set(line.filter(r => LABEL.test(r.s)).map(r => slotOf(r.s.replace(/[:.)\-–\s]/g, '')))).size >= 3);
  if (!header) return [];
  const cols = header.filter(r => LABEL.test(r.s)).map(r => ({ slot: slotOf(r.s.replace(/[:.)\-–\s]/g, '')), x: r.x })).sort((a, b) => a.x - b.x);
  const firstX = cols[0].x;
  const tol = Math.max(12, Math.min(...cols.slice(1).map((c, i) => c.x - cols[i].x)) / 2);
  const hy = header[0].y;
  const rows = [...byLine.values()].filter(l => l[0].y < hy - 1).sort((a, b) => b[0].y - a[0].y);
  const teams = [];
  for (const line of rows) {
    const players = {};
    let name = '';
    for (const r of line) {
      if (NOISE.test(r.s)) continue;
      if (r.x < firstX - tol / 2) {
        name = name ? `${name} ${r.s}` : r.s;
        continue;
      }
      const col = cols.reduce((best, c) => (Math.abs(c.x - r.x) < Math.abs(best.x - r.x) ? c : best), cols[0]);
      if (Math.abs(col.x - r.x) <= tol * 1.6 && col.slot) players[col.slot] = players[col.slot] ? `${players[col.slot]} ${r.s}` : r.s;
    }
    if (Object.keys(players).length >= 2) teams.push({ name: titleOf(name, teams.length), players, at: { page: line[0].page, y: line[0].y, x: 0 } });
  }
  return teams;
}

function parseCards(runs) {
  const used = new Set();
  const entries = [];
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
  for (const r of sorted) {
    if (used.has(r)) continue;
    let slot = null;
    let name = null;
    if (LABEL.test(r.s)) {
      slot = slotOf(r.s.replace(/[:.)\-–\s]/g, ''));
      const right = sorted
        .filter(o => o !== r && !used.has(o) && Math.abs(o.y - r.y) < Math.max(2.5, r.size * 0.6) && o.x > r.x && !LABEL.test(o.s))
        .sort((a, b) => a.x - b.x)[0];
      if (right && right.x - r.x < 260) {
        name = right.s;
        used.add(right);
      }
    } else {
      const m = INLINE.exec(r.s);
      if (m) {
        slot = slotOf(m[1]);
        name = m[2];
      }
    }
    if (!slot || !name || NOISE.test(name)) continue;
    used.add(r);
    entries.push({ slot, name: cleanPlayer(name), x: r.x, y: r.y, page: r.page, size: r.size });
  }
  if (entries.length < 4) return [];
  // Column clusters by label x.
  const xs = [];
  for (const e of [...entries].sort((a, b) => a.x - b.x)) {
    const c = xs.find(v => Math.abs(v.x - e.x) < 25);
    if (c) e.col = c;
    else xs.push((e.col = { x: e.x }));
  }
  const teams = [];
  const groups = new Map();
  for (const e of entries) {
    const k = `${e.page}:${xs.indexOf(e.col)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => b.y - a.y);
    let cur = null;
    let lastIdx = -1;
    for (const e of list) {
      const idx = SLOTS.indexOf(e.slot);
      const far = cur && cur.last.y - e.y > e.size * 4;
      if (!cur || idx <= lastIdx || far) {
        cur = { players: {}, first: e, last: e };
        teams.push(cur);
      }
      cur.players[e.slot] = e.name;
      cur.last = e;
      lastIdx = idx;
    }
  }
  // Title: the nearest unused text just above the first row of each card.
  const free = runs.filter(r => !used.has(r) && !NOISE.test(r.s) && !LABEL.test(r.s));
  return teams.map((t, i) => {
    const f = t.first;
    const above = free
      .filter(r => r.page === f.page && r.y > f.y + 1 && r.y - f.y < Math.max(34, f.size * 7.5) && r.x > f.x - 40 && r.x < f.x + 200)
      .sort((a, b) => (a.y - f.y) - (b.y - f.y))[0];
    if (above) used.add(above);
    return { name: titleOf(above?.s ?? '', i), generated: !above, players: t.players, at: { page: f.page, y: f.y, x: f.x } };
  });
}

function finish(teams, mode) {
  // Numbered teams (Team 1, Team 2 …) in number order, otherwise reading order.
  const num = t => Number(/^Team (\d+)$/.exec(t.name)?.[1] ?? NaN);
  const numbered = teams.every(t => !t.generated && Number.isFinite(num(t)));
  const ordered = numbered
    ? [...teams].sort((a, b) => num(a) - num(b))
    : [...teams].sort((a, b) => a.at.page - b.at.page || Math.round((b.at.y - a.at.y) / 12) || a.at.x - b.at.x);
  // Teams without a title in the file are numbered in reading order.
  ordered.forEach((t, i) => { if (t.generated) t.name = `Team ${i + 1}`; });
  return { teams: ordered.map(({ name, players, at }) => ({ name, players: Object.fromEntries(SLOTS.map(s => [s, players[s] ?? ''])), at })), mode, warnings: check(ordered) };
}

function check(teams) {
  const warnings = [];
  teams.forEach(t => {
    const missing = SLOTS.filter(s => !t.players[s]);
    if (missing.length) warnings.push(`${t.name}: no player for ${missing.join(', ')}`);
  });
  const names = new Map();
  for (const t of teams) {
    const k = t.name.toLowerCase();
    if (names.has(k)) warnings.push(`Two teams are called "${t.name}"`);
    names.set(k, true);
  }
  if (teams.length % 2) warnings.push(`${teams.length} teams — the draw needs an even number`);
  return warnings;
}

// Plain text: "Team 7" / "7" headings followed by "A: Name" lines, or rows "Team, A, B, C, D".
export function parseText(text) {
  const teams = [];
  let cur = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || NOISE.test(line)) continue;
    const cells = line.split(/\t|\s*[|;,]\s*/).map(s => s.trim()).filter(Boolean);
    if (cells.length >= 5 && !INLINE.test(line)) {
      teams.push({ name: titleOf(cells[0], teams.length), players: { A: cells[1], B: cells[2], C: cells[3], D: cells[4] } });
      cur = null;
      continue;
    }
    const m = INLINE.exec(line);
    if (m && cur) {
      const slot = slotOf(m[1]);
      if (slot) cur.players[slot] = cleanPlayer(m[2]);
      continue;
    }
    if (/^(team\s*)?#?\s*\d{1,3}\b/i.test(line) || (!m && (!cur || Object.keys(cur.players).length))) {
      cur = { name: titleOf(line, teams.length), players: {} };
      teams.push(cur);
    }
  }
  const good = teams.filter(t => Object.keys(t.players).length);
  return { teams: good.map(t => ({ name: t.name, players: Object.fromEntries(SLOTS.map(s => [s, t.players[s] ?? ''])) })), warnings: check(good) };
}
