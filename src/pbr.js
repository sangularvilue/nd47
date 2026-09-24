// Layered procedural PBR textures. Every draw call paints albedo, height and a mask/roughness
// channel at once so the maps stay registered. Mask texture: R = window glass, G = roughness.
import * as THREE from 'three';

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function mk(S) { const c = document.createElement('canvas'); c.width = c.height = S; return [c, c.getContext('2d')]; }

class Layers {
  constructor(S) { this.S = S; [this.cA, this.a] = mk(S); [this.cH, this.h] = mk(S); [this.cM, this.m] = mk(S); }
  // a: css colour, hv: height 0..255, win 0/1, rough 0..1
  rect(x, y, w, h, a, hv, win = 0, rough = 0.9) {
    this.a.fillStyle = a; this.a.fillRect(x, y, w, h);
    this.h.fillStyle = `rgb(${hv},${hv},${hv})`; this.h.fillRect(x, y, w, h);
    this.m.fillStyle = `rgb(${win * 255 | 0},${rough * 255 | 0},0)`; this.m.fillRect(x, y, w, h);
  }
  path(fn, a, hv, win = 0, rough = 0.9) {
    for (const [g, style] of [[this.a, a], [this.h, `rgb(${hv},${hv},${hv})`], [this.m, `rgb(${win * 255 | 0},${rough * 255 | 0},0)`]]) { g.fillStyle = style; g.beginPath(); fn(g); g.fill(); }
  }
  // albedo-only speckle (weathering)
  speckle(n, amp, size = 2) {
    for (let i = 0; i < n; i++) { const v = (rnd() - 0.5) * amp; this.a.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; this.a.fillRect(rnd() * this.S, rnd() * this.S, size * (0.5 + rnd()), size * (0.5 + rnd())); }
  }
  heightNoise(n, amp, size = 2) {
    for (let i = 0; i < n; i++) { const v = (rnd() - 0.5) * amp; this.h.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; this.h.fillRect(rnd() * this.S, rnd() * this.S, size, size); }
  }
  build(normalStrength = 2.5) {
    const t = (c, srgb) => { const x = new THREE.CanvasTexture(c); if (srgb) x.colorSpace = THREE.SRGBColorSpace; x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = 8; x.needsUpdate = true; return x; };
    return { map: t(this.cA, true), mask: t(this.cM, false), normal: t(heightToNormal(this.cH, normalStrength), false) };
  }
}

export function heightToNormal(src, strength) {
  const S = src.width, H = src.height;
  const d = src.getContext('2d').getImageData(0, 0, S, H).data;
  const [c, g] = [document.createElement('canvas'), null]; c.width = S; c.height = H;
  const ctx = c.getContext('2d'); const img = ctx.createImageData(S, H); const o = img.data;
  const hgt = (x, y) => d[(((y + H) % H) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < S; x++) {
    const dx = (hgt(x + 1, y) - hgt(x - 1, y)) * strength, dy = (hgt(x, y + 1) - hgt(x, y - 1)) * strength;
    let nx = -dx, ny = dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const k = (y * S + x) * 4; o[k] = (nx * 0.5 + 0.5) * 255; o[k + 1] = (ny * 0.5 + 0.5) * 255; o[k + 2] = (nz * 0.5 + 0.5) * 255; o[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function brickField(L, x0, y0, w, h, bw, bh, base, jitter, mortar) {
  L.rect(x0, y0, w, h, mortar, 120, 0, 0.95);
  for (let y = 0, row = 0; y < h; y += bh, row++) for (let x = row % 2 ? -bw / 2 : 0; x < w; x += bw) {
    const j = (rnd() - 0.5) * jitter, [r, g, b] = base;
    const burnt = rnd() < 0.06 ? -0.12 : 0;
    L.rect(x0 + x + 1, y0 + y + 1, bw - 2, bh - 2, `rgb(${(r + (j + burnt) * 255) | 0},${(g + (j + burnt) * 235) | 0},${(b + (j + burnt) * 200) | 0})`, 175 + (rnd() * 30 | 0), 0, 0.82 + rnd() * 0.1);
  }
}

// ---- Facade tiles: one structural bay (u) x one storey (v), 512 px
export function facadeND() {
  const S = 512, L = new Layers(S);
  brickField(L, 0, 0, S, S, 42, 13, [216, 192, 142], 0.07, '#c9b893');
  const wx = 146, ww = 220, wy = 84, wh = 330;
  // limestone surround + pointed head
  L.rect(wx - 22, wy - 10, ww + 44, wh + 26, '#e6dcc4', 225, 0, 0.75);
  L.path((g) => { g.moveTo(wx - 22, wy); g.lineTo(wx + ww / 2, wy - 56); g.lineTo(wx + ww + 22, wy); g.closePath(); }, '#e6dcc4', 225, 0, 0.75);
  // reveal (recessed stone)
  L.rect(wx - 6, wy - 2, ww + 12, wh + 6, '#cfc4ab', 150, 0, 0.8);
  L.path((g) => { g.moveTo(wx - 6, wy + 2); g.lineTo(wx + ww / 2, wy - 40); g.lineTo(wx + ww + 6, wy + 2); g.closePath(); }, '#cfc4ab', 150, 0, 0.8);
  // glass
  L.rect(wx, wy, ww, wh, '#101418', 60, 1, 0.06);
  L.path((g) => { g.moveTo(wx, wy + 2); g.lineTo(wx + ww / 2, wy - 34); g.lineTo(wx + ww, wy + 2); g.closePath(); }, '#101418', 60, 1, 0.06);
  // stone mullion + transom, lead cames
  L.rect(wx + ww / 2 - 9, wy - 34, 18, wh + 34, '#ddd2b9', 200, 0, 0.7);
  L.rect(wx, wy + 104, ww, 14, '#ddd2b9', 200, 0, 0.7);
  for (const f of [0.25, 0.75]) L.rect(wx + ww * f - 2, wy, 4, wh, '#2d2a26', 90, 0, 0.5);
  for (let y = wy + 20; y < wy + wh; y += 26) L.rect(wx, y, ww, 2, '#2d2a26', 90, 0, 0.5);
  // sill + string course at the floor line
  L.rect(wx - 30, wy + wh + 12, ww + 60, 18, '#ede3cc', 235, 0, 0.7);
  L.rect(0, S - 10, S, 10, '#e2d8c0', 215, 0, 0.75);
  L.speckle(9000, 0.08, 2); L.heightNoise(6000, 0.15, 2);
  // weathering streaks below sill
  for (let i = 0; i < 20; i++) { const x = wx - 20 + rnd() * (ww + 40); L.a.fillStyle = 'rgba(70,60,40,0.06)'; L.a.fillRect(x, wy + wh + 30, 3 + rnd() * 5, 30 + rnd() * 50); }
  return L.build(3);
}
export function facadeHouse() {
  const S = 512, L = new Layers(S);
  L.rect(0, 0, S, S, '#f2f0ea', 150, 0, 0.8);
  for (let y = 0; y < S; y += 22) { L.rect(0, y, S, 4, '#d9d6cf', 110, 0, 0.8); L.rect(0, y + 4, S, 2, '#ffffff', 170, 0, 0.8); }
  const wx = 160, ww = 190, wy = 110, wh = 240;
  L.rect(wx - 22, wy - 22, ww + 44, wh + 44, '#fbfbf8', 200, 0, 0.6);
  L.rect(wx, wy, ww, wh, '#12171b', 70, 1, 0.05);
  L.rect(wx, wy + wh / 2 - 6, ww, 12, '#fbfbf8', 190, 0, 0.6); L.rect(wx + ww / 2 - 6, wy, 12, wh, '#fbfbf8', 190, 0, 0.6);
  L.rect(wx - 56, wy - 18, 28, wh + 36, '#3a3f44', 180, 0, 0.7); L.rect(wx + ww + 28, wy - 18, 28, wh + 36, '#3a3f44', 180, 0, 0.7);
  L.speckle(4000, 0.05, 2);
  return L.build(2.5);
}
export function facadeCommercial() {
  const S = 512, L = new Layers(S);
  brickField(L, 0, 0, S, S, 42, 13, [150, 72, 54], 0.1, '#9c8a7c');
  const wx = 60, ww = 392, wy = 80, wh = 320;
  L.rect(wx - 12, wy - 12, ww + 24, wh + 24, '#2e2e2c', 190, 0, 0.4);
  L.rect(wx, wy, ww, wh, '#141a20', 70, 1, 0.04);
  L.rect(wx + ww / 2 - 6, wy, 12, wh, '#2e2e2c', 180, 0, 0.4);
  L.rect(0, S - 36, S, 22, '#d9d2c3', 220, 0, 0.7);
  L.speckle(6000, 0.08);
  return L.build(3);
}
export function facadeConcrete() {
  const S = 512, L = new Layers(S);
  L.rect(0, 0, S, S, '#b9b6ae', 200, 0, 0.9); L.speckle(9000, 0.1); L.heightNoise(5000, 0.2);
  L.rect(0, 140, S, 260, '#1d1e1f', 40, 0, 0.9);
  for (let x = 0; x < S; x += 256) L.rect(x, 140, 28, 260, '#a9a69e', 200, 0, 0.9);
  return L.build(3);
}
export function facadeMetal() {
  const S = 512, L = new Layers(S);
  L.rect(0, 0, S, S, '#b8bcbf', 150, 0, 0.45);
  for (let x = 0; x < S; x += 32) { L.rect(x, 0, 6, S, '#9fa4a8', 90, 0, 0.45); L.rect(x + 6, 0, 4, S, '#d0d4d7', 190, 0, 0.45); }
  L.rect(40, 150, 432, 120, '#141a20', 60, 1, 0.05);
  return L.build(2);
}
export function facadeLibrary() {
  const S = 512, L = new Layers(S);
  L.rect(0, 0, S, S, '#b7a78f', 190, 0, 0.7); L.speckle(14000, 0.12, 2); L.heightNoise(8000, 0.2);
  for (let y = 0; y < S; y += 128) L.rect(0, y, S, 3, '#7d6f5d', 120, 0, 0.8);
  for (let x = 0; x < S; x += 256) L.rect(x, 0, 3, S, '#7d6f5d', 120, 0, 0.8);
  L.rect(214, 0, 84, S, '#11161a', 50, 1, 0.05);
  L.rect(208, 0, 6, S, '#8c7e6a', 230, 0, 0.6); L.rect(298, 0, 6, S, '#8c7e6a', 230, 0, 0.6);
  return L.build(3);
}
export function facadeStadium() {
  const S = 512, L = new Layers(S);
  brickField(L, 0, 0, S, S, 42, 13, [176, 112, 78], 0.09, '#a08a74');
  L.rect(0, 0, S, 28, '#d8ccb4', 230, 0, 0.7); L.rect(0, 236, S, 20, '#d8ccb4', 230, 0, 0.7);
  L.rect(128, 320, 256, 192, '#1a1612', 40, 0, 0.9);
  L.path((g) => g.arc(256, 320, 128, Math.PI, 0), '#1a1612', 40, 0, 0.9);
  L.rect(168, 64, 176, 140, '#15191d', 60, 1, 0.1);
  return L.build(3);
}

// ---- Roofs (1 tile = 4 m)
export function roofPBR(kind) {
  const S = 512, L = new Layers(S);
  if (kind === 'slate') { L.rect(0, 0, S, S, '#3e4347', 100, 0, 0.7); for (let y = 0, r = 0; y < S; y += 30, r++) for (let x = r % 2 ? -22 : 0; x < S; x += 44) { const j = (rnd() - 0.5) * 20; L.rect(x + 2, y + 2, 41, 27, `rgb(${70 + j | 0},${76 + j | 0},${82 + j | 0})`, 150 + (rnd() * 60 | 0), 0, 0.55 + rnd() * 0.2); } }
  else if (kind === 'tile') { L.rect(0, 0, S, S, '#5e2a18', 90, 0, 0.8); for (let y = 0; y < S; y += 26) for (let x = 0; x < S; x += 32) { const j = (rnd() - 0.5) * 30; L.rect(x + 1, y, 30, 24, `rgb(${150 + j | 0},${72 + j / 2 | 0},${48})`, 170, 0, 0.7); L.rect(x + 8, y, 14, 24, `rgb(${170 + j | 0},${88 + j / 2 | 0},${58})`, 220, 0, 0.65); } }
  else if (kind === 'copper') { L.rect(0, 0, S, S, '#5f9c86', 150, 0, 0.55); L.speckle(20000, 0.2, 3); for (let x = 0; x < S; x += 64) L.rect(x, 0, 6, S, '#4b7d6b', 230, 0, 0.5); }
  else if (kind === 'shingle') { L.rect(0, 0, S, S, '#2e2b29', 90, 0, 0.9); for (let y = 0, r = 0; y < S; y += 24, r++) for (let x = r % 2 ? -20 : 0; x < S; x += 40) { const j = (rnd() - 0.5) * 26; L.rect(x + 1, y + 1, 38, 22, `rgb(${62 + j | 0},${58 + j | 0},${55 + j | 0})`, 150 + (rnd() * 50 | 0), 0, 0.92); } L.heightNoise(20000, 0.3, 1); }
  else if (kind === 'flat') { L.rect(0, 0, S, S, '#8d8b86', 128, 0, 0.9); L.speckle(26000, 0.14, 2); L.heightNoise(20000, 0.25, 2); for (let x = 0; x < S; x += 128) L.rect(x, 0, 4, S, '#7a7874', 160, 0, 0.8); }
  else if (kind === 'lead') { L.rect(0, 0, S, S, '#61666a', 128, 0, 0.45); L.speckle(9000, 0.1, 3); for (let x = 0; x < S; x += 56) L.rect(x, 0, 8, S, '#80868a', 230, 0, 0.4); }
  return L.build(kind === 'flat' ? 1.5 : 3);
}

// ---- Foliage atlas: a leaf cluster card (alpha), greyscale-ish so instance colour tints it
export function leafCard() {
  const S = 512; const [c, g] = mk(S);
  g.clearRect(0, 0, S, S);
  const leaf = (x, y, r, a, v) => {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath();
    // five-lobed maple-ish leaf
    for (let i = 0; i <= 10; i++) { const t = (i / 10) * Math.PI * 2, rr = r * (i % 2 ? 0.55 : 1); g.lineTo(Math.cos(t - Math.PI / 2) * rr, Math.sin(t - Math.PI / 2) * rr * 0.9); }
    g.fill();
    g.strokeStyle = `rgba(0,0,0,0.25)`; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r * 0.9); g.stroke();
    g.restore();
  };
  // twigs
  g.strokeStyle = '#3a2d20'; g.lineWidth = 5;
  for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(S / 2, S * 0.95); g.quadraticCurveTo(S / 2 + (rnd() - 0.5) * 200, S * 0.6, S * (0.15 + rnd() * 0.7), S * (0.1 + rnd() * 0.4)); g.stroke(); }
  const blobs = Array.from({ length: 7 }, () => [S * (0.25 + rnd() * 0.5), S * (0.22 + rnd() * 0.5), S * (0.12 + rnd() * 0.16)]);
  for (let i = 0; i < 2400; i++) {
    const [bx, by, br] = blobs[(rnd() * blobs.length) | 0];
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * br;
    leaf(bx + Math.cos(a) * rr, by + Math.sin(a) * rr, 6 + rnd() * 7, rnd() * 6.28, 120 + (rnd() * 135 | 0));
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}
export function barkTex() {
  const S = 256, L = new Layers(S);
  L.rect(0, 0, S, S, '#4a3b2c', 128, 0, 0.95);
  for (let i = 0; i < 70; i++) { const x = rnd() * S; L.rect(x, 0, 2 + rnd() * 5, S, rnd() < 0.5 ? '#3a2e22' : '#5a4a38', rnd() < 0.5 ? 70 : 190, 0, 0.95); }
  L.speckle(5000, 0.1);
  return L.build(4);
}
