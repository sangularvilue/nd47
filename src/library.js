// Hesburgh Library interior, built from the Libraries' published floor maps (tools/library_plans.mjs → data/library.json).
// LL–2: the bright, white 2010s renovation. 3–13: the 1963 tower's 70s/80s fit-out (carpet, beige, steel stacks, troffers).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pip, mulberry } from './geo.js';
import { baseOf } from './terrain.js';

export const LIB_BASE = 16109833, LIB_TOWER = 1185999646;
const FLOOR_NAMES = { '-1': 'LOWER LEVEL', 1: '1ST FLOOR', 2: '2ND FLOOR', 3: '3RD FLOOR' };
export const floorName = (l) => FLOOR_NAMES[l] || `${l}TH FLOOR`;

// ---------- entrance: centre of the tower's south face, under the Word of Life ----------
export function libraryDoor(data) {
  const tower = data.buildings.find((b) => b.id === LIB_TOWER); if (!tower) return null;
  const r = tower.o, n = r.length, south = [];
  for (let i = 0; i < n; i++) {
    const a = r[i], c = r[(i + 1) % n], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
    south.push((c[0] - a[0]) / L > 0.95 ? L : 0); // outward normal (dy,-dx)/L points south ⇔ edge runs east (CCW ring)
  }
  // longest contiguous run of south-facing edges
  let best = null;
  for (let i = 0; i < n; i++) {
    if (!south[i] || south[(i - 1 + n) % n]) continue;
    let j = i, len = 0; while (south[j % n] && j < i + n) { len += south[j % n]; j++; }
    if (!best || len > best.len) best = { i, j, len };
  }
  const a = r[best.i], c = r[best.j % n];
  const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
  const dir = [(c[0] - a[0]) / Math.hypot(c[0] - a[0], c[1] - a[1]), (c[1] - a[1]) / Math.hypot(c[0] - a[0], c[1] - a[1])];
  const half = 2.6;
  return { a, c, mid, dir, out: [dir[1], -dir[0]], p0: [mid[0] - dir[0] * half, mid[1] - dir[1] * half], p1: [mid[0] + dir[0] * half, mid[1] + dir[1] * half], height: 3.4, faceLen: best.len };
}
// Interval [s0, s1] (metres along a→c) of an edge that the door opening cuts, or null.
export function doorCut(door, a, c) {
  if (!door) return null;
  const L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 0.5) return null;
  const dx = (c[0] - a[0]) / L, dy = (c[1] - a[1]) / L;
  const proj = (p) => [(p[0] - a[0]) * dx + (p[1] - a[1]) * dy, Math.abs((p[0] - a[0]) * -dy + (p[1] - a[1]) * dx)];
  const [s0, d0] = proj(door.p0), [s1, d1] = proj(door.p1);
  if (d0 > 0.9 || d1 > 0.9 || Math.abs(dx * door.dir[0] + dy * door.dir[1]) < 0.95) return null;
  const lo = Math.max(0, Math.min(s0, s1)), hi = Math.min(L, Math.max(s0, s1));
  return hi - lo > 0.2 ? [lo, hi, L] : null;
}
function ringSegs(ring, door) {
  const segs = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], c = ring[(i + 1) % ring.length], cut = doorCut(door, a, c);
    if (!cut) { segs.push([a, c]); continue; }
    const [s0, s1, L] = cut, at = (s) => [a[0] + (c[0] - a[0]) * s / L, a[1] + (c[1] - a[1]) * s / L];
    if (s0 > 0.05) segs.push([a, at(s0)]);
    if (s1 < L - 0.05) segs.push([at(s1), c]);
  }
  return segs;
}

// ---------- procedural textures ----------
function cv(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, rep = true) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; }
const rng = mulberry(1963);
function booksTex(retro) {
  const [c, g] = cv(512, 1024); // one 0.9 m × 2.3 m shelf unit
  g.fillStyle = retro ? '#8e8470' : '#e9e9e6'; g.fillRect(0, 0, 512, 1024);
  const spines = retro ? ['#6b1f1a', '#1f3552', '#2f4a2e', '#7a6a4a', '#3b2a22', '#8a7b5c', '#5a2d3a', '#1d2a3a', '#a38d5c', '#40403a'] : ['#1f3552', '#7a2020', '#e3ddcf', '#2f4a2e', '#c9b28a', '#333', '#5d6f86', '#9b8a6a', '#b8472f', '#e8e3d8'];
  const shelfH = 1024 / 7;
  for (let s = 0; s < 7; s++) {
    const y1 = (s + 1) * shelfH - 10;
    let x = 14;
    while (x < 498) {
      const w = 7 + rng() * 16, h = shelfH * (0.62 + rng() * 0.3);
      if (rng() < 0.04) { x += 20 + rng() * 30; continue; } // gaps
      g.fillStyle = spines[(rng() * spines.length) | 0]; g.fillRect(x, y1 - h, w - 1, h);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 1, y1 - h + 6, 2, h - 12);
      if (rng() < 0.6) { g.fillStyle = 'rgba(230,210,150,0.55)'; g.fillRect(x + 2, y1 - h + 10, w - 5, 3); g.fillRect(x + 2, y1 - 22, w - 5, 8); } // gilt title + call-number label
      x += w;
    }
    g.fillStyle = retro ? '#6f6656' : '#d5d5d2'; g.fillRect(0, y1, 512, 10);
  }
  g.fillStyle = retro ? '#6f6656' : '#cfcfcc'; g.fillRect(0, 0, 14, 1024); g.fillRect(498, 0, 14, 1024);
  return tex(c);
}
function carpetTex() {
  const [c, g] = cv(512); // 1 tile = 2 m: burnt-orange/brown/gold 70s geometric
  g.fillStyle = '#7a4a22'; g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 64) for (let x = 0; x < 512; x += 64) {
    g.fillStyle = (x + y) % 128 ? '#8c5a26' : '#6a3c1c'; g.fillRect(x, y, 64, 64);
    g.fillStyle = '#b8862e'; g.beginPath(); g.arc(x + 32, y + 32, 20, 0, 7); g.fill();
    g.fillStyle = '#5a2e18'; g.beginPath(); g.arc(x + 32, y + 32, 11, 0, 7); g.fill();
  }
  const d = g.getImageData(0, 0, 512, 512); for (let i = 0; i < d.data.length; i += 4) { const n = (rng() - 0.5) * 34; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } g.putImageData(d, 0, 0);
  return tex(c);
}
function terrazzoTex() {
  const [c, g] = cv(512); // pale polished terrazzo, 1 tile = 2 m
  g.fillStyle = '#e9e7e2'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5000; i++) { g.fillStyle = ['#cfcac1', '#bdb6ab', '#f7f6f3', '#a9a399', '#d9d3c9'][(rng() * 5) | 0]; const r = 0.6 + rng() * 2.2; g.beginPath(); g.arc(rng() * 512, rng() * 512, r, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 2; g.strokeRect(0, 0, 512, 512);
  return tex(c);
}
function greyCarpetTex() {
  const [c, g] = cv(256); g.fillStyle = '#6d6f72'; g.fillRect(0, 0, 256, 256);
  const d = g.getImageData(0, 0, 256, 256); for (let i = 0; i < d.data.length; i += 4) { const n = (rng() - 0.5) * 40; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n + 3; } g.putImageData(d, 0, 0);
  return tex(c);
}
function ceilingTex(retro) {
  const [c, g] = cv(256); // 2 × 2 ft acoustic tiles (1 tile of texture = 1.22 m = 2 × 2 tiles)
  g.fillStyle = retro ? '#e6e1d4' : '#f7f7f5'; g.fillRect(0, 0, 256, 256);
  if (retro) for (let i = 0; i < 2600; i++) { g.fillStyle = 'rgba(120,110,90,0.25)'; g.fillRect(rng() * 256, rng() * 256, 1.5, 1.5); }
  g.fillStyle = retro ? '#b9b3a3' : '#e2e2e0'; g.fillRect(0, 0, 256, 4); g.fillRect(0, 126, 256, 4); g.fillRect(0, 0, 4, 256); g.fillRect(126, 0, 4, 256);
  return tex(c);
}
function windowWallTex(retro) {
  const [c, g] = cv(256, 512); // 3.2 m bay with the tower's slender slot window / renovation glazing
  g.fillStyle = retro ? '#cdbb95' : '#f1f0ec'; g.fillRect(0, 0, 256, 512);
  const grd = g.createLinearGradient(0, 40, 0, 470); grd.addColorStop(0, '#dfeaf3'); grd.addColorStop(0.6, '#b9ccda'); grd.addColorStop(1, '#8fa38a');
  g.fillStyle = grd;
  if (retro) g.fillRect(98, 60, 60, 390); else g.fillRect(10, 30, 236, 450);
  g.fillStyle = retro ? '#4a3a2a' : '#c9c9c6'; if (retro) { g.fillRect(92, 54, 72, 6); g.fillRect(92, 450, 72, 8); } else { g.fillRect(126, 30, 4, 450); g.fillRect(10, 250, 236, 4); }
  return tex(c);
}

// ---------- geometry helpers ----------
const boxAt = (cx, cy, w, d, y0, y1, th) => { const g = new THREE.BoxGeometry(w, y1 - y0, d); g.rotateY(th); g.translate(cx, (y0 + y1) / 2, -cy); return g; };
const rectCorners = (cx, cy, w, h, th) => { const c = Math.cos(th), s = Math.sin(th), u = [c, s], v = [-s, c]; return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [cx + u[0] * a * w / 2 + v[0] * b * h / 2, cy + u[1] * a * w / 2 + v[1] * b * h / 2]); };
function worldUV(g, sx, sz, along = null) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (along) { uv[i * 2] = (x * along[0] - z * along[1]) / sx; uv[i * 2 + 1] = y / sz; }
    else { uv[i * 2] = x / sx; uv[i * 2 + 1] = z / sz; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const merged = (list) => (list.length ? mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))) : null);

export function buildLibrary(data, lib, scene, T) {
  const BASE = data.buildings.find((b) => b.id === LIB_BASE), TOWER = data.buildings.find((b) => b.id === LIB_TOWER);
  if (!BASE || !TOWER || !lib) return null;
  const door = data.libDoor;
  const Y0 = baseOf(BASE) + 0.08; // floor-1 finished floor, a hair above grade
  const floors = lib.floors.slice().sort((a, b) => a.level - b.level);
  const byLevel = new Map(floors.map((f) => [f.level, f]));
  const TEX = {
    booksR: booksTex(true), booksM: booksTex(false), carpet: carpetTex(), terrazzo: terrazzoTex(), grey: greyCarpetTex(),
    ceilR: ceilingTex(true), ceilM: ceilingTex(false), winR: windowWallTex(true), winM: windowWallTex(false),
  };
  // self-lit fill stands in for bounce light (no interior GI in the browser)
  const M = (o, fill) => { const m = new THREE.MeshStandardMaterial({ roughness: 0.8, envMapIntensity: 0.25, ...o }); m.emissive = new THREE.Color(o.color ?? 0xffffff).multiplyScalar(fill); if (o.map) m.emissiveMap = o.map; return m; };
  const STYLE = {
    modern: {
      wall: M({ color: 0xeeece6, roughness: 0.9 }, 0.16), floor: M({ map: TEX.terrazzo, roughness: 0.42, color: 0xf2eee6 }, 0.12), ceil: M({ map: TEX.ceilM }, 0.3),
      core: M({ color: 0xc9c5bc }, 0.12), shelf: M({ map: TEX.booksM }, 0.3), win: M({ map: TEX.winM, roughness: 0.5 }, 0.7),
      table: M({ color: 0xf2efe8, roughness: 0.45 }, 0.22), wood: M({ color: 0xc8a575, roughness: 0.6 }, 0.2), seat: M({ color: 0x2b4f7d, roughness: 0.8 }, 0.15),
      light: new THREE.MeshBasicMaterial({ color: 0xfffdf6 }), lightSize: [3.2, 0.14], glass: new THREE.MeshStandardMaterial({ color: 0xe8f1f4, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22 }),
    },
    lower: {
      wall: M({ color: 0xeceae4 }, 0.42), floor: M({ map: TEX.grey, roughness: 0.95 }, 0.3), ceil: M({ map: TEX.ceilM }, 0.45),
      core: M({ color: 0xdedcd5 }, 0.35), shelf: M({ map: TEX.booksM }, 0.33), win: M({ color: 0xeceae4 }, 0.42),
      table: M({ color: 0xe8e5de, roughness: 0.5 }, 0.35), wood: M({ color: 0xb89568 }, 0.3), seat: M({ color: 0x3a3a3c }, 0.2),
      light: new THREE.MeshBasicMaterial({ color: 0xf6f8ff }), lightSize: [1.2, 0.6], glass: null,
    },
    retro: {
      wall: M({ color: 0xcdbb95, roughness: 0.92 }, 0.26), floor: M({ map: TEX.carpet, roughness: 1 }, 0.2), ceil: M({ map: TEX.ceilR }, 0.4),
      core: M({ color: 0xb9ad95 }, 0.22), shelf: M({ map: TEX.booksR }, 0.24), win: M({ map: TEX.winR }, 0.45),
      table: M({ color: 0x7a5534, roughness: 0.55 }, 0.2), wood: M({ color: 0x6b4a2e, roughness: 0.6 }, 0.2), seat: M({ color: 0xa4531f, roughness: 0.9 }, 0.2),
      light: new THREE.MeshBasicMaterial({ color: 0xeef6ff }), lightSize: [1.2, 0.6], glass: null,
    },
  };
  const styleOf = (lv) => (lv === 1 || lv === 2 ? STYLE.modern : lv === -1 ? STYLE.lower : STYLE.retro);
  const fpOf = (lv) => (lv >= 3 ? TOWER.o : BASE.o);
  const inside = (fp, x, y) => pip([x, y], fp);
  const edgeDist = (fp, x, y) => { let d = 1e9; for (let i = 0; i < fp.length; i++) { const a = fp[i], b = fp[(i + 1) % fp.length], ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / L2)); d = Math.min(d, Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t)); } return d; };

  // the entrance: carve plan walls around the door on floor 1
  const carve = (rects, th) => {
    if (!door) return rects;
    const c = Math.cos(th), s = Math.sin(th), toF = (p) => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c];
    const q = [door.p0, door.p1, [door.p0[0] - door.out[0] * 3, door.p0[1] - door.out[1] * 3], [door.p1[0] - door.out[0] * 3, door.p1[1] - door.out[1] * 3], [door.p0[0] + door.out[0], door.p0[1] + door.out[1]]].map(toF);
    const zu0 = Math.min(...q.map((p) => p[0])), zu1 = Math.max(...q.map((p) => p[0])), zv0 = Math.min(...q.map((p) => p[1])), zv1 = Math.max(...q.map((p) => p[1]));
    const out = [];
    for (const r of rects) {
      const [cx, cy, w, h] = r, [fu, fv] = toF([cx, cy]);
      const u0 = fu - w / 2, u1 = fu + w / 2, v0 = fv - h / 2, v1 = fv + h / 2;
      if (u1 <= zu0 || u0 >= zu1 || v1 <= zv0 || v0 >= zv1) { out.push(r); continue; }
      const pieces = [[u0, Math.min(u1, zu0), v0, v1], [Math.max(u0, zu1), u1, v0, v1], [Math.max(u0, zu0), Math.min(u1, zu1), v0, Math.min(v1, zv0)], [Math.max(u0, zu0), Math.min(u1, zu1), Math.max(v0, zv1), v1]];
      for (const [a0, a1, b0, b1] of pieces) {
        if (a1 - a0 < 0.05 || b1 - b0 < 0.05) continue;
        const mu = (a0 + a1) / 2, mv = (b0 + b1) / 2;
        out.push([mu * c - mv * s, mu * s + mv * c, a1 - a0, b1 - b0]);
      }
    }
    return out;
  };

  const levels = {};
  const allLights = [];
  for (let k = 0; k < floors.length; k++) {
    const f = floors[k], lv = f.level, st = styleOf(lv), th = f.th, fp = fpOf(lv);
    const next = floors[k + 1], y0 = Y0 + f.elev;
    const room = Math.min(f.ceil, (next ? next.elev - f.elev : 4.4) - 0.35);
    const keep = (r) => inside(fp, r[0], r[1]);
    const R = Object.fromEntries(Object.entries(f.regions).map(([n, v]) => [n, v.filter(keep)]));
    let walls = f.walls.filter(keep);
    if (lv === 1) { walls = carve(walls, th); R.core = carve(R.core, th); R.room = carve(R.room, th); }
    const G = { floor: [], ceil: [], wall: [], win: [], core: [], shelf: [], table: [], wood: [], seat: [] };
    const segs = [], lights = [];
    // slab + ceiling
    for (const r of f.slab.filter(keep)) {
      G.floor.push(boxAt(r[0], r[1], r[2] + 0.02, r[3] + 0.02, y0 - 0.3, y0, th));
      G.ceil.push(boxAt(r[0], r[1], r[2] + 0.02, r[3] + 0.02, y0 + room, y0 + room + 0.25, th));
    }
    // walls (perimeter ones carry windows)
    for (const r of walls) {
      const perim = edgeDist(fp, r[0], r[1]) < 1.4 && Math.max(r[2], r[3]) > 1.2;
      const g = boxAt(r[0], r[1], Math.max(r[2], 0.12), Math.max(r[3], 0.12), y0, y0 + room, th);
      if (perim) { const al = r[2] >= r[3] ? [Math.cos(th), Math.sin(th)] : [-Math.sin(th), Math.cos(th)]; worldUV(g, 3.2, room, al); for (let i = 0, uv = g.attributes.uv; i < uv.count; i++) uv.setY(i, (g.attributes.position.getY(i) - y0) / room); G.win.push(g); }
      else G.wall.push(g);
      const c = rectCorners(r[0], r[1], r[2], r[3], th); for (let i = 0; i < 4; i++) segs.push([c[i], c[(i + 1) % 4]]);
    }
    // service cores (stairs / lifts / WCs): solid volumes you can call the elevator from
    for (const r of R.core) {
      if (r[2] * r[3] < 0.4) continue;
      G.core.push(boxAt(r[0], r[1], r[2], r[3], y0, y0 + room, th));
      const c = rectCorners(r[0], r[1], r[2], r[3], th); for (let i = 0; i < 4; i++) segs.push([c[i], c[(i + 1) % 4]]);
    }
    const U = [Math.cos(th), Math.sin(th)], V = [-Math.sin(th), Math.cos(th)];
    const P = (r, a, b) => [r[0] + U[0] * a + V[0] * b, r[1] + U[1] * a + V[1] * b];
    // stacks: 0.55 m deep ranges on a 1.55 m pitch, running across the short side of each stack area
    for (const r of R.stacks) {
      const [w, h] = [r[2], r[3]]; if (w < 2.4 || h < 2.4) continue;
      const alongU = w < h, span = (alongU ? w : h) - 1.3, len = (alongU ? h : w) - 1.2;
      for (let s = -len / 2 + 0.6; s <= len / 2 - 0.3; s += 1.55) {
        const c = alongU ? P(r, 0, s) : P(r, s, 0), rw = alongU ? span : 0.55, rh = alongU ? 0.55 : span;
        const g = boxAt(c[0], c[1], rw, rh, y0, y0 + Math.min(2.3, room - 0.4), th);
        worldUV(g, 0.9, 2.3, alongU ? U : V); for (let i = 0, uv = g.attributes.uv; i < uv.count; i++) uv.setY(i, (g.attributes.position.getY(i) - y0) / 2.3);
        G.shelf.push(g);
        const cc = rectCorners(c[0], c[1], rw, rh, th); for (let i = 0; i < 4; i++) segs.push([cc[i], cc[(i + 1) % 4]]);
      }
    }
    // study areas: 4-seat tables; tech areas get the same with screens later
    const tableAt = (c, rot, big) => {
      const tw = big ? 3.6 : 1.8, td = big ? 1.4 : 0.9, a = th + rot;
      G.table.push(boxAt(c[0], c[1], tw, td, y0 + 0.72, y0 + 0.76, a));
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const q = [c[0] + Math.cos(a) * su * (tw / 2 - 0.08) - Math.sin(a) * sv * (td / 2 - 0.08), c[1] + Math.sin(a) * su * (tw / 2 - 0.08) + Math.cos(a) * sv * (td / 2 - 0.08)]; G.wood.push(boxAt(q[0], q[1], 0.05, 0.05, y0, y0 + 0.72, a)); }
      const seats = big ? [-1.2, -0.4, 0.4, 1.2] : [-0.45, 0.45];
      for (const sv of [-1, 1]) for (const su of seats) {
        const q = [c[0] + Math.cos(a) * su - Math.sin(a) * sv * (td / 2 + 0.35), c[1] + Math.sin(a) * su + Math.cos(a) * sv * (td / 2 + 0.35)];
        G.seat.push(boxAt(q[0], q[1], 0.46, 0.46, y0 + 0.42, y0 + 0.5, a));
        const bk = [q[0] - Math.sin(a) * sv * 0.22, q[1] + Math.cos(a) * sv * 0.22]; G.seat.push(boxAt(bk[0], bk[1], 0.44, 0.06, y0 + 0.5, y0 + 0.92, a));
        for (const [lu, lvv] of [[-0.19, -0.19], [0.19, -0.19], [0.19, 0.19], [-0.19, 0.19]]) G.wood.push(boxAt(q[0] + Math.cos(a) * lu - Math.sin(a) * lvv, q[1] + Math.sin(a) * lu + Math.cos(a) * lvv, 0.035, 0.035, y0, y0 + 0.42, a));
      }
      const cc = rectCorners(c[0], c[1], tw, td, a); for (let i = 0; i < 4; i++) segs.push([cc[i], cc[(i + 1) % 4]]);
    };
    for (const r of [...R.study, ...R.tech]) {
      const [w, h] = [r[2], r[3]]; if (w < 2.6 || h < 2.2) continue;
      const nu = Math.max(1, Math.floor((w - 0.8) / 3.1)), nv = Math.max(1, Math.floor((h - 0.8) / 2.7));
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) if (rng() < 0.9) tableAt(P(r, (i - (nu - 1) / 2) * 3.1, (j - (nv - 1) / 2) * 2.7), 0, false);
    }
    // seminar rooms and offices: one table sized to the room
    for (const r of R.room) { if (r[2] * r[3] > 24 && Math.min(r[2], r[3]) > 3.4) tableAt([r[0], r[1]], r[2] >= r[3] ? 0 : Math.PI / 2, r[2] * r[3] > 45); }
    // carrels along the windows
    for (const r of R.carrel) {
      const alongU = r[2] >= r[3], len = alongU ? r[2] : r[3]; if (len < 1.2 || Math.min(r[2], r[3]) < 0.8) continue;
      for (let s = -len / 2 + 0.6; s <= len / 2 - 0.5; s += 1.15) {
        const c = alongU ? P(r, s, 0) : P(r, 0, s), a = alongU ? th : th + Math.PI / 2;
        G.wood.push(boxAt(c[0], c[1], 1.0, 0.62, y0 + 0.72, y0 + 0.76, a));
        for (const side of [-1, 1]) { const q = [c[0] + Math.cos(a) * side * 0.53, c[1] + Math.sin(a) * side * 0.53]; G.wood.push(boxAt(q[0], q[1], 0.03, 0.62, y0, y0 + 1.3, a)); }
        const bq = [c[0] - Math.sin(a) * -0.3, c[1] + Math.cos(a) * -0.3]; G.wood.push(boxAt(bq[0], bq[1], 1.06, 0.03, y0 + 0.76, y0 + 1.3, a));
        G.seat.push(boxAt(c[0] + Math.sin(a) * 0.55, c[1] - Math.cos(a) * 0.55, 0.46, 0.46, y0 + 0.42, y0 + 0.5, a));
      }
    }
    // ceiling fixtures on a grid over open areas
    const [lw, ld] = st.lightSize, pitchU = lw > 2 ? 4.2 : 2.44, pitchV = lw > 2 ? 3.0 : 2.44;
    for (const r of [...R.corridor, ...R.study, ...R.stacks, ...R.carrel, ...R.tech]) {
      const nu = Math.floor(r[2] / pitchU), nv = Math.floor(r[3] / pitchV);
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const p = P(r, (i - (nu - 1) / 2) * pitchU, (j - (nv - 1) / 2) * pitchV); lights.push(p); }
    }
    const grp = new THREE.Group(); grp.name = 'lib-' + lv; grp.visible = false;
    const addMesh = (list, mat, uvFn) => { const g = merged(list); if (!g) return; if (uvFn) uvFn(g); const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; grp.add(m); };
    addMesh(G.floor, st.floor, (g) => worldUV(g, 2, 2)); addMesh(G.ceil, st.ceil, (g) => worldUV(g, 1.22, 1.22));
    addMesh(G.wall, st.wall); addMesh(G.win, st.win); addMesh(G.core, st.core); addMesh(G.shelf, st.shelf);
    addMesh(G.table, st.table); addMesh(G.wood, st.wood); addMesh(G.seat, st.seat);
    if (lights.length) {
      const pg = new THREE.PlaneGeometry(lw, ld); pg.rotateX(Math.PI / 2);
      const im = new THREE.InstancedMesh(pg, st.light, lights.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), th);
      lights.forEach((p, i) => im.setMatrixAt(i, m4.compose(new THREE.Vector3(p[0], y0 + room - 0.02, -p[1]), q, new THREE.Vector3(1, 1, 1))));
      im.computeBoundingSphere(); grp.add(im);
    }
    scene.add(grp);
    // collision: plan walls, cores, shelving, tables + the footprint shell (door gap on floor 1)
    const shell = ringSegs(fp, lv === 1 ? door : null);
    levels[lv] = { lv, y: y0, room, grp, segs: [...segs, ...shell], cores: R.core, corridors: R.corridor, lights: lights.map((p) => [p[0], y0 + room - 0.3, p[1]]), fp };
    allLights.push(...levels[lv].lights);
  }

  // ---- automatic sliding doors (bronze-anodised frame, two glass leaves) ----
  const doorGrp = new THREE.Group();
  const leaves = [];
  if (door) {
    const frameM = new THREE.MeshStandardMaterial({ color: 0x3a3029, metalness: 0.8, roughness: 0.35 });
    const glassM = new THREE.MeshStandardMaterial({ color: 0xcfe0e6, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.28, envMapIntensity: 1.5, depthWrite: false });
    const a = Math.atan2(door.dir[1], door.dir[0]), W2 = Math.hypot(door.p1[0] - door.p0[0], door.p1[1] - door.p0[1]);
    const place = (m, s, y, off = 0) => { m.position.set(door.mid[0] + door.dir[0] * s + door.out[0] * off, Y0 + y, -(door.mid[1] + door.dir[1] * s + door.out[1] * off)); m.rotation.y = a; doorGrp.add(m); return m; };
    place(new THREE.Mesh(new THREE.BoxGeometry(W2 + 0.3, 0.35, 0.3), frameM), 0, door.height + 0.1);
    for (const s of [-1, 1]) place(new THREE.Mesh(new THREE.BoxGeometry(0.15, door.height + 0.3, 0.3), frameM), s * (W2 / 2 + 0.07), (door.height + 0.3) / 2 - 0.02);
    place(new THREE.Mesh(new THREE.BoxGeometry(W2, 0.03, 0.9), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 })), 0, 0.01); // mat
    for (const s of [-1, 1]) {
      const leaf = new THREE.Group();
      const g = new THREE.Mesh(new THREE.BoxGeometry(W2 / 2 - 0.05, door.height - 0.1, 0.03), glassM); leaf.add(g);
      for (const e of [-1, 1]) { const st2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, door.height - 0.1, 0.06), frameM); st2.position.x = e * (W2 / 4 - 0.03); leaf.add(st2); }
      const pull = new THREE.Mesh(new THREE.BoxGeometry(W2 / 2 - 0.05, 0.1, 0.06), frameM); pull.position.y = -(door.height - 0.1) / 2 + 0.05; leaf.add(pull);
      place(leaf, s * W2 / 4, (door.height - 0.1) / 2 + 0.02, 0.02);
      leaves.push({ leaf, s, base: s * W2 / 4, slide: W2 / 2 - 0.1 });
    }
    // lettering over the entrance
    const [lc, lg] = cv(1024, 128); lg.clearRect(0, 0, 1024, 128); lg.fillStyle = '#2d2620'; lg.font = '600 70px "Trajan Pro", Georgia, serif'; lg.textAlign = 'center'; lg.textBaseline = 'middle'; lg.fillText('THEODORE M. HESBURGH LIBRARY', 512, 64);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.1), new THREE.MeshStandardMaterial({ map: tex(lc, false), transparent: true, metalness: 0.6, roughness: 0.4 }));
    place(sign, 0, door.height + 1.0, 0.09);
    doorGrp.traverse((o) => { if (o.isMesh) o.castShadow = o.material !== glassM; });
    scene.add(doorGrp);
  }
  let openAmt = 0;
  // interior fill lights that follow the player to the nearest fixtures (created once: no shader recompiles)
  const pls = []; // emissive fill stands in for fixtures: real point lights would add a lighting pass to every material
  let plT = 1;

  const outdoorShell = ringSegs(BASE.o, door);
  const api = {
    door, levels, floors: floors.map((f) => f.level), Y0,
    contains: (x, y) => pip([x, y], BASE.o),
    outdoorSegs: outdoorShell,
    floorY: (lv) => levels[lv]?.y ?? Y0,
    ceilY: (lv) => (levels[lv] ? levels[lv].y + levels[lv].room : Y0 + 4),
    nearCore(x, y, lv, r = 2.2) {
      const L = levels[lv]; if (!L) return false;
      for (const c of L.cores) if (Math.hypot(c[0] - x, c[1] - y) < Math.hypot(c[2], c[3]) / 2 + r && c[2] * c[3] > 3) return true;
      return false;
    },
    // nearest open corridor point on a floor to (x, y)
    arrive(lv, x, y) {
      const L = levels[lv]; let best = null, bd = 1e9;
      for (const r of L.corridors) { if (r[2] * r[3] < 3) continue; const d = (r[0] - x) ** 2 + (r[1] - y) ** 2; if (d < bd) { bd = d; best = r; } }
      return best ? [best[0], best[1]] : [x, y];
    },
    update(dt, player, camPos) {
      // doors: open when the agent is within 4.5 m on either side
      const d = door ? Math.hypot(player.x - door.mid[0], player.y - door.mid[1]) : 1e9;
      const want = d < 4.5 && (player.level == null || player.level === 1) ? 1 : 0;
      openAmt += (want - openAmt) * (1 - Math.exp(-dt * (want ? 5 : 2.5)));
      for (const l of leaves) { const s = l.base + l.s * l.slide * openAmt; l.leaf.position.set(door.mid[0] + door.dir[0] * s + door.out[0] * 0.02, l.leaf.position.y, -(door.mid[1] + door.dir[1] * s + door.out[1] * 0.02)); }
      // which floor is drawn: the one you're on; the lobby too when you're near the entrance outside
      const near = Math.hypot(player.x - BASE.c[0], player.y - BASE.c[1]) < 140;
      for (const lv in levels) levels[lv].grp.visible = player.level != null ? +lv === player.level : near && +lv === 1;
      // fill lights
      plT += dt;
      if (plT > 0.25) {
        plT = 0;
        const L = levels[player.level ?? 1];
        const on = player.level != null || d < 25;
        const sorted = L ? L.lights.slice().sort((a, b) => ((a[0] - player.x) ** 2 + (a[2] - player.y) ** 2) - ((b[0] - player.x) ** 2 + (b[2] - player.y) ** 2)) : [];
        pls.forEach((l, i) => { const p = sorted[i]; if (!p || !on) { l.intensity = 0; return; } l.position.set(p[0], p[1], -p[2]); l.intensity = (player.level === 1 || player.level === 2 || player.level == null) ? 9 : 6; l.color.set(player.level >= 3 ? 0xeef2ff : 0xfff6ea); });
      }
    },
  };
  return api;
}
