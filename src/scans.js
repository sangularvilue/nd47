// Loads CC0 scanned PBR materials (Poly Haven, https://polyhaven.com) from assets/tex/.
import * as THREE from 'three';

const IDS = ['brick_wall_001', 'large_red_bricks', 'concrete_pavement', 'asphalt_02', 'leafy_grass', 'forest_leaves_02', 'grey_roof_tiles', 'clay_roof_tiles_02', 'grey_roof_01', 'bark_brown_02', 'gray_rocks', 'large_sandstone_blocks'];

function avgColor(img) {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, 16, 16);
  const d = g.getImageData(0, 0, 16, 16).data; let r = 0, gg = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  return new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
}

export async function loadScans(renderer, onProgress, dir = 'assets/tex/') {
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const get = (url, srgb) => new Promise((res) => loader.load(url, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    res(t);
  }, undefined, () => res(null)));
  const out = {};
  let done = 0;
  await Promise.all(IDS.map(async (id) => {
    const [map, normal, rough] = await Promise.all([get(`${dir}${id}_diff.jpg`, true), get(`${dir}${id}_nor.jpg`, false), get(`${dir}${id}_rough.jpg`, false)]);
    if (map) out[id] = { map, normal, rough, avg: avgColor(map.image) };
    onProgress?.(++done, IDS.length);
  }));
  // A material set with its own repeat, for plain MeshStandardMaterials
  out.set = (id, repeat = 1, extra = {}) => {
    const s = out[id]; if (!s) return extra;
    const cl = (t) => { if (!t) return null; const c = t.clone(); c.repeat.set(repeat, repeat); c.needsUpdate = true; return c; };
    return { map: cl(s.map), normalMap: cl(s.normal), roughnessMap: cl(s.rough), roughness: 1, ...extra };
  };
  return out;
}
