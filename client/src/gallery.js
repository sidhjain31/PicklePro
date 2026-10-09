// One image with every team, in the ICC theme, for the organizers (download only, no sharing).
export async function downloadGallery(state, { save = true } = {}) {
  const W = 1920;
  const H = 1080;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  await document.fonts?.ready;
  const display = '"Big Shoulders Variable", "Arial Narrow", sans-serif';
  const body = '"Archivo Variable", Arial, sans-serif';

  const bg = g.createRadialGradient(W / 2, 0, 100, W / 2, 0, 1400);
  bg.addColorStop(0, '#1a4aa8');
  bg.addColorStop(0.5, '#123786');
  bg.addColorStop(1, '#0f2a6b');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const band = g.createLinearGradient(0, 0, W, 0);
  band.addColorStop(0, '#1f5fc6');
  band.addColorStop(0.55, '#0f2a6b');
  band.addColorStop(1, '#3f8f3a');
  g.fillStyle = band;
  g.fillRect(0, 0, W, 130);
  g.fillStyle = '#6cc04a';
  g.fillRect(0, 130, W, 6);

  const logo = await new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = '/logo.png';
  });
  if (logo) g.drawImage(logo, 28, 10, 112, 112);
  g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';
  g.font = `900 64px ${display}`;
  g.fillText(state.name.toUpperCase(), 160, 58);
  g.font = `600 24px ${body}`;
  g.fillStyle = 'rgba(244,247,242,0.8)';
  g.fillText(`THE ${state.teamCount} TEAMS · ${state.categories.map(x => x.label).join(' · ')}`, 162, 104);

  const cols = 7;
  const rows = Math.ceil(state.teams.length / cols);
  const pad = 22;
  const top = 140;
  const cw = (W - pad * (cols + 1)) / cols;
  const ch = (H - top - pad * (rows + 1)) / rows;
  state.teams.forEach((t, i) => {
    const x = pad + (i % cols) * (cw + pad);
    const y = top + pad + Math.floor(i / cols) * (ch + pad);
    g.fillStyle = '#0b1f52';
    g.beginPath();
    g.roundRect(x, y, cw, ch, 14);
    g.fill();
    g.strokeStyle = 'rgba(108,192,74,0.6)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#f4e04d';
    g.beginPath();
    g.arc(x + 32, y + 32, 21, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0b1f52';
    g.font = `900 24px ${display}`;
    g.textAlign = 'center';
    g.fillText(String(t.number), x + 32, y + 33);
    g.textAlign = 'left';
    const lineH = (ch - 64) / state.categories.length;
    state.categories.forEach((cat, k) => {
      const ly = y + 64 + k * lineH + lineH / 2;
      g.fillStyle = 'rgba(244,247,242,0.55)';
      g.font = `700 15px ${body}`;
      g.fillText(cat.label === 'Women' ? 'W' : cat.label, x + 14, ly);
      g.fillStyle = '#ffffff';
      g.font = `700 19px ${body}`;
      let name = t.players[cat.key] ?? '—';
      while (g.measureText(name).width > cw - 52 && name.length > 3) name = `${name.slice(0, -2)}…`;
      g.fillText(name, x + 40, ly);
    });
  });

  const url = c.toDataURL('image/png');
  if (save) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.name.replace(/[^\w -]+/g, '').trim() || 'team-draw'} - teams.png`;
    a.click();
  }
  return url;
}
