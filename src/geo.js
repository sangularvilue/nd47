// Low-level geometry helpers. Plan coordinates are [x east, y north]; world is (x, height, -y).
import * as THREE from 'three';

export class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; }
  // Triangle with flat normal; points are THREE.Vector3-like arrays [x,y,z]
  tri(a, b, c, ua, ub, uc, color = [1, 1, 1]) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) this.nor.push(nx, ny, nz);
    this.uv.push(...ua, ...ub, ...uc);
    this.col.push(...color, ...color, ...color);
  }
  quad(a, b, c, d, ua, ub, uc, ud, color) { this.tri(a, b, c, ua, ub, uc, color); this.tri(a, c, d, ua, uc, ud, color); }
  get count() { return this.pos.length / 3; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

export const W = (p, h) => [p[0], h, -p[1]];
export function area(r) { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return s / 2; }
export function centroid(r) { let x = 0, y = 0; for (const p of r) { x += p[0]; y += p[1]; } return [x / r.length, y / r.length]; }
export function pip(pt, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export function inPoly(pt, outer, holes = []) { if (!pip(pt, outer)) return false; for (const h of holes) if (pip(pt, h)) return false; return true; }

// Triangulate a polygon with holes into horizontal faces at height h.
export function capPoly(gb, outer, holes, h, uvScale, color, up = true, uvFn = null) {
  const contour = outer.map((p) => new THREE.Vector2(p[0], p[1]));
  const hs = (holes || []).map((r) => r.map((p) => new THREE.Vector2(p[0], p[1])));
  let faces;
  try { faces = THREE.ShapeUtils.triangulateShape(contour, hs); } catch (e) { return; }
  const all = contour.concat(...hs);
  for (const [i, j, k] of faces) {
    let a = all[i], b = all[j], c = all[k];
    const cr = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if ((cr < 0) === up) { const t = b; b = c; c = t; }
    const uv = uvFn || ((p) => [p.x / uvScale, p.y / uvScale]);
    gb.tri([a.x, h, -a.y], [b.x, h, -b.y], [c.x, h, -c.y], uv(a), uv(b), uv(c), color);
  }
}

// Convex hull + minimum-area oriented bounding rectangle
export function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
export function obb(pts) {
  const h = hull(pts);
  let best = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue;
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    let mnu = Infinity, mxu = -Infinity, mnv = Infinity, mxv = -Infinity;
    for (const p of h) { const u = p[0] * ux + p[1] * uy, v = -p[0] * uy + p[1] * ux; mnu = Math.min(mnu, u); mxu = Math.max(mxu, u); mnv = Math.min(mnv, v); mxv = Math.max(mxv, v); }
    const A = (mxu - mnu) * (mxv - mnv);
    if (!best || A < best.A) best = { A, ux, uy, mnu, mxu, mnv, mxv };
  }
  if (!best) return null;
  let { ux, uy, mnu, mxu, mnv, mxv } = best;
  let hu = (mxu - mnu) / 2, hv = (mxv - mnv) / 2;
  const cu = (mxu + mnu) / 2, cv = (mxv + mnv) / 2;
  const c = [cu * ux - cv * uy, cu * uy + cv * ux];
  // ensure u is the long axis
  if (hv > hu) { [hu, hv] = [hv, hu]; [ux, uy] = [-uy, ux]; }
  return { c, u: [ux, uy], v: [-uy, ux], hu, hv, A: best.A };
}

// Inset a CCW ring by d (inward). Returns null if the result degenerates.
export function inset(ring, d) {
  const n = ring.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = ring[(i - 1 + n) % n], p1 = ring[i], p2 = ring[(i + 1) % n];
    const e0 = norm([p1[0] - p0[0], p1[1] - p0[1]]), e1 = norm([p2[0] - p1[0], p2[1] - p1[1]]);
    const n0 = [-e0[1], e0[0]], n1 = [-e1[1], e1[0]]; // left normals (inward for CCW)
    const bis = norm([n0[0] + n1[0], n0[1] + n1[1]]);
    const cos = bis[0] * n1[0] + bis[1] * n1[1];
    let m = d / Math.max(cos, 0.25);
    out.push([p1[0] + bis[0] * m, p1[1] + bis[1] * m]);
  }
  const a0 = area(ring), a1 = area(out);
  if (a1 <= 0 || a1 < a0 * 0.18) return null;
  // reject self-intersections
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (segX(out[i], out[(i + 1) % n], out[j], out[(j + 1) % n])) return null;
  }
  // each vertex must move inward roughly the same amount; reject flipped edges
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n], c = out[i], e = out[(i + 1) % n];
    if ((b[0] - a[0]) * (e[0] - c[0]) + (b[1] - a[1]) * (e[1] - c[1]) <= 0) return null;
  }
  return out;
}
export function outset(ring, d) {
  const n = ring.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = ring[(i - 1 + n) % n], p1 = ring[i], p2 = ring[(i + 1) % n];
    const e0 = norm([p1[0] - p0[0], p1[1] - p0[1]]), e1 = norm([p2[0] - p1[0], p2[1] - p1[1]]);
    const n0 = [e0[1], -e0[0]], n1 = [e1[1], -e1[0]];
    const bis = norm([n0[0] + n1[0], n0[1] + n1[1]]);
    const cos = bis[0] * n1[0] + bis[1] * n1[1];
    const m = d / Math.max(cos, 0.35);
    out.push([p1[0] + bis[0] * m, p1[1] + bis[1] * m]);
  }
  return out;
}
export function norm(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }
function segX(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b) && o(a, b, c) !== 0 && o(c, d, a) !== 0;
}

// Ray from centre c at angle t intersected with ring; returns farthest hit distance.
export function rayRing(c, t, ring) {
  const dx = Math.cos(t), dy = Math.sin(t);
  let best = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j], [x2, y2] = ring[i];
    const ex = x2 - x1, ey = y2 - y1;
    const den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) continue;
    const s = ((x1 - c[0]) * ey - (y1 - c[1]) * ex) / den;
    const u = ((x1 - c[0]) * dy - (y1 - c[1]) * dx) / den;
    if (s > 0 && u >= 0 && u <= 1) best = Math.max(best, s);
  }
  return best;
}

// Simple deterministic hash
export function hash1(n) { let h = (n * 374761393) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
