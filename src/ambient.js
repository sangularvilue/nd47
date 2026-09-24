// Ambient life: falling autumn leaves around the camera, foundation shrubs, lakeshore reeds.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patch, windPatch, G } from './materials.js';
import { TER } from './terrain.js';
import { mulberry, outset } from './geo.js';

const campusLike = (x, y) => x > -690 && x < 1070 && y > -1010 && y < 1030;

// Leaves drift down inside a box that follows the camera; each leaf loops on its own phase.
export function buildFallingLeaves(scene, T, count = 900) {
  const quad = new THREE.PlaneGeometry(0.12, 0.12);
  const geo = new THREE.InstancedBufferGeometry().copy(quad);
  const off = new Float32Array(count * 4), col = new Float32Array(count * 3);
  const rng = mulberry(11), pal = ['#d0a52a', '#dd8a26', '#cc621e', '#b53d1d', '#912a1c', '#9a6a2e', '#6f9038'];
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    off.set([rng(), rng(), rng(), rng()], i * 4);
    c.set(pal[(rng() * pal.length) | 0]); col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
  geo.instanceCount = count;
  const uCam = { value: new THREE.Vector3() };
  const mat = new THREE.MeshStandardMaterial({ map: T.leaf, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
  patch(mat, 'fallingLeaves', (sh) => {
    sh.uniforms.uCam = uCam; sh.uniforms.uTime = G.time; sh.uniforms.uTerr = G.terr; sh.uniforms.uTB = G.terrB;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 aOff; attribute vec3 aCol; uniform vec3 uCam; uniform float uTime; uniform sampler2D uTerr; uniform vec4 uTB; varying vec3 vLeafCol;`)
      .replace('#include <begin_vertex>', `
        const float BOX = 46.0, H = 16.0;
        vec2 cb = uCam.xz - BOX * 0.5;
        vec2 xz = cb + mod(aOff.xy * BOX - cb, BOX);
        float t = uTime * (0.25 + aOff.z * 0.2) + aOff.w * 10.0;
        float fall = fract(t / 6.0);
        float g = texture2D(uTerr, (vec2(xz.x, -xz.y) - uTB.xy) / uTB.zw).r;
        xz += vec2(sin(t * 1.7 + aOff.x * 20.0), cos(t * 1.3 + aOff.y * 20.0)) * 0.9 + vec2(0.8, 0.3) * fall * 3.0;
        float y = g + H * (1.0 - fall);
        float a = t * 3.0, b = t * 2.3;
        mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cos(a), sin(a), 0.0, -sin(a), cos(a));
        mat3 ry = mat3(cos(b), 0.0, -sin(b), 0.0, 1.0, 0.0, sin(b), 0.0, cos(b));
        vec3 transformed = ry * rx * position + vec3(xz.x, y, xz.y);
        vLeafCol = aCol;`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n objectNormal = vec3(0.0, 1.0, 0.0);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLeafCol;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= vLeafCol * 1.6;');
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.castShadow = false;
  scene.add(mesh);
  return { mesh, update(cam) { uCam.value.copy(cam); mesh.visible = cam.y - TER.h(cam.x, -cam.z) < 60; } };
}

// Low clipped shrubs in beds along the walls of campus buildings, and reeds along lake edges.
export function buildUndergrowth(data, scene, T) {
  const rng = mulberry(404);
  const shrubs = [], reeds = [];
  for (const b of data.buildings) {
    if (b.part || b.k !== 0 || b.bt === 'roof' || b.a < 250 || !campusLike(b.c[0], b.c[1]) || b.n === 'Notre Dame Stadium') continue;
    const ring = outset(b.o, 1.1);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 4) continue;
      for (let s = 1.5; s < L - 1.5; s += 1.4 + rng() * 0.8) {
        if (rng() < 0.28) continue; // gaps for doors and walks
        shrubs.push([a[0] + (c[0] - a[0]) * s / L, a[1] + (c[1] - a[1]) * s / L, 0.8 + rng() * 0.5]);
      }
    }
  }
  for (const w of data.areas) {
    if (w.t !== 'water' || w.o.length < 12) continue;
    for (let i = 0; i < w.o.length; i++) {
      const a = w.o[i], c = w.o[(i + 1) % w.o.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      for (let s = 0; s < L; s += 2.2) if (rng() < 0.35) reeds.push([a[0] + (c[0] - a[0]) * s / L + (rng() - 0.5), a[1] + (c[1] - a[1]) * s / L + (rng() - 0.5), 0.8 + rng() * 0.6]);
    }
  }
  // shrub: a few leaf cards around a small core
  const parts = [];
  for (let k = 0; k < 7; k++) { const p = new THREE.PlaneGeometry(1.0, 0.9); p.rotateY((k / 7) * Math.PI); p.rotateX((rng() - 0.5) * 0.6); p.translate((rng() - 0.5) * 0.4, 0.5, (rng() - 0.5) * 0.4); parts.push(p); }
  const shrubG = mergeGeometries(parts);
  const sn = shrubG.attributes.normal, sp = shrubG.attributes.position;
  for (let i = 0; i < sn.count; i++) { const v = new THREE.Vector3(sp.getX(i), sp.getY(i) - 0.2, sp.getZ(i)).normalize(); sn.setXYZ(i, v.x, v.y, v.z); }
  const shrubM = windPatch(new THREE.MeshStandardMaterial({ map: T.leaf, alphaTest: 0.45, side: THREE.DoubleSide, color: 0x6f8f45, roughness: 0.85 }), 0.3, 'shrub');
  // reeds: crossed thin blades
  const rparts = [];
  for (let k = 0; k < 9; k++) { const p = new THREE.PlaneGeometry(0.05, 1.4); p.translate(0, 0.7, 0); p.rotateZ((rng() - 0.5) * 0.35); p.rotateY(rng() * Math.PI); p.translate((rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5); rparts.push(p); }
  const reedG = mergeGeometries(rparts);
  const reedM = windPatch(new THREE.MeshStandardMaterial({ color: 0x8a8a4a, side: THREE.DoubleSide, roughness: 0.9 }), 1.5, 'reed');
  const place = (geo, mat, list, yOff, tint) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    list.forEach(([x, y, sc], i) => {
      im.setMatrixAt(i, m4.compose(p.set(x, TER.h(x, y) + yOff, -y), q.setFromAxisAngle(up, rng() * 6.28), s.set(sc, sc * (0.8 + rng() * 0.4), sc)));
      if (tint) im.setColorAt(i, col.setHSL(tint[0] + (rng() - 0.5) * 0.05, tint[1], tint[2] + (rng() - 0.5) * 0.1));
    });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im);
  };
  place(shrubG, shrubM, shrubs, -0.05, [0.26, 0.4, 0.5]);
  place(reedG, reedM, reeds, -0.3, [0.15, 0.35, 0.55]);
  return { shrubs: shrubs.length, reeds: reeds.length };
}
