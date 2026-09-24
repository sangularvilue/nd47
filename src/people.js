// Game-day population: parked cars, tailgate tents, static fans and walkers following footpaths.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { obb, inPoly, mulberry, centroid } from './geo.js';
import { makeCrowd } from './crowd.js';
import { TER } from './terrain.js';

const FAN = ['#0c2340', '#0c2340', '#0c2340', '#1b3a66', '#c99700', '#d4af37', '#00843d', '#1a9a4f', '#f2f2f2', '#6b6b6b', '#1f1f1f', '#8b1a1a'];
const PANTS = ['#2b3442', '#1f2227', '#4a5a73', '#6d6150', '#2e3b55', '#bfb39a'];
const SKIN = ['#f1c9a5', '#e0ac85', '#c68b62', '#8d5a3b', '#5e3b26', '#f5d5b8'];
const CAR = ['#e8e8e8', '#1b1b1d', '#6d7278', '#9aa0a6', '#1d2f55', '#7a1a1a', '#c7c2b5', '#2f4a3a', '#384250', '#b04a1a'];

export function buildPeople(data, world, L, scene, kit, opts = {}) {
  const rng = mulberry(2024);
  const statics = []; // [x, y, heading]
  const cars = []; const tents = [];
  const stadium = [L.stadium.x, L.stadium.y];
  const dStad = (x, y) => Math.hypot(x - stadium[0], y - stadium[1]);

  // ---- parking lots: cars in rows, tailgates near the stadium
  for (const a of data.areas) {
    if (a.t !== 'parking') continue;
    const o = obb(a.o); if (!o || o.A < 300) continue;
    const near = dStad(o.c[0], o.c[1]) < 1300;
    for (let v = -o.hv + 3; v < o.hv - 2; v += 13.6) {
      for (const side of [0, 1]) {
        const vv = v + side * 5.4;
        for (let u = -o.hu + 1.5; u < o.hu - 1.5; u += 2.7) {
          const p = [o.c[0] + o.u[0] * u + o.v[0] * vv, o.c[1] + o.u[1] * u + o.v[1] * vv];
          if (!inPoly(p, a.o, a.hl)) continue;
          const r = rng();
          if (r < (near ? 0.12 : 0.35)) continue;
          const head = Math.atan2(o.v[1], o.v[0]) + (side ? Math.PI : 0);
          cars.push([p[0], p[1], head, (rng() * CAR.length) | 0, rng() < 0.25 ? 1 : 0]);
          if (near && rng() < 0.16) {
            // tent behind the car + a cluster of fans
            const q = [p[0] - Math.cos(head) * 4.2, p[1] - Math.sin(head) * 4.2];
            tents.push([q[0], q[1], head, rng() < 0.55 ? 0 : rng() < 0.6 ? 1 : 2]);
            const n = 3 + (rng() * 6) | 0;
            for (let k = 0; k < n; k++) statics.push([q[0] + (rng() - 0.5) * 5, q[1] + (rng() - 0.5) * 5, rng() * 6.28]);
          }
        }
      }
    }
  }
  // tailgaters on the Irish Green & other lawns near the stadium
  for (const a of data.areas) {
    if (a.t !== 'grass') continue;
    const c = centroid(a.o); const d = dStad(c[0], c[1]);
    if (d > 900) continue;
    const o = obb(a.o); if (!o) continue;
    const n = Math.min(500, (o.A / (a.n === 'Irish Green' ? 30 : 180)) | 0);
    for (let k = 0; k < n; k++) {
      const p = [o.c[0] + o.u[0] * (rng() - 0.5) * 2 * o.hu + o.v[0] * (rng() - 0.5) * 2 * o.hv, o.c[1] + o.u[1] * (rng() - 0.5) * 2 * o.hu + o.v[1] * (rng() - 0.5) * 2 * o.hv];
      if (!inPoly(p, a.o, a.hl)) continue;
      statics.push([p[0], p[1], rng() * 6.28]);
      if (a.n === 'Irish Green' && rng() < 0.05) tents.push([p[0], p[1], rng() * 6.28, (rng() * 3) | 0]);
    }
  }

  // ---- walkers on footpaths, denser near the stadium
  const paths = data.roads.filter((r) => r.f && r.w >= 2 && r.p.length >= 2);
  const walkers = [];
  for (const r of paths) {
    let len = 0; for (let i = 0; i + 1 < r.p.length; i++) len += Math.hypot(r.p[i + 1][0] - r.p[i][0], r.p[i + 1][1] - r.p[i][1]);
    const c = r.p[(r.p.length / 2) | 0];
    const d = dStad(c[0], c[1]);
    if (Math.abs(c[0]) > 1100 || c[1] > 1000 || c[1] < -1150) continue;
    const dens = (d < 400 ? 1 / 5 : d < 900 ? 1 / 14 : 1 / 45) * (opts.density ?? 1);
    const n = Math.floor(len * dens + rng());
    for (let k = 0; k < n; k++) walkers.push({ r, len, s: rng() * len, dir: rng() < 0.5 ? 1 : -1, speed: 1.0 + rng() * 0.6, off: (rng() - 0.5) * r.w * 0.7, ph: rng() * 6 });
  }

  // ---- people: Rocketbox avatars (near: skinned + animated, far: instanced baked poses)
  const people = [];
  for (const st of statics) if (rng() < (opts.density ?? 1)) people.push({ x: st[0], y: st[1], h: st[2], s: 0.94 + rng() * 0.12, w: null });
  for (const w of walkers) people.push({ x: 0, y: 0, h: 0, s: 0.94 + rng() * 0.12, w });
  const total = people.length;
  const col = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);

  // cars
  const body = new THREE.BoxGeometry(1.8, 0.75, 4.4); body.translate(0, 0.62, 0);
  const cab = new THREE.BoxGeometry(1.6, 0.6, 2.3); cab.translate(0, 1.28, -0.2);
  const suvBody = new THREE.BoxGeometry(1.95, 0.95, 4.8); suvBody.translate(0, 0.75, 0);
  const suvCab = new THREE.BoxGeometry(1.85, 0.75, 3.2); suvCab.translate(0, 1.55, -0.4);
  const carG = mergeGeometries([body, cab]), suvG = mergeGeometries([suvBody, suvCab]);
  const carM = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.6 });
  const sedans = cars.filter((c) => !c[4]), suvs = cars.filter((c) => c[4]);
  for (const [list, geo] of [[sedans, carG], [suvs, suvG]]) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(geo, carM, list.length);
    list.forEach((c, i) => { im.setMatrixAt(i, m4.compose(pos.set(c[0], TER.h(c[0], c[1]), -c[1]), q.setFromAxisAngle(up, c[2] + Math.PI / 2), sc.set(1, 1, 1))); im.setColorAt(i, col.set(CAR[c[3]])); });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im);
  }
  // tents: blue / gold / white pop-up canopies
  const canopy = new THREE.ConeGeometry(2.3, 0.9, 4, 1); canopy.rotateY(Math.PI / 4); canopy.translate(0, 2.65, 0);
  const valance = new THREE.CylinderGeometry(2.1, 2.1, 0.3, 4, 1, true); valance.rotateY(Math.PI / 4); valance.translate(0, 2.1, 0);
  const tentG = mergeGeometries([canopy.toNonIndexed(), valance.toNonIndexed()]);
  const legsG = []; for (const [dx, dz] of [[1.45, 1.45], [1.45, -1.45], [-1.45, 1.45], [-1.45, -1.45]]) { const l = new THREE.CylinderGeometry(0.04, 0.04, 2.2, 4); l.translate(dx, 1.1, dz); legsG.push(l); }
  const tLegsG = mergeGeometries(legsG);
  const tentCols = ['#0c2340', '#c99700', '#f4f4f4'];
  const tm = new THREE.InstancedMesh(tentG, new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide }), Math.max(1, tents.length));
  const tl = new THREE.InstancedMesh(tLegsG, new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.6 }), Math.max(1, tents.length));
  tents.forEach((t, i) => { m4.compose(pos.set(t[0], TER.h(t[0], t[1]), -t[1]), q.setFromAxisAngle(up, t[2]), sc.set(1, 1, 1)); tm.setMatrixAt(i, m4); tl.setMatrixAt(i, m4); tm.setColorAt(i, col.set(tentCols[t[3]])); });
  for (const m of [tm, tl]) { m.castShadow = true; m.computeBoundingSphere(); scene.add(m); }

  // ---- movement along paths (heading: model faces +z; world forward = (dx, 0, -dy))
  const pt = (w) => {
    let d = w.s; const p = w.r.p;
    for (let i = 0; i + 1 < p.length; i++) {
      const L = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
      if (d <= L || i + 2 === p.length) {
        const dx = (p[i + 1][0] - p[i][0]) / L, dy = (p[i + 1][1] - p[i][1]) / L;
        return [p[i][0] + dx * d + -dy * w.off, p[i][1] + dy * d + dx * w.off, Math.atan2(dx * w.dir, -dy * w.dir)];
      }
      d -= L;
    }
    return [p[0][0], p[0][1], 0];
  };
  for (const P of people) if (P.w) { const r = pt(P.w); P.x = r[0]; P.y = r[1]; P.h = r[2]; }
  const crowd = kit ? makeCrowd(kit, people, scene, opts) : null;
  function update(dt, cam) {
    for (const P of people) {
      const w = P.w; if (!w) continue;
      w.s += w.dir * w.speed * dt;
      if (w.s < 0) { w.s = 0; w.dir = 1; } else if (w.s > w.len) { w.s = w.len; w.dir = -1; }
      const r = pt(w); P.x = r[0]; P.y = r[1]; P.h = r[2];
    }
    if (crowd && cam) crowd.update(dt, cam);
  }
  return { update, count: total, cars: cars.length, tents: tents.length, crowd };
}
