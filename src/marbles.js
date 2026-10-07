// Magnimarbles on the floor of the maze. The marble and the magnets are
// Magnimarbles' own: its physics module, pinned in the import map, runs a
// World whose board is the maze. The maze's walls are its walls, and so is
// any window hanging low enough to touch the marble, moving at the speed
// it moves. You are a wall too, so walking into the marble kicks it.
//
// Click the floor to put a magnet down, click a magnet to flip it, drag it
// to move it, Alt-click (or right-click) it to pick it up. Red pushes the
// marble, blue pulls it.

import * as THREE from 'three';
import { World, Marble, Magnet, ALIVE, MARBLE_RADIUS, MAGNET_RADIUS } from 'magnimarbles/physics.js';
import { bounds } from './maze.js';
import { THICK } from './window.js';

export const MARBLES = {
  unit: 150,          // CSS px per Magnimarbles unit: the marble is 150px across
  magnets: 6,         // how many you can have down at once; one more takes up the oldest
  kick: 18,           // fastest a window or a walker moves the marble, in units/s
  power: 5,           // magnets, as many times as strong as on a Magnimarbles board: the maze is a big floor
  rolling: 0.02,      // rolling resistance, as Magnimarbles' MU_FLOOR (0.08 there)
};

/** Magnimarbles' world, with the magnets and the floor tuned for the maze. */
class MazeWorld extends World {
  magneticForce(px, pz) { const [fx, fz] = super.magneticForce(px, pz); return [fx * MARBLES.power, fz * MARBLES.power]; }
  frictionAt() { return MARBLES.rolling; }
}
const U = MARBLES.unit;
const KEY = 'terrarium.marbles';
const RED = 0xff5a4e, BLUE = 0x4ea1ff;

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// the marble as Magnimarbles paints it
const marbleTexture = () => canvasTexture(256, (g, s) => {
  g.fillStyle = '#f2ead8'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#c8412f'; g.beginPath(); g.arc(s * 0.3, s * 0.35, s * 0.18, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2f5fc8'; g.beginPath(); g.arc(s * 0.75, s * 0.7, s * 0.14, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e0b03a'; g.beginPath(); g.arc(s * 0.7, s * 0.25, s * 0.08, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(0, s * 0.55); g.bezierCurveTo(s * 0.3, s * 0.2, s * 0.6, s * 0.9, s, s * 0.5); g.stroke();
});

const glowTexture = () => {
  const t = canvasTexture(128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(0.35, 'rgba(255,255,255,.25)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  });
  t.colorSpace = THREE.NoColorSpace;
  return t;
};

const blotTexture = () => canvasTexture(64, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});

export class Marbles {
  constructor(space, shell, floorY) {
    this.space = space; this.shell = shell; this.floorY = floorY;
    const b = bounds(space.maze);
    // the board: the maze, in units, centered where the maze is
    this.cx = (b.x0 + b.x1) / 2; this.cz = (b.z0 + b.z1) / 2;
    this.world = new MazeWorld({
      name: 'Terrarium', size: [(b.x1 - b.x0) / U, (b.z1 - b.z0) / U], start: [-this.cx / U, -this.cz / U],
      goal: { x: 1e6, z: 1e6, r: 0 }, budget: MARBLES.magnets,
      walls: space.boxes.map(w => ({ x: (w.x - this.cx) / U, z: (w.z - this.cz) / U, w: w.hw * 2 / U, d: w.hd * 2 / U })),
    });
    this.world.reset();

    // lit, unlike the maze, so the marble reads as round
    const g = this.group = new THREE.Group();
    g.add(new THREE.HemisphereLight(0xdfe8ff, 0x405040, 1.1));
    const sun = new THREE.DirectionalLight(0xfff2dc, 1.8);
    sun.position.set(-0.4, 1, 0.5);
    g.add(sun);
    this.marbleMesh = new THREE.Mesh(new THREE.SphereGeometry(MARBLE_RADIUS * U, 40, 28),
      new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.25, metalness: 0.05 }));
    g.add(this.marbleMesh);
    this.blot = blotTexture();
    this.marbleShadow = this.shadowMesh(MARBLE_RADIUS * U * 2.2);
    this.glow = glowTexture();
    this.meshes = new Map();   // magnet -> its group
    space.scene.add(g);

    this.load();
  }

  shadowMesh(size) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, map: this.blot, transparent: true, opacity: 0.45, depthWrite: false }));
    m.renderOrder = 1;
    this.group.add(m);
    return m;
  }

  // ---- between the maze's px and the board's units --------------------------

  toBoard(x, z) { return { x: (x - this.cx) / U, z: (z - this.cz) / U }; }
  toWorld(x, z) { return { x: x * U + this.cx, z: z * U + this.cz }; }

  // ---- magnets ----------------------------------------------------------------

  /** Put a magnet down at a floor point; false if it can't go there. */
  place(pt, q = 1) {
    const w = this.world, at = this.toBoard(pt.x, pt.z);
    if (!this.clear(at)) return false;
    if (w.magnets.length >= w.budget) w.remove(w.magnets[0]);
    w.magnets.push(new Magnet(at.x, at.z, q));
    this.save();
    return true;
  }

  /** Room for a magnet here: off the walls and the other magnets, and not on the marble. */
  clear(at, ignore = null) {
    const w = this.world, b = w.marble;
    // canPlace also keeps clear of the start, which here is only where the marble began
    const saved = w.level.start;
    w.level.start = [1e6, 1e6];
    const ok = w.canPlace(at.x, at.z, ignore) && Math.hypot(at.x - b.x, at.z - b.z) > MARBLE_RADIUS + MAGNET_RADIUS;
    w.level.start = saved;
    return ok;
  }

  /** The magnet under a floor point, if any. */
  magnetAt(pt) { const at = this.toBoard(pt.x, pt.z); return this.world.magnetAt(at.x, at.z); }

  flip(m) { m.q = -m.q; this.save(); }
  remove(m) { this.world.remove(m); this.save(); }

  /** Slide a magnet toward a floor point, as far as there's room. */
  moveTo(m, pt) {
    const at = this.toBoard(pt.x, pt.z);
    if (this.clear(at, m)) { m.x = at.x; m.z = at.z; }
  }

  // ---- each frame -------------------------------------------------------------

  update(dt) {
    const w = this.world;
    // a toy, not a level: no goal, no clock, never over
    w.state = ALIVE; w.time = 0; w.restTime = 0;
    if (w.trail.length > 8) w.trail.splice(0, w.trail.length - 8);
    w.setDynamicWalls(this.movers());
    w.step(dt);
    this.draw();
    if (w.marble.speed() > 0.05) this.saveSoon();
  }

  /** You, and the windows low enough to meet the marble, as walls that move. */
  movers() {
    const cap = (vx, vz) => {
      const s = Math.hypot(vx, vz) / U, k = s > MARBLES.kick ? MARBLES.kick / s : 1;
      return { vx: vx / U * k, vz: vz / U * k };
    };
    const top = this.floorY + MARBLE_RADIUS * 2 * U, list = [];
    const p = this.space.player.body, me = this.toBoard(p.x, p.z);
    list.push({ ...me, w: p.hw * 2 / U, d: p.ht * 2 / U, a: 0, ...cap(p.vx, p.vz) });
    for (const win of this.shell.inMaze()) {
      const b = win.slab;
      if (!b || win.y - win.h / 2 > top) continue;
      const at = this.toBoard(b.x, b.z);
      list.push({ ...at, w: win.w / U, d: THICK / U, a: -b.yaw, ...cap(b.vx, b.vz), window: true });
    }
    return list;
  }

  draw() {
    const b = this.world.marble, R = MARBLE_RADIUS * U, at = this.toWorld(b.x, b.z);
    this.marbleMesh.position.set(at.x, this.floorY + R, at.z);
    if (b.spinAngle > 0) this.marbleMesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(b.spinAxisX, 0, b.spinAxisZ), b.spinAngle));
    this.marbleShadow.position.set(at.x + R * 0.15, this.floorY + 3, at.z + R * 0.1);

    const live = new Set(this.world.magnets);
    for (const [m, g] of this.meshes) if (!live.has(m)) { this.group.remove(g); this.meshes.delete(m); }
    for (const m of this.world.magnets) {
      let g = this.meshes.get(m);
      if (!g) { g = this.magnetMesh(); this.meshes.set(m, g); this.group.add(g); }
      const p = this.toWorld(m.x, m.z), color = m.q > 0 ? RED : BLUE;
      g.position.set(p.x, this.floorY, p.z);
      g.userData.body.material.color.setHex(color); g.userData.body.material.emissive.setHex(color);
      g.userData.glow.material.color.setHex(color);
    }
  }

  magnetMesh() {
    const g = new THREE.Group(), r = MAGNET_RADIUS * U, h = 0.5 * U;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32),
      new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3, emissiveIntensity: 0.25 }));
    body.position.y = h / 2;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(4.5 * U, 4.5 * U, 1);
    glow.position.y = h * 0.6;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.6, r * 2.6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, map: this.blot, transparent: true, opacity: 0.4, depthWrite: false }));
    shadow.position.y = 3; shadow.renderOrder = 1;
    g.add(shadow, body, glow);
    g.userData = { body, glow };
    return g;
  }

  // ---- keeping it ---------------------------------------------------------------

  saveSoon() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.save(); }, 1000);
  }

  save() {
    const w = this.world, b = w.marble;
    try {
      localStorage.setItem(KEY, JSON.stringify({ marble: { x: b.x, z: b.z }, magnets: w.magnets.map(m => ({ x: m.x, z: m.z, q: m.q })) }));
    } catch {}
  }

  load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch {}
    if (!s) return;
    const w = this.world;
    if (s.marble) w.marble = new Marble(s.marble.x, s.marble.z);
    w.magnets = (s.magnets || []).slice(-w.budget).map(m => new Magnet(m.x, m.z, m.q));
  }
}
