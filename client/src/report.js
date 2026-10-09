// Organizer PDF: final teams + an alphabetical player index. Built in the browser from the
// public state (already-revealed picks only), so it never shows a result early.
const NAVY = [11, 31, 82];
const BLUE = [31, 95, 198];
const GREEN = [108, 192, 74];
const YELLOW = [244, 224, 77];

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function downloadReport(state, { save = true } = {}) {
  const [{ jsPDF }, { autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadImage('/logo.png')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const cats = state.categories;
  const when = new Date().toLocaleString();
  const drawn = cats.reduce((n, c) => n + c.assigned, 0);
  const total = state.teamCount * cats.length;
  const status = state.status === 'COMPLETED' ? 'Final' : `In progress — ${drawn}/${total} picks`;

  const header = () => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 26, 'F');
    doc.setFillColor(...GREEN);
    doc.rect(0, 26, W, 1.5, 'F');
    if (logo) doc.addImage(logo, 'PNG', 8, 2, 22, 22);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(state.name.toUpperCase(), 34, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Team draw results · ${status} · Generated ${when}`, 34, 19);
  };
  const footer = () => {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(110, 120, 140);
      doc.text('Every pick drawn on the server with a cryptographically secure random generator and sealed with SHA-256 before the spin. Proofs: Excel export, Draw History sheet.', 10, 203);
      doc.text(`Page ${i} of ${pages}`, W - 10, 203, { align: 'right' });
    }
  };

  // Page 1: teams.
  header();
  autoTable(doc, {
    startY: 32,
    head: [['Team', ...cats.map(c => c.label)]],
    body: state.teams.map(t => [t.number, ...cats.map(c => t.players[c.key] ?? '—')]),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 0.9, lineColor: [210, 218, 235], textColor: [15, 28, 53] },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', halign: 'left' },
    columnStyles: { 0: { halign: 'center', fontStyle: 'bold', fillColor: YELLOW, cellWidth: 16 } },
    alternateRowStyles: { fillColor: [244, 248, 255] },
    margin: { left: 10, right: 10, top: 32, bottom: 12 },
    didDrawPage: d => { if (d.pageNumber > 1) header(); },
  });

  // Page 2+: every player, alphabetically, with their team — for check-in desks.
  doc.addPage();
  header();
  const index = state.teams
    .flatMap(t => cats.filter(c => t.players[c.key]).map(c => [t.players[c.key], c.label, t.number]))
    .sort((a, b) => a[0].localeCompare(b[0]));
  const half = Math.ceil(index.length / 2);
  autoTable(doc, {
    startY: 32,
    head: [['Player', 'Category', 'Team', '', 'Player', 'Category', 'Team']],
    body: index.slice(0, half).map((row, i) => [...row, '', ...(index[half + i] ?? ['', '', ''])]),
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.1, textColor: [15, 28, 53] },
    headStyles: { fillColor: NAVY, textColor: 255 },
    columnStyles: { 2: { halign: 'center', fontStyle: 'bold' }, 3: { cellWidth: 6, fillColor: [255, 255, 255] }, 6: { halign: 'center', fontStyle: 'bold' } },
    margin: { left: 10, right: 10, top: 32 },
    didDrawPage: d => { if (d.pageNumber > 1) header(); },
  });

  footer();
  const file = `${state.name.replace(/[^\w -]+/g, '').trim() || 'team-draw'} - results.pdf`;
  if (save) doc.save(file);
  return doc;
}
