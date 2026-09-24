// Builds the OSM-derived world: ground, land areas, roads, generic buildings, trees.
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { addDetail, facadePatch, MIRROR_CLIP } from './materials.js';
import { buildTrees } from './foliage.js';
import { TER, baseOf, drapeTriangles } from './terrain.js';
import { GeoBuilder, W, area, centroid, capPoly, obb, inset, outset, norm, hash1, mulberry, pip } from './geo.js';

// facade kinds: 0 ND brick, 1 house, 2 commercial brick, 3 concrete, 4 metal, 5 library granite, 6 stadium
const BAY = [[3.4, 3.9], [3.6, 3.0], [4.2, 4.0], [5.0, 3.2], [4.0, 4.0], [3.2, 3.2], [8, 9]];
const HOUSE_COLS = [[0.95, 0.94, 0.9], [0.8, 0.82, 0.84], [0.62, 0.7, 0.8], [0.93, 0.87, 0.68], [0.7, 0.76, 0.66], [0.85, 0.8, 0.72], [0.55, 0.5, 0.48], [0.9, 0.9, 0.92]];
export const SPECIAL = new Set(['Notre Dame Stadium', 'Stepan Center']);

export function buildWorld(data, T, scene, env) {
  const out = { colliders: [], named: [], roofs: [] };
  const matOpts = { roughness: 0.92, metalness: 0.0 };

  // ---------------- ground ----------------
  const S = T.scan;
  // tint helper for scans: target colour + the scan's average luminance
  const tintOf = (id, hex) => (S && S[id] ? { color: new THREE.Color(hex), avgL: 0.2126 * S[id].avg.r + 0.7152 * S[id].avg.g + 0.0722 * S[id].avg.b } : null);
  const LAWN = '#5b7a33';
  const groundMat = addDetail(new THREE.MeshStandardMaterial(S ? S.set('leafy_grass', 24 / 5) : { map: T.ground.base, ...matOpts }), 5.1, 0.35, tintOf('leafy_grass', '#587631'));
  const ground = new THREE.Mesh(TER.t.mesh(1), groundMat);
  ground.receiveShadow = true; scene.add(ground);
  // flat apron beyond the LiDAR extent, with a hole where the terrain mesh is
  const [bx0, by0, bx1, by1] = data.bounds;
  const apronShape = new THREE.Shape([[-4500, -4500], [4700, -4500], [4700, 4500], [-4500, 4500]].map(([x, y]) => new THREE.Vector2(x, y)));
  apronShape.holes.push(new THREE.Path([[bx0 + 2, by0 + 2], [bx0 + 2, by1 - 2], [bx1 - 2, by1 - 2], [bx1 - 2, by0 + 2]].map(([x, y]) => new THREE.Vector2(x, y))));
  const apronG = new THREE.ShapeGeometry(apronShape); apronG.rotateX(-Math.PI / 2);
  { const uv = apronG.attributes.uv, p = apronG.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 24, -p.getZ(i) / 24); }
  const apron = new THREE.Mesh(apronG, addDetail(new THREE.MeshStandardMaterial(S ? S.set('leafy_grass', 24 / 8) : { map: T.ground.base, ...matOpts }), 5.1, 0.35, tintOf('leafy_grass', '#587631')));
  apron.position.y = 1.0; apron.receiveShadow = true; scene.add(apron);
  // Drape a flat GeoBuilder onto the terrain (y values become offsets above grade)
  const draped = (gb, maxLen = 6) => {
    const d = drapeTriangles(gb.pos, gb.uv, TER.t, maxLen);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
    g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  };
  out.draped = draped;

  // ---------------- areas ----------------
  const AREA = {
    residential: { y: 0.012, tex: T.ground.residential, s: 24, scan: 'leafy_grass', tile: 5, tint: '#607b37' }, farm: { y: 0.014, tex: T.ground.farm, s: 20 }, cemetery: { y: 0.014, tex: T.ground.cemetery, s: 20, scan: 'leafy_grass', tile: 5, tint: '#5a7834' },
    golf: { y: 0.016, tex: T.ground.golf, s: 30, scan: 'leafy_grass', tile: 7, tint: '#4e8a35' }, meadow: { y: 0.016, tex: T.ground.meadow, s: 20, scan: 'leafy_grass', tile: 4, tint: '#8a8747' }, grass: { y: 0.02, tex: T.ground.lawn, s: 18, scan: 'leafy_grass', tile: 4.5, tint: '#5e7e34' },
    wood: { y: 0.022, tex: T.ground.wood, s: 16, scan: 'forest_leaves_02', tile: 4 }, paved: { y: 0.03, tex: T.concrete, s: 16, scan: 'concrete_pavement', tile: 3, tint: '#a9a396' }, plaza: { y: 0.034, tex: T.concrete, s: 8, scan: 'concrete_pavement', tile: 2.5, tint: '#b8b1a3' },
    playground: { y: 0.036, tex: null, col: 0x8a4b3a }, parking: { y: 0.04, tex: T.parking, s: 20, obb: true },
    pitch: { y: 0.045, tex: T.pitch, s: 40, obb: true }, turf: { y: 0.045, tex: T.pitch, s: 40, obb: true }, court: { y: 0.046, tex: null, col: 0x3d6e5a },
  };
  const areaB = {};
  const waterPolys = [];
  for (const a of data.areas) {
    if (a.t === 'water' || a.t === 'fountain') { waterPolys.push(a); continue; }
    const cfg = AREA[a.t]; if (!cfg) continue;
    const gb = areaB[a.t] || (areaB[a.t] = new GeoBuilder());
    let uvFn = null;
    if (cfg.obb) {
      const o = obb(a.o);
      if (o) uvFn = (p) => [((p.x - o.c[0]) * o.u[0] + (p.y - o.c[1]) * o.u[1]) / cfg.s, ((p.x - o.c[0]) * o.v[0] + (p.y - o.c[1]) * o.v[1]) / cfg.s + 0.5];
    }
    capPoly(gb, a.o, a.hl, cfg.y, cfg.s || 10, [1, 1, 1], true, uvFn);
  }
  for (const [t, gb] of Object.entries(areaB)) {
    const cfg = AREA[t];
    const useScan = cfg.scan && S && S[cfg.scan];
    const mat = new THREE.MeshStandardMaterial(useScan ? S.set(cfg.scan, cfg.s / cfg.tile) : { map: cfg.tex || null, color: cfg.col || 0xffffff, ...matOpts });
    if (cfg.tex && t !== 'parking' && t !== 'pitch' && t !== 'turf') addDetail(mat, useScan ? 4.3 : 6.1, useScan ? 0.3 : 0.4, useScan && cfg.tint ? tintOf(cfg.scan, cfg.tint) : null);
    const m = new THREE.Mesh(draped(gb), mat);
    m.receiveShadow = true; scene.add(m);
  }

  // ---------------- water ----------------
  {
    const pos = [], idx = [];
    // One mirror for the big lakes at their real level; ponds/pools elsewhere get glossy standard water (no extra pass)
    const big = waterPolys.filter((a) => Math.abs(area(a.o)) > 20000);
    const lakeW = big.reduce((s2, a) => s2 + Math.abs(area(a.o)), 0) || 1;
    const planeY = big.length ? big.reduce((s2, a) => s2 + (a.level ?? 0) * Math.abs(area(a.o)), 0) / lakeW : 0;
    const mirrored = waterPolys.filter((a) => Math.abs((a.level ?? 0) - planeY) < 2.5);
    const glossy = waterPolys.filter((a) => !mirrored.includes(a));
    {
      const gb = new GeoBuilder();
      for (const a of glossy) capPoly(gb, a.o, a.hl, (a.level ?? 0) + 0.02, 6, [1, 1, 1]);
      const gm = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ color: 0x1f3a33, roughness: 0.04, metalness: 0.0, envMapIntensity: 1.2 }));
      gm.receiveShadow = true; scene.add(gm);
    }
    for (const a of mirrored) {
      const contour = a.o.map((p) => new THREE.Vector2(p[0], p[1]));
      const holes = (a.hl || []).map((r) => r.map((p) => new THREE.Vector2(p[0], p[1])));
      let faces; try { faces = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (e) { continue; }
      const base = pos.length / 3;
      for (const v of contour.concat(...holes)) pos.push(v.x, v.y, (a.level ?? 0) - planeY);
      for (const [i, j, k] of faces) idx.push(base + i, base + j, base + k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const uv = []; for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] / 40, pos[i + 1] / 40);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    // Make all faces point +z
    const water = new Water(g, {
      textureWidth: 1024, textureHeight: 1024, waterNormals: T.waterNormals,
      sunDirection: env.sunDir.clone(), sunColor: 0xfff0d8, waterColor: 0x2c4a3c, distortionScale: 0.9, fog: true, alpha: 1.0,
    });
    water.material.side = THREE.DoubleSide;
    water.rotation.x = -Math.PI / 2; water.position.y = planeY;
    water.material.uniforms.size.value = 0.35; // broad, gentle ripples
    // three's Water uses rf0 = 0.3 and a grey floor, which reads as brushed metal; water is ~0.02
    water.material.fragmentShader = water.material.fragmentShader.replace('float rf0 = 0.3;', 'float rf0 = 0.02;').replace('( vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight )', '( reflectionSample * 0.85 + reflectionSample * specularLight )')
      .replace('vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;', 'vec3 scatter = (0.55 + 0.45 * max( 0.0, dot( surfaceNormal, eyeDirection ) )) * waterColor; reflectance = min(reflectance, 0.62);');
    water.material.needsUpdate = true;
    // Reflector's oblique-near-plane clipping doesn't survive logarithmic depth, so clip explicitly during the mirror pass
    { const orig = water.onBeforeRender.bind(water);
      water.onBeforeRender = (r, s2, c) => { MIRROR_CLIP.constant = -(planeY - 0.3); try { orig(r, s2, c); } finally { MIRROR_CLIP.constant = 1e6; } }; }
    scene.add(water);
    out.water = water;
    // shoreline: darker muddy band + reeds hint
    const shore = new GeoBuilder();
    for (const a of waterPolys) {
      if (Math.abs(area(a.o)) < 3000) continue;
      const r = a.o, o = outset(r, 2.2);
      for (let i = 0; i < r.length; i++) {
        const j = (i + 1) % r.length;
        shore.quad(W(r[i], 0.06), W(r[j], 0.06), W(o[j], 0.06), W(o[i], 0.06), [0, 0], [1, 0], [1, 1], [0, 1], [1, 1, 1]);
      }
    }
    const sm = new THREE.Mesh(draped(shore, 3), new THREE.MeshStandardMaterial({ color: 0x4d4a33, roughness: 1, side: THREE.DoubleSide }));
    sm.receiveShadow = true; scene.add(sm);
    out.waterPolys = waterPolys;
  }

  // ---------------- roads ----------------
  {
    const road = new GeoBuilder(), path = new GeoBuilder(), paint = new GeoBuilder();
    const ribbon = (gb, p, w, y, uvS) => {
      const hw = w / 2, n = p.length;
      const L = [], R = [];
      for (let i = 0; i < n; i++) {
        const a = p[Math.max(0, i - 1)], b = p[i], c = p[Math.min(n - 1, i + 1)];
        const d0 = norm([b[0] - a[0], b[1] - a[1]]), d1 = norm([c[0] - b[0], c[1] - b[1]]);
        let d = i === 0 ? d1 : i === n - 1 ? d0 : norm([d0[0] + d1[0], d0[1] + d1[1]]);
        const nrm = [-d[1], d[0]];
        const ref = i === 0 ? d1 : d0;
        const cos = Math.max(0.35, nrm[0] * -ref[1] + nrm[1] * ref[0]);
        const m = hw / cos;
        L.push([b[0] + nrm[0] * m, b[1] + nrm[1] * m]); R.push([b[0] - nrm[0] * m, b[1] - nrm[1] * m]);
      }
      for (let i = 0; i + 1 < n; i++) {
        const uv = (q) => [q[0] / uvS, q[1] / uvS];
        gb.quad(W(R[i], y), W(R[i + 1], y), W(L[i + 1], y), W(L[i], y), uv(R[i]), uv(R[i + 1]), uv(L[i + 1]), uv(L[i]), [1, 1, 1]);
      }
      // round joins/caps to hide gaps
      for (let i = 0; i < n; i++) {
        const c = p[i], seg = 10;
        for (let s = 0; s < seg; s++) {
          const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
          const q0 = [c[0] + Math.cos(a0) * hw, c[1] + Math.sin(a0) * hw], q1 = [c[0] + Math.cos(a1) * hw, c[1] + Math.sin(a1) * hw];
          const uv = (q) => [q[0] / uvS, q[1] / uvS];
          gb.tri(W(c, y - 0.004), W(q0, y - 0.004), W(q1, y - 0.004), uv(c), uv(q0), uv(q1), [1, 1, 1]);
        }
      }
    };
    for (const r of data.roads) {
      if (r.f) ribbon(path, r.p, r.w, r.t === 'steps' ? 0.058 : 0.055, 8);
      else ribbon(road, r.p, r.w, 0.07, 10);
      if (!r.f && ['primary', 'secondary', 'tertiary', 'trunk'].includes(r.t)) {
        // dashed centre line
        for (let i = 0; i + 1 < r.p.length; i++) {
          const [ax, ay] = r.p[i], [bx, by] = r.p[i + 1];
          const L = Math.hypot(bx - ax, by - ay), dx = (bx - ax) / L, dy = (by - ay) / L;
          for (let s = 1; s + 3 < L; s += 9) {
            const a = [ax + dx * s, ay + dy * s], b = [ax + dx * (s + 3), ay + dy * (s + 3)];
            const nx = -dy * 0.08, ny = dx * 0.08;
            paint.quad(W([a[0] - nx, a[1] - ny], 0.08), W([b[0] - nx, b[1] - ny], 0.08), W([b[0] + nx, b[1] + ny], 0.08), W([a[0] + nx, a[1] + ny], 0.08), [0, 0], [1, 0], [1, 1], [0, 1], [1, 1, 1]);
          }
        }
      }
    }
    const rm = new THREE.Mesh(draped(road, 4), addDetail(new THREE.MeshStandardMaterial(S ? S.set('asphalt_02', 10 / 6, { color: 0x9a9a9a }) : { map: T.asphalt, roughness: 0.95 }), 3.7, 0.3));
    const pm = new THREE.Mesh(draped(path, 4), S ? addDetail(new THREE.MeshStandardMaterial(S.set('concrete_pavement', 8 / 2.6)), 3.1, 0.25, tintOf('concrete_pavement', '#bdb6a7')) : new THREE.MeshStandardMaterial({ map: T.concrete, roughness: 0.9 }));
    const lm = new THREE.Mesh(draped(paint, 4), new THREE.MeshStandardMaterial({ color: 0xd8b23a, roughness: 0.7 }));
    for (const m of [rm, pm, lm]) { m.receiveShadow = true; scene.add(m); }
    // rail line
    const rail = new GeoBuilder();
    for (const p of data.rails) if (p.length > 1) ribbon(rail, p, 4, 0.05, 6);
    const railm = new THREE.Mesh(draped(rail, 4), new THREE.MeshStandardMaterial({ color: 0x5a5048, roughness: 1 }));
    railm.receiveShadow = true; scene.add(railm);
  }

  // ---------------- buildings ----------------
  {
    const walls = Array.from({ length: 7 }, () => new GeoBuilder());
    const roofs = { slate: new GeoBuilder(), tile: new GeoBuilder(), copper: new GeoBuilder(), shingle: new GeoBuilder(), flat: new GeoBuilder(), lead: new GeoBuilder() };
    const trim = new GeoBuilder(), units = new GeoBuilder();
    const kindOf = (b) => {
      if (b.n === 'Hesburgh Library' || [1185999646, 1185987280, 1188681935].includes(b.id)) return 5;
      return b.k;
    };
    const allB = () => [...walls, ...Object.values(roofs), trim, units];
    let pend = null;
    const flush = () => { if (!pend) return; const [marks, base] = pend; allB().forEach((g, i) => { for (let k = marks[i] + 1; k < g.pos.length; k += 3) g.pos[k] += base; }); pend = null; };
    for (const b of data.buildings) {
      flush();
      if (SPECIAL.has(b.n)) { out.colliders.push({ o: b.o, hl: b.n === 'Notre Dame Stadium' ? [] : b.hl, n: b.n }); continue; }
      pend = [allB().map((g) => g.pos.length), baseOf(b)];
      const rng = mulberry(b.id | 0);
      const kind = kindOf(b);
      const [bw, fh] = BAY[kind];
      let tint;
      if (kind === 0) { const j = rng() * 0.08; tint = [1 - j * 0.3, 0.97 - j, 0.92 - j * 1.2]; }
      else if (kind === 1) tint = HOUSE_COLS[(rng() * HOUSE_COLS.length) | 0];
      else if (kind === 2) { const j = rng() * 0.15; tint = [1 - j, 0.95 - j, 0.95 - j]; }
      else tint = [0.95 + rng() * 0.05, 0.95 + rng() * 0.05, 0.95 + rng() * 0.05];
      let h = b.h, mh = b.mh || (b.part ? 0 : -2.5);
      if (b.rs === 'dome' && b.rh) h = Math.max(mh + 2, h - b.rh);
      if (b.n === 'Hesburgh Library') h = 10;
      if (b.n === 'Joyce Athletic Center') h = 10;
      const oriented = obb(b.o);
      const fill = oriented ? b.a / oriented.A : 0;
      // decide roof
      let roof = 'flat', rtex = 'flat';
      const pick = rng();
      if (b.rs === 'dome') roof = 'dome';
      else if (b.n === 'Basilica of the Sacred Heart') { roof = 'gable'; rtex = 'slate'; }
      else if (b.n === 'Main Building') { roof = 'mansard'; rtex = 'lead'; }
      else if (kind === 1 && b.bt !== 'garage' && b.bt !== 'shed' && b.bt !== 'garages' && fill > 0.7 && oriented.hv < 12) { roof = pick < 0.55 ? 'gable' : 'hip'; rtex = 'shingle'; }
      else if (kind === 0 && !b.part && b.bt !== 'roof') {
        rtex = pick < 0.55 ? 'slate' : pick < 0.9 ? 'tile' : 'copper';
        if (b.rc) rtex = /green|#4|#5[0-9a-f]9/i.test(b.rc) ? 'copper' : rtex;
        if (fill > 0.86 && oriented && oriented.hv < 15 && b.a < 3500 && b.h < 25) roof = oriented.hu / oriented.hv > 1.5 ? 'gable' : 'hip';
        else if (b.a < 14000 && b.hl.length === 0 && b.h < 30) roof = 'mansard';
      }
      // LiDAR says flat (lr 0) or gives the real rise (lr > 0); -1 keeps the heuristics above
      if (b.lr === 0 && roof !== 'dome') roof = 'flat';
      else if (b.lr > 0 && roof === 'flat' && b.bt !== 'roof' && !b.part) {
        roof = fill > 0.84 && oriented && oriented.hv < 16 ? (oriented.hu / oriented.hv > 1.5 ? 'gable' : 'hip') : b.hl.length === 0 ? 'mansard' : 'flat';
        if (rtex === 'flat') rtex = kind === 1 ? 'shingle' : pick < 0.6 ? 'slate' : 'tile';
      }
      if (b.bt === 'roof') { mh = Math.max(mh, h - 0.6); }

      // --- walls
      const gbw = walls[kind];
      const rings = [b.o, ...b.hl];
      for (const ring of rings) {
        let u = 0;
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], c = ring[(i + 1) % ring.length];
          const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
          const bays = Math.max(1, Math.round(L / bw));
          const v0 = mh / fh, v1 = h / fh;
          gbw.quad(W(a, mh), W(c, mh), W(c, h), W(a, h), [u, v0], [u + bays, v0], [u + bays, v1], [u, v1], tint);
          u += bays;
        }
      }
      if (b.bt !== 'roof') out.colliders.push({ o: b.o, hl: b.hl, n: b.n });
      if (b.n) out.named.push({ n: b.n, c: b.c, a: b.a });

      // --- roof
      const stone = kind === 0 ? [0.93, 0.9, 0.82] : kind === 1 ? [0.95, 0.95, 0.95] : [0.78, 0.77, 0.75];
      if (roof === 'gable' || roof === 'hip') {
        const o = oriented, ov = kind === 1 ? 0.45 : 0.35;
        const pitch = b.n === 'Basilica of the Sacred Heart' ? 1.05 : kind === 1 ? 0.6 + rng() * 0.2 : 0.75 + rng() * 0.25;
        const rise = b.lr > 0 ? Math.min(b.lr, o.hv * 1.6) : Math.min(o.hv * pitch, kind === 1 ? 4.5 : 12);
        const P = (su, sv) => [o.c[0] + o.u[0] * su + o.v[0] * sv, o.c[1] + o.u[1] * su + o.v[1] * sv];
        const HU = o.hu + ov, HV = o.hv + ov, eh = h - ov * pitch * 0.6;
        const c0 = P(-HU, -HV), c1 = P(HU, -HV), c2 = P(HU, HV), c3 = P(-HU, HV);
        const rl = roof === 'gable' ? HU : Math.max(0, o.hu - o.hv);
        const r0 = P(-rl, 0), r1 = P(rl, 0);
        const rg = roofs[rtex], top = h + rise;
        const ctr = [o.c[0], h - 1, -o.c[1]];
        const add = (A, B, C, ua, ub, uc) => triOut(rg, A, B, C, ua, ub, uc, ctr, [1, 1, 1]);
        const s = 4, sl = Math.sqrt(1 + pitch * pitch);
        const U = (p, hh) => [((p[0] - o.c[0]) * o.u[0] + (p[1] - o.c[1]) * o.u[1]) / s, ((hh - eh) * sl / pitch) / s];
        // long sides
        add(W(c0, eh), W(c1, eh), W(r1, top), U(c0, eh), U(c1, eh), U(r1, top));
        add(W(c0, eh), W(r1, top), W(r0, top), U(c0, eh), U(r1, top), U(r0, top));
        add(W(c2, eh), W(c3, eh), W(r0, top), U(c2, eh), U(c3, eh), U(r0, top));
        add(W(c2, eh), W(r0, top), W(r1, top), U(c2, eh), U(r0, top), U(r1, top));
        if (roof === 'hip') {
          const V = (p, hh) => [((p[0] - o.c[0]) * o.v[0] + (p[1] - o.c[1]) * o.v[1]) / s, ((hh - eh) * sl / pitch) / s];
          add(W(c1, eh), W(c2, eh), W(r1, top), V(c1, eh), V(c2, eh), V(r1, top));
          add(W(c3, eh), W(c0, eh), W(r0, top), V(c3, eh), V(c0, eh), V(r0, top));
        } else {
          // gable end walls in facade material + thin roof edge
          const E = (p, hh) => [((p[0] - o.c[0]) * o.v[0] + (p[1] - o.c[1]) * o.v[1]) / bw, hh / fh];
          const g0 = P(-o.hu, -o.hv), g1 = P(-o.hu, o.hv), gr0 = P(-o.hu, 0), g2 = P(o.hu, -o.hv), g3 = P(o.hu, o.hv), gr1 = P(o.hu, 0);
          triOut(gbw, W(g0, h), W(g1, h), W(gr0, top - 0.3), E(g0, h), E(g1, h), E(gr0, top), ctr, tint);
          triOut(gbw, W(g2, h), W(g3, h), W(gr1, top - 0.3), E(g2, h), E(g3, h), E(gr1, top), ctr, tint);
          // underside of overhang so gables don't look hollow
          triOut(gbw, W(c0, eh), W(c3, eh), W(r0, top), E(c0, eh), E(c3, eh), E(r0, top), ctr, tint);
          triOut(gbw, W(c1, eh), W(c2, eh), W(r1, top), E(c1, eh), E(c2, eh), E(r1, top), ctr, tint);
        }
        // ceiling cap under roof (in case footprint pokes outside the OBB-based roof)
        capPoly(roofs.flat, b.o, b.hl, h - 0.05, 4, [0.6, 0.6, 0.6]);
        out.roofs.push({ b, top });
      } else if (roof === 'mansard') {
        const d = b.lr > 0 ? Math.min(7, Math.max(1.6, b.lr * 0.9)) : Math.min(4, Math.max(1.6, Math.sqrt(b.a) * 0.09));
        let ins = inset(b.o, d), dd = d;
        if (!ins) { ins = inset(b.o, (dd = d * 0.55)); }
        const rise = b.n === 'Main Building' ? 5 : b.lr > 0 ? b.lr * (dd / d) : dd * 0.95;
        if (ins) {
          const rg = roofs[rtex];
          const ov = outset(b.o, 0.3);
          const eh = h - 0.2;
          for (let i = 0; i < b.o.length; i++) {
            const j = (i + 1) % b.o.length;
            const L = Math.hypot(b.o[j][0] - b.o[i][0], b.o[j][1] - b.o[i][1]) / 4;
            rg.quad(W(ov[i], eh), W(ov[j], eh), W(ins[j], h + rise), W(ins[i], h + rise), [0, 0], [L, 0], [L, rise / 3], [0, rise / 3], [1, 1, 1]);
          }
          capPoly(rg, ins, [], h + rise, 4, [0.82, 0.82, 0.82]);
          // ridge trim
          addBand(trim, ins, h + rise, h + rise + 0.35, 0.15, stone);
          out.roofs.push({ b, top: h + rise });
        } else { roof = 'flat'; }
      }
      if (roof === 'flat') {
        { const v = 0.62 + rng() * 0.32, warm = rng() * 0.06; capPoly(roofs.flat, b.o, b.hl, h, 4, [v + warm, v + warm * 0.5, v]); }
        if (b.bt !== 'roof' && kind !== 1) {
          const ph = kind === 0 ? 0.9 : 0.6;
          addBand(trim, b.o, h - (kind === 0 ? 0.6 : 0.3), h + ph, 0.25, stone);
          for (const hl of b.hl) addBand(trim, hl, h - 0.3, h + ph, 0.2, stone);
        }
        // rooftop mechanical units
        if (b.a > 700 && kind !== 1 && b.bt !== 'roof') {
          const n = Math.min(5, 1 + (b.a / 2500) | 0);
          for (let k = 0; k < n; k++) {
            const o = oriented; if (!o) break;
            const su = (rng() - 0.5) * o.hu * 1.2, sv = (rng() - 0.5) * o.hv * 1.2;
            const p = [o.c[0] + o.u[0] * su + o.v[0] * sv, o.c[1] + o.u[1] * su + o.v[1] * sv];
            if (!pip(p, b.o)) continue;
            box(units, p, o.u, 1.5 + rng() * 3, 1.2 + rng() * 2, h, h + 1.2 + rng() * 1.5, [0.75, 0.76, 0.78]);
          }
        }
        if (b.ph > 0 && b.hl.length === 0) {
          let best = null;
          for (let d = 1.5; d < 40; d *= 1.25) { const r = inset(b.o, d); if (!r) break; best = r; if (Math.abs(area(r)) / b.a <= b.phF) break; }
          if (best) {
            const top = h + b.ph; let u = 0;
            for (let i = 0; i < best.length; i++) { const a2 = best[i], c2 = best[(i + 1) % best.length]; const L2 = Math.hypot(c2[0] - a2[0], c2[1] - a2[1]); const bays = Math.max(1, Math.round(L2 / bw)); gbw.quad(W(a2, h), W(c2, h), W(c2, top), W(a2, top), [u, 0], [u + bays, 0], [u + bays, b.ph / fh], [u, b.ph / fh], tint); u += bays; }
            capPoly(roofs.flat, best, [], top, 4, [0.8, 0.8, 0.8]);
            addBand(trim, best, top - 0.3, top + 0.6, 0.2, stone);
          }
        }
        out.roofs.push({ b, top: h });
      }
      if (roof === 'dome') {
        const c = centroid(b.o), r = Math.sqrt(b.a / Math.PI);
        const g = new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
        g.scale(r, b.rh, r); g.translate(c[0], h + baseOf(b), -c[1]);
        const col = new THREE.Color(b.rc || '#d8d7c5');
        out.extraMeshes = out.extraMeshes || [];
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.1 }));
        m.castShadow = m.receiveShadow = true; scene.add(m);
        capPoly(roofs.flat, b.o, b.hl, h, 4, [1, 1, 1]);
      }
    }
    flush();
    const mk = (gb, mat) => { if (!gb.count) return; const m = new THREE.Mesh(gb.build(), mat); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; };
    const sc = (id, hex, tile) => (S && S[id] ? { scan: S[id], tint: hex ? new THREE.Color(hex) : S[id].avg.clone(), tile } : null);
    const FACADE_SCANS = { 0: { brick: sc('brick_wall_001', '#d8caa5', 1.6), lime: sc('large_sandstone_blocks', '#e3d9c3', 3.2) }, 2: { brick: sc('large_red_bricks', null, 1.8) }, 6: { brick: sc('large_red_bricks', '#b98365', 1.8) } };
    walls.forEach((gb, k) => mk(gb, facadePatch(new THREE.MeshStandardMaterial({ map: T.facade[k].map, roughnessMap: T.facade[k].mask, normalMap: T.facade[k].normal, vertexColors: true, roughness: 1, metalness: 0.0, envMapIntensity: 1.0 }), { bay: BAY[k][0], floor: BAY[k][1], stone: k === 0 ? 1 : 0, interior: k === 6 ? 0 : 1, key: k + (FACADE_SCANS[k] ? 's' : ''), ...(FACADE_SCANS[k] || {}) })));
    const ROOF_SCAN = { slate: 'grey_roof_tiles', tile: 'clay_roof_tiles_02', shingle: 'grey_roof_01' };
    for (const [k, gb] of Object.entries(roofs)) mk(gb, new THREE.MeshStandardMaterial(ROOF_SCAN[k] && S?.[ROOF_SCAN[k]] ? S.set(ROOF_SCAN[k], 2, { vertexColors: true, color: k === 'slate' ? 0x9aa0a8 : 0xffffff }) : { map: T.roof[k].map, roughnessMap: T.roof[k].mask, normalMap: T.roof[k].normal, vertexColors: true, roughness: 1, metalness: k === 'lead' || k === 'copper' ? 0.35 : 0 }));
    mk(trim, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8 }));
    mk(units, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6, metalness: 0.3 }));
  }

  // ---------------- fences ----------------
  {
    const f = new GeoBuilder();
    for (const bar of data.barriers) {
      const p = bar.p; const hgt = bar.t === 'fence' ? 1.6 : 1.0;
      for (let i = 0; i + 1 < p.length; i++) {
        const L = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
        const g0 = TER.h(p[i][0], p[i][1]), g1 = TER.h(p[i + 1][0], p[i + 1][1]);
        f.quad(W(p[i], g0 - 0.2), W(p[i + 1], g1 - 0.2), W(p[i + 1], g1 + hgt), W(p[i], g0 + hgt), [0, 0], [L / 2, 0], [L / 2, 1], [0, 1], bar.t === 'fence' ? [0.2, 0.22, 0.2] : [0.7, 0.68, 0.62]);
      }
    }
    const m = new THREE.Mesh(f.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide, transparent: false }));
    m.castShadow = true; scene.add(m);
  }

  // ---------------- trees ----------------
  out.trees = buildTrees(data.trees, scene, T);
  return out;
}

function triOut(gb, a, b, c, ua, ub, uc, ref, color) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const mx = (a[0] + b[0] + c[0]) / 3 - ref[0], my = (a[1] + b[1] + c[1]) / 3 - ref[1], mz = (a[2] + b[2] + c[2]) / 3 - ref[2];
  if (nx * mx + ny * my + nz * mz < 0) gb.tri(a, c, b, ua, uc, ub, color); else gb.tri(a, b, c, ua, ub, uc, color);
}
// Vertical band around a ring from y0..y1, pushed outward by d (cornice / parapet) with a top cap.
export function addBand(gb, ring, y0, y1, d, color) {
  const o = outset(ring, d), i2 = inset(ring, 0.3) || ring;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    gb.quad(W(o[i], y0), W(o[j], y0), W(o[j], y1), W(o[i], y1), [0, 0], [1, 0], [1, 1], [0, 1], color);
    gb.quad(W(o[i], y1), W(o[j], y1), W(i2[j], y1), W(i2[i], y1), [0, 0], [1, 0], [1, 1], [0, 1], color);
    gb.quad(W(i2[i], y1), W(i2[j], y1), W(i2[j], y0 + 0.2), W(i2[i], y0 + 0.2), [0, 0], [1, 0], [1, 1], [0, 1], color.map((c) => c * 0.8));
    gb.quad(W(o[j], y0), W(o[i], y0), W(ring[i], y0), W(ring[j], y0), [0, 0], [1, 0], [1, 1], [0, 1], color.map((c) => c * 0.7));
  }
}
export function box(gb, p, u, w, d, y0, y1, color) {
  const v = [-u[1], u[0]];
  const C = (su, sv) => [p[0] + u[0] * su + v[0] * sv, p[1] + u[1] * su + v[1] * sv];
  const c = [C(-w / 2, -d / 2), C(w / 2, -d / 2), C(w / 2, d / 2), C(-w / 2, d / 2)];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; gb.quad(W(c[i], y0), W(c[j], y0), W(c[j], y1), W(c[i], y1), [0, 0], [1, 0], [1, 1], [0, 1], color); }
  gb.quad(W(c[0], y1), W(c[1], y1), W(c[2], y1), W(c[3], y1), [0, 0], [1, 0], [1, 1], [0, 1], color);
}

