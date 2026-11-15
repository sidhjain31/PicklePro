// Reads the organisers' final-teams file in the browser: PDF, Excel (.xlsx), Word (.docx), CSV or
// text. Finds team names, players by category (A–D; M1/M2/M3/W1 and B1/G1/B2/G2 also understood)
// and, where the file has them, the team LOGOS — Word/Excel pictures by the row they sit in, PDF
// pictures by the team card they sit next to. The host reviews everything before saving.
import { strFromU8, unzipSync } from 'fflate';
import { SLOTS } from './core.js';
import { parseText, readPdf } from './teamsPdf.js';

const SLOT_OF = { A: 'A', B: 'B', C: 'C', D: 'D', W: 'D', W1: 'D', M1: 'A', M2: 'B', M3: 'C', M4: 'D', B1: 'A', G1: 'B', B2: 'C', G2: 'D', WOMEN: 'D', LADIES: 'D', WOMAN: 'D' };
const slotOf = v => {
  const k = String(v ?? '').toUpperCase().replace(/^(CAT(EGORY)?|GRADE|GROUP|LEVEL)\s*/, '').replace(/\s*PLAYER$/, '').replace(/[^A-Z0-9]/g, '');
  return SLOT_OF[k] ?? null;
};
const cell = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
const toDataUrl = (bytes, path) => {
  const ext = path.split('.').pop().toLowerCase();
  const mime = MIME[ext];
  if (!mime) return null; // EMF/WMF/SVG are skipped (browsers can't draw them reliably)
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
};
const xml = text => new DOMParser().parseFromString(text, 'application/xml');
// Namespace-aware lookups: tools differ in prefixes (Excel writes "xdr:row", others plain "row").
const NS = {
  main: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  xdr: 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
};
const tags = (el, ns, name) => [...el.getElementsByTagNameNS(NS[ns], name)];
const isTag = (el, ns, name) => el.namespaceURI === NS[ns] && el.localName === name;
const embedOf = blip => blip.getAttributeNS(NS.r, 'embed') || blip.getAttribute('r:embed');
const resolve = (base, target) => {
  // Absolute targets ("/xl/worksheets/sheet1.xml", written by some tools) start at the zip root.
  const parts = (target.startsWith('/') ? target.slice(1) : `${base.replace(/[^/]*$/, '')}${target}`).split('/');
  const out = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/');
};
function relsOf(files, partPath) {
  const relPath = partPath.replace(/([^/]+)$/, '_rels/$1.rels');
  const map = new Map();
  if (!files[relPath]) return map;
  for (const r of tags(xml(strFromU8(files[relPath])), 'rel', 'Relationship')) {
    map.set(r.getAttribute('Id'), resolve(partPath, r.getAttribute('Target')));
  }
  return map;
}

// Rows of cells -> teams. Understands:
//  wide: header "Team | A | B | C | D" (any order, optional Logo column), one team per row;
//  long: header "Team | Category | Name", one player per row (team name may only be on its first row);
//  anything else: handed to the text reader line by line.
export function parseRows(rows) {
  const clean = rows.map(r => r.map(cell));
  for (let h = 0; h < Math.min(clean.length, 15); h++) {
    const head = clean[h].map(x => x.toLowerCase());
    const teamCol = head.findIndex(x => /^(team|teams|team name|name of (the )?team|franchise)$/.test(x));
    const slotCols = clean[h].map((x, i) => [slotOf(x), i]).filter(([s]) => s);
    const catCol = head.findIndex(x => /^(cat|category|grade|group|level|cat\.)$/.test(x));
    const nameCol = head.findIndex(x => /^(name|player|player name|players|name of player)$/.test(x));
    if (teamCol >= 0 && new Set(slotCols.map(([s]) => s)).size >= 3) {
      const teams = [];
      for (let r = h + 1; r < clean.length; r++) {
        const name = clean[r][teamCol];
        if (!name) continue;
        const players = {};
        for (const [s, i] of slotCols) if (clean[r][i] && !players[s]) players[s] = clean[r][i];
        if (Object.keys(players).length) teams.push({ name, players, rows: [r] });
      }
      if (teams.length) return { teams, mode: 'table' };
    }
    if (teamCol >= 0 && catCol >= 0 && nameCol >= 0) {
      const byName = new Map();
      let current = '';
      for (let r = h + 1; r < clean.length; r++) {
        current = clean[r][teamCol] || current;
        const s = slotOf(clean[r][catCol]);
        const p = clean[r][nameCol];
        if (!current || !s || !p) continue;
        if (!byName.has(current)) byName.set(current, { name: current, players: {}, rows: [] });
        const t = byName.get(current);
        if (!t.players[s]) t.players[s] = p;
        t.rows.push(r);
      }
      if (byName.size) return { teams: [...byName.values()], mode: 'list' };
    }
  }
  // Text fallback: keep which row each team started on (for pictures).
  const lines = clean.map(r => r.filter(Boolean).join('\t'));
  const res = parseText(lines.join('\n'));
  const starts = [];
  let k = 0;
  for (let i = 0; i < lines.length && k < res.teams.length; i++) if (lines[i] && lines[i].toLowerCase().includes(res.teams[k].name.toLowerCase().replace(/^team (\d+)$/, '$1'))) starts.push(i), k++;
  return { teams: res.teams.map((t, i) => ({ ...t, rows: [starts[i] ?? -1] })), mode: 'text' };
}

// Pictures -> teams: by row when we know it, else in order when the counts match.
function attach(teams, pictures) {
  const logos = new Map();
  const free = pictures.filter(p => p.url);
  for (const p of free) {
    if (p.row === undefined) continue;
    const t = teams.findIndex(x => x.rows?.includes(p.row));
    if (t >= 0 && !logos.has(t)) { logos.set(t, p.url); p.used = true; }
  }
  // Pictures in their own row just above the team (common in Word): give them to the next team.
  for (const p of free) {
    if (p.used || p.row === undefined) continue;
    const t = teams.findIndex(x => (x.rows?.[0] ?? -9) > p.row && x.rows[0] - p.row <= 2);
    if (t >= 0 && !logos.has(t)) { logos.set(t, p.url); p.used = true; }
  }
  const left = free.filter(p => !p.used);
  const need = teams.map((_, i) => i).filter(i => !logos.has(i));
  if (left.length && left.length === need.length) need.forEach((t, i) => logos.set(t, left[i].url));
  return logos;
}

function finish(result, pictures = []) {
  const logos = attach(result.teams, pictures);
  const teams = result.teams.map((t, i) => ({
    name: t.name,
    players: Object.fromEntries(SLOTS.map(s => [s, t.players?.[s] ?? ''])),
    logoData: logos.get(i) ?? null,
  }));
  const warnings = [...(result.warnings ?? [])];
  teams.forEach(t => {
    const missing = SLOTS.filter(s => !t.players[s]);
    if (missing.length && !warnings.some(w => w.startsWith(`${t.name}:`))) warnings.push(`${t.name}: no player for ${missing.join(', ')}`);
  });
  if (pictures.length) warnings.unshift(`${logos.size} of ${teams.length} logos found in the file${logos.size < teams.length ? ' — add the rest by tapping a logo' : ''}.`);
  return { teams, mode: result.mode, warnings };
}

// ---------- Excel ----------
function readXlsx(files) {
  const shared = [];
  if (files['xl/sharedStrings.xml']) {
    for (const si of tags(xml(strFromU8(files['xl/sharedStrings.xml'])), 'main', 'si')) {
      shared.push(tags(si, 'main', 't').map(t => t.textContent).join(''));
    }
  }
  // First sheet in workbook order.
  const wb = xml(strFromU8(files['xl/workbook.xml']));
  const first = tags(wb, 'main', 'sheet')[0];
  const firstId = first?.getAttributeNS(NS.r, 'id') || first?.getAttribute('r:id');
  const wbRels = relsOf(files, 'xl/workbook.xml');
  const sheetPath = wbRels.get(firstId) ?? 'xl/worksheets/sheet1.xml';
  const sheet = xml(strFromU8(files[sheetPath]));
  const colIndex = ref => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const rows = [];
  for (const row of tags(sheet, 'main', 'row')) {
    const r = Number(row.getAttribute('r')) - 1;
    const out = rows[r] ?? (rows[r] = []);
    for (const c of tags(row, 'main', 'c')) {
      const type = c.getAttribute('t');
      const v = tags(c, 'main', 'v')[0]?.textContent ?? '';
      const text = type === 's' ? shared[Number(v)] ?? '' : type === 'inlineStr' ? tags(c, 'main', 't').map(t => t.textContent).join('') : v;
      out[colIndex(c.getAttribute('r') ?? 'A1')] = text;
    }
  }
  for (let i = 0; i < rows.length; i++) rows[i] ??= [];
  // Pictures anchored on the sheet: which row each one starts on.
  const pictures = [];
  const sheetRels = relsOf(files, sheetPath);
  for (const target of sheetRels.values()) {
    if (!/drawings\/drawing\d+\.xml$/.test(target) || !files[target]) continue;
    const dRels = relsOf(files, target);
    const d = xml(strFromU8(files[target]));
    for (const anchor of [...tags(d, 'xdr', 'twoCellAnchor'), ...tags(d, 'xdr', 'oneCellAnchor')]) {
      const row = Number(tags(anchor, 'xdr', 'row')[0]?.textContent ?? NaN);
      const blipEl = tags(anchor, 'a', 'blip')[0];
      const blip = blipEl && embedOf(blipEl);
      const media = dRels.get(blip);
      if (media && files[media] && Number.isFinite(row)) pictures.push({ row, url: toDataUrl(files[media], media) });
    }
  }
  return finish(parseRows(rows), pictures);
}

// ---------- Word ----------
function readDocx(files) {
  const doc = xml(strFromU8(files['word/document.xml']));
  const rels = relsOf(files, 'word/document.xml');
  const body = tags(doc, 'w', 'body')[0];
  const textOf = el => tags(el, 'w', 't').map(t => t.textContent).join('');
  const picsIn = el => tags(el, 'a', 'blip').map(b => rels.get(embedOf(b))).filter(p => p && files[p]);
  const rows = [];
  const pictures = [];
  for (const node of body.children) {
    if (isTag(node, 'w', 'tbl')) {
      for (const tr of tags(node, 'w', 'tr')) {
        const cells = [...tr.children].filter(c => isTag(c, 'w', 'tc')).map(tc => tags(tc, 'w', 'p').map(textOf).filter(Boolean).join(' '));
        picsIn(tr).forEach(p => pictures.push({ row: rows.length, url: toDataUrl(files[p], p) }));
        rows.push(cells);
      }
    } else if (isTag(node, 'w', 'p')) {
      picsIn(node).forEach(p => pictures.push({ row: rows.length, url: toDataUrl(files[p], p) }));
      // Tabs inside a paragraph separate columns ("Team<TAB>A<TAB>B…").
      const parts = [];
      let cur = '';
      for (const r of tags(node, 'w', 'r')) {
        for (const ch of r.children) {
          if (isTag(ch, 'w', 't')) cur += ch.textContent;
          else if (isTag(ch, 'w', 'tab')) { parts.push(cur); cur = ''; }
        }
      }
      parts.push(cur);
      rows.push(parts);
    }
  }
  return finish(parseRows(rows), pictures);
}

export async function readTeamsFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const r = await readPdf(file, { images: true });
    return finish({ teams: r.teams.map((t, i) => ({ ...t, rows: [i] })), mode: r.mode, warnings: r.warnings }, r.pictures);
  }
  if (/\.(xlsx|xlsm|docx)$/.test(name)) {
    let files;
    try {
      files = unzipSync(new Uint8Array(await file.arrayBuffer()));
    } catch {
      throw new Error("That file couldn't be opened. Save it again as .xlsx / .docx (or PDF) and retry.");
    }
    if (files['word/document.xml']) return readDocx(files);
    if (files['xl/workbook.xml']) return readXlsx(files);
    throw new Error('Unknown file inside — use .xlsx, .docx, .pdf or .csv');
  }
  if (/\.(xls|doc)$/.test(name)) throw new Error('Old .xls / .doc format: open it and "Save as" .xlsx / .docx (or PDF), then upload again.');
  const text = await file.text();
  const rows = text.split(/\r?\n/).map(line => (line.includes('\t') ? line.split('\t') : line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c => c.replace(/^"|"$/g, ''))));
  return finish(parseRows(rows));
}
