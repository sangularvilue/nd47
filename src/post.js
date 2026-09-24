// Post-processing: N8AO ambient occlusion → exposure/grade → bloom → ACES → vignette/grain → SMAA.
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode, VignetteEffect, Effect, BlendFunction } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

// Filmic grade: exposure, split toning (cool shadows / warm highlights), saturation, soft contrast.
class GradeEffect extends Effect {
  constructor({ exposure = 1, saturation = 1.05, contrast = 1.06, warm = 0.03 } = {}) {
    super('GradeEffect', `
      uniform float exposure; uniform float saturation; uniform float contrast; uniform float warm;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb * exposure;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, saturation);
        float lw = l / (1.0 + l);
        c *= mix(vec3(1.0 - warm, 1.0, 1.0 + warm * 1.5), vec3(1.0 + warm, 1.0, 1.0 - warm), smoothstep(0.1, 0.6, lw));
        c = pow(max(c, 0.0) / 0.18, vec3(contrast)) * 0.18;
        outputColor = vec4(c, inputColor.a);
      }`, {
      uniforms: new Map([['exposure', new THREE.Uniform(exposure)], ['saturation', new THREE.Uniform(saturation)], ['contrast', new THREE.Uniform(contrast)], ['warm', new THREE.Uniform(warm)]]),
    });
  }
}
class GrainEffect extends Effect {
  constructor() {
    super('GrainEffect', `
      uniform float t;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        float n = fract(sin(dot(uv * 1000.0 + t, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
        outputColor = vec4(inputColor.rgb + n * 0.018, inputColor.a);
      }`, { uniforms: new Map([['t', new THREE.Uniform(0)]]) });
  }
  update(r, i, dt) { this.uniforms.get('t').value = (this.uniforms.get('t').value + dt * 13.0) % 100; }
}

export function makePost(renderer, scene, camera, quality = 'ultra') {
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
  composer.addPass(new RenderPass(scene, camera));
  let ao = null;
  if (quality !== 'low') {
    ao = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
    Object.assign(ao.configuration, { aoRadius: 3.0, distanceFalloff: 1.2, intensity: 2.6, color: new THREE.Color(0x1a1612), halfRes: true, gammaCorrection: false, screenSpaceRadius: false });
    ao.setQualityMode(quality === 'ultra' ? 'Medium' : 'Low');
    composer.addPass(ao);
  }
  const grade = new GradeEffect({ exposure: 0.5, saturation: 1.12, contrast: 1.1, warm: 0.04 });
  const bloom = new BloomEffect({ intensity: 0.55, luminanceThreshold: 0.85, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.72 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  const vignette = new VignetteEffect({ darkness: 0.42, offset: 0.32 });
  const grain = new GrainEffect();
  composer.addPass(new EffectPass(camera, grade));
  composer.addPass(new EffectPass(camera, bloom, tone));
  composer.addPass(new EffectPass(camera, vignette, grain, new SMAAEffect({ preset: SMAAPreset.HIGH })));
  return { composer, ao, grade, setSize: (w, h) => composer.setSize(w, h) };
}
