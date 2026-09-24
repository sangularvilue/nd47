// Minimap, location callouts and objective list.
import { centroid } from './geo.js';

export function buildHud(data, L) {
  const $ = (id) => document.getElementById(id);
  // --- pre-render full map
  const [X0, Y0, X1, Y1] = [-1400, -1400, 1600, 1200];
  const S = 0.9; // px per metre
  const cv = document.createElement('canvas'); cv.width = (X1 - X0) * S; cv.height = (Y1 - Y0) * S;
  const g = cv.getContext('2d');
  const tx = (p) => [(p[0] - X0) * S, (Y1 - p[1]) * S];
  const poly = (r, fill) => { g.beginPath(); r.forEach((p, i) => { const [x, y] = tx(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fillStyle = fill; g.fill(); };
  g.fillStyle = '#1b1f22'; g.fillRect(0, 0, cv.width, cv.height);
  for (const a of data.areas) {
    const c = { grass: '#24302a', wood: '#1f2a22', golf: '#24302a', water: '#1d3a4c', fountain: '#1d3a4c', parking: '#2a2c2f', pitch: '#26342a' }[a.t];
    if (c) poly(a.o, c);
  }
  g.lineCap = 'round';
  for (const r of data.roads) {
    g.strokeStyle = r.f ? '#3b4043' : '#50565a'; g.lineWidth = Math.max(1, r.w * S * (r.f ? 0.8 : 1));
    g.beginPath(); r.p.forEach((p, i) => { const [x, y] = tx(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
  }
  for (const b of data.buildings) if (!b.part) poly(b.o, b.k === 1 ? '#5a5f63' : '#8b8f92');

  const zones = [];
  const namedArea = (n, label) => { const a = data.areas.find((q) => q.n === n); if (a) zones.push({ n: label || n.toUpperCase(), c: centroid(a.o), r: 130 }); };
  namedArea('South Quad'); namedArea('North Quad'); namedArea('Debartolo Quad', 'DEBARTOLO QUAD'); namedArea('Irish Green'); namedArea('Far Quad');
  namedArea("Saint Mary's Lake", "ST. MARY'S LAKE"); namedArea("Saint Joseph's Lake", "ST. JOSEPH'S LAKE");
  zones.push({ n: 'GOD QUAD', c: [25, -135], r: 110 }, { n: 'MAIN QUAD', c: [25, -290], r: 90 }, { n: 'WEST QUAD', c: [-220, -600], r: 140 },
    { n: 'MOD QUAD', c: [410, 120], r: 110 }, { n: 'LIBRARY QUAD', c: [420, -170], r: 110 }, { n: 'ENGINEERING QUAD', c: [130, -520], r: 90 },
    { n: 'NOTRE DAME STADIUM', c: [L.stadium.x, L.stadium.y], r: 150 }, { n: 'EDDY STREET COMMONS', c: [210, -1180], r: 150 });

  const objectives = [
    { id: 'speech', label: 'The Lecture — Nieuwland Science Hall', sub: 'Target addresses the Physics Department at 11:00', p: L.nieuwland, col: '#e23b3b' },
    { id: 'doe', label: 'The Project — Radiation Research Building', sub: 'Investigate the DOE facility on Library Quad', p: L.doe, col: '#e8c547' },
    { id: 'box', label: 'The Box — Duncan Student Center', sub: 'Target watches the game from a private suite', p: L.box, col: '#e23b3b' },
  ];
  $('objectives').innerHTML = objectives.map((o) => `<div class="obj"><span class="dot" style="background:${o.col}"></span><div><div class="ol">${o.label}</div><div class="os">${o.sub}</div></div></div>`).join('');

  const mini = $('minimap'), mg = mini.getContext('2d');
  const big = $('bigmap'), bg = big.getContext('2d');
  let lastZone = '', zoneT = 0;
  const named = data.buildings.filter((b) => b.n && !b.part && b.a > 150);

  function update(dt, px, py, heading, mode) {
    // minimap (rotates with camera heading)
    const R = mini.width / 2, zoom = 1.6;
    mg.save(); mg.clearRect(0, 0, mini.width, mini.height);
    mg.beginPath(); mg.arc(R, R, R - 2, 0, 7); mg.clip();
    mg.translate(R, R); mg.rotate(heading); mg.scale(zoom, zoom);
    const [mx, my] = tx([px, py]);
    mg.drawImage(cv, -mx, -my);
    for (const o of objectives) if (o.p) { const [ox, oy] = tx([o.p.x, o.p.y]); mg.fillStyle = o.col; mg.beginPath(); mg.arc(ox - mx, oy - my, 5 / zoom * 1.6, 0, 7); mg.fill(); }
    mg.restore();
    mg.save(); mg.translate(R, R); mg.fillStyle = '#fff'; mg.beginPath(); mg.moveTo(0, -8); mg.lineTo(6, 6); mg.lineTo(0, 3); mg.lineTo(-6, 6); mg.closePath(); mg.fill(); mg.restore();
    mg.strokeStyle = 'rgba(255,255,255,0.35)'; mg.lineWidth = 2; mg.beginPath(); mg.arc(R, R, R - 2, 0, 7); mg.stroke();

    // location callout
    let zone = '';
    let bestD = 1e9;
    for (const z of zones) { const d = Math.hypot(px - z.c[0], py - z.c[1]); if (d < z.r && d < bestD) { bestD = d; zone = z.n; } }
    let near = null, nd = 45;
    for (const b of named) { const d = Math.hypot(px - b.c[0], py - b.c[1]) - Math.sqrt(b.a) / 2; if (d < nd) { nd = d; near = b.n; } }
    const label = zone || (near ? near.toUpperCase() : 'UNIVERSITY OF NOTRE DAME');
    if (label !== lastZone) { lastZone = label; zoneT = 0; $('loc').textContent = label; $('loc').classList.remove('show'); void $('loc').offsetWidth; $('loc').classList.add('show'); }
    $('near').textContent = near || '';
  }
  function drawBig(px, py) {
    const w = big.width, h = big.height;
    const s = Math.min(w / cv.width, h / cv.height) * 1.9;
    bg.fillStyle = '#111'; bg.fillRect(0, 0, w, h);
    const [cx, cy] = tx([150, -150]);
    bg.save(); bg.translate(w / 2, h / 2); bg.scale(s, s); bg.drawImage(cv, -cx, -cy);
    bg.font = `${11 / s}px "Barlow Condensed", Arial`; bg.textAlign = 'center';
    for (const z of zones) { const [x, y] = tx(z.c); bg.fillStyle = 'rgba(255,255,255,0.7)'; bg.fillText(z.n, x - cx, y - cy); }
    for (const o of objectives) if (o.p) { const [x, y] = tx([o.p.x, o.p.y]); bg.fillStyle = o.col; bg.beginPath(); bg.arc(x - cx, y - cy, 7 / s, 0, 7); bg.fill(); bg.fillStyle = '#fff'; bg.fillText(o.label.split(' — ')[0], x - cx, y - cy - 11 / s); }
    const [ax, ay] = tx([px, py]); bg.fillStyle = '#fff'; bg.beginPath(); bg.arc(ax - cx, ay - cy, 6 / s, 0, 7); bg.fill();
    bg.restore();
  }
  return { update, drawBig, zones, objectives };
}
