// Street furniture. Everything except campus lamp posts comes from real OSM nodes;
// lamp posts follow the main campus walks at approximate spacing (the real ones aren't mapped).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry } from './geo.js';
import { TER } from './terrain.js';

const campusLike = (x, y) => x > -690 && x < 1070 && y > -1010 && y < 1030;

function instanced(geo, mat, items, scene, { shadow = true } = {}) {
  if (!items.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, items.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  items.forEach((it, i) => im.setMatrixAt(i, m4.compose(p.set(it.x, (it.z || 0) + TER.h(it.x, it.y), -it.y), q.setFromAxisAngle(up, it.a || 0), s.setScalar(it.s || 1))));
  im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere();
  scene.add(im); return im;
}
const merge = (parts) => mergeGeometries(parts.map((g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); return n; }));
const colored = (g, c) => { const col = new THREE.Color(c); const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = col.r; a[i + 1] = col.g; a[i + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const part = (g, c, x = 0, y = 0, z = 0) => { g.translate(x, y, z); return colored(g.index ? g.toNonIndexed() : g, c); };

export function buildProps(data, scene) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 });
  const byK = (k) => data.props.filter((p) => p.k === k);
  const iron = '#1b1c1e';

  // Benches: black iron frame, wood slats
  const bench = merge([
    ...[0, 1, 2, 3].map((i) => part(new THREE.BoxGeometry(1.8, 0.04, 0.09), '#6b4a2e', 0, 0.45, -0.18 + i * 0.1)),
    ...[0, 1].map((i) => part(new THREE.BoxGeometry(1.8, 0.09, 0.035), '#6b4a2e', 0, 0.62 + i * 0.13, -0.24)),
    ...[-0.8, 0.8].flatMap((x) => [part(new THREE.BoxGeometry(0.05, 0.45, 0.5), iron, x, 0.22, -0.05), part(new THREE.BoxGeometry(0.05, 0.45, 0.04), iron, x, 0.65, -0.26)]),
  ]);
  instanced(bench, mat, byK('bench').map((p) => ({ ...p, a: p.a + Math.PI / 2 })), scene);

  // Lamp posts in ND style: fluted black pole, lantern head
  const lamp = merge([
    part(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8), iron, 0, 0.25),
    part(new THREE.CylinderGeometry(0.055, 0.075, 3.3, 8), iron, 0, 2.0),
    part(new THREE.CylinderGeometry(0.2, 0.12, 0.12, 8), iron, 0, 3.7),
    part(new THREE.CylinderGeometry(0.17, 0.13, 0.55, 6), '#f3ead6', 0, 4.05),
    part(new THREE.ConeGeometry(0.26, 0.3, 6), iron, 0, 4.47),
  ]);
  const lamps = [];
  const rng = mulberry(77);
  const occupied = new Set();
  for (const r of data.roads) {
    if (!r.f || r.w < 2.4) continue;
    for (let i = 0; i + 1 < r.p.length; i++) {
      const [ax, ay] = r.p[i], [bx, by] = r.p[i + 1];
      const L = Math.hypot(bx - ax, by - ay); if (L < 4) continue;
      const nx = -(by - ay) / L, ny = (bx - ax) / L;
      for (let s = 10; s < L; s += 27) {
        const x = ax + (bx - ax) * s / L + nx * (r.w / 2 + 0.6), y = ay + (by - ay) * s / L + ny * (r.w / 2 + 0.6);
        if (!campusLike(x, y)) continue;
        const k = Math.round(x / 14) + ',' + Math.round(y / 14);
        if (occupied.has(k)) continue; occupied.add(k);
        lamps.push({ x, y, a: rng() * 6 });
      }
    }
  }
  instanced(lamp, mat, lamps, scene);

  // Crosswalks: continental stripes across the road
  const stripes = [];
  for (const c of byK('crossing')) {
    const w = Math.max(4, c.w || 7), dir = [Math.cos(c.a), Math.sin(c.a)], nrm = [-dir[1], dir[0]];
    for (let t = -w / 2 + 0.3; t < w / 2 - 0.2; t += 0.9) stripes.push({ x: c.x + nrm[0] * t, y: c.y + nrm[1] * t, a: -c.a, z: 0.085 });
  }
  const stripeG = colored(new THREE.PlaneGeometry(3.0, 0.45).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).toNonIndexed(), '#e9e7df');
  instanced(stripeG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }), stripes, scene, { shadow: false });

  // Traffic signals: pole with mast arm and three heads
  const sig = merge([
    part(new THREE.CylinderGeometry(0.1, 0.12, 6, 8), '#707478', 0, 3),
    part(new THREE.CylinderGeometry(0.06, 0.06, 5, 6).rotateZ(Math.PI / 2), '#707478', 2.5, 5.8),
    ...[1.8, 3.8].map((x) => part(new THREE.BoxGeometry(0.34, 0.95, 0.3), '#1c1c1a', x, 5.3)),
  ]);
  const sigItems = byK('traffic_signals').map((p) => ({ x: p.x + Math.sin(p.a) * (p.w / 2 + 1.5), y: p.y - Math.cos(p.a) * (p.w / 2 + 1.5), a: p.a }));
  instanced(sig, mat, sigItems, scene);

  // Stop signs, bollards, flagpoles, lift gates, bus stop signs, bike racks
  const stop = merge([part(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 6), '#8a8c8e', 0, 1.15), part(new THREE.CylinderGeometry(0.38, 0.38, 0.03, 8).rotateX(Math.PI / 2), '#b8141c', 0, 2.2, 0.03)]);
  instanced(stop, mat, byK('stop').map((p) => ({ x: p.x + Math.sin(p.a) * (p.w / 2 + 1), y: p.y - Math.cos(p.a) * (p.w / 2 + 1), a: -p.a })), scene);
  instanced(merge([part(new THREE.CylinderGeometry(0.1, 0.11, 0.95, 10), '#2a2b2d', 0, 0.47), part(new THREE.SphereGeometry(0.1, 8, 4, 0, 6.3, 0, 1.6), '#2a2b2d', 0, 0.95)]), mat, byK('bollard'), scene);
  const flag = merge([part(new THREE.CylinderGeometry(0.05, 0.09, 12, 8), '#d8d8d8', 0, 6), part(new THREE.SphereGeometry(0.12, 8, 6), '#c99700', 0, 12.1)]);
  instanced(flag, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.8 }), byK('flagpole'), scene);
  instanced(merge([part(new THREE.BoxGeometry(0.3, 1.0, 0.3), '#e4e4e0', 0, 0.5), part(new THREE.BoxGeometry(4.5, 0.08, 0.08), '#c8141c', 2.3, 0.95)]), mat, byK('lift_gate'), scene);
  instanced(merge([part(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), '#8a8c8e', 0, 1.3), part(new THREE.BoxGeometry(0.45, 0.6, 0.03), '#1d4f91', 0, 2.3)]), mat, byK('bus_stop'), scene);
  instanced(merge([0, 1, 2, 3, 4].map((i) => part(new THREE.TorusGeometry(0.38, 0.025, 4, 12, Math.PI), '#9a9c9e', i * 0.7 - 1.4, 0.2))), mat, byK('bicycle_parking'), scene);
  return { lamps: lamps.length, benches: byK('bench').length, crossings: stripes.length };
}
