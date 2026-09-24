// Shader patching that composes with CSM, plus the bespoke facade / detail / wind patches.
import * as THREE from 'three';

// Mirror clip plane shared by every material: parked far away, moved to the water surface only while the lake reflection renders.
export const MIRROR_CLIP = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6);
export const G = { time: { value: 0 }, wind: { value: new THREE.Vector2(0.8, 0.3) }, terr: { value: null }, terrB: { value: new THREE.Vector4(0, 0, 1, 1) } }; // shared uniforms

export function patch(mat, key, fn) {
  (mat.userData.patches || (mat.userData.patches = [])).push(fn);
  mat.userData.key = (mat.userData.key || '') + '|' + key;
  return mat;
}

// Install CSM + patches on every standard material in the scene.
export function finalize(scene, csm) {
  const mats = new Set();
  scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => mats.add(m)); });
  for (const m of mats) {
    if (!m.isMeshStandardMaterial) continue;
    installMaterial(m, csm);
  }
}
export function installMaterial(m, csm) {
  if (m.userData.installed) return;
  m.userData.installed = true;
  m.clippingPlanes = [MIRROR_CLIP];
  const patches = m.userData.patches || [];
  let csmHook = null;
  if (csm) { csm.setupMaterial(m); csmHook = m.onBeforeCompile; }
  m.onBeforeCompile = (sh, r) => { if (csmHook) csmHook.call(m, sh, r); for (const p of patches) p(sh); };
  m.customProgramCacheKey = () => (m.userData.key || '') + (csm ? '|csm' : '');
  m.needsUpdate = true;
}

// Two-scale texturing: the same map sampled at k× breaks tiling and adds close-up detail.
// Optional tint: keep the scan's luminance detail but recolour it (a brown grass scan becomes a green October lawn).
export function addDetail(mat, k = 7.3, amt = 0.5, tint = null) {
  return patch(mat, 'detail' + k + amt + (tint ? 't' : ''), (sh) => {
    if (tint) { sh.uniforms.uTint = { value: tint.color }; sh.uniforms.uAvgL = { value: tint.avgL }; }
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + String.fromCharCode(10) + 'uniform vec3 uTint; uniform float uAvgL;').replace('#include <map_fragment>', `
      vec4 c1 = texture2D( map, vMapUv ); vec4 c2 = texture2D( map, vMapUv * ${k.toFixed(2)} ); vec4 c3 = texture2D( map, vMapUv * 0.137 );
      vec3 dm = mix( c1.rgb, c2.rgb, ${amt.toFixed(2)} ) * mix( 1.0, c3.g / max( c1.g, 0.02 ), 0.35 );
      ${tint ? 'diffuseColor.rgb *= uTint * clamp(dot(dm, vec3(0.2126, 0.7152, 0.0722)) / uAvgL, 0.0, 3.0);' : 'diffuseColor.rgb *= dm;'}`);
  });
}

const WORLD_VARY_V = `
varying vec3 vWPos; varying vec3 vWNrm;`;
const WORLD_VARY_V_MAIN = `
  #ifdef USE_INSTANCING
    vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif
  vWNrm = normalize(mat3(modelMatrix) * objectNormal);`;
function worldVaryings(sh) {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + WORLD_VARY_V).replace('#include <fog_vertex>', '#include <fog_vertex>' + WORLD_VARY_V_MAIN);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + WORLD_VARY_V);
}

// Facade: interior-mapped rooms behind glass, limestone base course, ground grime.
// Mask texture (roughnessMap): R = glass, G = roughness.
export function facadePatch(mat, { bay, floor, depth = 5.5, stone = 1, interior = 1, key, brick = null, lime = null }) {
  return patch(mat, 'facade' + key, (sh) => {
    worldVaryings(sh);
    sh.uniforms.uCell = { value: new THREE.Vector3(bay, floor, depth) };
    sh.uniforms.uStone = { value: stone };
    sh.uniforms.uInterior = { value: interior };
    sh.uniforms.uTerr = G.terr; sh.uniforms.uTB = G.terrB;
    const scanU = (p, s) => { sh.uniforms[p + 'D'] = { value: s?.scan.map || null }; sh.uniforms[p + 'N'] = { value: s?.scan.normal || null }; sh.uniforms[p + 'R'] = { value: s?.scan.rough || null }; sh.uniforms[p + 'K'] = { value: s ? s.tint.clone().multiply(new THREE.Color(1 / Math.max(s.scan.avg.r, 0.02), 1 / Math.max(s.scan.avg.g, 0.02), 1 / Math.max(s.scan.avg.b, 0.02))) : new THREE.Color(1, 1, 1) }; sh.uniforms[p + 'T'] = { value: s ? s.tile : 1 }; };
    scanU('uBk', brick); scanU('uLs', lime);
    sh.uniforms.uHasBk = { value: brick ? 1 : 0 }; sh.uniforms.uHasLs = { value: lime ? 1 : 0 };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D uBkD, uBkN, uBkR, uLsD, uLsN, uLsR; uniform vec3 uBkK, uLsK; uniform float uBkT, uLsT, uHasBk, uHasLs;
      uniform vec3 uCell; uniform float uStone; uniform float uInterior; uniform sampler2D uTerr; uniform vec4 uTB;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      vec3 roomColor(vec2 uv, vec3 V, vec3 N, float seed) {
        vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N));
        vec3 rd = vec3(dot(V, T) / uCell.x, V.y / uCell.y, max(dot(V, -N), 1e-3) / uCell.z);
        rd = sign(rd) * max(abs(rd), vec3(1e-4));
        vec2 cell = floor(uv) + seed;
        vec3 ro = vec3(fract(uv), 0.0);
        vec3 tt = (step(0.0, rd) - ro) / rd;
        float t = min(min(tt.x, tt.y), tt.z);
        vec3 hp = ro + rd * t;
        float r = h21(cell), r2 = h21(cell * 1.73 + 4.1), r3 = h21(cell * 0.61 + 9.7);
        float lit = step(0.42, r);
        vec3 wall = mix(vec3(0.62, 0.57, 0.48), vec3(0.72, 0.72, 0.7), r2);
        if (r3 > 0.85) wall = vec3(0.35, 0.42, 0.52);
        vec3 col;
        if (t == tt.z) {
          col = wall * 0.95;
          if (hp.y < 0.28 && abs(hp.x - 0.5 + (r2 - 0.5) * 0.3) < 0.28) col = vec3(0.18, 0.13, 0.09);      // desk / bed
          if (hp.y > 0.42 && hp.y < 0.78 && abs(hp.x - 0.25 - r3 * 0.5) < 0.12) col = mix(vec3(0.1, 0.1, 0.12), vec3(0.8, 0.7, 0.3), step(0.5, r2)); // screen / poster
          if (r3 < 0.25 && hp.y > 0.2 && hp.y < 0.9 && abs(hp.x - 0.82) < 0.08) col = vec3(0.07, 0.1, 0.25); // ND flag / door
        } else if (t == tt.y) {
          if (rd.y > 0.0) { col = vec3(0.86); vec2 q = abs(hp.xz - 0.5); if (q.x < 0.22 && q.y < 0.18) col = mix(vec3(0.5), vec3(2.2, 2.05, 1.8), lit); }
          else col = mix(vec3(0.22, 0.17, 0.12), vec3(0.35, 0.33, 0.32), r3);
        } else col = wall * 0.8;
        col *= 1.0 - hp.z * 0.45;
        vec3 light = mix(vec3(0.06, 0.07, 0.08), vec3(1.0, 0.86, 0.68), lit);
        vec3 res = col * light;
        // blinds / curtains dropping from the top
        float cover = step(0.55, r2) * (0.15 + 0.7 * h21(cell + 3.1));
        if (ro.y > 1.0 - cover) res = mix(vec3(0.7, 0.66, 0.58), vec3(0.2, 0.25, 0.4), step(0.8, r3)) * (0.35 + 0.65 * lit) * (0.85 + 0.15 * step(0.5, fract(ro.y * 38.0)));
        return res;
      }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec4 fMask = texture2D(roughnessMap, vRoughnessMapUv);
      float win = fMask.r;
      // scanned materials: brick where mask.b ≈ 1, limestone where ≈ 0.5 (world-metre UVs)
      vec2 wUv = vRoughnessMapUv * uCell.xy;
      float isBk = step(0.75, fMask.b) * uHasBk, isLs = step(0.3, fMask.b) * (1.0 - step(0.75, fMask.b)) * uHasLs;
      vec2 bkUv = wUv / uBkT, lsUv = wUv / uLsT;
      if (isBk > 0.5) diffuseColor.rgb = vColor * uBkK * texture2D(uBkD, bkUv).rgb;
      else if (isLs > 0.5) diffuseColor.rgb = vColor * uLsK * texture2D(uLsD, lsUv).rgb;
      vec3 roomCol = vec3(0.0);
      float cellPx = max(length(fwidth(vRoughnessMapUv)), 1e-4);
      float detailK = 1.0 - smoothstep(0.08, 0.35, cellPx);
      if (win > 0.02 && uInterior > 0.5) {
        vec3 V = normalize(vWPos - cameraPosition);
        vec3 rc = detailK > 0.01 ? roomColor(vRoughnessMapUv, V, normalize(vWNrm), dot(vColor, vec3(13.1, 7.7, 3.3))) : vec3(0.0);
        roomCol = mix(vec3(0.09, 0.08, 0.07), rc, detailK);
      }
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.014, 0.016), win);
      // limestone base course + ground grime
      float gy = vWPos.y - texture2D(uTerr, (vec2(vWPos.x, -vWPos.z) - uTB.xy) / uTB.zw).r;
      if (uStone > 0.5 && gy < 0.95 && abs(vWNrm.y) < 0.5) {
        float n = h21(floor(vWPos.xz * 3.0)) * 0.06;
        diffuseColor.rgb = vec3(0.80, 0.76, 0.66) - n - step(0.9, gy) * 0.08;
      }
      diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 2.2, gy));`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += roomCol * win * 0.55;`);
    sh.fragmentShader = sh.fragmentShader.replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
      'vec3 mapN = (isBk > 0.5 ? texture2D(uBkN, bkUv).xyz : isLs > 0.5 ? texture2D(uLsN, lsUv).xyz : texture2D( normalMap, vNormalMapUv ).xyz) * 2.0 - 1.0;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        if (isBk > 0.5) roughnessFactor = texture2D(uBkR, bkUv).g; else if (isLs > 0.5) roughnessFactor = texture2D(uLsR, lsUv).g;`);
  });
}

// Wind sway for instanced foliage: vertices above y≈2 bend with height.
export function windPatch(mat, strength = 0.35, key = '') {
  return patch(mat, 'wind' + strength + key, (sh) => {
    sh.uniforms.uTime = G.time; sh.uniforms.uWind = G.wind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.0);
        #endif
        float bend = max(0.0, position.y - 2.0) * ${strength.toFixed(3)} * 0.03;
        float ph = uTime * 1.3 + ip.x * 0.05 + ip.z * 0.07;
        transformed.x += (sin(ph) * 0.6 + sin(ph * 2.7 + position.x) * 0.25) * bend * uWind.x;
        transformed.z += (cos(ph * 0.8) * 0.6 + sin(ph * 3.1 + position.z) * 0.25) * bend * uWind.y * 1.5;`);
  });
}
