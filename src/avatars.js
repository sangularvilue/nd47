// Microsoft Rocketbox avatars (MIT) — loading, clip prep, and baked low-poly poses for far crowds.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

export const KIT = {
  fans: [['Male_Adult_01', 'm'], ['Male_Adult_02', 'm'], ['Male_Adult_03', 'm'], ['Male_Adult_05', 'm'], ['Male_Adult_08', 'm'], ['Male_Adult_11', 'm'],
    ['Female_Adult_01', 'f'], ['Female_Adult_02', 'f'], ['Female_Adult_04', 'f'], ['Female_Adult_06', 'f'], ['Female_Adult_09', 'f'], ['Female_Adult_12', 'f']],
  staff: [['Police_Male_01', 'm'], ['Security_Male_01', 'm']],
  vip: [['Business_Male_01', 'm'], ['Business_Female_01', 'f']],
};
export const CLIPS = {
  m: { walk: ['m_walk_neutral_01', 'm_walk_neutral_02'], idle: ['m_idle_neutral_01', 'm_idle_neutral_03'], social: ['m_gestic_talk_relaxed_01', 'm_drink_drinking', 'm_cheer_01', 'm_claphands_01', 'm_cell_phone_textmessage'], run: ['m_run_neutral_01'] },
  f: { walk: ['f_walk_neutral_01', 'f_walk_neutral_02'], idle: ['f_idle_neutral_01', 'f_idle_neutral_03'], social: ['f_gestic_talk_relaxed_01', 'f_drink_drinking', 'f_cheer_02', 'f_claphands_01', 'f_cell_phone_textmessage'], run: ['m_run_neutral_01'] },
};

export async function loadKit(onProgress) {
  const gl = new GLTFLoader(), tl = new THREE.TextureLoader();
  const all = [...KIT.fans, ...KIT.staff, ...KIT.vip];
  const clipNames = [...new Set(Object.values(CLIPS).flatMap((g) => Object.values(g).flat()))];
  let done = 0; const total = all.length + clipNames.length;
  const tick = () => onProgress?.(++done, total);
  const tex = (name, f, srgb = true) => tl.loadAsync(`assets/people/${name}/${f}`).then((t) => { t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }).catch(() => null);
  const avatars = {};
  await Promise.all(all.map(async ([name, sex]) => {
    try {
      const [g, body, head, op] = await Promise.all([gl.loadAsync(`assets/people/${name}.glb`), tex(name, 'body.jpg'), tex(name, 'head.jpg'), tex(name, 'opacity.webp')]);
      const mats = {
        body: new THREE.MeshStandardMaterial({ map: body, roughness: 0.78 }),
        head: new THREE.MeshStandardMaterial({ map: head, roughness: 0.6 }),
        opacity: new THREE.MeshStandardMaterial({ map: op, roughness: 0.7, alphaTest: 0.5, side: THREE.DoubleSide }),
      };
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        const k = /opacity/.test(o.material.name) ? 'opacity' : /head/.test(o.material.name) ? 'head' : 'body';
        o.material = mats[k]; o.userData.part = k; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      });
      avatars[name] = { name, sex, scene: g.scene, mats };
    } catch (e) { console.warn('avatar failed', name, e); }
    tick();
  }));
  const clips = {};
  await Promise.all(clipNames.map(async (c) => {
    try {
      const g = await gl.loadAsync(`assets/people/anim/${c}.glb`);
      const clip = g.animations[0];
      clip.tracks = clip.tracks.filter((t) => !/MotionExtractionHelper|Footsteps/.test(t.name));
      // walks are motion-extracted in XY; drop any residual horizontal drift of the root so paths drive position
      for (const t of clip.tracks) if (t.name === 'Bip01.position') { const v = t.values; const x0 = v[0], z0 = v[2]; for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; } }
      clip.name = c; clips[c] = clip;
    } catch (e) { console.warn('clip failed', c); }
    tick();
  }));
  await MeshoptSimplifier.ready;
  return { avatars, clips };
}

// Bake an avatar in a clip pose into static, simplified geometry per material part.
export function bakePose(av, clip, t, targetTris = 600) {
  const root = SkeletonUtils.clone(av.scene);
  if (clip) { const mixer = new THREE.AnimationMixer(root); mixer.clipAction(clip).play(); mixer.update(t); }
  root.updateMatrixWorld(true);
  const parts = {};
  const v = new THREE.Vector3();
  let totalTris = 0;
  const meshes = [];
  root.traverse((o) => { if (o.isSkinnedMesh || o.isMesh) meshes.push(o); });
  for (const m of meshes) totalTris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  for (const m of meshes) {
    const g = m.geometry, n = g.attributes.position.count;
    if (m.isSkinnedMesh) m.skeleton.update();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      if (m.isSkinnedMesh) m.getVertexPosition(i, v); else v.fromBufferAttribute(g.attributes.position, i);
      v.applyMatrix4(m.matrixWorld);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    }
    let index = g.index ? new Uint32Array(g.index.array) : Uint32Array.from({ length: n }, (_, i) => i);
    const part = m.userData.part || 'body';
    const share = index.length / 3 / totalTris;
    const want = Math.max(24, Math.floor(targetTris * share * (part === 'opacity' ? 0.6 : 1))) * 3;
    if (want < index.length) {
      const [simp] = MeshoptSimplifier.simplifySloppy(index, pos, 3, null, want, 0.02);
      if (simp.length >= 36) index = simp;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('uv', g.attributes.uv.clone());
    out.setIndex(new THREE.BufferAttribute(index, 1));
    out.computeVertexNormals();
    (parts[part] = parts[part] || []).push(out);
  }
  return parts;
}
export const cloneAvatar = (av) => SkeletonUtils.clone(av.scene);
