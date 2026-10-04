// The room. The camera stands at the center of a ring; windows stand on the
// ring facing in. At the ring's radius one CSS pixel is one screen pixel, so a
// window you are looking straight at is as sharp as a flat page. All around is
// the desktop color; the floor carries the desktop pattern.

import * as THREE from 'three';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import * as desktop from './desktop.js';

const FOV = 50;
const FLOOR_BIT = 7;   // world px per pattern bit on the floor

export class Space {
  constructor(glRoot, cssRoot) {
    this.camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 1, 60000);
    this.camera.rotation.order = 'YXZ';
    this.gl = new THREE.WebGLRenderer({ antialias: true });
    this.gl.setPixelRatio(devicePixelRatio);
    glRoot.appendChild(this.gl.domElement);
    this.css = new CSS3DRenderer();
    cssRoot.appendChild(this.css.domElement);
    this.scene = new THREE.Scene();
    this.cssScene = new THREE.Scene();

    this.floorMat = new THREE.MeshBasicMaterial();
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(1, 96), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.scene.add(this.floor);
    this.setDesktop(desktop.load());

    this.pan = 0; this.panTarget = 0;
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
    this.buildFloor();
  }

  /** The floor reaches far enough to meet the sky; one pattern bit is FLOOR_BIT across. */
  buildFloor() {
    const D = this.D, R = Math.min(D * 30, 50000);
    this.floor.position.y = -0.62 * D;
    this.floor.scale.set(R, R, 1);
    const t = this.floorMat.map;
    if (t) t.repeat.set(2 * R / (8 * FLOOR_BIT), 2 * R / (8 * FLOOR_BIT));
  }

  /** { color, pattern } */
  setDesktop(d) {
    this.desktop = d;
    this.scene.background = new THREE.Color(d.color);
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
    this.floorMat.map = t;
    this.floorMat.needsUpdate = true;
    this.buildFloor();
  }

  /** Where a point on the ring sits: angle theta (0 = straight ahead at pan 0,
   *  increasing to the right), height y, radius r. */
  ringPos(theta, y, r) { return new THREE.Vector3(r * Math.sin(theta), y, -r * Math.cos(theta)); }

  update(dt, t) {
    const k = 1 - Math.exp(-dt * 9);
    this.pan += (this.panTarget - this.pan) * k;
    this.over += (this.overTarget - this.over) * (1 - Math.exp(-dt * 5));
    if (Math.abs(this.panTarget - this.pan) < 1e-5) this.pan = this.panTarget;
    if (Math.abs(this.overTarget - this.over) < 1e-4) this.over = this.overTarget;

    const D = this.D, e = this.over * this.over * (3 - 2 * this.over);
    // overview: step back out of the ring and up, still facing the same way
    const back = 1.7 * D * e, up = 1.05 * D * e;
    this.camera.position.set(-Math.sin(this.pan) * back, up, Math.cos(this.pan) * back);
    this.camera.rotation.set(-0.5 * e, -this.pan, 0);
  }

  render() {
    this.gl.render(this.scene, this.camera);
    this.css.render(this.cssScene, this.camera);
  }
}
