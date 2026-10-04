// The world: you, the maze, and the camera. You stand at eye height and walk
// the floor; at distance D one CSS pixel is one screen pixel, so a window you
// face squarely from there is as sharp as a flat page.
//
// Windows are DOM in a CSS3D layer underneath; the maze is WebGL in a clear
// canvas on top that lets the pointer through. Each window has an occluder in
// the GL scene that writes depth and no color, so a wall in front of a window
// is drawn over it and a wall behind it leaves a hole the window shows
// through. Things that ride in front of everything (icons, dialogs, menus)
// punch a hole at the nearest depth.
//
// Step Back flies up over the maze for the map: the walls sink, the ceiling
// goes, and an arrow on the floor shows where you are.

import * as THREE from 'three';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import * as desktop from './desktop.js';
import { generate, wallBoxes, wallBodies, bounds, rayHit } from './maze.js';
import { wallTile, TILE } from './walls.js';
import { Player, MOVE } from './player.js';

const FOV = 50;
const FLOOR_BIT = 7;            // world px per pattern bit on the floor
export const FLOOR_Y = -MOVE.eyeOverFloor;
export const CEIL_Y = 760;
const MAP_PITCH = -1.08;        // how steeply the map looks down
const MAP_WALLS = 0.28;         // how tall the walls stand in the map, as a share
const FOG = { near: 2600, far: 17000 };

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (t) => t * t * (3 - 2 * t);
const shade = (hex, k) => { const c = new THREE.Color(hex); return c.multiplyScalar(k); };

/** Depth only, where the window is. */
const DEPTH = new THREE.MeshBasicMaterial({ colorWrite: false });
/** Depth only, at the very front: nothing GL draws over what's behind this. */
const PUNCH = new THREE.ShaderMaterial({
  vertexShader: 'void main(){ vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); p.z = -0.9999 * p.w; gl_Position = p; }',
  fragmentShader: 'void main(){ gl_FragColor = vec4(0.0); }',
  // with the depth test off nothing is written either, so test, and always pass
  colorWrite: false, depthFunc: THREE.AlwaysDepth,
});

export class Space {
  constructor(glRoot, cssRoot) {
    this.camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 1, 80000);
    this.camera.rotation.order = 'YXZ';
    this.gl = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.gl.setPixelRatio(devicePixelRatio);
    this.gl.setClearColor(0x000000, 0);
    glRoot.appendChild(this.gl.domElement);
    this.css = new CSS3DRenderer();
    cssRoot.appendChild(this.css.domElement);
    this.scene = new THREE.Scene();
    this.cssScene = new THREE.Scene();

    this.maze = generate();
    this.boxes = wallBoxes(this.maze);
    this.walls = wallBodies(this.boxes);
    this.player = new Player();

    this.build();
    this.setDesktop(desktop.load());

    this.over = 0; this.overTarget = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  /** Distance at which one CSS pixel is one screen pixel. */
  get D() { return (innerHeight / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2)); }

  /** Horizontal field of view in radians. */
  get hfov() { return 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * innerWidth / innerHeight); }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.gl.setSize(innerWidth, innerHeight);
    this.css.setSize(innerWidth, innerHeight);
  }

  // ---- the maze -------------------------------------------------------------

  build() {
    const b = bounds(this.maze), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    this.center = { x: cx, z: cz };
    const R = 40000;

    // the floor, far past the maze, so the map has ground to the horizon
    this.floorMat = new THREE.MeshBasicMaterial();
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, 2 * R), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.set(cx, FLOOR_Y, cz);
    this.floorSize = 2 * R;
    this.scene.add(this.floor);

    // the ceiling covers the maze only
    this.ceilMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    this.ceiling = new THREE.Mesh(new THREE.PlaneGeometry(b.x1 - b.x0 + 400, b.z1 - b.z0 + 400), this.ceilMat);
    this.ceiling.rotation.x = Math.PI / 2;
    this.ceiling.position.set(cx, CEIL_Y, cz);
    this.scene.add(this.ceiling);

    // the sky, for when the ceiling's gone
    this.skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(60000, 32, 16), this.skyMat);
    this.sky.renderOrder = 10;   // last, so windows' occluders and the floor keep it out
    this.scene.add(this.sky);

    // the walls: one geometry, faces across x lit and faces across z in shade (as in the old corridors), tops plain
    this.wallMats = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial({ color: 0xd4d4d4 }), new THREE.MeshBasicMaterial({ color: 0x808080 })];
    this.wallGroup = new THREE.Group();
    this.wallGroup.position.y = FLOOR_Y;
    this.wallGroup.add(new THREE.Mesh(wallGeometry(this.boxes, CEIL_Y - FLOOR_Y), this.wallMats));
    this.scene.add(this.wallGroup);

    // you, on the map
    const arrow = new THREE.Shape();
    arrow.moveTo(0, -260); arrow.lineTo(170, 170); arrow.lineTo(0, 70); arrow.lineTo(-170, 170); arrow.closePath();
    const ag = new THREE.ShapeGeometry(arrow);
    ag.rotateX(-Math.PI / 2);
    // shape y runs up the screen; laid flat, -y must point down -z, the way yaw 0 looks
    ag.scale(1, 1, -1);
    this.marker = new THREE.Group();
    const outline = new THREE.Mesh(ag.clone().scale(1.25, 1, 1.25), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false, depthTest: false, side: THREE.DoubleSide }));
    const fill = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0xffff00, fog: false, depthTest: false, side: THREE.DoubleSide }));
    outline.renderOrder = 20; fill.renderOrder = 21;
    fill.position.y = 1;
    this.marker.add(outline, fill);
    this.marker.position.y = FLOOR_Y + 30;
    this.marker.visible = false;
    this.scene.add(this.marker);

    // every window's footprint, on the map: where it stands, how wide, and a
    // notch on the side it faces, so one seen edge-on from above still reads
    this.footprints = new THREE.Group();
    this.footprints.visible = false;
    this.scene.add(this.footprints);
    this.footMat = new THREE.MeshBasicMaterial({ color: 0x000080, fog: false, depthTest: false, side: THREE.DoubleSide });
    const notch = new THREE.Shape();
    notch.moveTo(-90, 0); notch.lineTo(90, 0); notch.lineTo(0, 130); notch.closePath();
    this.notchGeo = new THREE.ShapeGeometry(notch).rotateX(Math.PI / 2);

    this.scene.fog = new THREE.Fog(0x000000, FOG.near, FOG.far);
  }

  /** Lay each window's footprint on the floor: [{ x, z, yaw, w }]. */
  setFootprints(list) {
    const g = this.footprints;
    while (g.children.length > list.length) g.remove(g.children[g.children.length - 1]);
    while (g.children.length < list.length) {
      const f = new THREE.Group();
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(1, 70).rotateX(-Math.PI / 2), this.footMat);
      const tip = new THREE.Mesh(this.notchGeo, this.footMat);
      tip.position.z = 35;
      f.add(bar, tip);
      f.renderOrder = 19;
      bar.renderOrder = tip.renderOrder = 19;
      g.add(f);
    }
    list.forEach((it, i) => {
      const f = g.children[i];
      f.position.set(it.x, FLOOR_Y + 20, it.z);
      f.rotation.set(0, it.yaw, 0);
      f.children[0].scale.x = it.w;
    });
  }

  /** The point on the floor under the pointer, or null. */
  pickFloor(clientX, clientY) {
    const ndc = new THREE.Vector2(clientX / innerWidth * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR_Y), hit) ? hit : null;
  }

  /** { color, pattern, walls } */
  setDesktop(d) {
    this.desktop = d;
    document.body.style.background = d.color;
    document.body.style.setProperty('--desk', d.color);
    document.body.classList.toggle('light', d.color === '#c0c0c0');

    this.floorMat.map?.dispose();
    const t = new THREE.CanvasTexture(desktop.tile(d));
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = this.gl.capabilities.getMaxAnisotropy();
    const n = this.floorSize / (8 * FLOOR_BIT);
    t.repeat.set(n, n);
    this.floorMat.map = t;
    this.floorMat.needsUpdate = true;

    const dark = desktop.ceilingFor(d.color);
    this.ceilMat.color.set(dark);
    this.skyMat.color.set(d.color);
    this.scene.fog.color.copy(shade(dark, 0.55));

    const kind = desktop.wallsNamed(d.walls);
    if (this.wallKind !== kind) {
      this.wallKind = kind;
      this.wallMats[0].map?.dispose();
      const w = new THREE.CanvasTexture(wallTile(kind));
      w.colorSpace = THREE.SRGBColorSpace;
      w.wrapS = w.wrapT = THREE.RepeatWrapping;
      w.magFilter = THREE.NearestFilter;
      w.minFilter = THREE.LinearMipmapLinearFilter;
      w.anisotropy = this.gl.capabilities.getMaxAnisotropy();
      this.wallMats[0].map = w; this.wallMats[1].map = w;
      this.wallMats[0].needsUpdate = this.wallMats[1].needsUpdate = true;
    }
  }

  /** The ray from the eye through a point on the screen, flat on the floor: { ox, oz, dx, dz }. */
  ray(cx, cy) {
    const v = new THREE.Vector3((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1, 0.5).unproject(this.camera).sub(this.camera.position);
    return { ox: this.camera.position.x, oz: this.camera.position.z, dx: v.x, dz: v.z };
  }

  /** How far along a ray from the eye the first wall is, in world px; Infinity if none. */
  wallDistance(ox, oz, dx, dz) { return rayHit(this.boxes, ox, oz, dx, dz); }

  // ---- occluders ------------------------------------------------------------

  /** A box in the GL scene that hides walls behind a window and is hidden by walls in front. */
  occluder() {
    const g = new THREE.Group();
    g.slab = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), DEPTH);
    g.slab.renderOrder = -1;
    g.menu = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), PUNCH);
    g.menu.renderOrder = -2;
    g.menu.visible = false;
    g.add(g.slab, g.menu);
    this.scene.add(g);
    return g;
  }

  /** Make an occluder punch through everything (icons, dialogs) or not. */
  punch(g, on) { g.slab.material = on ? PUNCH : DEPTH; g.slab.renderOrder = on ? -2 : -1; }

  dropOccluder(g) { this.scene.remove(g); g.slab.geometry.dispose(); g.menu.geometry.dispose(); }

  // ---- the view -------------------------------------------------------------

  /** A pose in front of the eye: phi to the side (right is positive), dist out, at height y; facing back at the eye. */
  inFront(phi = 0, dist = this.D, y = 0, from = this.player) {
    const yaw = from.yaw - phi;
    return { x: from.x - Math.sin(yaw) * dist, z: from.z - Math.cos(yaw) * dist, yaw, y };
  }

  /** The point p in the eye's frame: { side, ahead, up }. */
  toView(p, cam = this.cam) {
    const dx = p.x - cam.x, dz = p.z - cam.z;
    return { side: dx * Math.cos(cam.yaw) - dz * Math.sin(cam.yaw), ahead: -dx * Math.sin(cam.yaw) - dz * Math.cos(cam.yaw) };
  }

  fromView(v, cam = this.cam) {
    return { x: cam.x + v.side * Math.cos(cam.yaw) - v.ahead * Math.sin(cam.yaw), z: cam.z - v.side * Math.sin(cam.yaw) - v.ahead * Math.cos(cam.yaw) };
  }

  /** Where the map looks from: high over the middle, back far enough to see the whole maze. */
  mapPose() {
    const b = bounds(this.maze), cam = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 1, 80000);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(MAP_PITCH, 0, 0);
    const look = new THREE.Vector3(0, 0, -1).applyEuler(cam.rotation);
    const corners = [];
    for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) for (const y of [FLOOR_Y, FLOOR_Y + (CEIL_Y - FLOOR_Y) * MAP_WALLS]) corners.push(new THREE.Vector3(x, y, z));
    const at = new THREE.Vector3(this.center.x, FLOOR_Y, this.center.z);
    const fits = (dist) => {
      cam.position.copy(at).addScaledVector(look, -dist);
      cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      return corners.every(c => { const p = c.clone().project(cam); return Math.abs(p.x) < 0.94 && Math.abs(p.y) < 0.9 && p.z < 1; });
    };
    let lo = 1000, hi = 60000;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    fits(hi);
    return { x: cam.position.x, y: cam.position.y, z: cam.position.z, yaw: 0, pitch: MAP_PITCH };
  }

  update(dt) {
    this.over += (this.overTarget - this.over) * (1 - Math.exp(-dt * 3.2));
    if (Math.abs(this.overTarget - this.over) < 1e-4) this.over = this.overTarget;
    const e = ease(this.over), p = this.player;
    this.mapness = e;
    if (e > 0 && !this.map) this.map = this.mapPose();
    if (e === 0) this.map = null;
    const m = this.map || { x: p.x, y: 0, z: p.z, yaw: p.yaw, pitch: 0 };
    const yaw = p.yaw + wrap(m.yaw - p.yaw) * e;
    this.camera.position.set(p.x + (m.x - p.x) * e, m.y * e, p.z + (m.z - p.z) * e);
    this.camera.rotation.set(m.pitch * e, yaw, 0);
    this.cam = { x: this.camera.position.x, z: this.camera.position.z, yaw };
    this.sky.position.copy(this.camera.position);
    this.camera.updateMatrixWorld();

    this.ceiling.visible = e < 0.02;
    this.wallGroup.scale.y = 1 - (1 - MAP_WALLS) * e;
    this.marker.visible = e > 0.02;
    this.marker.position.x = p.x; this.marker.position.z = p.z;
    this.marker.rotation.y = p.yaw;
    this.marker.scale.setScalar(Math.max(0.01, e));
    this.footprints.visible = e > 0.02;
    this.scene.fog.near = FOG.near + e * 60000; this.scene.fog.far = FOG.far + e * 90000;
  }

  render() {
    this.camera.updateMatrixWorld();
    this.css.render(this.cssScene, this.camera);
    this.gl.render(this.scene, this.camera);
  }
}

/**
 * The walls as one geometry: four sides and a top per box, with texture
 * coordinates in world pixels so the tiles line up from box to box. Groups:
 * 0 faces across x, 1 faces across z, 2 tops. y runs from 0 (floor) to h.
 */
function wallGeometry(boxes, h) {
  const pos = [], uv = [], idx = [], groups = [[], [], []];
  const quad = (g, a, b, c, d, ua, ub, va, vb) => {
    const i = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    uv.push(ua, va, ub, va, ub, vb, ua, vb);
    groups[g].push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  const U = (v) => v / TILE.w, V = (y) => y / TILE.h;
  for (const b of boxes) {
    const x0 = b.x - b.hw, x1 = b.x + b.hw, z0 = b.z - b.hd, z1 = b.z + b.hd;
    // +z face, seen from +z: left is x0
    quad(1, [x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], U(x0), U(x1), V(0), V(h));
    // -z face, seen from -z: left is x1
    quad(1, [x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], U(-x1), U(-x0), V(0), V(h));
    // +x face, seen from +x: left is z1
    quad(0, [x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], U(-z1), U(-z0), V(0), V(h));
    // -x face: left is z0
    quad(0, [x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], U(z0), U(z1), V(0), V(h));
    // top
    quad(2, [x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], 0, 1, 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  let start = 0;
  const all = [];
  groups.forEach((list, i) => { g.addGroup(start, list.length, i); all.push(...list); start += list.length; });
  g.setIndex(all);
  return g;
}
