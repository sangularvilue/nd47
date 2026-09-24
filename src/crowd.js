// Crowd renderer: nearest people are real skinned Rocketbox avatars with their own clips;
// everyone else is the same avatar baked into idle / two stride poses, simplified and GPU-instanced.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bakePose, cloneAvatar, CLIPS } from './avatars.js';
import { TER } from './terrain.js';

export function makeCrowd(kit, people, scene, { near = 90, nearR = 45, farMax = 7000, farTris = 480 } = {}) {
  const names = Object.keys(kit.avatars).filter((n) => /Adult/.test(n));
  if (!names.length) return null;
  const rnd = (() => { let s = 99; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  // assign avatars + activities
  for (const P of people) {
    P.av = names[(rnd() * names.length) | 0];
    const sex = kit.avatars[P.av].sex, set = CLIPS[sex];
    P.clip = P.w ? set.walk[(rnd() * set.walk.length) | 0] : rnd() < 0.55 ? set.social[(rnd() * set.social.length) | 0] : set.idle[(rnd() * set.idle.length) | 0];
    P.t0 = rnd() * 10;
  }
  // ---- far LOD buckets: [avatar][pose] → instanced meshes sharing one matrix buffer
  const POSES = 3; // 0 idle, 1 stride A, 2 stride B
  const far = {};
  for (const n of names) {
    const av = kit.avatars[n], set = CLIPS[av.sex];
    const walk = kit.clips[set.walk[0]], idle = kit.clips[set.idle[0]];
    far[n] = [];
    for (let p = 0; p < POSES; p++) {
      const clip = p === 0 ? idle : walk, t = p === 0 ? 0.5 : clip ? clip.duration * (p === 1 ? 0.12 : 0.62) : 0;
      const parts = bakePose(av, clip, t, farTris);
      let first = null; const meshes = [];
      for (const [k, geos] of Object.entries(parts)) {
        const g = geos.length > 1 ? mergeGeometries(geos) : geos[0];
        const im = new THREE.InstancedMesh(g, av.mats[k], farMax);
        if (first) im.instanceMatrix = first.instanceMatrix; else { first = im; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
        im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
        scene.add(im); meshes.push(im);
      }
      far[n].push({ meshes, first, n: 0 });
    }
  }
  // ---- near pool of skinned clones
  const pool = [];
  const group = new THREE.Group(); scene.add(group);
  const acquire = (P) => {
    let it = pool.find((q) => !q.P && q.av === P.av);
    if (!it) {
      if (pool.length >= near + 20) { it = pool.find((q) => !q.P); if (it) { group.remove(it.obj); pool.splice(pool.indexOf(it), 1); } }
      const obj = cloneAvatar(kit.avatars[P.av]);
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      it = { av: P.av, obj, mixer: new THREE.AnimationMixer(obj), action: null, clip: null, P: null };
      pool.push(it); group.add(it.obj);
    }
    it.P = P; P.near = it; it.obj.visible = true;
    if (it.clip !== P.clip) {
      it.mixer.stopAllAction();
      const c = kit.clips[P.clip];
      it.action = c ? it.mixer.clipAction(c).play() : null;
      it.clip = P.clip;
      if (it.action) it.action.time = P.t0 % (c.duration || 1);
    }
    if (it.action) it.action.timeScale = P.w ? P.w.speed / 1.25 : 1;
  };
  const release = (it) => { if (it.P) it.P.near = null; it.P = null; it.obj.visible = false; };

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let sortT = 1e9, farR2 = 700 * 700, time = 0;
  const visible = [];
  function update(dt, cam) {
    time += dt;
    const cx = cam.x, cy = -cam.z;
    sortT += dt;
    if (sortT > 0.4) {
      sortT = 0;
      const cand = [];
      visible.length = 0;
      for (const P of people) {
        const dx = P.x - cx, dy = P.y - cy, d2 = dx * dx + dy * dy;
        P.d2 = d2;
        if (d2 < nearR * nearR) cand.push(P);
        if (d2 < farR2) visible.push(P);
      }
      // adapt far radius to the budget
      if (visible.length > farMax) farR2 *= 0.85; else if (visible.length < farMax * 0.7 && farR2 < 1500 * 1500) farR2 *= 1.1;
      cand.sort((a, b) => a.d2 - b.d2);
      const want = new Set(cand.slice(0, near));
      for (const it of pool) if (it.P && !want.has(it.P)) release(it);
      for (const P of want) if (!P.near) acquire(P);
    }
    // near: follow + animate
    for (const it of pool) {
      if (!it.P) continue;
      const P = it.P;
      it.obj.position.set(P.x, TER.h(P.x, P.y), -P.y); it.obj.rotation.y = P.h; it.obj.scale.setScalar(P.s);
      it.mixer.update(dt);
    }
    // far: rebuild instance buffers
    for (const n in far) for (const b of far[n]) b.n = 0;
    for (const P of visible) {
      if (P.near) continue;
      const bucket = far[P.av]; if (!bucket) continue;
      const pose = P.w ? 1 + ((Math.floor((time + P.t0) * 1.7 * P.w.speed) & 1)) : 0;
      const b = bucket[pose];
      if (b.n >= farMax) continue;
      m4.compose(p3.set(P.x, P.gy ?? (P.gy = TER.h(P.x, P.y)), -P.y), q.setFromAxisAngle(up, P.h), s3.setScalar(P.s));
      if (P.w) m4.elements[13] = TER.h(P.x, P.y);
      b.first.setMatrixAt(b.n++, m4);
    }
    for (const n in far) for (const b of far[n]) { for (const m of b.meshes) m.count = b.n; b.first.instanceMatrix.needsUpdate = true; }
  }
  return { update, poolSize: () => pool.length };
}
