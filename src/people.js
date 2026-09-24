// Game-day population: parked cars, tailgate tents, static fans and walkers following footpaths.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { obb, inPoly, mulberry, centroid } from './geo.js';
import { patch, G as GU } from './materials.js';
import { TER } from './terrain.js';

const FAN = ['#0c2340', '#0c2340', '#0c2340', '#1b3a66', '#c99700', '#d4af37', '#00843d', '#1a9a4f', '#f2f2f2', '#6b6b6b', '#1f1f1f', '#8b1a1a'];
const PANTS = ['#2b3442', '#1f2227', '#4a5a73', '#6d6150', '#2e3b55', '#bfb39a'];
const SKIN = ['#f1c9a5', '#e0ac85', '#c68b62', '#8d5a3b', '#5e3b26', '#f5d5b8'];
const CAR = ['#e8e8e8', '#1b1b1d', '#6d7278', '#9aa0a6', '#1d2f55', '#7a1a1a', '#c7c2b5', '#2f4a3a', '#384250', '#b04a1a'];

// Person geometry with per-vertex part (0 skin, 1 shirt, 2 pants, 3 shoes, 4 hair/cap) and limb tags
// (±1 legs, ±2 arms) so one shader colours and animates every instance.
function tagged(g, part, limb) {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1));
  g.setAttribute('aLimb', new THREE.Float32BufferAttribute(new Float32Array(n).fill(limb), 1));
  return g;
}
function personGeo(detail) {
  const P = [];
  const cap = (r, len, x, y, z, part, limb, sx = 1, sz = 1) => { const g = detail ? new THREE.CapsuleGeometry(r, len, 2, 7) : new THREE.BoxGeometry(r * 2, len + r * 2, r * 2); g.scale(sx, 1, sz); g.translate(x, y, z); P.push(tagged(g, part, limb)); };
  for (const s of [1, -1]) {
    cap(0.072, 0.74, 0.1 * s, 0.5, 0, 2, s);
    const shoe = new THREE.BoxGeometry(0.11, 0.07, 0.25); shoe.translate(0.1 * s, 0.035, 0.04); P.push(tagged(shoe, 3, s));
    cap(0.052, 0.5, 0.245 * s, 1.14, 0, 1, 2 * s);
    const hand = detail ? new THREE.SphereGeometry(0.048, 6, 4) : new THREE.BoxGeometry(0.08, 0.08, 0.08); hand.translate(0.25 * s, 0.84, 0); P.push(tagged(hand, 0, 2 * s));
  }
  cap(0.15, 0.12, 0, 0.93, 0, 2, 0, 1.15, 0.75);
  cap(0.17, 0.34, 0, 1.2, 0, 1, 0, 1.2, 0.72);
  const neck = new THREE.CylinderGeometry(0.048, 0.055, 0.1, 6); neck.translate(0, 1.5, 0); P.push(tagged(neck, 0, 0));
  const head = detail ? new THREE.SphereGeometry(0.105, 10, 8) : new THREE.BoxGeometry(0.2, 0.24, 0.21); head.scale(0.92, 1.12, 1); head.translate(0, 1.64, 0.01); P.push(tagged(head, 0, 0));
  const hair = detail ? new THREE.SphereGeometry(0.112, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.5) : new THREE.BoxGeometry(0.21, 0.08, 0.22); hair.scale(0.95, 0.9, 1.05); hair.translate(0, detail ? 1.665 : 1.73, -0.005); P.push(tagged(hair, 4, 0));
  const g = mergeGeometries(P);
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return g;
}
function crowdMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  return patch(m, 'crowd', (sh) => {
    sh.uniforms.uTime = GU.time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute float aPart; attribute float aLimb; attribute vec3 iShirt; attribute vec3 iPants; attribute vec3 iSkin; attribute vec3 iHair; attribute vec2 iAnim;
      uniform float uTime;
      mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        float lsw = sin(uTime * iAnim.y * 5.6 + iAnim.x);
        float lamp = iAnim.y > 0.05 ? 0.5 : 0.0;
        float lang = 0.0; float pivot = 0.0;
        if (abs(aLimb) > 0.5 && abs(aLimb) < 1.5) { lang = lsw * lamp * sign(aLimb); pivot = 0.9; }
        else if (abs(aLimb) > 1.5) { lang = -lsw * lamp * 0.8 * sign(aLimb) + (1.0 - step(0.05, iAnim.y)) * sin(uTime * 0.7 + iAnim.x) * 0.05; pivot = 1.42; }
        mat3 lr = rotX(lang);
        objectNormal = lr * objectNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        if (pivot > 0.0) { transformed.y -= pivot; transformed = lr * transformed; transformed.y += pivot; }
        transformed.y += abs(cos(uTime * iAnim.y * 5.6 + iAnim.x)) * 0.035 * step(0.05, iAnim.y);`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        vColor.rgb = aPart < 0.5 ? iSkin : aPart < 1.5 ? iShirt : aPart < 2.5 ? iPants : aPart < 3.5 ? vec3(0.06) : iHair;`);
  });
}

export function buildPeople(data, world, L, scene) {
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
    const dens = d < 400 ? 1 / 5 : d < 900 ? 1 / 14 : 1 / 45;
    const n = Math.floor(len * dens + rng());
    for (let k = 0; k < n; k++) walkers.push({ r, len, s: rng() * len, dir: rng() < 0.5 ? 1 : -1, speed: 1.0 + rng() * 0.6, off: (rng() - 0.5) * r.w * 0.7, ph: rng() * 6 });
  }

  // ---- crowd: near LOD (smooth, animated limbs) + far LOD (boxes), re-sorted every frame
  const people = [];
  const HAIR = ['#2a1d14', '#4a3222', '#1a1a1a', '#8a6a3a', '#b8a080', '#0c2340', '#0c2340', '#c99700', '#00843d'];
  const colOf = (arr) => { const c = new THREE.Color(arr[(rng() * arr.length) | 0]); return [c.r, c.g, c.b]; };
  const mkPerson = (x, y, h, walker) => people.push({ x, y, h, s: 0.92 + rng() * 0.16, shirt: colOf(FAN), pants: colOf(PANTS), skin: colOf(SKIN), hair: colOf(HAIR), ph: rng() * 6.28, w: walker });
  for (const st of statics) mkPerson(st[0], st[1], st[2], null);
  for (const w of walkers) mkPerson(0, 0, 0, w);
  const NEAR = 2500;
  const mat = crowdMaterial();
  const mkLOD = (geo, cap) => {
    const g = geo.clone();
    const attrs = { iShirt: 3, iPants: 3, iSkin: 3, iHair: 3, iAnim: 2 };
    const im = new THREE.InstancedMesh(g, mat, cap);
    for (const [k, n] of Object.entries(attrs)) { const at = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n); at.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, at); }
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
    scene.add(im);
    return im;
  };
  const nearM = mkLOD(personGeo(true), NEAR), farM = mkLOD(personGeo(false), people.length);
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

  // ---- animation
  const pt = (w) => {
    let d = w.s; const p = w.r.p;
    for (let i = 0; i + 1 < p.length; i++) {
      const L = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
      if (d <= L || i + 2 === p.length) {
        const dx = (p[i + 1][0] - p[i][0]) / L, dy = (p[i + 1][1] - p[i][1]) / L;
        return [p[i][0] + dx * d + -dy * w.off, p[i][1] + dy * d + dx * w.off, Math.atan2(dx * w.dir, dy * w.dir)];
      }
      d -= L;
    }
    return [p[0][0], p[0][1], 0];
  };
  const write = (im, i, P) => {
    const e = im.instanceMatrix.array, o = i * 16, c = Math.cos(P.h) * P.s, sn = Math.sin(P.h) * P.s;
    e[o] = c; e[o + 1] = 0; e[o + 2] = -sn; e[o + 3] = 0; e[o + 4] = 0; e[o + 5] = P.s; e[o + 6] = 0; e[o + 7] = 0;
    e[o + 8] = sn; e[o + 9] = 0; e[o + 10] = c; e[o + 11] = 0; e[o + 12] = P.x; e[o + 13] = P.gy ?? (P.gy = TER.h(P.x, P.y)); e[o + 14] = -P.y; e[o + 15] = 1;
    const g = im.geometry.attributes;
    g.iShirt.array.set(P.shirt, i * 3); g.iPants.array.set(P.pants, i * 3); g.iSkin.array.set(P.skin, i * 3); g.iHair.array.set(P.hair, i * 3);
    g.iAnim.array[i * 2] = P.ph; g.iAnim.array[i * 2 + 1] = P.w ? P.w.speed : 0;
  };
  const writeM = (im, i, P) => {
    const e = im.instanceMatrix.array, o = i * 16, c = Math.cos(P.h) * P.s, sn = Math.sin(P.h) * P.s;
    e[o] = c; e[o + 2] = -sn; e[o + 8] = sn; e[o + 10] = c; e[o + 12] = P.x; e[o + 13] = TER.h(P.x, P.y); e[o + 14] = -P.y;
  };
  let sortT = 1e9;
  function update(dt, cam) {
    for (const P of people) {
      const w = P.w; if (!w) continue;
      w.s += w.dir * w.speed * dt;
      if (w.s < 0) { w.s = 0; w.dir = 1; } else if (w.s > w.len) { w.s = w.len; w.dir = -1; }
      const r = pt(w); P.x = r[0]; P.y = r[1]; P.h = r[2];
      if (P.slot) writeM(P.slot[0], P.slot[1], P);
    }
    sortT += dt;
    if (sortT > 0.5) {
      sortT = 0;
      const cx = cam ? cam.x : 0, cy = cam ? -cam.z : 0, R2 = 130 * 130;
      let n = 0, f = 0;
      for (const P of people) {
        const dx = P.x - cx, dy = P.y - cy;
        const near = n < NEAR && dx * dx + dy * dy < R2;
        const im = near ? nearM : farM, i = near ? n++ : f++;
        write(im, i, P);
        P.slot = P.w ? [im, i] : null;
      }
      nearM.count = n; farM.count = f;
      for (const im of [nearM, farM]) for (const k of ['iShirt', 'iPants', 'iSkin', 'iHair', 'iAnim']) im.geometry.attributes[k].needsUpdate = true;
    }
    nearM.instanceMatrix.needsUpdate = true; farM.instanceMatrix.needsUpdate = true;
  }
  update(0, null);
  return { update, count: total, cars: cars.length, tents: tents.length };
}
