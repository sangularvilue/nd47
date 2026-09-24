import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { makeSky } from './sky.js';
import { makePost } from './post.js';
import { finalize, G } from './materials.js';
import { buildGrass } from './foliage.js';
import { buildProps } from './props.js';
import { Terrain, TER } from './terrain.js';
import { isTouch, setupTouch } from './touch.js';
import { GoogleReference } from './googletiles.js';
import { loadScans } from './scans.js';
import { buildFallingLeaves, buildUndergrowth } from './ambient.js';
import { loadKit, cloneAvatar } from './avatars.js';
import { buildEzTrees } from './eztrees.js';
import { buildLibrary, libraryDoor, floorName, LIB_BASE, LIB_TOWER } from './library.js';
import { makeTextures } from './textures.js';
import { buildWorld } from './world.js';
import { buildLandmarks } from './landmarks.js';
import { buildPeople } from './people.js';
import { makeAgent, animateAgent, makeRocketAgent, animateRocketAgent, Collider } from './player.js';
import { buildHud } from './hud.js';

const $ = (id) => document.getElementById(id);
const status = (t) => { $('loadmsg').textContent = t; };
const tick = () => new Promise((r) => setTimeout(r, 0));

// Quality: ultra (default on desktop) · high · low — press O to cycle, or add #high / #low to the URL.
const QUALITIES = ['ultra', 'high', 'low'];
// Phones get 'high': modern phones (A17/A18-class) handle AO, grass and cascaded shadows fine
let quality = QUALITIES.includes(location.hash.slice(1)) ? location.hash.slice(1) : isTouch ? 'high' : 'ultra';
const renderer = new THREE.WebGLRenderer({ antialias: false, stencil: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
// Phones render at ~1.2× (not the panel's native 3×) — each post-processing buffer scales with this squared
const LITE = isTouch;
const pixelRatio = () => Math.min(devicePixelRatio, quality === 'ultra' ? 1.5 : quality === 'high' ? (LITE ? 1.2 : 1.25) : 1);
renderer.setPixelRatio(pixelRatio());
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NoToneMapping; // tone mapping runs in the post stack
renderer.localClippingEnabled = true; // for the lake mirror clip plane
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
// If the GPU resets (usually memory pressure on phones), reload one quality step lower instead of freezing
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  const next = { ultra: 'high', high: 'low', low: 'low' }[quality];
  document.getElementById('loadmsg').textContent = 'Graphics reset — reloading at ' + next.toUpperCase() + ' quality…';
  document.getElementById('loading').classList.remove('hidden');
  setTimeout(() => { location.hash = next; location.reload(); }, 900);
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 30000);

// --- sky & sun: mid-October, ~2:30 pm, sun in the south-west
// Saturday Oct 17, ~4:45 pm EDT at Notre Dame: sun ~17° up, compass azimuth ~235° (SW) → three azimuth 305°
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 17), THREE.MathUtils.degToRad(305));
const skyObj = makeSky(scene, renderer, sunDir);
scene.environment = skyObj.env; scene.environmentIntensity = 0.75;
scene.fog = null; // atmosphere is a depth-based post effect (src/atmosphere.js)
// Cascaded shadows: crisp near the camera, still present on distant buildings
const csm = new CSM({
  maxFar: quality === 'low' ? 500 : 1000, cascades: quality === 'low' || LITE ? 2 : 3, mode: 'practical', parent: scene, shadowMapSize: LITE ? 1536 : quality === 'ultra' ? 3072 : quality === 'high' ? 2048 : 1024,
  lightDirection: sunDir.clone().negate(), camera, lightIntensity: 4.2, lightNear: 1, lightFar: 3000, shadowBias: -0.00012,
});
csm.fade = true;
for (const l of csm.lights) { l.color.set(0xffc58f); l.shadow.normalBias = 0.35; }
const hemi = new THREE.HemisphereLight(0x9db6d8, 0x5e4a30, 0.62); scene.add(hemi);
let post;

// --- state
const keys = new Set();
let mode = 'title'; // title | play | drone | map
let yaw = 0, pitch = 0.18, camDist = 4.6;
let agent = makeAgent();
const player = { x: 25, y: -250, h: Math.PI, speed: 0, level: null };
const drone = new THREE.Vector3(), droneRot = { yaw: 0, pitch: -0.3 };
let world, L, people, hud, collider, grass, leaves, ezTrees, lib, worldObjs = [], footPts = [];
// Start points: [label, [x, y] near, [x, y] to face]. Each snaps to the nearest walkway.
const SPAWNS = () => [
  ['Main Quad · Golden Dome', [25, -300], [L.dome.x, L.dome.y]],
  ['God Quad · Sacred Heart', [25, -170], [L.dome.x, L.dome.y]],
  ['Basilica & Grotto', [L.grotto.x - 14, L.grotto.y + 12], [L.grotto.x, L.grotto.y]],
  ["St. Mary's Lake", [-420, 60], [L.dome.x, L.dome.y]],
  ['Touchdown Jesus', [L.mural.x - 4, L.mural.y - 110], [L.mural.x, L.mural.y]],
  ['Hesburgh Library doors', [L.mural.x, L.mural.y - 14], [L.mural.x, L.mural.y]],
  ['Library Quad · DOE site', [L.doe.x - 10, L.doe.y - 45], [L.doe.x, L.doe.y]],
  ['Nieuwland (physics)', [L.nieuwland.x, L.nieuwland.y - 55], [L.nieuwland.x, L.nieuwland.y]],
  ['Stadium · Rockne Gate', [436, -350], [L.stadium.x, L.stadium.y]],
  ['Tailgate lots', [560, -760], [L.stadium.x, L.stadium.y]],
  ['South Quad', [-200, -320], [-384, -332]],
  ['North Quad', [205, 60], [L.dome.x, L.dome.y]],
  ['Eddy Street', [210, -1180], [L.stadium.x, L.stadium.y]],
];
function spawnAt(i) {
  player.level = null;
  const [, near, face] = SPAWNS()[i];
  let best = near, bd = 1e9;
  for (const p of footPts) { const d = (p[0] - near[0]) ** 2 + (p[1] - near[1]) ** 2; if (d < bd) { bd = d; best = p; } }
  [player.x, player.y] = collider.resolve(best[0], best[1], 0.5);
  const fx = face[0] - player.x, fy = face[1] - player.y, l = Math.hypot(fx, fy) || 1;
  yaw = Math.atan2(-fx / l, fy / l); pitch = 0.12;
  player.h = Math.atan2(fx, -fy); player.speed = 0;
  flash(SPAWNS()[i][0]);
}
// Google Photorealistic 3D Tiles reference (G cycles off → Google only → both; key entered in the Reference panel)
const gref = new GoogleReference(scene, camera, renderer);
const REF_MODES = ['off', 'google', 'both'];
function setRefMode(m) {
  if (m !== 'off' && !gref.key) { openRefPanel(); return; }
  if (m !== 'off' && !gref.start()) return;
  gref.mode = m;
  for (const o of worldObjs) o.visible = m !== 'google';
  if (gref.tiles) gref.tiles.group.visible = m !== 'off';
  $('refTag').textContent = m === 'off' ? '' : m === 'google' ? 'REFERENCE: GOOGLE 3D TILES' : 'REFERENCE: GOOGLE + NDGAME OVERLAY';
  flash(m === 'off' ? 'REFERENCE OFF' : m === 'google' ? 'GOOGLE 3D TILES' : 'OVERLAY: GOOGLE + OURS');
}
function openRefPanel() { $('refKey').value = gref.key; $('refPanel').classList.remove('hidden'); document.exitPointerLock?.(); }
$('refSave').addEventListener('click', () => { gref.setKey($('refKey').value.trim()); $('refPanel').classList.add('hidden'); if (gref.key) setRefMode('google'); });
$('refClear').addEventListener('click', () => { gref.setKey(''); $('refKey').value = ''; setRefMode('off'); });
$('refClose').addEventListener('click', () => $('refPanel').classList.add('hidden'));
$('refUp').addEventListener('click', () => gref.nudge(-0.5));
$('refDown').addEventListener('click', () => gref.nudge(0.5));
$('openRef').addEventListener('click', openRefPanel);
gref.onStatus = () => {
  $('refErr').textContent = gref.lastError ? 'Last error: ' + gref.lastError + (/400|403|Auth/.test(gref.lastError) ? ' — check the key and that the Map Tiles API is enabled.' : '') : '';
  if (/Auth/.test(gref.lastError || '')) { gref.dispose(); setRefMode('off'); openRefPanel(); }
};

async function init() {
  status('Painting brick & limestone…'); await tick();
  const T = makeTextures();
  status('Loading campus survey (OpenStreetMap)…'); await tick();
  const data = await (await fetch('data/campus.json')).json();
  status('Loading scanned materials (Poly Haven, CC0)…'); await tick();
  T.lite = LITE;
  T.scan = await loadScans(renderer, (d, n) => status(`Loading scanned materials… ${d}/${n}`), LITE ? 'assets/tex/512/' : 'assets/tex/');
  const before = new Set(scene.children);
  status('Laying LiDAR terrain…'); await tick();
  const b64 = await (await fetch('data/dtm.b64.txt')).text();
  const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  TER.t = new Terrain(bin.buffer, data.bounds);
  TER.t.carveWater(data.areas.filter((a) => a.t === 'water' || a.t === 'fountain'));
  data.libDoor = libraryDoor(data);
  { const lb = data.buildings.find((b) => b.id === LIB_BASE); if (lb && lb.g != null) TER.t.flatten(lb.o, lb.g - 223.0 - 0.35); }
  { const tt = TER.t.texture(); G.terr.value = tt.tex; G.terrB.value.copy(tt.bounds); }
  status('Raising 1,500 buildings…'); await tick();
  T.skipTrees = true;
  world = buildWorld(data, T, scene, { sunDir });
  status('Growing 8,700 trees (EZ-Tree)…'); await tick();
  try { ezTrees = await buildEzTrees(data.trees, scene, renderer, quality === 'ultra' ? { nearR: 150, nearMax: 700, res: 320 } : quality === 'high' ? (LITE ? { nearR: 70, nearMax: 160, res: 160, lite: true } : { nearR: 90, nearMax: 320, res: 256 }) : { nearR: 50, nearMax: 120, res: 192 }); console.log('trees', ezTrees.variants.join(' | ')); }
  catch (e) { console.warn('ez-tree failed, using fallback trees', e); T.skipTrees = false; }
  status('Gilding the Dome…'); await tick();
  L = buildLandmarks(data, T, scene, world);
  void 0;
  status('Filling the lots for kickoff…'); await tick();
  status('Dressing the crowd (Rocketbox avatars)…'); await tick();
  const kit = await loadKit((d, n) => status(`Dressing the crowd… ${d}/${n}`), { lite: LITE }).catch((e) => { console.warn(e); return null; });
  status('Filling the lots for kickoff…'); await tick();
  people = buildPeople(data, world, L, scene, kit, quality === 'ultra' ? { near: 140, nearR: 60, farTris: 1100 } : quality === 'high' ? (LITE ? { near: 40, nearR: 35, farTris: 450, farMax: 2500, density: 0.45 } : { near: 90, nearR: 45, farTris: 800 }) : { near: 40, nearR: 30, farTris: 400 });
  if (kit) { const ra = makeRocketAgent(kit, cloneAvatar); if (ra) agent = ra; }
  status('Placing benches, lamps & crosswalks…'); await tick();
  buildProps(data, scene);
  grass = quality === 'low' ? null : buildGrass(data, scene, LITE ? { patchSize: 26, density: 45 } : undefined);
  buildUndergrowth(data, scene, T);
  leaves = buildFallingLeaves(scene, T, quality === 'low' ? 300 : 900);
  status('Opening Hesburgh Library…'); await tick();
  const libData = await (await fetch('data/library.json')).json().catch(() => null);
  lib = libData ? buildLibrary(data, libData, scene, T) : null;
  const outdoor = world.colliders.filter((c) => !lib || (c.id !== LIB_BASE && c.id !== LIB_TOWER));
  if (lib) outdoor.push({ segs: lib.outdoorSegs });
  collider = new Collider([...outdoor, ...world.waterPolys.map((w) => ({ o: w.o, hl: [] }))]);
  hud = buildHud(data, L);
  worldObjs = scene.children.filter((c) => !before.has(c));
  scene.add(agent);
  status('Compiling shaders…'); await tick();
  finalize(scene, csm);
  post = makePost(renderer, scene, camera, quality, { sunDir, sunMesh: skyObj.sunMesh, groundY: TER.h(25, -300) });
  renderer.compile(scene, camera);
  // spawn on the main quad south of the Dome, facing it
  player.x = 25; player.y = -300; player.h = Math.PI; yaw = 0; // back to the camera, facing the Dome
  footPts = [];
  for (const r of data.roads) if (r.f && r.w >= 2) for (let i = 0; i + 1 < r.p.length; i++) {
    const [ax, ay] = r.p[i], [bx, by] = r.p[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3));
    for (let k = 0; k <= n; k++) footPts.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]);
  }
  $('spawns').innerHTML = SPAWNS().map((s, i) => `<button class="spawn" data-i="${i}">${s[0]}</button>`).join('');
  for (const b of $('spawns').querySelectorAll('button')) b.addEventListener('click', () => { spawnAt(+b.dataset.i); setMode('play'); try { renderer.domElement.requestPointerLock?.()?.catch?.(() => {}); } catch (e) {} });
  $('loading').classList.add('hidden');
  $('title').classList.remove('hidden');
  document.body.classList.add('cine');
  window.__nd = { get collider() { return collider; }, setTitleT: (t) => { titleT = t; }, setLevel, get lib() { return lib; }, scene, camera, renderer, world, L, people, player, setMode, drone, droneRot, setView, csm, get post() { return post; }, setQuality };
  requestAnimationFrame(loop);
}

// --- input
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyF' && (mode === 'play' || mode === 'drone')) setMode(mode === 'play' ? 'drone' : 'play');
  if (e.code === 'KeyM' && (mode === 'play' || mode === 'drone' || mode === 'map')) setMode(mode === 'map' ? (prevMode || 'play') : 'map');
  if (e.code === 'Tab') { e.preventDefault(); $('mission').classList.toggle('open'); }
  if (/Digit[1-7]/.test(e.code) && mode !== 'title') tour(+e.code.slice(5));
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.code === 'KeyG' && mode !== 'title') setRefMode(REF_MODES[(REF_MODES.indexOf(gref.mode) + 1) % REF_MODES.length]);
  if (e.code === 'KeyK') openRefPanel();
  if (e.code === 'KeyE' && !$('prompt').classList.contains('hidden')) openElevator();
  if (e.code === 'KeyO') setQuality(QUALITIES[(QUALITIES.indexOf(quality) + 1) % QUALITIES.length]);
});
addEventListener('keyup', (e) => keys.delete(e.code));
renderer.domElement.addEventListener('click', () => { if (mode === 'play' || mode === 'drone') try { renderer.domElement.requestPointerLock?.()?.catch?.(() => {}); } catch (e) {} });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement && !(e.buttons & 1)) return; // drag-to-look fallback
  if (mode === 'play') { yaw -= e.movementX * 0.0025; pitch = THREE.MathUtils.clamp(pitch + e.movementY * 0.0022, -0.5, 1.1); }
  if (mode === 'drone') { droneRot.yaw -= e.movementX * 0.0025; droneRot.pitch = THREE.MathUtils.clamp(droneRot.pitch - e.movementY * 0.0022, -1.5, 1.4); }
});
const touch = setupTouch({
  onLook: (dx, dy) => {
    if (mode === 'play') { yaw -= dx * 0.005; pitch = THREE.MathUtils.clamp(pitch + dy * 0.004, -0.5, 1.1); }
    if (mode === 'drone') { droneRot.yaw -= dx * 0.005; droneRot.pitch = THREE.MathUtils.clamp(droneRot.pitch - dy * 0.004, -1.5, 1.4); }
  },
  onButton: (a) => {
    if (a === 'drone' && (mode === 'play' || mode === 'drone')) setMode(mode === 'play' ? 'drone' : 'play');
    if (a === 'map') setMode(mode === 'map' ? (prevMode || 'play') : 'map');
    if (a === 'tour') { tourIdx = (tourIdx % 7) + 1; tour(tourIdx); }
    if (a === 'obj') $('mission').classList.toggle('open');
  },
});
let tourIdx = 0;
if (isTouch) $('mission').classList.remove('open');
addEventListener('wheel', (e) => { camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.004, 2.2, 14); });
$('start').addEventListener('click', () => { setMode('play'); try { renderer.domElement.requestPointerLock?.()?.catch?.(() => {}); } catch (e) {} });
$('startDrone').addEventListener('click', () => { drone.set(-150, 180, 420); droneRot.yaw = -0.3; droneRot.pitch = -0.35; setMode('drone'); try { renderer.domElement.requestPointerLock?.()?.catch?.(() => {}); } catch (e) {} });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); post?.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); csm.updateFrustums(); sizeMaps(); });
// Runtime quality switch: AO, grass and resolution (cascade count is fixed at load)
function setQuality(q) {
  quality = q; renderer.setPixelRatio(pixelRatio()); post.setSize(innerWidth, innerHeight);
  if (post.ao) { post.ao.enabled = q !== 'low'; post.ao.configuration.halfRes = q !== 'ultra'; }
  if (grass) grass.mesh.visible = q !== 'low';
  flash('QUALITY: ' + q.toUpperCase());
}
function sizeMaps() { const b = $('bigmap'); b.width = innerWidth; b.height = innerHeight; }
sizeMaps();

let prevMode = null;
function setMode(m) {
  if (m === 'map') prevMode = mode;
  if (m === 'drone' && mode === 'play') { camera.getWorldPosition(drone); const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); droneRot.yaw = e.y; droneRot.pitch = e.x; }
  mode = m;
  document.body.classList.toggle('cine', m === 'title');
  if (m !== 'title') $('fader').style.opacity = '0';
  if (m === 'play') camSmooth.copy(camera.position);
  document.body.classList.toggle('playing', m !== 'title');
  document.body.classList.toggle('drone', m === 'drone');
  $('title').classList.toggle('hidden', m !== 'title');
  $('hud').classList.toggle('hidden', m === 'title');
  $('bigmapWrap').classList.toggle('hidden', m !== 'map');
  $('modeTag').textContent = m === 'drone' ? 'DRONE CAMERA — WASD / Space / Ctrl · Shift = fast · F = return to agent' : m === 'play' ? '' : '';
  if (m === 'map') { document.exitPointerLock?.(); hud.drawBig(player.x, player.y); }
}
// cinematic viewpoints (keys 1–7)
const VIEWS = () => [
  ['The Golden Dome', [L.dome.x + 70, 45, L.dome.y - 110], [L.dome.x, 40, L.dome.y]],
  ['Basilica of the Sacred Heart', [L.basilica.x - 60, 30, L.basilica.y - 70], [L.basilica.x, 40, L.basilica.y]],
  ['Touchdown Jesus', [L.mural.x - 20, 14, L.mural.y - 150], [L.mural.x, 38, L.mural.y]],
  ['Notre Dame Stadium', [L.stadium.x - 260, 140, L.stadium.y - 230], [L.stadium.x, 0, L.stadium.y]],
  ['The Grotto', [L.grotto.x - 13, 3, L.grotto.y + 10], [L.grotto.x, 2.5, L.grotto.y]],
  ["St. Mary's Lake", [-720, 16, -40], [L.dome.x, 30, L.dome.y]],
  ['Library Quad — DOE facility', [L.doe.x + 30, 50, L.doe.y - 90], [L.doe.x, 5, L.doe.y]],
];
function setView(p, t) { p = [p[0], p[1] + TER.h(p[0], p[2]), p[2]]; t = [t[0], t[1] + TER.h(t[0], t[2]), t[2]]; drone.set(p[0], p[1], -p[2]); const d = new THREE.Vector3(t[0] - p[0], t[1] - p[1], -(t[2] - p[2])); droneRot.yaw = Math.atan2(-d.x, -d.z); droneRot.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); }
function tour(n) { const v = VIEWS()[n - 1]; if (!v) return; if (mode !== 'drone') setMode('drone'); setView(v[1], v[2]); flash(v[0]); camera.fov = 45; camera.updateProjectionMatrix(); }
function flash(t) { const e = $('loc'); e.textContent = t.toUpperCase(); e.classList.remove('show'); void e.offsetWidth; e.classList.add('show'); }

// --- loop
const clock = new THREE.Clock();
let titleT = 0, fpsT = 0, frames = 0;
const camSmooth = new THREE.Vector3();
// Title sequence: [from, to, lookAt, fov] in plan coords [x, height above ground, y]
const SHOTS = () => [
  [[L.dome.x + 14, 7, L.dome.y - 200], [L.dome.x + 6, 11, L.dome.y - 150], [L.dome.x, 44, L.dome.y], 36],
  [[L.mural.x - 14, 2.5, L.mural.y - 170], [L.mural.x - 6, 3.5, L.mural.y - 125], [L.mural.x, 34, L.mural.y], 38],
  [[-760, 12, -60], [-690, 13, -30], [L.dome.x, 34, L.dome.y], 30],
  [[L.stadium.x - 330, 95, L.stadium.y - 160], [L.stadium.x - 250, 80, L.stadium.y - 280], [L.stadium.x, 5, L.stadium.y], 34],
  [[L.basilica.x - 75, 4, L.basilica.y + 25], [L.basilica.x - 60, 6, L.basilica.y + 5], [L.basilica.x, 48, L.basilica.y], 40],
  [[L.grotto.x - 16, 2.2, L.grotto.y + 14], [L.grotto.x - 11, 2.4, L.grotto.y + 9], [L.grotto.x, 2.8, L.grotto.y], 42],
];
const tmpV = new THREE.Vector3();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, clock.getDelta());
  if (mode === 'title') {
    titleT += dt;
    const shots = SHOTS(), DUR = 9, i = Math.floor(titleT / DUR) % shots.length, k = (titleT % DUR) / DUR;
    const [from, to, look, fov] = shots[i];
    const e = k * k * (3 - 2 * k) * 0.85 + k * 0.15;
    const lerp3 = (a, b) => [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
    const p = lerp3(from, to);
    camera.position.set(p[0], p[1] + TER.h(p[0], p[2]), -p[2]);
    camera.lookAt(look[0], look[1] + TER.h(look[0], look[2]), -look[2]);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const fade = Math.min(1, Math.min(k, 1 - k) * DUR / 0.9);
    $('fader').style.opacity = String(1 - fade);
  } else if (mode === 'play' || mode === 'map') {
    if (mode === 'play') movePlayer(dt);
    // third-person camera over the right shoulder
    const gy = groundY();
    const tgt = new THREE.Vector3(player.x, gy + 1.62, -player.y);
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    let want = tgt.clone().addScaledVector(dir, camDist).addScaledVector(right, 0.55);
    if (player.level != null && lib) {
      // indoors: pull the camera in front of walls and under the ceiling
      const hit = activeCollider().raycast(player.x, player.y, want.x, -want.z);
      if (hit < 1) want = tgt.clone().lerp(want, Math.max(0.12, hit - 0.08));
      want.y = Math.min(want.y, lib.ceilY(player.level) - 0.25);
      want.y = Math.max(want.y, gy + 0.4);
    } else want.y = Math.max(TER.h(want.x, -want.z) + 0.5, want.y);
    camSmooth.lerp(want, 1 - Math.exp(-dt * 10)); // damped follow
    camera.position.copy(camSmooth);
    camera.lookAt(tgt.x + right.x * 0.55, tgt.y, tgt.z + right.z * 0.55);
    if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
  } else if (mode === 'drone') {
    const f = new THREE.Vector3(-Math.sin(droneRot.yaw) * Math.cos(droneRot.pitch), Math.sin(droneRot.pitch), -Math.cos(droneRot.yaw) * Math.cos(droneRot.pitch));
    const r = new THREE.Vector3(Math.cos(droneRot.yaw), 0, -Math.sin(droneRot.yaw));
    const sp = (keys.has('ShiftLeft') || touch.run ? 180 : 45) * dt;
    if (touch.x || touch.y) { drone.addScaledVector(f, touch.y * sp); drone.addScaledVector(r, touch.x * sp); }
    drone.y += touch.up * sp;
    if (keys.has('KeyW')) drone.addScaledVector(f, sp); if (keys.has('KeyS')) drone.addScaledVector(f, -sp);
    if (keys.has('KeyD')) drone.addScaledVector(r, sp); if (keys.has('KeyA')) drone.addScaledVector(r, -sp);
    if (keys.has('Space') || keys.has('KeyE')) drone.y += sp; if (keys.has('ControlLeft') || keys.has('KeyQ')) drone.y -= sp;
    drone.y = Math.max(TER.h(drone.x, -drone.z) + 1.5, drone.y);
    camera.position.copy(drone); camera.lookAt(tmpV.copy(drone).add(f));
  }
  agent.position.set(player.x, groundY(), -player.y); agent.rotation.y = player.h;
  if (lib) lib.update(dt, player, camera.position);
  if (post?.atmo) { const inside = player.level != null && mode !== 'drone';
    hemi.color.set(inside ? 0xfff4e6 : 0x9db6d8); hemi.groundColor.set(inside ? 0xd8cdbb : 0x5e4a30); hemi.intensity = inside ? 1.1 : 0.62; scene.environmentIntensity = inside ? 0.25 : 0.75;
    post.grade.uniforms.get('exposure').value = inside ? (player.level <= 2 ? 0.66 : 0.52) : 0.46; post.atmo.uniforms.get('uDensity').value = inside ? 0 : 0.0014; post.atmo.uniforms.get('uDebug').value = 0; if (post.rays) post.rays.blendMode.opacity.value = inside ? 0 : 1; }
  if (agent.userData.mixer) animateRocketAgent(agent, player.speed, dt); else animateAgent(agent, player.speed, dt);
  people.update(dt, camera.position);
  if (world.water) world.water.material.uniforms.time.value += dt * 0.5;
  G.time.value += dt;
  camera.updateMatrixWorld();
  csm.update();
  if (leaves) { leaves.update(camera.position); if (player.level != null && mode !== 'drone') leaves.mesh.visible = false; }
  if (ezTrees) ezTrees.update(dt, camera.position);
  if (grass) { grass.update(camera.position); if (gref.mode === 'google') grass.mesh.visible = false; }
  skyObj.update(dt, camera.position);
  gref.update();
  post.composer.render(dt);
  if (gref.mode !== 'off') $('gattr').textContent = 'Google · ' + gref.attributions();
  else $('gattr').textContent = '';
  if (mode !== 'title') {
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    const px = mode === 'drone' ? camera.position.x : player.x, py = mode === 'drone' ? -camera.position.z : player.y;
    hud.update(dt, px, py, e.y, mode);
  }
  frames++; fpsT += dt; if (fpsT > 1) { $('fps').textContent = `${frames} fps · ${quality}`; frames = 0; fpsT = 0; }
}
const groundY = () => (player.level != null && lib ? lib.floorY(player.level) : TER.h(player.x, player.y));
const activeCollider = () => (player.level != null && lib ? lib.ensure(player.level).collider : collider);
function setLevel(lv, x, y) {
  player.level = lv;
  if (lv != null && x != null) { const p = lib.arrive(lv, x, y); [player.x, player.y] = p; }
  camSmooth.set(player.x, groundY() + 1.8, -player.y);
  if (lv != null) flash('HESBURGH LIBRARY · ' + floorName(lv));
}
function openElevator() {
  if (!lib || player.level == null) return;
  document.exitPointerLock?.();
  $('elevList').innerHTML = lib.floors.slice().reverse().map((lv) => `<button data-lv="${lv}" class="${lv === player.level ? 'here' : ''}">${lv === -1 ? 'LL' : lv}</button>`).join('');
  for (const b of $('elevList').querySelectorAll('button')) b.addEventListener('click', () => { const lv = +b.dataset.lv; $('elev').classList.add('hidden'); if (lv !== player.level) setLevel(lv, player.x, player.y); });
  $('elev').classList.remove('hidden');
}
$('elevClose').addEventListener('click', () => $('elev').classList.add('hidden'));
$('prompt').addEventListener('click', openElevator);
function movePlayer(dt) {
  let ix = 0, iy = 0;
  if (keys.has('KeyW')) iy += 1; if (keys.has('KeyS')) iy -= 1; if (keys.has('KeyA')) ix -= 1; if (keys.has('KeyD')) ix += 1;
  if (Math.hypot(touch.x, touch.y) > 0.15) { ix = touch.x; iy = touch.y; }
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.run || Math.hypot(touch.x, touch.y) > 0.92;
  const target = ix || iy ? (run ? 5.6 : 1.9) : 0;
  player.speed = THREE.MathUtils.lerp(player.speed, target, 1 - Math.exp(-dt * 8));
  if (ix || iy) {
    // camera-relative: forward = away from camera
    const fwd = [-Math.sin(yaw), Math.cos(yaw)]; // in plan coordinates (x east, y north)
    const rt = [Math.cos(yaw), Math.sin(yaw)];
    let mx = fwd[0] * iy + rt[0] * ix, my = fwd[1] * iy + rt[1] * ix; const l = Math.hypot(mx, my); mx /= l; my /= l;
    const want = Math.atan2(mx, -my); // Rocketbox agent faces -z locally
    let d = want - player.h; d = Math.atan2(Math.sin(d), Math.cos(d));
    player.h += d * (1 - Math.exp(-dt * 12));
    player.x += mx * player.speed * dt; player.y += my * player.speed * dt;
  } else if (player.speed > 0.05) {
    player.x += Math.sin(player.h) * player.speed * dt; player.y += -Math.cos(player.h) * player.speed * dt;
  }
  [player.x, player.y] = activeCollider().resolve(player.x, player.y, 0.35);
  // entering / leaving the library through the south doors
  if (lib) {
    const inside = lib.contains(player.x, player.y);
    if (inside && player.level == null) setLevel(1);
    else if (!inside && player.level === 1) setLevel(null);
    const near = player.level != null && lib.nearCore(player.x, player.y, player.level);
    $('prompt').classList.toggle('hidden', !near);
  }
}

init().catch((e) => { console.error(e); status('Error: ' + e.message); });
