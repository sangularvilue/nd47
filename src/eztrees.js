// Realistic trees: EZ-Tree (MIT, https://github.com/dgreenheck/ez-tree) variants generated at load.
// Near trees are the real branch + leaf meshes (instanced); far trees are 8-view baked imposters.
// Leaves are baked greyscale so each instance gets its own October colour.
import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';
import { patch, windPatch, G } from './materials.js';
import { TER } from './terrain.js';
import { hash1 } from './geo.js';

const VARIANTS = [
  { preset: 'Oak Medium', seed: 35729, h: 15, dec: 1 }, { preset: 'Oak Medium', seed: 1207, h: 13, dec: 1 }, { preset: 'Oak Large', seed: 23399, h: 19, dec: 1 },
  { preset: 'Ash Medium', seed: 911, h: 16, dec: 1 }, { preset: 'Aspen Medium', seed: 4242, h: 14, dec: 1 },
  { preset: 'Pine Medium', seed: 77, h: 15, dec: 0 }, { preset: 'Pine Large', seed: 1901, h: 19, dec: 0 },
];
const AUTUMN = [['#6a9a3a', 10], ['#557f2e', 8], ['#86a33c', 7], ['#a8a83a', 6], ['#e0b52c', 10], ['#f0c93e', 7], ['#ee9324', 10], ['#e06a1c', 9], ['#c8401c', 8], ['#a32a1a', 5], ['#b07a30', 3]];
const AT = AUTUMN.reduce((s, a) => s + a[1], 0);
const pickCol = (r) => { let x = r * AT; for (const [c, w] of AUTUMN) if ((x -= w) <= 0) return c; return AUTUMN[0][0]; };
const FRAMES = 8;

// Greyscale leaves ×(instance colour); spherical canopy normals are baked into the geometry.
function leafMaterial(map, alphaTest) {
  const m = new THREE.MeshStandardMaterial({ map, alphaTest, side: THREE.DoubleSide, roughness: 0.72, envMapIntensity: 0.55 });
  patch(m, 'leafGrey', (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
      vec4 lt = texture2D(map, vMapUv);
      diffuseColor.a *= lt.a;
      diffuseColor.rgb *= vec3(pow(dot(lt.rgb, vec3(0.3, 0.59, 0.11)), 0.8) * 2.5);`);
  });
  return windPatch(m, 0.9, 'ezleaf');
}

function buildVariant(v, i) {
  const t = new Tree(); t.loadPreset(v.preset); t.options.seed = v.seed;
  if (v.dec) t.options.leaves.count = Math.round(t.options.leaves.count * 1.5); // fuller mature campus crowns
  t.generate();
  const box = new THREE.Box3().setFromObject(t), size = box.getSize(new THREE.Vector3());
  const k = v.h / size.y;
  const prep = (g) => { g = g.clone(); g.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2); g.scale(k, k, k); g.computeBoundingSphere(); return g; };
  const branches = prep(t.branchesMesh.geometry), leaves = prep(t.leavesMesh.geometry);
  // soft canopy lighting: leaf normals point out from the crown centre
  { leaves.computeBoundingBox(); const c = leaves.boundingBox.getCenter(new THREE.Vector3()); const p = leaves.attributes.position, n = leaves.attributes.normal, q = new THREE.Vector3();
    for (let j = 0; j < p.count; j++) { q.set(p.getX(j) - c.x, (p.getY(j) - c.y) * 1.2, p.getZ(j) - c.z).normalize(); n.setXYZ(j, q.x, q.y, q.z); } n.needsUpdate = true; }
  const bm = t.branchesMesh.material, lm = t.leavesMesh.material;
  const bark = new THREE.MeshStandardMaterial({ map: bm.map, normalMap: bm.normalMap, roughnessMap: bm.roughnessMap, roughness: 1, color: bm.color ? bm.color.clone() : 0xffffff });
  const leaf = leafMaterial(lm.map, lm.alphaTest || 0.5);
  return { ...v, i, branches, leaves, bark, leaf, w: Math.max(size.x, size.z) * k, hgt: v.h, tris: (branches.index.count + leaves.index.count) / 3 };
}

// Bake albedo (leaves greyscale) + leaf mask from FRAMES azimuths into one atlas row.
function bakeImposter(renderer, V, res) {
  const scene = new THREE.Scene();
  const unlitLeaf = new THREE.MeshBasicMaterial({ map: V.leaf.map, alphaTest: V.leaf.alphaTest, side: THREE.DoubleSide });
  patch(unlitLeaf, 'bakeLeaf', (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', 'vec4 lt = texture2D(map, vMapUv); diffuseColor.a *= lt.a; diffuseColor.rgb *= vec3(pow(dot(lt.rgb, vec3(0.3,0.59,0.11)), 0.8) * 2.5);'); });
  unlitLeaf.onBeforeCompile = (sh) => unlitLeaf.userData.patches.forEach((p) => p(sh)); unlitLeaf.customProgramCacheKey = () => 'bakeLeaf';
  const unlitBark = new THREE.MeshBasicMaterial({ map: V.bark.map, color: V.bark.color });
  const maskLeaf = new THREE.MeshBasicMaterial({ map: V.leaf.map, alphaTest: V.leaf.alphaTest, side: THREE.DoubleSide, color: 0xffffff });
  maskLeaf.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', 'vec4 lt = texture2D(map, vMapUv); diffuseColor.a *= lt.a;'); }; maskLeaf.customProgramCacheKey = () => 'maskLeaf';
  const maskBark = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const b = new THREE.Mesh(V.branches, unlitBark), l = new THREE.Mesh(V.leaves, unlitLeaf);
  scene.add(b, l);
  const W = res * FRAMES, H = Math.round(res * (V.hgt / V.w) * 1.0) || res;
  const mk = () => { const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace; return rt; };
  const albedo = mk(), mask = mk();
  const half = V.w * 0.52;
  const cam = new THREE.OrthographicCamera(-half, half, V.hgt * 1.02, 0, 0.1, 400);
  const prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), prevTM = renderer.toneMapping;
  const prevVP = renderer.getViewport(new THREE.Vector4()), prevSC = renderer.getScissor(new THREE.Vector4());
  renderer.toneMapping = THREE.NoToneMapping;
  const prevOCS = renderer.outputColorSpace;
  for (const [rt, lMat, bMat, clear] of [[albedo, unlitLeaf, unlitBark, 0x5a6a3a], [mask, maskLeaf, maskBark, 0x000000]]) {
    l.material = lMat; b.material = bMat;
    renderer.setRenderTarget(rt); renderer.setClearColor(clear, 0); renderer.clear();
    for (let f = 0; f < FRAMES; f++) {
      const a = (f / FRAMES) * Math.PI * 2;
      cam.position.set(Math.sin(a) * 150, 0, Math.cos(a) * 150); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
      renderer.setViewport(f * res, 0, res, H); renderer.setScissor(f * res, 0, res, H); renderer.setScissorTest(true);
      renderer.render(scene, cam);
    }
  }
  renderer.setScissorTest(false); renderer.setRenderTarget(null); renderer.setViewport(prevVP); renderer.setScissor(prevSC); renderer.setClearColor(prevClear, prevA); renderer.toneMapping = prevTM; renderer.outputColorSpace = prevOCS;
  for (const t of [albedo.texture, mask.texture]) { t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; }
  return { albedo: albedo.texture, mask: mask.texture };
}

// Cylindrical billboard picking the frame nearest to the view azimuth (shared by colour + shadow passes).
const BILLBOARD = `
  vec3 ipos = instanceMatrix[3].xyz;
  float isc = length(instanceMatrix[0].xyz);
  float iyaw = atan(instanceMatrix[0].z, instanceMatrix[0].x);
  vec2 toCam = cameraPosition.xz - ipos.xz;
  float az = atan(toCam.x, toCam.y) + iyaw;
  float fr = mod(floor(az / 6.2831853 * ${FRAMES}.0 + 0.5), ${FRAMES}.0);
  vec3 right = normalize(vec3(toCam.y, 0.0, -toCam.x));
  vec3 wp = ipos + right * position.x * uSize.x * isc + vec3(0.0, position.y * uSize.y * isc, 0.0);
  vImpUv = vec2((fr + position.x + 0.5) / ${FRAMES}.0, position.y);
`;
function imposterMaterial(atlas, size) {
  const m = new THREE.MeshStandardMaterial({ map: atlas.albedo, alphaTest: 0.5, roughness: 0.8, side: THREE.DoubleSide });
  const uSize = { value: new THREE.Vector2(size[0], size[1]) };
  patch(m, 'imposter' + size.join(','), (sh) => {
    sh.uniforms.uSize = uSize; sh.uniforms.uMask = { value: atlas.mask };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uSize; varying vec2 vImpUv; varying float vImpShade;')
      .replace('#include <project_vertex>', BILLBOARD + `
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vImpShade = 0.55 + 0.45 * position.y;`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n objectNormal = vec3(0.0, 0.6, 0.8);')
      .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalize(mat3(viewMatrix) * normalize(vec3(cameraPosition.x - instanceMatrix[3].x, 18.0, cameraPosition.z - instanceMatrix[3].z)));');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uMask; varying vec2 vImpUv; varying float vImpShade;')
      .replace('#include <map_fragment>', `
        vec4 ac = texture2D(map, vImpUv);
        float lm = texture2D(uMask, vImpUv).r;
        diffuseColor.a *= ac.a;
        vec3 tint = mix(vec3(1.0), vColor, lm);
        diffuseColor.rgb = ac.rgb * tint * vImpShade;`)
      .replace('#include <color_fragment>', '');
  });
  m.vertexColors = false;
  // shadow caster: same billboard, seen from the light
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas.albedo, alphaTest: 0.5, side: THREE.DoubleSide });
  d.onBeforeCompile = (sh) => {
    sh.uniforms.uSize = uSize;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uSize; varying vec2 vImpUv;')
      .replace('#include <project_vertex>', BILLBOARD + 'vec4 mvPosition = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mvPosition;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vImpUv;').replace('#include <map_fragment>', 'vec4 sampledDiffuseColor = texture2D(map, vImpUv); diffuseColor *= sampledDiffuseColor;');
  };
  d.customProgramCacheKey = () => 'impDepth' + size.join(',');
  return { m, d };
}

export async function buildEzTrees(list, scene, renderer, { nearR = 140, nearMax = 600, res = 256 } = {}) {
  const V = [];
  for (let i = 0; i < VARIANTS.length; i++) { V.push(buildVariant(VARIANTS[i], i)); await new Promise((r) => setTimeout(r, 0)); }
  const quad = new THREE.PlaneGeometry(1, 1); quad.translate(0, 0.5, 0);
  const color = new THREE.Color();
  for (const v of V) {
    v.atlas = bakeImposter(renderer, v, res);
    const cap = list.length;
    v.nearB = new THREE.InstancedMesh(v.branches, v.bark, nearMax); v.nearL = new THREE.InstancedMesh(v.leaves, v.leaf, nearMax);
    v.nearL.instanceMatrix = v.nearB.instanceMatrix;
    const im = imposterMaterial(v.atlas, [v.w, v.hgt]);
    v.far = new THREE.InstancedMesh(quad, im.m, cap); v.far.customDepthMaterial = im.d;
    v.far.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    v.nearL.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nearMax * 3), 3);
    for (const m of [v.nearB, v.nearL, v.far]) { m.count = 0; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; scene.add(m); }
    v.far.material.userData.instColor = true;
  }
  const dec = V.filter((v) => v.dec), con = V.filter((v) => !v.dec);
  const trees = list.map((t, i) => {
    const r = hash1(i * 7 + 13), vs = t[3] ? con : dec, v = vs[(hash1(i * 3 + 5) * vs.length) | 0];
    const s = t[2] * (0.85 + r * 0.3);
    const c = t[3] ? color.set('#2f4f2a').offsetHSL(0, 0, (r - 0.5) * 0.08).clone() : color.set(pickCol(hash1(i * 3 + 1))).clone();
    return { x: t[0], y: t[1], v, s, yaw: r * Math.PI * 2, c, gy: TER.h(t[0], t[1]) - 0.15 };
  });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let sortT = 1e9;
  function update(dt, cam) {
    sortT += dt; if (sortT < 0.12) return; sortT = 0;
    for (const v of V) { v.nn = 0; v.nf = 0; }
    const cx = cam.x, cz = cam.z, R2 = nearR * nearR;
    let near = 0;
    for (const t of trees) {
      const dx = t.x - cx, dz = -t.y - cz, d2 = dx * dx + dz * dz;
      m4.compose(p.set(t.x, t.gy, -t.y), q.setFromAxisAngle(up, t.yaw), sc.setScalar(t.s));
      const v = t.v;
      if (d2 < 42 && cam.y - t.gy < 22) continue;
      if (d2 < R2 && v.nn < nearMax && near < nearMax * 2) { v.nearB.setMatrixAt(v.nn, m4); v.nearL.setColorAt(v.nn, t.c); v.nn++; near++; }
      else { v.far.setMatrixAt(v.nf, m4); v.far.setColorAt(v.nf, t.c); v.nf++; }
    }
    for (const v of V) {
      v.nearB.count = v.nearL.count = v.nn; v.far.count = v.nf;
      v.nearB.instanceMatrix.needsUpdate = true; v.nearL.instanceColor.needsUpdate = true; v.far.instanceMatrix.needsUpdate = true; v.far.instanceColor.needsUpdate = true;
    }
  }
  return { update, variants: V.map((v) => `${v.preset}#${v.seed} ${Math.round(v.tris / 1000)}k tris`) };
}
