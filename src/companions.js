// Companions: pixel-art animals that live in the maze, drawn with pxart
// (sprites/*.px, exported to sprites/companions.png and .json). Each is a
// flat sprite standing on the floor, turned to face you, showing its front,
// back or side by which way it's heading as you see it, as the old
// corridor games did. Each has a body, so walls stop it, windows and boxes
// in its way get knocked, and the marble and the magnets get kicked.
//
// The turtle keeps you company. The cat chases the marble. The bear goes
// and sits by the games you've brought home, or wanders. Click one and it
// hops and comes over.

import * as THREE from 'three';
import { Body } from './physics.js';
import { cellAt, cellCenter, path, clearLine, nearestClear, clearOf } from './maze.js';

const SHEET = 'sprites/companions';
const KEY = 'terrarium.companions';
const PX = 24;   // a frame's size in sprite pixels

/** Who lives here, and how each one gets about. */
export const KINDS = {
  turtle: { scale: 9, speed: 260, size: 90, near: 650, far: 1300 },
  cat: { scale: 9, speed: 900, size: 70, near: 400, far: 900 },
  bear: { scale: 12, speed: 420, size: 110, near: 500, far: 1100 },
};

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const blot = () => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.55, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
};

class Companion {
  constructor(world, kind, s) {
    this.world = world; this.kind = kind; this.k = KINDS[kind];
    const half = this.k.size / 2, sp = world.space;
    const tall = PX * this.k.scale * 0.4;   // half its height, about: the sprite has room around it
    this.body = new Body({ x: s.x, z: s.z, hw: half, ht: half, hh: tall, y: world.floorY + tall });
    this.body.kinematic = true;
    this.heading = s.heading ?? 0;        // radians in the floor plane: 0 is +x
    this.anim = 0;                        // time along the current animation
    this.mode = 'idle'; this.until = 0;   // what it's doing, and till when
    this.route = []; this.goal = null;
    this.hop = 0;

    const h = PX * this.k.scale;
    const tex = world.sheet.clone();
    tex.needsUpdate = true;
    this.tex = tex;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(h, h).translate(0, h / 2, 0),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5 }));
    this.mesh.userData.companion = this;
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, map: world.blot, transparent: true, opacity: 0.4, depthWrite: false }));
    this.shadow.renderOrder = 1;
    this.shadow.scale.set(h * 0.75, 1, h * 0.32);
    sp.scene.add(this.mesh, this.shadow);
  }

  get x() { return this.body.x; }
  get z() { return this.body.z; }

  // ---- what it wants ------------------------------------------------------------

  /** Decide where to go: a point to walk to, or null to stay put. */
  think(now) {
    const w = this.world, p = w.space.player, d = Math.hypot(p.x - this.x, p.z - this.z);
    if (this.mode === 'called') {
      if (now < this.until && d > this.k.near) return { x: p.x, z: p.z, stop: this.k.near };
      this.mode = 'idle'; this.until = now + 1500;
    }
    if (this.kind === 'cat') {
      const m = w.marble();
      if (m && now > this.until) {
        const md = Math.hypot(m.x - this.x, m.z - this.z);
        if (md < 5000) {
          if (md < this.k.size / 2 + 90) { this.until = now + 1200 + Math.random() * 1800; return null; }
          return { x: m.x, z: m.z, stop: 0, run: true };
        }
      }
    }
    if (this.kind === 'turtle' || (this.kind === 'cat' && now < this.until)) {
      if (d > this.k.far) return { x: p.x, z: p.z, stop: this.k.near };
      return null;
    }
    if (this.kind === 'bear') {
      if (now < this.until) return null;
      // a box nobody's sitting by, or somewhere else for a while
      const boxes = w.shell.boxes;
      if (!this.goal) {
        const b = boxes[Math.floor(Math.random() * boxes.length)];
        if (b && Math.random() < 0.7) this.goal = { x: b.x + Math.cos(this.heading) * 260, z: b.z + Math.sin(this.heading) * 260, stop: 40, sit: true };
        else if (d > 2600 && Math.random() < 0.5) this.goal = { x: p.x, z: p.z, stop: this.k.near };
        else { const c = this.randomCell(); this.goal = { ...c, stop: 60 }; }
      }
      return this.goal;
    }
    return null;
  }

  randomCell() {
    const m = this.world.space.maze, at = cellAt(m, this.x, this.z);
    const c = Math.max(0, Math.min(m.cols - 1, at.c + Math.round((Math.random() - 0.5) * 4)));
    const r = Math.max(0, Math.min(m.rows - 1, at.r + Math.round((Math.random() - 0.5) * 4)));
    return cellCenter(m, c, r);
  }

  /** The next point to head for on the way to t: straight there if nothing's in the way, or by the cells between. */
  waypoint(t) {
    const w = this.world, sp = w.space, pad = this.k.size / 2 + 10;
    if (clearLine(sp.boxes, this.body, t, pad)) { this.route = []; return t; }
    const key = `${cellAt(sp.maze, t.x, t.z).c},${cellAt(sp.maze, t.x, t.z).r}`;
    if (this.routeTo !== key || !this.route.length) {
      const cells = path(sp.maze, cellAt(sp.maze, this.x, this.z), cellAt(sp.maze, t.x, t.z)) || [];
      this.route = cells.slice(1).map(c => cellCenter(sp.maze, c.c, c.r));
      this.routeTo = key;
    }
    while (this.route.length > 1 && clearLine(sp.boxes, this.body, this.route[1], pad)) this.route.shift();
    const next = this.route[0];
    if (next && Math.hypot(next.x - this.x, next.z - this.z) < 80) this.route.shift();
    return this.route[0] || t;
  }

  // ---- each frame ---------------------------------------------------------------

  /** Set the body's velocity for this step. */
  steer(dt, now) {
    const b = this.body, t = this.think(now);
    let want = { x: 0, z: 0 };
    if (t) {
      const d = Math.hypot(t.x - this.x, t.z - this.z);
      if (d > (t.stop ?? 0) + 20) {
        const to = this.waypoint(t), dx = to.x - this.x, dz = to.z - this.z, n = Math.hypot(dx, dz) || 1;
        const speed = this.k.speed * (t.run ? 1.15 : 1) * Math.min(1, (d - (t.stop ?? 0)) / 200 + 0.3);
        want = { x: dx / n * speed, z: dz / n * speed };
      } else if (t === this.goal) {
        // there: sit a while
        this.goal = null;
        this.until = now + (t.sit ? 6000 + Math.random() * 8000 : 1500 + Math.random() * 3000);
      }
    }
    // don't walk through you
    const p = this.world.space.player, px = this.x - p.x, pz = this.z - p.z, pd = Math.hypot(px, pz), room = this.k.size + 80;
    if (pd < room && pd > 1) { want.x += px / pd * (room - pd) * 6; want.z += pz / pd * (room - pd) * 6; }
    const k = 1 - Math.exp(-dt * 6);
    b.vx += (want.x - b.vx) * k; b.vz += (want.z - b.vz) * k;
    if (Math.hypot(b.vx, b.vz) > 30) this.heading = Math.atan2(b.vz, b.vx);
  }

  draw(dt) {
    const w = this.world, sp = w.space, cam = sp.camera.position, b = this.body;
    const speed = Math.hypot(b.vx, b.vz);
    // which side of it you see: front, back, or a side (the left is the right, mirrored)
    const tx = cam.x - b.x, tz = cam.z - b.z, tn = Math.hypot(tx, tz) || 1;
    const fx = Math.cos(this.heading), fz = Math.sin(this.heading), facing = (fx * tx + fz * tz) / tn;
    const R = { x: Math.cos(sp.cam.yaw), z: -Math.sin(sp.cam.yaw) };
    let view = facing > 0.7 ? 'down' : facing < -0.7 ? 'up' : 'right', mirror = view === 'right' && fx * R.x + fz * R.z < 0;
    const walking = speed > 40;
    const tag = walking ? `${this.kind}/walk/${view}` : `${this.kind}/idle/down`;
    if (!walking) mirror = false;
    // the walk runs as fast as the feet go
    this.anim += dt * (walking ? speed / this.k.speed : 1);
    const frames = w.tags[tag] || w.tags[`${this.kind}/idle/down`];
    const per = frames[0].ms / 1000;
    const f = frames[Math.floor(this.anim / per) % frames.length];
    const W = w.sheetSize.w, H = w.sheetSize.h;
    this.tex.repeat.set((mirror ? -1 : 1) * PX / W, PX / H);
    this.tex.offset.set((f.x + (mirror ? PX : 0)) / W, 1 - (f.y + PX) / H);

    // standing on the floor, turned to face you, hopping when petted
    if (this.hop > 0) this.hop = Math.max(0, this.hop - dt);
    const lift = Math.sin(Math.min(1, 1 - this.hop / 0.45) * Math.PI) * (this.hop > 0 ? 120 : 0);
    this.mesh.position.set(b.x, w.floorY + lift, b.z);
    this.mesh.rotation.set(0, sp.cam.yaw, 0);
    this.shadow.position.set(b.x, w.floorY + 2, b.z);
    this.shadow.material.opacity = 0.4 * (1 - lift / 300);
  }

  pet() {
    this.hop = 0.45;
    this.mode = 'called'; this.until = performance.now() + 12000;
    this.goal = null;
  }

  state() { return { kind: this.kind, x: this.x, z: this.z, heading: this.heading }; }
}

export class Companions {
  constructor(space, shell, marbles, floorY) {
    this.space = space; this.shell = shell; this.marbles = marbles; this.floorY = floorY;
    this.list = [];
    this.blot = blot();
    this.ready = this.load();
  }

  /** The marble, in world px, or null. */
  marble() {
    const m = this.marbles, b = m?.world?.marble;
    return b ? m.toWorld(b.x, b.z) : null;
  }

  async load() {
    const [json, tex] = await Promise.all([
      fetch(`${SHEET}.json`).then(r => r.json()),
      new THREE.TextureLoader().loadAsync(`${SHEET}.png`),
    ]);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    this.sheet = tex;
    this.sheetSize = json.meta.size;
    this.tags = {};
    for (const t of json.meta.frameTags) this.tags[t.name] = json.frames.slice(t.from, t.to + 1).map(f => ({ ...f.frame, ms: f.duration }));

    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch {}
    const p = this.space.player;
    const spots = [[-500, -300], [500, -350], [0, 500]];
    for (const [i, kind] of Object.keys(KINDS).entries()) {
      let s = saved?.find(c => c.kind === kind) || { x: p.x + spots[i][0], z: p.z + spots[i][1], heading: Math.PI / 2 };
      const probe = new Body({ x: s.x, z: s.z, hw: KINDS[kind].size / 2, ht: KINDS[kind].size / 2 });
      if (!clearOf(this.space.maze, this.space.walls, probe)) s = { ...s, ...nearestClear(this.space.maze, this.space.walls, probe) };
      this.list.push(new Companion(this, kind, s));
    }
  }

  /** Their bodies, for the shell's physics: they move like you do, and walls stop them. */
  bodies() { return this.list.map(c => c.body); }

  /** Before the physics step. */
  steer(dt) {
    const now = performance.now();
    for (const c of this.list) c.steer(dt, now);
  }

  /** After it. */
  draw(dt) {
    for (const c of this.list) c.draw(dt);
    if (this.list.some(c => Math.hypot(c.body.vx, c.body.vz) > 40)) this.saveSoon();
  }

  /** The companion under the pointer, if any. */
  at(clientX, clientY) {
    if (!this.list.length) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(clientX / innerWidth * 2 - 1, -(clientY / innerHeight) * 2 + 1), this.space.camera);
    const hit = ray.intersectObjects(this.list.map(c => c.mesh))[0];
    if (!hit) return null;
    // only where it's drawn, and not behind a wall
    const c = hit.object.userData.companion, eye = this.space.camera.position;
    const d = Math.hypot(c.x - eye.x, c.z - eye.z), dir = ray.ray.direction, n = Math.hypot(dir.x, dir.z) || 1;
    return this.space.wallDistance(eye.x, eye.z, dir.x / n, dir.z / n) < d - c.k.size ? null : c;
  }

  saveSoon() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try { localStorage.setItem(KEY, JSON.stringify(this.list.map(c => c.state()))); } catch {}
    }, 1500);
  }
}
