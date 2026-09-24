// Bare-earth terrain from USGS 3DEP LiDAR (2 m grid). Heights are metres relative to DATUM.
import * as THREE from 'three';
import { pip, inPoly } from './geo.js';

export const DATUM = 223.0; // ≈ median campus grade (ft ≈ 731.6)
// Global accessor so every module can place things on the ground: TER.h(x, y) with plan coords.
export const TER = { t: null, h: (x, y) => (TER.t ? TER.t.h(x, y) : 0) };
export const baseOf = (b) => (b.g != null ? b.g - DATUM : TER.h(b.c[0], b.c[1]));

export class Terrain {
  constructor(buf, bounds) {
    const dv = new DataView(buf);
    this.W = dv.getUint32(0, true); this.H = dv.getUint32(4, true);
    const med = dv.getFloat32(8, true);
    this.cs = 2; this.x0 = bounds[0]; this.y0 = bounds[1];
    const n = this.W * this.H, raw = new Float32Array(n);
    for (let i = 0; i < n; i++) raw[i] = med + dv.getInt16(12 + i * 2, true) / 10 - DATUM;
    // light 3×3 blur: LiDAR ground is noisy at 2 m and roads would visibly wobble
    this.d = new Float32Array(n);
    for (let r = 0; r < this.H; r++) for (let c = 0; c < this.W; c++) {
      let s = 0, k = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= this.H || cc >= this.W) continue; s += raw[rr * this.W + cc]; k++; }
      this.d[r * this.W + c] = s / k;
    }
  }
  h(x, y) {
    const fx = (x - this.x0) / this.cs - 0.5, fy = (y - this.y0) / this.cs - 0.5;
    const c = Math.max(0, Math.min(this.W - 2, Math.floor(fx))), r = Math.max(0, Math.min(this.H - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - c)), ty = Math.max(0, Math.min(1, fy - r));
    const i = r * this.W + c, d = this.d;
    return (d[i] * (1 - tx) + d[i + 1] * tx) * (1 - ty) + (d[i + this.W] * (1 - tx) + d[i + this.W + 1] * tx) * ty;
  }
  // Give every water body a level from its shoreline and carve a bed below it.
  carveWater(waterAreas) {
    for (const a of waterAreas) {
      const v = a.o.map((p) => this.h(p[0], p[1])).sort((p, q) => p - q);
      a.level = v[Math.floor(v.length * 0.2)] - 0.15;
    }
    for (const a of waterAreas) {
      let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
      for (const [x, y] of a.o) { mnx = Math.min(mnx, x); mny = Math.min(mny, y); mxx = Math.max(mxx, x); mxy = Math.max(mxy, y); }
      const c0 = Math.max(0, Math.floor((mnx - this.x0) / this.cs)), c1 = Math.min(this.W - 1, Math.ceil((mxx - this.x0) / this.cs));
      const r0 = Math.max(0, Math.floor((mny - this.y0) / this.cs)), r1 = Math.min(this.H - 1, Math.ceil((mxy - this.y0) / this.cs));
      const deep = Math.abs(a.o.length) > 20 ? 2.5 : 0.8;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const x = this.x0 + (c + 0.5) * this.cs, y = this.y0 + (r + 0.5) * this.cs;
        if (inPoly([x, y], a.o, a.hl)) this.d[r * this.W + c] = Math.min(this.d[r * this.W + c], a.level - deep);
      }
    }
  }
  // Flatten a pad under each building so walls sit on level grade.
  padBuildings(buildings) {
    for (const b of buildings) {
      if (b.part || b.bt === 'roof') continue;
      b.base = b.g != null ? b.g - DATUM : this.h(b.c[0], b.c[1]);
    }
  }
  mesh(step = 2) {
    const nx = Math.floor((this.W - 1) / step), ny = Math.floor((this.H - 1) / step);
    const pos = new Float32Array((nx + 1) * (ny + 1) * 3), uv = new Float32Array((nx + 1) * (ny + 1) * 2);
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const x = this.x0 + (i * step + 0.5) * this.cs, y = this.y0 + (j * step + 0.5) * this.cs, k = j * (nx + 1) + i;
      pos[k * 3] = x; pos[k * 3 + 1] = this.d[(j * step) * this.W + i * step] - 0.04; pos[k * 3 + 2] = -y;
      uv[k * 2] = x / 24; uv[k * 2 + 1] = y / 24;
    }
    const idx = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  texture() {
    const t = new THREE.DataTexture(this.d, this.W, this.H, THREE.RedFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
    return { tex: t, bounds: new THREE.Vector4(this.x0, this.y0, this.W * this.cs, this.H * this.cs) };
  }
}

// Split triangles until no edge exceeds maxLen, then lift vertices onto the terrain.
export function drapeTriangles(pos, uv, terrain, maxLen = 6) {
  const outP = [], outU = [];
  const rec = (a, b, c, ua, ub, uc, depth) => {
    const d = (p, q) => Math.hypot(p[0] - q[0], p[2] - q[2]);
    const ab = d(a, b), bc = d(b, c), ca = d(c, a), m = Math.max(ab, bc, ca);
    if (m <= maxLen || depth > 9) { for (const [p, u] of [[a, ua], [b, ub], [c, uc]]) { outP.push(p[0], terrain.h(p[0], -p[2]) + p[1], p[2]); outU.push(u[0], u[1]); } return; }
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], mu = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    if (m === ab) { const e = mid(a, b), ue = mu(ua, ub); rec(a, e, c, ua, ue, uc, depth + 1); rec(e, b, c, ue, ub, uc, depth + 1); }
    else if (m === bc) { const e = mid(b, c), ue = mu(ub, uc); rec(a, b, e, ua, ub, ue, depth + 1); rec(a, e, c, ua, ue, uc, depth + 1); }
    else { const e = mid(c, a), ue = mu(uc, ua); rec(a, b, e, ua, ub, ue, depth + 1); rec(e, b, c, ue, ub, uc, depth + 1); }
  };
  for (let i = 0; i < pos.length; i += 9) {
    const t = i / 9;
    rec([pos[i], pos[i + 1], pos[i + 2]], [pos[i + 3], pos[i + 4], pos[i + 5]], [pos[i + 6], pos[i + 7], pos[i + 8]], [uv[t * 6], uv[t * 6 + 1]], [uv[t * 6 + 2], uv[t * 6 + 3]], [uv[t * 6 + 4], uv[t * 6 + 5]], 0);
  }
  return { pos: outP, uv: outU };
}
