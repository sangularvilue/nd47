// Optional reference layer: Google Photorealistic 3D Tiles, streamed live with the viewer's own API key.
// Tiles are rendered, never stored; Google's attribution is shown while the layer is on.
import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer/three';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/core/plugins';
import { ReorientationPlugin, GLTFExtensionsPlugin, TileCompressionPlugin, TilesFadePlugin } from '3d-tiles-renderer/three/plugins';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { DATUM } from './terrain.js';

const LAT0 = 41.70300, LON0 = -86.23920;
const GEOID_N = -33.9; // EGM96 undulation near South Bend: ellipsoid height = orthometric + N
const DEG = Math.PI / 180;
const KEY = 'nd47.googleKey', OFF = 'nd47.googleOffset';
const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };

export class GoogleReference {
  constructor(scene, camera, renderer) {
    Object.assign(this, { scene, camera, renderer, tiles: null, mode: 'off', offset: +(store.get(OFF) || 0) });
  }
  get key() { return store.get(KEY) || ''; }
  setKey(k) { store.set(KEY, k || null); this.dispose(); }
  start() {
    if (this.tiles || !this.key) return !!this.tiles;
    const tiles = new TilesRenderer();
    tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: this.key, autoRefreshToken: true }));
    const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
    tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));
    tiles.registerPlugin(new TileCompressionPlugin());
    tiles.registerPlugin(new TilesFadePlugin());
    this.reo = new ReorientationPlugin({ lat: LAT0 * DEG, lon: LON0 * DEG, height: DATUM + GEOID_N + this.offset, recenter: true });
    tiles.registerPlugin(this.reo);
    tiles.setCamera(this.camera);
    tiles.setResolutionFromRenderer(this.camera, this.renderer);
    tiles.addEventListener('load-error', (e) => { this.lastError = e?.error?.message || 'tile load failed'; this.onStatus?.(); });
    this.scene.add(tiles.group);
    this.tiles = tiles;
    return true;
  }
  nudge(dy) { this.offset += dy; store.set(OFF, String(this.offset)); if (this.tiles) this.tiles.group.position.y -= dy; }
  update() {
    if (!this.tiles || this.mode === 'off') return;
    this.camera.updateMatrixWorld();
    this.tiles.setResolutionFromRenderer(this.camera, this.renderer);
    this.tiles.update();
  }
  attributions() {
    if (!this.tiles) return '';
    const a = this.tiles.getAttributions?.() || [];
    return a.filter((x) => x.type === 'string').map((x) => x.value).join(' · ');
  }
  dispose() { if (this.tiles) { this.scene.remove(this.tiles.group); this.tiles.dispose(); this.tiles = null; } }
}
