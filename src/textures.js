// Procedural canvas textures. Everything is generated at load so the project ships no image assets.
import * as THREE from 'three';
import { facadeND, facadeHouse, facadeCommercial, facadeConcrete, facadeMetal, facadeLibrary, facadeStadium, roofPBR, leafCard, barkTex } from './pbr.js';

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const reseed = (s) => { seed = s; };

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}
function noiseFill(g, w, h, base, amp, n = 4000, size = 2) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = (rnd() - 0.5) * amp;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(rnd() * w, rnd() * h, size * (0.5 + rnd()), size * (0.5 + rnd()));
  }
}
function bricks(g, x0, y0, w, h, bw, bh, base, jitter, mortar) {
  g.fillStyle = mortar; g.fillRect(x0, y0, w, h);
  for (let y = 0, row = 0; y < h; y += bh, row++) {
    for (let x = row % 2 ? -bw / 2 : 0; x < w; x += bw) {
      const j = (rnd() - 0.5) * jitter;
      const [r, gg, b] = base;
      g.fillStyle = `rgb(${r + j * 255 | 0},${gg + j * 240 | 0},${b + j * 210 | 0})`;
      g.fillRect(x0 + x + 0.6, y0 + y + 0.6, bw - 1.2, bh - 1.2);
    }
  }
}

// ---- Ground
function groundTex(kind) {
  const S = 512;
  const [c, g] = canvas(S);
  const P = {
    lawn: ['#5a7a34', 0.22], grass: ['#5f8436', 0.2], wood: ['#4d4a2c', 0.35], meadow: ['#7b8446', 0.3], golf: ['#4f8a38', 0.14],
    residential: ['#607c3a', 0.25], farm: ['#6f6a3e', 0.3], cemetery: ['#5a7a38', 0.2], base: ['#5d7836', 0.26],
  }[kind] || ['#5d7836', 0.25];
  noiseFill(g, S, S, P[0], P[1], 26000, 2.5);
  // clumps
  for (let i = 0; i < 180; i++) {
    const x = rnd() * S, y = rnd() * S, r = 10 + rnd() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.5;
    gr.addColorStop(0, dark ? 'rgba(30,40,10,0.10)' : 'rgba(200,190,90,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  if (kind === 'wood' || kind === 'lawn' || kind === 'grass' || kind === 'base') {
    // fallen autumn leaves
    const n = kind === 'wood' ? 5000 : 700;
    for (let i = 0; i < n; i++) { const hue = 15 + rnd() * 35; g.fillStyle = `hsla(${hue},70%,${35 + rnd() * 20}%,${0.5 + rnd() * 0.4})`; g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 3, 2 + rnd() * 2); }
  }
  return tex(c);
}
function asphaltTex() {
  const S = 512; const [c, g] = canvas(S);
  noiseFill(g, S, S, '#4a4b4d', 0.16, 30000, 1.5);
  for (let i = 0; i < 12; i++) { g.strokeStyle = 'rgba(20,20,20,0.35)'; g.lineWidth = 1.5; g.beginPath(); let x = rnd() * S, y = rnd() * S; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
  return tex(c);
}
function concreteTex() {
  const S = 512; const [c, g] = canvas(S);
  noiseFill(g, S, S, '#aba497', 0.12, 18000, 1.5);
  g.fillStyle = 'rgba(70,60,50,0.28)';
  for (let x = 0; x < S; x += 128) g.fillRect(x, 0, 2, S);
  for (let y = 0; y < S; y += 128) g.fillRect(0, y, S, 2);
  return tex(c);
}
function parkingTex() {
  // 1 tile = 20 m x 20 m; stalls 2.7 m wide
  const S = 512; const [c, g] = canvas(S);
  noiseFill(g, S, S, '#505154', 0.14, 30000, 1.5);
  const m = S / 20;
  g.fillStyle = 'rgba(235,235,225,0.75)';
  for (let x = 0; x < 20; x += 2.7) { g.fillRect(x * m, 1 * m, 3, 5.2 * m); g.fillRect(x * m, 13.6 * m, 3, 5.2 * m); }
  return tex(c);
}
function fieldTex() {
  // Football field; canvas maps 0..1 across an area 140 m (length) x 70 m (width)
  const W = 2048, Hh = 1024; const [c, g] = canvas(W, Hh);
  const L = 140, Wd = 70, sx = W / L, sy = Hh / Wd;
  for (let i = 0; i < 28; i++) { g.fillStyle = i % 2 ? '#3f8a32' : '#46953a'; g.fillRect(i * W / 28, 0, W / 28 + 1, Hh); }
  const fx0 = (L - 109.7) / 2, fy0 = (Wd - 48.8) / 2;
  const X = (m) => (fx0 + m) * sx, Y = (m) => (fy0 + m) * sy;
  // end zones (navy) with gold text
  g.fillStyle = '#0c2340'; g.fillRect(X(0), Y(0), 9.14 * sx, 48.8 * sy); g.fillRect(X(100.58), Y(0), 9.14 * sx, 48.8 * sy);
  g.fillStyle = '#c99700'; g.font = `bold ${5.2 * sy}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const [x, rot] of [[X(4.57), -Math.PI / 2], [X(105.15), Math.PI / 2]]) { g.save(); g.translate(x, Y(24.4)); g.rotate(rot); g.fillText('NOTRE DAME', 0, 0); g.restore(); }
  g.strokeStyle = '#f4f4ee'; g.lineWidth = 5;
  g.strokeRect(X(0), Y(0), 109.7 * sx, 48.8 * sy);
  g.fillStyle = '#f4f4ee';
  for (let yd = 0; yd <= 100; yd += 5) { const x = X(9.14 + yd * 0.9144); g.fillRect(x - 2, Y(0), 4, 48.8 * sy); }
  for (let yd = 1; yd < 100; yd++) { const x = X(9.14 + yd * 0.9144); for (const y of [0.3, 18.2, 29.9, 48.1]) g.fillRect(x - 1.5, Y(y), 3, 0.6 * sy); }
  g.font = `bold ${2 * sy}px Arial`;
  for (let yd = 10; yd <= 90; yd += 10) { const x = X(9.14 + yd * 0.9144), n = yd <= 50 ? yd : 100 - yd; g.fillText(String(n), x, Y(8)); g.save(); g.translate(x, Y(40.8)); g.rotate(Math.PI); g.fillText(String(n), 0, 0); g.restore(); }
  // midfield: interlocking monogram approximated with serif letters
  g.fillStyle = '#c99700'; g.font = `bold ${9 * sy}px Georgia, serif`; g.fillText('ND', X(54.85), Y(24.4));
  const t = tex(c, { repeat: false }); return t;
}
function pitchTex() {
  const S = 512; const [c, g] = canvas(S);
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#4a8c36' : '#529a3c'; g.fillRect(i * S / 8, 0, S / 8, S); }
  noiseFill(g, S, S, 'rgba(0,0,0,0)', 0.08, 8000, 2);
  return tex(c);
}
// Stadium crowd: tiny fans in navy / gold / green / white.
function crowdTex() {
  const W = 1024, Hh = 64; const [c, g] = canvas(W, Hh);
  g.fillStyle = '#2b2f36'; g.fillRect(0, 0, W, Hh);
  const cols = ['#0c2340', '#0c2340', '#1b3a66', '#c99700', '#d4af37', '#e8c547', '#00843d', '#1a9a4f', '#f2f2f2', '#dddddd', '#6b0f1a', '#1f1f1f', '#c8102e'];
  for (let y = 4; y < Hh; y += 14) for (let x = 0; x < W; x += 6 + rnd() * 2) {
    if (rnd() < 0.06) continue;
    g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(x, y + rnd() * 2, 5, 8);
    g.fillStyle = ['#f1c9a5', '#d9a47a', '#8d5a3b', '#e8b890'][(rnd() * 4) | 0]; g.fillRect(x + 1, y - 2 + rnd() * 2, 3, 3);
  }
  return tex(c);
}
// "Word of Life" mosaic (134 ft tall, south face of the library tower) — a stylised homage, not a copy.
function muralTex() {
  const W = 512, Hh = 1024; const [c, g] = canvas(W, Hh);
  const stones = ['#b98f63', '#8c6a4f', '#d2b48c', '#6e4a36', '#a0522d', '#c9a67a', '#4b5d6b', '#8b9aa3', '#e2cfa8', '#5c3b2a'];
  for (let y = 0; y < Hh; y += 8) for (let x = 0; x < W; x += 8) { g.fillStyle = stones[(rnd() * stones.length) | 0]; g.fillRect(x + 0.5, y + 0.5, 7, 7); }
  // rows of saints/scholars in the lower two thirds
  for (let row = 0; row < 5; row++) {
    const y = 520 + row * 95;
    for (let i = 0; i < 9; i++) {
      const x = 30 + i * 55 + (row % 2) * 22;
      g.fillStyle = ['#7a2c1c', '#2c4a6e', '#556b2f', '#5a3a6e', '#8c6d1f'][(i + row) % 5];
      g.beginPath(); g.moveTo(x, y + 80); g.lineTo(x + 14, y + 18); g.lineTo(x + 28, y + 80); g.fill();
      g.fillStyle = '#d8b48a'; g.beginPath(); g.arc(x + 14, y + 12, 9, 0, 7); g.fill();
      g.strokeStyle = '#e8c547'; g.lineWidth = 2; g.beginPath(); g.arc(x + 14, y + 12, 13, 0, 7); g.stroke();
    }
  }
  // central risen Christ with raised arms
  g.fillStyle = '#efe6d2'; g.beginPath(); g.moveTo(206, 520); g.lineTo(226, 170); g.lineTo(286, 170); g.lineTo(306, 520); g.fill();
  g.strokeStyle = '#efe6d2'; g.lineWidth = 34; g.lineCap = 'round';
  g.beginPath(); g.moveTo(236, 190); g.lineTo(150, 110); g.lineTo(120, 30); g.stroke();
  g.beginPath(); g.moveTo(276, 190); g.lineTo(362, 110); g.lineTo(392, 30); g.stroke();
  g.fillStyle = '#d4a979'; g.beginPath(); g.arc(256, 140, 30, 0, 7); g.fill();
  g.strokeStyle = '#e8c547'; g.lineWidth = 8; g.beginPath(); g.arc(256, 140, 46, 0, 7); g.stroke();
  // pixelate the drawn figures into mosaic tesserae
  const img = g.getImageData(0, 0, W, Hh), d = img.data;
  for (let y = 0; y < Hh; y += 8) for (let x = 0; x < W; x += 8) {
    const i = (y * W + x) * 4; const j = (rnd() - 0.5) * 30;
    for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) {
      const k = ((y + yy) * W + x + xx) * 4;
      if (xx === 7 || yy === 7) { d[k] *= 0.6; d[k + 1] *= 0.6; d[k + 2] *= 0.6; continue; }
      d[k] = d[i] + j; d[k + 1] = d[i + 1] + j; d[k + 2] = d[i + 2] + j;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: false });
}
function waterNormals() {
  const S = 256; const [c, g] = canvas(S);
  const h = new Float32Array(S * S);
  for (let o = 0; o < 5; o++) {
    const f = 2 ** (o + 1), a = 1 / (o + 1);
    const ph = [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = (x / S) * Math.PI * 2, v = (y / S) * Math.PI * 2;
      h[y * S + x] += a * (Math.sin(u * f + ph[0] + Math.sin(v * f + ph[1])) + Math.sin(v * f * 1 + ph[2] + Math.cos(u * f + ph[3])));
    }
  }
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)], dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
    const n = new THREE.Vector3(-dx * 0.6, -dy * 0.6, 1).normalize();
    const k = (y * S + x) * 4;
    img.data[k] = (n.x * 0.5 + 0.5) * 255; img.data[k + 1] = (n.y * 0.5 + 0.5) * 255; img.data[k + 2] = (n.z * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, { srgb: false });
}
function scoreboardTex() {
  const W = 1024, Hh = 512; const [c, g] = canvas(W, Hh);
  g.fillStyle = '#05070c'; g.fillRect(0, 0, W, Hh);
  const gr = g.createLinearGradient(0, 0, W, Hh); gr.addColorStop(0, '#0c2340'); gr.addColorStop(1, '#16386b');
  g.fillStyle = gr; g.fillRect(12, 12, W - 24, Hh - 24);
  g.fillStyle = '#c99700'; g.font = 'bold 120px Georgia, serif'; g.textAlign = 'center'; g.fillText('IRISH', W / 2, 180);
  g.fillStyle = '#ffffff'; g.font = 'bold 64px Arial'; g.fillText('HOME  0   —   VISITOR  0', W / 2, 300);
  g.font = '44px Arial'; g.fillStyle = '#e8c547'; g.fillText('KICKOFF 3:30 PM   •   1ST   15:00', W / 2, 400);
  return tex(c, { repeat: false });
}
function signTex(text, sub = '', bg = '#1d1d1d', fg = '#f5c518') {
  const W = 512, Hh = 256; const [c, g] = canvas(W, Hh);
  g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
  g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(10, 10, W - 20, Hh - 20);
  g.fillStyle = fg; g.textAlign = 'center'; g.font = 'bold 64px Arial'; g.fillText(text, W / 2, 120);
  g.font = 'bold 30px Arial'; g.fillStyle = '#ffffff'; g.fillText(sub, W / 2, 190);
  return tex(c, { repeat: false });
}

export function makeTextures() {
  reseed(4747);
  return {
    facade: [facadeND(), facadeHouse(), facadeCommercial(), facadeConcrete(), facadeMetal(), facadeLibrary(), facadeStadium()],
    roof: Object.fromEntries(['slate', 'tile', 'copper', 'shingle', 'flat', 'lead'].map((k) => [k, roofPBR(k)])),
    leaf: leafCard(), bark: barkTex(),
    ground: Object.fromEntries(['base', 'lawn', 'grass', 'wood', 'meadow', 'golf', 'residential', 'farm', 'cemetery'].map((k) => [k, groundTex(k)])),
    asphalt: asphaltTex(), concrete: concreteTex(), parking: parkingTex(), field: fieldTex(), pitch: pitchTex(),
    crowd: crowdTex(), mural: muralTex(), waterNormals: waterNormals(), scoreboard: scoreboardTex(),
    sign: signTex,
  };
}
