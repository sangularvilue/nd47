// Depth-based atmosphere (post effect): exponential height fog + Mie-ish sun in-scattering.
// Works with the logarithmic depth buffer: w = 2^(depth·log2(far+1)) − 1 is the view distance along the axis.
import * as THREE from 'three';
import { Effect, EffectAttribute } from 'postprocessing';

export class AtmosphereEffect extends Effect {
  constructor(camera, sunDir, { density = 0.0014, falloff = 80, haze = new THREE.Color(0xb4b7b4), sun = new THREE.Color(0xf7c28c), groundY = 0 } = {}) {
    super('AtmosphereEffect', `
      uniform mat4 uProjInv; uniform mat4 uCamWorld; uniform vec3 uCamPos; uniform vec3 uSun; uniform float uFar;
      uniform float uDensity; uniform float uFalloff; uniform vec3 uHaze; uniform vec3 uSunCol; uniform float uGround; uniform float uDebug;
      void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
        float rawD = texture2D(depthBuffer, uv).r; // raw log depth (the passed depth is linearised for perspective buffers)
        float w = exp2(rawD * log2(uFar + 1.0)) - 1.0;
        vec4 vd = uProjInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0); vec3 dv = normalize(vd.xyz / vd.w);
        vec3 dir = normalize((uCamWorld * vec4(dv, 0.0)).xyz);
        float dist = w / max(-dv.z, 1e-3);
        if (uDebug > 0.5) { outputColor = vec4(vec3(fract(rawD * 10.0)), 1.0); if (uDebug > 1.5) outputColor = vec4(vec3(depth), 1.0); return; }
        if (rawD > 0.99999) { outputColor = inputColor; return; }
        // integral of d0·exp(−(y−g)/H) along the ray
        float h0 = uCamPos.y - uGround, dy = dir.y * dist;
        float e0 = exp(-h0 / uFalloff);
        float od = abs(dy) > 0.01 ? uDensity * uFalloff * e0 * (1.0 - exp(-dy / uFalloff)) / dir.y : uDensity * e0 * dist;
        od += dist * 0.00021 * step(1e-6, uDensity); // aerosol: ~35% at 2 km, the campus edge fades into haze
        float fog = 1.0 - exp(-max(od, 0.0));
        float mu = max(dot(dir, uSun), 0.0);
        vec3 col = mix(uHaze, uSunCol, pow(mu, 6.0) * 0.85 + pow(mu, 48.0) * 0.6);
        outputColor = vec4(mix(inputColor.rgb, col, fog), inputColor.a);
      }`, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ['uProjInv', new THREE.Uniform(new THREE.Matrix4())], ['uCamWorld', new THREE.Uniform(new THREE.Matrix4())], ['uCamPos', new THREE.Uniform(new THREE.Vector3())],
        ['uSun', new THREE.Uniform(sunDir.clone().normalize())], ['uFar', new THREE.Uniform(camera.far)], ['uDensity', new THREE.Uniform(density)], ['uFalloff', new THREE.Uniform(falloff)],
        ['uHaze', new THREE.Uniform(haze)], ['uSunCol', new THREE.Uniform(sun)], ['uGround', new THREE.Uniform(groundY)], ['uDebug', new THREE.Uniform(0)],
      ]),
    });
    this.cam = camera;
  }
  update() {
    const u = this.uniforms, c = this.cam;
    u.get('uProjInv').value.copy(c.projectionMatrixInverse); u.get('uCamWorld').value.copy(c.matrixWorld);
    u.get('uCamPos').value.setFromMatrixPosition(c.matrixWorld); u.get('uFar').value = c.far;
  }
}
