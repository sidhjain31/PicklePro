import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { HttpError, cleanName, historyRows, snapshot } from './draw.js';
import { LABELS } from './models.js';

const bold = sheet => { sheet.getRow(1).font = { bold: true }; };

export async function exportWorkbook(tournamentId) {
  const s = await snapshot(tournamentId);
  const wb = new ExcelJS.Workbook();

  const teams = wb.addWorksheet('Final Teams');
  teams.columns = [
    { header: 'Team', key: 'team', width: 8 },
    ...s.t.categories.map(c => ({ header: c === 'WOMEN' ? 'Women' : `${c} Player`, key: c, width: 24 })),
  ];
  const rows = Array.from({ length: s.t.teamCount }, (_, i) => ({ team: i + 1 }));
  for (const e of s.revealed) rows[e.teamNumber - 1][e.category] = e.playerName;
  teams.addRows(rows);
  bold(teams);

  const history = wb.addWorksheet('Draw History');
  history.columns = [
    { header: 'Timestamp', key: 'at', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
    { header: 'Category', key: 'category', width: 10 },
    { header: 'Draw sequence', key: 'sequence', width: 14 },
    { header: 'Player', key: 'player', width: 24 },
    { header: 'Team', key: 'teamNumber', width: 8 },
    { header: 'Event ID', key: 'eventId', width: 26 },
    { header: 'Action ID', key: 'actionId', width: 38 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Fairness commitment (SHA-256)', key: 'commitment', width: 66 },
    { header: 'Fairness key (revealed)', key: 'salt', width: 66 },
  ];
  history.addRows(historyRows(s).map(r => ({ ...r, status: r.voided ? 'UNDONE' : 'Final' })));
  bold(history);

  return { buffer: await wb.xlsx.writeBuffer(), name: s.t.name };
}

// Header cell -> category: "A", "A Player", "Category B", "Women", "Ladies", ...
export function headerCategory(text) {
  const h = String(text).toLowerCase().replace(/[^a-z]/g, '');
  if (/^(wom[ae]n|ladies|w$)/.test(h)) return 'WOMEN';
  const letter = h.match(/^(?:category|cat|group)?([abcd])(?:players?|category|cat|group)?$/)?.[1];
  return letter ? letter.toUpperCase() : null;
}

// Upload = first sheet (or CSV) with a header row naming the categories, one name per cell below.
export async function parseUpload({ filename, data } = {}) {
  if (typeof filename !== 'string' || typeof data !== 'string') throw new HttpError(400, 'Send { filename, data (base64) }');
  const buffer = Buffer.from(data, 'base64');
  const wb = new ExcelJS.Workbook();
  let sheet;
  try {
    if (/\.csv$/i.test(filename)) {
      const text = buffer.toString('utf8').replace(/^﻿/, '');
      const firstLine = text.split(/\r?\n/, 1)[0];
      const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
      sheet = await wb.csv.read(Readable.from([text]), { parserOptions: { delimiter }, map: value => value });
    } else if (/\.xlsx$/i.test(filename)) {
      await wb.xlsx.load(buffer);
      sheet = wb.worksheets[0];
    } else {
      throw new HttpError(400, 'Upload a .xlsx or .csv file');
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, "Couldn't read that file — save it as .xlsx or .csv");
  }
  const rows = [];
  sheet?.eachRow({ includeEmpty: true }, row => {
    rows.push(Array.from({ length: sheet.columnCount }, (_, i) => cleanName(row.getCell(i + 1).text)));
  });
  const columns = (rows[0] ?? []).map(headerCategory);
  if (!columns.some(Boolean)) throw new HttpError(400, `First row must name the categories: ${Object.values(LABELS).join(', ')}`);
  const lists = {};
  columns.forEach((c, i) => {
    if (c) lists[c] = rows.slice(1).map(r => r[i]).filter(Boolean);
  });
  return { lists };
}
