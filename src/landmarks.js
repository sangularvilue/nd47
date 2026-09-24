// Hand-modelled Notre Dame landmarks placed on the OSM footprints.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoBuilder, W, area, centroid, obb, rayRing, capPoly, mulberry } from './geo.js';
import { addBand } from './world.js';
import { TER, baseOf } from './terrain.js';

const gold = () => new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 1, roughness: 0.18, envMapIntensity: 1.6 });
const stoneM = (c = 0xe6dcc6) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
const brickM = (T) => new THREE.MeshStandardMaterial({ map: T.facade[0].map, roughnessMap: T.facade[0].mask, roughness: 1 });
const find = (data, n) => data.buildings.find((b) => b.n === n);
const shadow = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };
const put = (parent, m) => { parent.add(m); return m; };
const at = (obj, x, y, h = 0) => { obj.position.set(x, h + TER.h(x, y), -y); return obj; };

export function buildLandmarks(data, T, scene, world) {
  const L = {};
  // ---------- Golden Dome (Main Building) ----------
  {
    const b = find(data, 'Main Building');
    const c = centroid(b.o);
    const g = new THREE.Group();
    const base = b.h + 5; // wall + mansard
    const drumM = new THREE.MeshStandardMaterial({ color: 0xf0e8d6, roughness: 0.7 });
    // square base block, then octagonal-ish drum with columns
    put(g, new THREE.Mesh(new THREE.BoxGeometry(22, 4, 22), drumM)).position.y = base + 2;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(9.6, 10, 8, 32, 1, true), brickM(T));
    drum.material.map = T.facade[0].map.clone(); drum.material.map.repeat.set(10, 2); drum.material.side = THREE.DoubleSide;
    drum.position.y = base + 8; g.add(drum);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 8, 8), drumM);
      col.position.set(Math.cos(a) * 10.4, base + 8, Math.sin(a) * 10.4); g.add(col);
    }
    put(g, new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.9, 32), drumM)).position.y = base + 12.4;
    // gilded dome (slightly ogival)
    const pts = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24; const a = t * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * 10.2 * (1 - 0.05 * t), base + 12.8 + Math.sin(a) * 13.5 * (1 + 0.08 * t * t))); }
    const dome = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), gold());
    g.add(dome);
    // ribs
    for (let i = 0; i < 16; i++) {
      const rib = new THREE.Mesh(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p.x + 0.12, p.y)), 1, (i / 16) * Math.PI * 2, 0.04), gold());
      g.add(rib);
    }
    // lantern + Mary statue (the top of the statue is ~57 m / 187 ft)
    const lt = base + 12.8 + 14.4;
    put(g, new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.4, 4.6, 16), gold())).position.y = lt + 2.3;
    put(g, new THREE.Mesh(new THREE.SphereGeometry(2.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold())).position.y = lt + 4.6;
    const mary = new THREE.Group();
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.95, 4.2, 12), gold()); robe.position.y = 2.1; mary.add(robe);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), gold()); head.position.y = 4.5; mary.add(head);
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.08, 6, 24), gold()); crown.position.y = 4.9; crown.rotation.x = Math.PI / 2; mary.add(crown);
    for (let i = 0; i < 12; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), gold()); const a = (i / 12) * Math.PI * 2; s.position.set(Math.cos(a) * 0.75, 4.95, Math.sin(a) * 0.75); mary.add(s); }
    mary.position.y = lt + 6.4; g.add(mary);
    at(g, c[0], c[1]); g.position.y = baseOf(b); shadow(g); scene.add(g);
    L.dome = { x: c[0], y: c[1], top: lt + 11.5 };
    // front portico + steps on the south face
    const o = obb(b.o);
    const por = new THREE.Group();
    put(por, new THREE.Mesh(new THREE.BoxGeometry(16, 1.8, 10), stoneM())).position.set(0, 0.9, 0);
    for (let i = 0; i < 4; i++) put(por, new THREE.Mesh(new THREE.BoxGeometry(16 - i * 1.2, 0.45, 2), stoneM())).position.set(0, 0.2 + i * 0.45, 6 + (3 - i) * 0.8);
    const minY = Math.min(...b.o.map((p) => p[1]));
    at(por, c[0], minY - 4); por.position.y = baseOf(b); shadow(por); scene.add(por);
  }

  // ---------- Basilica of the Sacred Heart spire (230 ft) ----------
  {
    const b = find(data, 'Basilica of the Sacred Heart');
    const o = obb(b.o);
    // steeple at the south end of the long axis
    const s = o.u[1] < 0 ? 1 : -1;
    const p = [o.c[0] + o.u[0] * s * (o.hu - 4), o.c[1] + o.u[1] * s * (o.hu - 4)];
    const g = new THREE.Group();
    const bm = brickM(T); bm.map = T.facade[0].map.clone(); bm.map.repeat.set(3, 10);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(8.5, 38, 8.5), bm); tower.position.y = 19; g.add(tower);
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.7, 7, 6), stoneM()); pin.position.set(dx * 4.1, 41.5, dz * 4.1); g.add(pin);
    }
    const belfry = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 4.2, 6, 8), stoneM(0xd8cdb4)); belfry.position.y = 41; g.add(belfry);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(3.9, 25, 8), new THREE.MeshStandardMaterial({ color: 0x3e464a, roughness: 0.55, metalness: 0.3 }));
    spire.position.y = 44 + 12.5; g.add(spire);
    const cross = new THREE.Group();
    cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 3, 0.25), gold()));
    put(cross, new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.25, 0.25), gold())).position.y = 0.5;
    cross.position.y = 70; g.add(cross);
    g.rotation.y = -Math.atan2(o.u[1], o.u[0]);
    at(g, p[0], p[1]); g.position.y = baseOf(b); shadow(g); scene.add(g);
    L.basilica = { x: p[0], y: p[1] };
    // rose window on the south facade
    const rose = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshStandardMaterial({ color: 0x31244f, emissive: 0x3a1e5a, emissiveIntensity: 0.6, roughness: 0.2 }));
    rose.position.set(p[0] + o.u[0] * s * 4.3, 22 + baseOf(b), -(p[1] + o.u[1] * s * 4.3));
    rose.rotation.y = -Math.atan2(o.u[1], o.u[0]) + (s > 0 ? Math.PI / 2 : -Math.PI / 2);
    scene.add(rose);
  }

  // ---------- Hesburgh Library tower + Word of Life mural ----------
  {
    const tower = data.buildings.find((b) => b.id === 1185999646);
    if (tower) {
      // south-facing edge with the longest length gets the mural
      let best = null;
      const r = tower.o;
      for (let i = 0; i < r.length; i++) {
        const a = r[i], c = r[(i + 1) % r.length];
        const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        const n = [(c[1] - a[1]) / len, -(c[0] - a[0]) / len]; // outward normal for CCW
        const score = -n[1] * len;
        if (!best || score > best.score) best = { a, c, len, n, score };
      }
      const mw = Math.min(best.len * 0.72, 21), mh = 41;
      const mid = [(best.a[0] + best.c[0]) / 2 + best.n[0] * 0.15, (best.a[1] + best.c[1]) / 2 + best.n[1] * 0.15];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshStandardMaterial({ map: T.mural, roughness: 0.7 }));
      m.position.set(mid[0], tower.h - mh / 2 - 2.5 + baseOf(tower), -mid[1]);
      m.rotation.y = Math.atan2(best.n[0], -best.n[1]) + Math.PI;
      m.rotation.y = Math.atan2(best.n[0], best.n[1] * -1);
      // PlaneGeometry faces +z; rotate so it faces the outward normal (world (nx, 0, -ny))
      m.lookAt(m.position.x + best.n[0], m.position.y, m.position.z - best.n[1]);
      m.receiveShadow = true; scene.add(m);
      // frame
      const fr = new THREE.Mesh(new THREE.BoxGeometry(mw + 1.2, mh + 1.2, 0.2), stoneM(0xb8ad9c));
      fr.position.copy(m.position); fr.quaternion.copy(m.quaternion); fr.translateZ(-0.12); scene.add(fr);
      L.mural = { x: mid[0], y: mid[1] };
    }
  }

  // ---------- Notre Dame Stadium bowl ----------
  {
    const b = find(data, 'Notre Dame Stadium');
    L.stadium = buildStadium(b, T, scene);
  }

  // ---------- Stepan Center geodesic dome ----------
  {
    const b = find(data, 'Stepan Center');
    if (b) {
      const c = centroid(b.o), r = Math.sqrt(b.a / Math.PI) * 0.98;
      const g = new THREE.IcosahedronGeometry(r, 3);
      const mat = new THREE.MeshStandardMaterial({ color: 0xe9e6de, roughness: 0.5, metalness: 0.2, flatShading: true });
      const dome = new THREE.Mesh(g, mat); dome.scale.y = 0.62; at(dome, c[0], c[1], 0); dome.position.y = baseOf(b);
      const wire = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0x8a8a86 }));
      wire.scale.y = 0.62; at(wire, c[0], c[1], 0.02); wire.position.y = baseOf(b) + 0.02;
      scene.add(shadow(dome), wire);
    }
  }

  // ---------- Grotto of Our Lady of Lourdes ----------
  {
    const p = data.pois.find((q) => /Grotto/.test(q.n));
    // it is cut into the slope below the Basilica and opens away from it, toward St. Mary's Lake
    const bas = find(data, 'Basilica of the Sacred Heart');
    if (p) L.grotto = buildGrotto(p.p, scene, world, bas ? Math.atan2(p.p[0] - bas.c[0], -(p.p[1] - bas.c[1])) : Math.PI / 4, T);
  }

  // ---------- Clarke Memorial Fountain ("Stonehenge") ----------
  {
    const a = data.areas.find((q) => q.n === 'Clark Memorial Fountain');
    if (a) {
      const c = centroid(a.o), g = new THREE.Group(), sm = stoneM(0xd9cfbb);
      for (let k = 0; k < 4; k++) {
        const arm = new THREE.Group();
        const s1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 7, 1.4), sm); s1.position.set(-2.4, 3.5, 7); arm.add(s1);
        const s2 = s1.clone(); s2.position.x = 2.4; arm.add(s2);
        const top = new THREE.Mesh(new THREE.BoxGeometry(7, 1.3, 1.6), sm); top.position.set(0, 7.6, 7); arm.add(top);
        arm.rotation.y = (k * Math.PI) / 2 + Math.PI / 4; g.add(arm);
      }
      const sph = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16), new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.3, metalness: 0.1 }));
      sph.position.y = 2.4; g.add(sph);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 1.2, 16), sm); ped.position.y = 0.6; g.add(ped);
      at(g, c[0], c[1], 0.1); shadow(g); scene.add(g);
    }
  }

  // ---------- statues on pedestals ----------
  {
    const bronze = new THREE.MeshStandardMaterial({ color: 0x4c3a24, metalness: 0.8, roughness: 0.45 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 });
    for (const p of data.pois) {
      if (p.k !== 'art' || p.n === 'The Word of Life Mural') continue;
      const g = new THREE.Group();
      const isSacredHeart = Math.hypot(p.p[0] - 23.5, p.p[1] + 132.4) < 2;
      const mat = isSacredHeart ? bronze : /Rockne|Holtz|Leahy/.test(p.n) ? bronze : Math.random() < 0.5 ? white : bronze;
      const lime = new THREE.MeshStandardMaterial({ color: 0xb9ae98, roughness: 0.85 });
      for (const [w, h, y] of [[3.2, 0.35, 0.17], [2.7, 0.3, 0.5], [1.9, 2.1, 1.7], [2.3, 0.3, 2.9]]) put(g, new THREE.Mesh(new THREE.BoxGeometry(w, h, w), lime)).position.y = y;
      const robe = new THREE.LatheGeometry([[0.55, 0], [0.5, 0.4], [0.4, 1.2], [0.36, 1.7], [0.42, 2.0], [0.2, 2.25], [0, 2.3]].map(([r, y]) => new THREE.Vector2(r, y)), 18);
      { const p = robe.attributes.position; for (let j = 0; j < p.count; j++) { const x = p.getX(j), z = p.getZ(j), a = Math.atan2(z, x), k = 1 + 0.05 * Math.sin(a * 9) * (1 - p.getY(j) / 2.3); p.setXYZ(j, x * k, p.getY(j), z * k); } robe.computeVertexNormals(); }
      const body = new THREE.Mesh(robe, mat); body.position.y = 3.05; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), mat); head.scale.set(0.9, 1.1, 1); head.position.y = 5.55; g.add(head);
      if (isSacredHeart) for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.9, 4, 8), mat); arm.position.set(s * 0.55, 4.75, 0.12); arm.rotation.z = s * 1.05; arm.rotation.x = -0.25; g.add(arm); }
      bronze.color.set(0x3d2e1c); bronze.metalness = 0.85; bronze.roughness = 0.38;
      at(g, p.p[0], p.p[1], 0); shadow(g); scene.add(g);
    }
  }

  // ---------- water tower ----------
  {
    const p = data.pois.find((q) => q.k === 'water_tower');
    if (p) {
      const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0xd7dadc, roughness: 0.5, metalness: 0.4 });
      put(g, new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 30, 16), m)).position.y = 15;
      const tank = new THREE.Mesh(new THREE.SphereGeometry(8, 32, 16), m); tank.scale.y = 0.7; tank.position.y = 34; g.add(tank);
      at(g, p.p[0], p.p[1]); shadow(g); scene.add(g);
    }
  }

  // ---------- Fictional: DOE compound around the Radiation Research Building ----------
  {
    const b = find(data, 'Radiation Research Building');
    if (b) L.doe = buildCompound(b, T, scene, world);
  }
  // Nieuwland (physics) — speech venue marker position
  const nw = find(data, 'Nieuwland Science Hall');
  if (nw) L.nieuwland = { x: nw.c[0], y: nw.c[1] };
  const dsc = find(data, 'Duncan Student Center');
  if (dsc) L.box = { x: dsc.c[0], y: dsc.c[1] };
  return L;
}

function buildStadium(b, T, scene) {
  const outer = b.o, inner = b.hl[0];
  const c = centroid(inner || outer);
  const N = 180, rows = 44;
  const fieldY = 0.08, top = 27, innerY = 1.4;
  const tread = new GeoBuilder(), riser = new GeoBuilder(), wall = new GeoBuilder(), concourse = new GeoBuilder();
  const ri = [], ro = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    ri.push(inner ? rayRing(c, t, inner) : 60); ro.push(rayRing(c, t, outer));
  }
  const P = (i, r, h) => { const t = (i / N) * Math.PI * 2; return [c[0] + Math.cos(t) * r, h, -(c[1] + Math.sin(t) * r)]; };
  const frac = 0.9; // stands occupy inner..90% of outer
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < rows; k++) {
      const f0 = k / rows, f1 = (k + 1) / rows;
      const r0a = ri[i] + (ro[i] * frac - ri[i]) * f0, r1a = ri[i] + (ro[i] * frac - ri[i]) * f1;
      const r0b = ri[i + 1] + (ro[i + 1] * frac - ri[i + 1]) * f0, r1b = ri[i + 1] + (ro[i + 1] * frac - ri[i + 1]) * f1;
      const h0 = innerY + (top - 3 - innerY) * f0, h1 = innerY + (top - 3 - innerY) * f1;
      // riser (vertical) then tread
      riser.quad(P(i, r0a, h0), P(i + 1, r0b, h0), P(i + 1, r0b, h1), P(i, r0a, h1), [0, 0], [1, 0], [1, 1], [0, 1], [1, 1, 1]);
      const u0 = (i / N) * 16, u1 = ((i + 1) / N) * 16;
      tread.quad(P(i + 1, r0b, h1), P(i, r0a, h1), P(i, r1a, h1), P(i + 1, r1b, h1), [u1, (k % 4) / 4], [u0, (k % 4) / 4], [u0, (k % 4 + 1) / 4], [u1, (k % 4 + 1) / 4], [1, 1, 1]);
    }
    // concourse ring at top
    const ra = ro[i] * frac + (ri[i] - ri[i]), rb = ro[i + 1] * frac;
    concourse.quad(P(i + 1, rb, top - 3), P(i, ra, top - 3), P(i, ro[i] - 0.3, top - 3), P(i + 1, ro[i + 1] - 0.3, top - 3), [0, 0], [1, 0], [1, 1], [0, 1], [1, 1, 1]);
    // parapet
    concourse.quad(P(i, ra, top - 3), P(i + 1, rb, top - 3), P(i + 1, rb, top - 1.9), P(i, ra, top - 1.9), [0, 0], [1, 0], [1, 1], [0, 1], [0.8, 0.8, 0.8]);
    // field wall (lower bowl front)
    riser.quad(P(i, ri[i], fieldY), P(i + 1, ri[i + 1], fieldY), P(i + 1, ri[i + 1], innerY), P(i, ri[i], innerY), [0, 0], [1, 0], [1, 1], [0, 1], [0.3, 0.35, 0.5]);
    // outer brick wall
    const seg = Math.hypot(Math.cos(((i + 1) / N) * 6.283) * ro[i + 1] - Math.cos((i / N) * 6.283) * ro[i], Math.sin(((i + 1) / N) * 6.283) * ro[i + 1] - Math.sin((i / N) * 6.283) * ro[i]);
    const uA = (i * seg) / 8;
    wall.quad(P(i + 1, ro[i + 1], 0), P(i, ro[i], 0), P(i, ro[i], top), P(i + 1, ro[i + 1], top), [uA + seg / 8, 0], [uA, 0], [uA, top / 9], [uA + seg / 8, top / 9], [1, 1, 1]);
    wall.quad(P(i, ro[i], top), P(i, ro[i] - 0.4, top), P(i + 1, ro[i + 1] - 0.4, top), P(i + 1, ro[i + 1], top), [0, 0], [0, 0], [0, 0], [0, 0], [1, 1, 1]);
  }
  const mats = [
    [tread, new THREE.MeshStandardMaterial({ map: T.crowd, roughness: 0.9 })],
    [riser, new THREE.MeshStandardMaterial({ color: 0x9aa0a8, vertexColors: true, roughness: 0.6, metalness: 0.4 })],
    [wall, new THREE.MeshStandardMaterial({ map: T.facade[6].map, roughnessMap: T.facade[6].mask, roughness: 1, side: THREE.DoubleSide })],
    [concourse, new THREE.MeshStandardMaterial({ color: 0xbfb8a8, vertexColors: true, roughness: 0.9 })],
  ];
  const g = new THREE.Group();
  for (const [gb, m] of mats) { const mesh = new THREE.Mesh(gb.build(), m); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); }
  // field
  const fo = obb(inner || outer);
  const fg = new GeoBuilder();
  capPoly(fg, inner || outer, [], fieldY, 1, [1, 1, 1], true, (p) => {
    const du = (p.x - fo.c[0]) * fo.u[0] + (p.y - fo.c[1]) * fo.u[1], dv = (p.x - fo.c[0]) * fo.v[0] + (p.y - fo.c[1]) * fo.v[1];
    return [du / 140 + 0.5, dv / 70 + 0.5];
  });
  const field = new THREE.Mesh(fg.build(), new THREE.MeshStandardMaterial({ map: T.field, roughness: 0.9 }));
  field.receiveShadow = true; g.add(field);
  // south video board (added 2017) above the south stands
  const s = fo.u[1] < 0 ? 1 : -1;
  const boardR = rayRing(c, Math.atan2(fo.u[1] * s, fo.u[0] * s), outer) - 6;
  const bp = [c[0] + fo.u[0] * s * boardR, c[1] + fo.u[1] * s * boardR];
  const board = new THREE.Group();
  board.add(new THREE.Mesh(new THREE.BoxGeometry(30, 17, 1.5), new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.6 })));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(28, 15), new THREE.MeshStandardMaterial({ map: T.scoreboard, emissive: 0xffffff, emissiveMap: T.scoreboard, emissiveIntensity: 1.3 }));
  screen.position.z = 0.8; board.add(screen);
  for (const x of [-10, 10]) put(board, new THREE.Mesh(new THREE.BoxGeometry(1.2, 14, 1.2), stoneM(0x777777))).position.set(x, -15, -0.5);
  board.position.set(bp[0], top + 9, -bp[1]);
  board.lookAt(c[0], top + 9, -c[1]);
  g.add(board);
  // light rings / flag poles
  const poleM = new THREE.MeshStandardMaterial({ color: 0xdadada, metalness: 0.6, roughness: 0.4 });
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * Math.PI * 2, r = rayRing(c, t, outer) - 1;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6, 6), poleM); pole.position.set(c[0] + Math.cos(t) * r, top + 3, -(c[1] + Math.sin(t) * r)); g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x0c2340 : 0xc99700, side: THREE.DoubleSide }));
    flag.position.set(pole.position.x + 1.2, top + 5.2, pole.position.z); g.add(flag);
  }
  g.position.y = baseOf(b);
  scene.add(g);
  return { x: c[0], y: c[1], group: g };
}

function buildGrotto(p, scene, world, facing, T) {
  const g = new THREE.Group();
  const rng = mulberry(7);
  const rs = T.scan?.gray_rocks;
  const rockM = new THREE.MeshStandardMaterial(rs ? { ...T.scan.set('gray_rocks', 1.4), vertexColors: true, color: 0x9a9690 } : { vertexColors: true, roughness: 1 });
  // Rock face (~13 m wide, 8 m tall) with an arched cave opening, built from stacked boulders
  const rocks = [];
  const inOpening = (x, y) => Math.abs(x) < 2.8 && y < 4.8 * Math.sqrt(Math.max(0, 1 - (x / 2.9) ** 2));
  const addRock = (x, y, z, r) => {
    const geo = new THREE.IcosahedronGeometry(r, 2);
    { const p = geo.attributes.position, s1 = rng() * 10; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + 0.16 * Math.sin(x * 3.1 / r + s1) * Math.cos(z * 2.7 / r - s1) + 0.1 * Math.sin(y * 5.3 / r + s1 * 2); p.setXYZ(i, x * k, y * k * 0.8, z * k); } geo.computeVertexNormals(); }
    geo.scale(1 + rng() * 0.5, 0.65 + rng() * 0.4, 0.8 + rng() * 0.5);
    geo.rotateY(rng() * 6); geo.rotateZ((rng() - 0.5) * 0.6);
    geo.translate(x, y, z);
    const v = 0.55 + rng() * 0.35, tint = rng() < 0.25 ? [0.8, 0.95, 0.65] : [1, 0.96, 0.9];
    const col = []; for (let i = 0; i < geo.attributes.position.count; i++) col.push(v * tint[0], v * tint[1], v * tint[2]);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    rocks.push(geo.index ? geo.toNonIndexed() : geo);
  };
  for (let y = 0.3; y < 8.5; y += 0.85) for (let x = -6.6; x <= 6.6; x += 0.95) {
    const xx = x + (rng() - 0.5) * 0.5, yy = y + (rng() - 0.5) * 0.4;
    const top = 8.2 - (xx / 6.8) ** 2 * 5.5; if (yy > top) continue;
    if (inOpening(xx, yy)) continue;
    const z = -0.6 * (xx / 6.6) ** 2 * 3 - (yy / 8) * 1.6;
    addRock(xx, yy, z, 0.55 + rng() * 0.45);
  }
  // cave interior: back wall + ceiling
  for (let y = 0.3; y < 5; y += 0.8) for (let x = -3; x <= 3; x += 0.9) { addRock(x, y, -3.4 - rng() * 0.3, 0.6 + rng() * 0.3); }
  for (let x = -3; x <= 3; x += 0.9) for (let z = -3; z <= -0.4; z += 0.9) addRock(x, 4.9 * Math.sqrt(Math.max(0.1, 1 - (x / 3.1) ** 2)) + 0.3, z, 0.6);
  for (const s of [-1, 1]) for (let y = 0.3; y < 4.5; y += 0.8) for (let z = -3; z <= -0.6; z += 0.9) addRock(s * 3.3, y, z, 0.6 + rng() * 0.2);
  // earthen hillside behind the rocks
  const hill = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4d5a2c, roughness: 1 }));
  hill.scale.set(1.1, 0.9, 0.6); hill.position.z = -10; g.add(hill);
  const rock = new THREE.Mesh(mergeGeometries(rocks), rockM); g.add(rock);
  // statue niche up and to the right
  const mary = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.5 });
  { const robe = new THREE.LatheGeometry([[0.34, 0], [0.3, 0.3], [0.22, 0.9], [0.2, 1.25], [0.24, 1.42], [0.12, 1.6], [0, 1.65]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
    const p = robe.attributes.position; for (let j = 0; j < p.count; j++) { const x = p.getX(j), z = p.getZ(j), a = Math.atan2(z, x), k = 1 + 0.06 * Math.sin(a * 11) * (1 - p.getY(j) / 1.65); p.setXYZ(j, x * k, p.getY(j), z * k); } robe.computeVertexNormals();
    mary.add(new THREE.Mesh(robe, white));
    const veil = new THREE.SphereGeometry(0.16, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62); const vm = new THREE.Mesh(veil, white); vm.scale.set(1, 1.25, 1); vm.position.y = 1.66; mary.add(vm);
    for (const s of [-1, 1]) { const hand = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 3, 6), white); hand.position.set(s * 0.05, 1.18, 0.2); hand.rotation.set(-0.7, 0, s * 0.35); mary.add(hand); } }
  const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0x5a86c4 })); sash.position.y = 1.0; mary.add(sash);
  mary.position.set(3.6, 4.6, 0.2); g.add(mary);
  const niche = new THREE.Mesh(new THREE.CircleGeometry(0.75, 12), new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 1 })); niche.position.set(3.6, 5.4, -0.25); g.add(niche);
  // candle racks — hundreds of flickering votives
  const candG = new THREE.CylinderGeometry(0.045, 0.04, 0.1, 8);
  const candM = new THREE.MeshStandardMaterial({ color: 0x8a1a14, emissive: 0xff5a14, emissiveIntensity: 1.6, roughness: 0.2 }); // red votive glass
  const n = 420; const inst = new THREE.InstancedMesh(candG, candM, n);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const row = i % 7, col = (i / 7) | 0, ncol = n / 7;
    m4.makeTranslation(-2.3 + (col / ncol) * 4.6, 0.3 + row * 0.16, -1.2 - row * 0.28);
    inst.setMatrixAt(i, m4);
  }
  g.add(inst);
  const glow = new THREE.PointLight(0xff8a3a, 6, 12, 2); glow.position.set(0, 1.5, -2); g.add(glow);
  // kneelers
  const woodM = new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 0.8 });
  for (let i = -2; i <= 2; i++) put(g, new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.4), woodM)).position.set(i * 2.6, 0.25, 3);
  g.rotation.y = facing;
  g.position.set(p[0], TER.h(p[0], p[1]) - 0.2, -p[1]);
  shadow(g); scene.add(g);
  { const th = facing, P = (x, z) => [p[0] + x * Math.cos(th) + z * Math.sin(th), p[1] - (-x * Math.sin(th) + z * Math.cos(th))];
    world.colliders.push({ o: [P(-7, -0.3), P(7, -0.3), P(7, -9), P(-7, -9)].reverse(), hl: [], n: 'Grotto' }); }
  return { x: p[0], y: p[1], candles: inst };
}

function buildCompound(b, T, scene, world) {
  const g = new THREE.Group();
  const o = obb(b.o);
  const pad = 14;
  const postM0 = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.6 });
  const P = (su, sv) => [o.c[0] + o.u[0] * su + o.v[0] * sv, o.c[1] + o.u[1] * su + o.v[1] * sv];
  const corners = [P(-o.hu - pad, -o.hv - pad), P(o.hu + pad, -o.hv - pad), P(o.hu + pad, o.hv + pad), P(-o.hu - pad, o.hv + pad)];
  const fence = new GeoBuilder();
  const fm = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.7, roughness: 0.4, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const a = corners[i], c = corners[(i + 1) % 4];
    if (i === 0) { // gap for the gatehouse on the first side
      const m1 = [a[0] + (c[0] - a[0]) * 0.42, a[1] + (c[1] - a[1]) * 0.42], m2 = [a[0] + (c[0] - a[0]) * 0.58, a[1] + (c[1] - a[1]) * 0.58];
      fence.quad(W(a, 0), W(m1, 0), W(m1, 3), W(a, 3), [0, 0], [1, 0], [1, 1], [0, 1], [1, 1, 1]);
      fence.quad(W(m2, 0), W(c, 0), W(c, 3), W(m2, 3), [0, 0], [1, 0], [1, 1], [0, 1], [1, 1, 1]);
      world.colliders.push(thinWall(a, m1), thinWall(m2, c));
      // temporary security canopy + folding table + barrier arm
      const tent = new THREE.Group();
      const cm = new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.8, side: THREE.DoubleSide });
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 0.7, 4), cm); roof.rotation.y = Math.PI / 4; roof.position.y = 2.6; tent.add(roof);
      for (const [dx, dz] of [[1.4, 1.4], [1.4, -1.4], [-1.4, 1.4], [-1.4, -1.4]]) put(tent, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 4), postM0)).position.set(dx, 1.15, dz);
      put(tent, new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.7), new THREE.MeshStandardMaterial({ color: 0xe8e8e4 }))).position.y = 0.75;
      tent.position.set(m1[0], 0, -m1[1]); g.add(tent);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 1), new THREE.MeshStandardMaterial({ color: 0xcc2222 }));
      arm.scale.z = Math.hypot(m2[0] - m1[0], m2[1] - m1[1]);
      arm.position.set((m1[0] + m2[0]) / 2, 1.1, -(m1[1] + m2[1]) / 2); arm.lookAt(m2[0], 1.1, -m2[1]); g.add(arm);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshStandardMaterial({ map: T.sign('RESTRICTED', 'U.S. DEPT. OF ENERGY — AUTHORIZED ONLY'), roughness: 0.5 }));
      const n = [(c[1] - a[1]), -(c[0] - a[0])]; const nl = Math.hypot(...n);
      sign.position.set(m1[0] - n[0] / nl * 0.2 - (m2[0] - m1[0]) * 0.8, 1.8, -(m1[1] - n[1] / nl * 0.2 - (m2[1] - m1[1]) * 0.8));
      sign.lookAt(sign.position.x + n[0], 1.8, sign.position.z - n[1]); g.add(sign);
    } else {
      fence.quad(W(a, 0), W(c, 0), W(c, 3), W(a, 3), [0, 0], [1, 0], [1, 1], [0, 1], [1, 1, 1]);
      world.colliders.push(thinWall(a, c));
    }
  }
  g.add(new THREE.Mesh(fence.build(), fm));
  // fence posts
  const postM = new THREE.MeshStandardMaterial({ color: 0x5b6065, metalness: 0.6, roughness: 0.5 });
  for (let i = 0; i < 4; i++) {
    const a = corners[i], c = corners[(i + 1) % 4], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    for (let s = 0; s <= len; s += 4) { const q = [a[0] + (c[0] - a[0]) * s / len, a[1] + (c[1] - a[1]) * s / len]; const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.3, 5), postM); post.position.set(q[0], 1.65, -q[1]); g.add(post); }
  }
  // black SUVs (temporary)
  const suvM = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, metalness: 0.6, roughness: 0.25 });
  for (let k = 0; k < 3; k++) {
    const q = P(-o.hu + 4 + k * 6, -o.hv - pad * 0.55);
    const suv = new THREE.Group();
    put(suv, new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.1, 5), suvM)).position.y = 0.8;
    put(suv, new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 3.2), suvM)).position.set(0, 1.7, -0.3);
    suv.position.set(q[0], 0, -q[1]); suv.rotation.y = Math.atan2(o.v[0], o.v[1]); g.add(suv);
  }
  g.position.y = baseOf(b);
  shadow(g); scene.add(g);
  return { x: o.c[0], y: o.c[1], corners };
}
function thinWall(a, c) {
  const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy), nx = -dy / l * 0.15, ny = dx / l * 0.15;
  return { o: [[a[0] - nx, a[1] - ny], [c[0] - nx, c[1] - ny], [c[0] + nx, c[1] + ny], [a[0] + nx, a[1] + ny]], hl: [], n: '' };
}
