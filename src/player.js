// The agent: suit, red tie, shaved head. Third-person movement with building collision.
import * as THREE from 'three';

export function makeAgent() {
  const suit = new THREE.MeshPhysicalMaterial({ color: 0x141518, roughness: 0.62, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x4a4c55) });
  const shirt = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.55 });
  const tie = new THREE.MeshPhysicalMaterial({ color: 0x9c0e1a, roughness: 0.35, sheen: 0.8, sheenColor: new THREE.Color(0xff5060) });
  const skin = new THREE.MeshPhysicalMaterial({ color: 0xe3bb98, roughness: 0.48, sheen: 0.25, sheenColor: new THREE.Color(0xffc0a0) });
  const shoe = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.18, metalness: 0.1 });
  const root = new THREE.Group();
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const hips = new THREE.Group(); hips.position.y = 0.98; root.add(hips);
  // jacket: tapered torso, shoulders, skirt below the waist
  const torso = add(hips, new THREE.CylinderGeometry(0.2, 0.17, 0.56, 16), suit, 0, 0.33); torso.scale.z = 0.62;
  add(hips, new THREE.CylinderGeometry(0.175, 0.19, 0.2, 16), suit, 0, -0.02).scale.z = 0.65;
  const sh = add(hips, new THREE.CapsuleGeometry(0.07, 0.36, 4, 10), suit, 0, 0.6); sh.rotation.z = Math.PI / 2; sh.scale.z = 1.3;
  // shirt V, collar, tie, lapels
  const v = add(hips, new THREE.PlaneGeometry(0.1, 0.26), shirt, 0, 0.5, 0.127); v.rotation.x = -0.12;
  add(hips, new THREE.TorusGeometry(0.068, 0.018, 6, 14), shirt, 0, 0.66, 0.0).rotation.x = Math.PI / 2 - 0.2;
  const tk = add(hips, new THREE.BoxGeometry(0.035, 0.03, 0.02), tie, 0, 0.615, 0.12);
  const tb = add(hips, new THREE.BoxGeometry(0.05, 0.3, 0.012), tie, 0, 0.45, 0.133); tb.rotation.x = -0.1;
  for (const s of [-1, 1]) { const lp = add(hips, new THREE.BoxGeometry(0.06, 0.28, 0.012), suit, s * 0.06, 0.5, 0.132); lp.rotation.z = s * 0.28; lp.rotation.x = -0.1; }
  add(hips, new THREE.CylinderGeometry(0.052, 0.06, 0.1, 10), skin, 0, 0.7);
  // head: smooth skull, jaw, ears, subtle brow
  const head = new THREE.Group(); head.position.y = 0.85; hips.add(head);
  add(head, new THREE.SphereGeometry(0.108, 24, 18), skin).scale.set(0.9, 1.08, 1.0);
  const jaw = add(head, new THREE.SphereGeometry(0.085, 16, 12), skin, 0, -0.05, 0.02); jaw.scale.set(0.95, 0.8, 1.0);
  for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(0.022, 8, 6), skin, s * 0.098, -0.005, 0).scale.set(0.5, 1.2, 0.9);
  // limbs with pivots
  const limb = (r, len, mat) => { const g = new THREE.CapsuleGeometry(r, len, 4, 10); g.translate(0, -len / 2 - r * 0.5, 0); return new THREE.Mesh(g, mat); };
  const mk = (x, y, r, len, mat, parent) => { const p = new THREE.Group(); p.position.set(x, y, 0); p.add(limb(r, len, mat)); parent.add(p); return p; };
  const armL = mk(-0.245, 0.6, 0.052, 0.52, suit, hips), armR = mk(0.245, 0.6, 0.052, 0.52, suit, hips);
  for (const a of [armL, armR]) { add(a, new THREE.CylinderGeometry(0.047, 0.047, 0.03, 10), shirt, 0, -0.6); add(a, new THREE.SphereGeometry(0.045, 10, 8), skin, 0, -0.66).scale.set(0.8, 1.2, 1); }
  const legL = mk(-0.1, 0.0, 0.068, 0.84, suit, hips), legR = mk(0.1, 0.0, 0.068, 0.84, suit, hips);
  for (const l of [legL, legR]) { const s = add(l, new THREE.CapsuleGeometry(0.05, 0.16, 4, 8), shoe, 0, -0.965, 0.05); s.rotation.x = Math.PI / 2; s.scale.set(1.1, 1, 0.7); }
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.userData = { armL, armR, legL, legR, hips, phase: 0 };
  return root;
}

export function animateAgent(agent, speed, dt) {
  const u = agent.userData;
  u.phase += dt * (speed > 3 ? 9.5 : 6.2) * Math.min(1, speed);
  const amp = speed < 0.1 ? 0 : speed > 3 ? 0.9 : 0.45;
  u.amp = THREE.MathUtils.lerp(u.amp || 0, amp, 1 - Math.exp(-dt * 10));
  const s = Math.sin(u.phase) * u.amp;
  u.legL.rotation.x = s; u.legR.rotation.x = -s;
  u.armL.rotation.x = -s * 0.8; u.armR.rotation.x = s * 0.8;
  u.hips.position.y = 0.98 + Math.abs(Math.cos(u.phase)) * 0.04 * u.amp;
}

// Spatial hash of polygon edges for circle-vs-wall collision.
export class Collider {
  constructor(polys, cell = 25) {
    this.cell = cell; this.grid = new Map(); this.polys = polys;
    for (const p of polys) for (const ring of [p.o, ...(p.hl || [])]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const x0 = Math.floor(Math.min(a[0], b[0]) / cell), x1 = Math.floor(Math.max(a[0], b[0]) / cell);
        const y0 = Math.floor(Math.min(a[1], b[1]) / cell), y1 = Math.floor(Math.max(a[1], b[1]) / cell);
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push([a, b]); }
      }
    }
  }
  // push point (x,y) out of all edges within radius r
  resolve(x, y, r) {
    for (let iter = 0; iter < 3; iter++) {
      const k = Math.floor(x / this.cell) + ',' + Math.floor(y / this.cell);
      const edges = this.grid.get(k); if (!edges) return [x, y];
      let moved = false;
      for (const [a, b] of edges) {
        const ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey; if (L2 < 1e-6) continue;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / L2));
        const px = a[0] + ex * t, py = a[1] + ey * t, dx = x - px, dy = y - py, d = Math.hypot(dx, dy);
        if (d < r && d > 1e-6) { x = px + (dx / d) * r; y = py + (dy / d) * r; moved = true; }
      }
      if (!moved) break;
    }
    return [x, y];
  }
}
