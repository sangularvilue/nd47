// Leaf-card trees (instanced, tiled for culling) and near-camera grass blades.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash1, mulberry } from './geo.js';
import { windPatch, patch, G } from './materials.js';
import { TER } from './terrain.js';

const AUTUMN = [
  ['#4b7a2c', 15], ['#5a8a34', 13], ['#3e6a2a', 10], ['#6f9038', 8], ['#8a9a3a', 6],
  ['#d0a52a', 9], ['#e0b843', 6], ['#dd8a26', 9], ['#cc621e', 7], ['#b53d1d', 7], ['#912a1c', 5], ['#9a6a2e', 3],
];
const TOT = AUTUMN.reduce((s, a) => s + a[1], 0);
function pickCol(r) { let x = r * TOT; for (const [c, w] of AUTUMN) { if ((x -= w) <= 0) return c; } return AUTUMN[0][0]; }

function withColor(g, fn) {
  const p = g.attributes.position, col = [];
  for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i)); col.push(v, v, v); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
// Trunk + main limbs, one geometry
function woodGeo(rng) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.36, 5.4, 8, 3); trunk.translate(0, 2.7, 0);
  parts.push(trunk);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng(), len = 2.6 + rng() * 1.6;
    const b = new THREE.CylinderGeometry(0.06, 0.14, len, 5); b.translate(0, len / 2, 0);
    b.rotateZ(0.75 + rng() * 0.35); b.rotateY(a); b.translate(0, 4.2 + rng() * 1.0, 0);
    parts.push(b);
  }
  const g = mergeGeometries(parts.map((p) => { const n = p.toNonIndexed(); n.deleteAttribute('uv'); return n; }));
  return withColor(g, (x, y) => 0.8 + 0.2 * Math.min(1, y / 5));
}
// Leaf cards scattered over a lumpy canopy volume, with spherical normals for soft lighting.
function cardsGeo(rng, nCards = 120) {
  const lobes = [[0, 7.4, 0, 3.7], [1.9, 6.4, 0.8, 2.8], [-1.8, 6.6, -1.1, 2.9], [0.3, 9.2, -0.3, 2.6], [-0.4, 6.0, 1.9, 2.4], [1.0, 6.2, -2.0, 2.3]];
  const pos = [], nor = [], uv = [], col = [], cen = [], cor = [];
  const C = new THREE.Vector3(0, 7.2, 0);
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
  for (let k = 0; k < nCards; k++) {
    const L = lobes[(rng() * lobes.length) | 0];
    const dir = new THREE.Vector3(rng() - 0.5, (rng() - 0.35) * 0.9, rng() - 0.5).normalize();
    const c = new THREE.Vector3(L[0], L[1], L[2]).addScaledVector(dir, L[3] * (0.62 + rng() * 0.42));
    const s = 1.35 + rng() * 0.8;
    e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI); q.setFromEuler(e);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const P = corners.map(([a, b]) => v.set(a * s / 2, b * s / 2, 0).applyQuaternion(q).add(c).toArray());
    const N = P.map((p) => new THREE.Vector3(p[0] - C.x, (p[1] - C.y) * 1.3, p[2] - C.z).normalize().toArray());
    const ao = (p) => 0.55 + 0.5 * THREE.MathUtils.clamp((p[1] - 4.5) / 6, 0, 1) + 0.15 * (Math.hypot(p[0], p[2]) / 4);
    const U = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const roll = rng() * Math.PI * 2, cr = Math.cos(roll), sr = Math.sin(roll);
    const nc = new THREE.Vector3(c.x - C.x, (c.y - C.y) * 1.3, c.z - C.z).normalize().toArray();
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(...P[i]); nor.push(...nc); uv.push(...U[i]); const a = ao(c.toArray()); col.push(a, a, a);
      const [cx, cy] = corners[i]; cen.push(c.x, c.y, c.z); cor.push((cx * cr - cy * sr) * s / 2, (cx * sr + cy * cr) * s / 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aCenter', new THREE.Float32BufferAttribute(cen, 3));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute(cor, 2));
  return g;
}
// Opaque inner canopy so the crown never looks hollow from a distance
function coreGeo() {
  const parts = [[0, 7.2, 0, 2.1], [1.3, 6.4, 0.5, 1.4], [-1.2, 6.6, -0.8, 1.5], [0.2, 8.4, -0.2, 1.4]].map(([x, y, z, r]) => { const g = new THREE.IcosahedronGeometry(r, 1); g.translate(x, y, z); return g.toNonIndexed(); });
  const g = mergeGeometries(parts); g.computeVertexNormals();
  return withColor(g, (x, y) => 0.2 + 0.18 * THREE.MathUtils.clamp((y - 4.5) / 5, 0, 1));
}
function coniferGeo() {
  const parts = [];
  for (const [y, r, h] of [[1.6, 3.1, 4.6], [3.9, 2.6, 4.2], [6.1, 2.0, 3.8], [8.2, 1.3, 3.2]]) { const g = new THREE.ConeGeometry(r, h, 10, 2); g.translate(0, y + h / 2, 0); parts.push(g.toNonIndexed()); }
  const g = mergeGeometries(parts);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + Math.sin(x * 3.1 + y * 2.3) * Math.cos(z * 2.7) * 0.1; p.setXYZ(i, x * k, y, z * k); }
  g.computeVertexNormals();
  return withColor(g, (x, y) => 0.45 + 0.55 * Math.min(1, y / 11));
}

export function buildTrees(list, scene, T) {
  const TILE = 240;
  const tiles = new Map();
  for (const t of list) { const k = Math.floor(t[0] / TILE) + ',' + Math.floor(t[1] / TILE); if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(t); }
  const rng = mulberry(31);
  const VAR = 3;
  const woods = Array.from({ length: VAR }, () => woodGeo(rng));
  const cards = Array.from({ length: VAR }, () => cardsGeo(rng));
  const core = coreGeo(), cone = coniferGeo();
  const bark = new THREE.MeshStandardMaterial({ map: T.bark.map, normalMap: T.bark.normal, vertexColors: true, roughness: 0.95 });
  const leafM = windPatch(new THREE.MeshStandardMaterial({ map: T.leaf, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.78, envMapIntensity: 0.6 }), 1.0, 'leaf');
  patch(leafM, 'billboard', (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aCenter; attribute vec2 aCorner;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 bc = vec4(aCenter + (transformed - position), 1.0);
        #ifdef USE_INSTANCING
          bc = instanceMatrix * bc;
          float bs = length(instanceMatrix[0].xyz);
        #else
          float bs = 1.0;
        #endif
        mvPosition = modelViewMatrix * bc;
        mvPosition.xy += aCorner * bs;
        gl_Position = projectionMatrix * mvPosition;`);
  });
  const coreTex = T.leaf.clone(); coreTex.wrapS = coreTex.wrapT = THREE.RepeatWrapping; coreTex.repeat.set(4, 3); coreTex.needsUpdate = true;
  const coreM = windPatch(new THREE.MeshStandardMaterial({ map: coreTex, vertexColors: true, roughness: 0.9 }), 0.5, 'core');
  const conM = windPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 0.25, 'con');
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  const group = new THREE.Group();
  let i0 = 0;
  for (const arr of tiles.values()) {
    const buckets = Array.from({ length: VAR }, () => []);
    const con = [];
    arr.forEach((t, i) => { const r = hash1(i0 + i * 7 + 13); (t[3] ? con : buckets[(r * VAR) | 0]).push([t, r, i0 + i]); });
    i0 += arr.length;
    const place = (mesh, items, colorFn, scaleFn) => {
      items.forEach(([t, r, id], j) => {
        const sc = t[2];
        q.setFromAxisAngle(up, r * 6.283);
        mesh.setMatrixAt(j, m4.compose(p.set(t[0], TER.h(t[0], t[1]) - 0.1, -t[1]), q, scaleFn ? scaleFn(sc, id) : s.set(sc, sc * (0.9 + hash1(id) * 0.25), sc)));
        if (colorFn) mesh.setColorAt(j, colorFn(id));
      });
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere(); group.add(mesh);
    };
    buckets.forEach((items, v) => {
      if (!items.length) return;
      const leafCol = (id) => c.set(pickCol(hash1(id * 3 + 1))).multiplyScalar(1.15);
      place(new THREE.InstancedMesh(woods[v], bark, items.length), items);
      place(new THREE.InstancedMesh(cards[v], leafM, items.length), items, leafCol);
      place(new THREE.InstancedMesh(core, coreM, items.length), items, leafCol);
    });
    if (con.length) place(new THREE.InstancedMesh(cone, conM, con.length), con, (id) => c.set(['#2f4f2a', '#35552c', '#2a4526'][id % 3]), (sc, id) => s.set(sc * 0.75, sc * (0.9 + hash1(id) * 0.3), sc * 0.75));
  }
  scene.add(group);
  return group;
}

// ---------------- grass ----------------
// Mask: 1 px = 1 m. White where lawn exists; roads, paths, buildings, lots, water are cut out.
export function grassMask(data) {
  const [X0, Y0, X1, Y1] = data.bounds;
  const W = X1 - X0, H = Y1 - Y0;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const tx = (p) => [p[0] - X0, Y1 - p[1]];
  const poly = (r) => { g.beginPath(); r.forEach((p, i) => { const [x, y] = tx(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill(); };
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#000';
  for (const a of data.areas) if (['water', 'fountain', 'parking', 'paved', 'plaza', 'playground', 'court', 'farm', 'wood'].includes(a.t)) poly(a.o);
  for (const b of data.buildings) poly(b.o);
  g.strokeStyle = '#000'; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const r of data.roads) { g.lineWidth = r.w + 0.6; g.beginPath(); r.p.forEach((p, i) => { const [x, y] = tx(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return { tex: t, bounds: new THREE.Vector4(X0, Y0, W, H) };
}

export function buildGrass(data, scene, { patchSize = 34, density = 85 } = {}) {
  const mask = grassMask(data);
  // blade: 3 segments, tapered, slightly curved
  const pos = [], col = [], nor = [];
  const seg = 3, wBase = 0.018;
  const rows = [];
  for (let i = 0; i <= seg; i++) { const t = i / seg; rows.push([wBase * (1 - t * 0.85), t]); }
  for (let i = 0; i < seg; i++) {
    const [w0, y0] = rows[i], [w1, y1] = rows[i + 1];
    const quad = [[-w0, y0], [w0, y0], [w1, y1], [-w0, y0], [w1, y1], [-w1, y1]];
    for (const [x, y] of quad) { pos.push(x, y, 0); nor.push(0, 1, 0.25); const v = 0.45 + 0.55 * y; col.push(v, v, v); }
  }
  const base = new THREE.BufferGeometry();
  base.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  base.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  base.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const geo = new THREE.InstancedBufferGeometry().copy(base);
  const n = Math.floor(patchSize * patchSize * density);
  const off = new Float32Array(n * 3);
  const rng = mulberry(5);
  for (let i = 0; i < n; i++) { off[i * 3] = rng() * patchSize; off[i * 3 + 1] = rng() * patchSize; off[i * 3 + 2] = rng(); }
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
  geo.instanceCount = n;
  const uCam = { value: new THREE.Vector3() };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x557a2e, roughness: 0.95, side: THREE.DoubleSide });
  patch(mat, 'grass', (sh) => {
    sh.uniforms.uCam = uCam; sh.uniforms.uP = { value: patchSize }; sh.uniforms.uMask = { value: mask.tex }; sh.uniforms.uB = { value: mask.bounds };
    sh.uniforms.uTime = G.time; sh.uniforms.uTerr = G.terr; sh.uniforms.uTB = G.terrB;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec3 aOff; uniform vec3 uCam; uniform float uP; uniform sampler2D uMask; uniform vec4 uB; uniform float uTime; uniform sampler2D uTerr; uniform vec4 uTB;
      varying float vGrassFade;`)
      .replace('#include <begin_vertex>', `
        vec2 cb = uCam.xz - uP * 0.5;
        vec2 wp = cb + mod(aOff.xy - cb, uP);
        float dist = length(wp - uCam.xz);
        vec2 plan = vec2(wp.x, -wp.y);
        float m = texture2D(uMask, (plan - uB.xy) / uB.zw).r;
        float hgt = (0.045 + 0.075 * aOff.z) * smoothstep(0.35, 0.8, m) * smoothstep(uP * 0.5, uP * 0.5 - 9.0, dist);
        float ang = aOff.z * 37.0;
        float ca = cos(ang), sa = sin(ang);
        vec3 transformed = vec3(position.x * ca, position.y * hgt, position.x * sa);
        float sway = sin(uTime * 2.1 + wp.x * 0.35 + wp.y * 0.21) * 0.5 + 0.5;
        transformed.x += position.y * position.y * hgt * (0.35 + 0.35 * sway);
        transformed.z += position.y * position.y * hgt * 0.2 * cos(ang * 1.3);
        transformed.xz += wp;
        transformed.y += texture2D(uTerr, (plan - uTB.xy) / uTB.zw).r;
        vGrassFade = aOff.z;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        vColor.rgb *= vec3(0.85 + 0.3 * fract(aOff.z * 13.7), 0.9 + 0.2 * fract(aOff.z * 7.3), 0.8);`);
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false;
  scene.add(mesh);
  return { mesh, update(cam) { uCam.value.copy(cam); mesh.visible = cam.y < 45; } };
}
