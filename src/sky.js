// Preetham sky + a drifting fair-weather cumulus layer.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export function makeSky(scene, renderer, sunDir) {
  const sky = new Sky(); sky.scale.setScalar(8000);
  const su = sky.material.uniforms;
  su.turbidity.value = 2.2; su.rayleigh.value = 2.0; su.mieCoefficient.value = 0.0025; su.mieDirectionalG.value = 0.85;
  su.sunPosition.value.copy(sunDir);
  scene.add(sky);

  const cloudMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
    uniforms: { uSun: { value: sunDir.clone() }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.9999; }`,
    fragmentShader: `
      uniform vec3 uSun; uniform float uTime; varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir);
        if (d.y < 0.015) discard;
        vec2 p = d.xz / (d.y + 0.08) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
        float n = fbm(p);
        float cov = smoothstep(0.52, 0.78, n);
        float thick = smoothstep(0.52, 0.95, n);
        // light: sun-facing puffs bright, dense cores grey-blue
        float sunAmt = clamp(dot(d, normalize(uSun)) * 0.5 + 0.5, 0.0, 1.0);
        float nl = fbm(p + normalize(uSun.xz) * 0.08);
        float lit = clamp(0.55 + (n - nl) * 4.0, 0.0, 1.0);
        vec3 col = mix(vec3(0.55, 0.6, 0.68), vec3(1.05, 1.0, 0.95), lit) * mix(0.9, 1.25, sunAmt);
        col = mix(col, vec3(0.45, 0.5, 0.58), thick * 0.35);
        float horizon = smoothstep(0.015, 0.2, d.y);
        gl_FragColor = vec4(col * 1.6, cov * horizon * 0.92);
      }`,
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(7000, 48, 24), cloudMat);
  clouds.renderOrder = -1;
  scene.add(clouds);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const s2 = new THREE.Scene(); const sk = new Sky(); sk.scale.setScalar(1000);
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) sk.material.uniforms[k].value = su[k].value;
  sk.material.uniforms.sunPosition.value.copy(sunDir); s2.add(sk);
  const env = pmrem.fromScene(s2, 0).texture;
  return { sky, clouds, env, update(dt, camPos) { cloudMat.uniforms.uTime.value += dt; clouds.position.copy(camPos); sky.position.copy(camPos); } };
}
