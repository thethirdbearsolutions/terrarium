// The room. The camera stands at the center of a ring; windows stand on the
// ring facing in. At the ring's radius one CSS pixel is one screen pixel, so a
// window you are looking straight at is as sharp as a flat page.

import * as THREE from 'three';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';

const FOV = 50;

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = `
varying vec3 vDir;
uniform float uTime;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main() {
  float y = vDir.y;
  vec3 deep = vec3(0.012, 0.03, 0.07);
  vec3 mid = vec3(0.03, 0.12, 0.2);
  vec3 glow = vec3(0.1, 0.32, 0.38);
  vec3 col = mix(mid, deep, smoothstep(0.0, 0.7, y));
  col = mix(col, glow, exp(-abs(y) * 9.0) * 0.55);
  col = mix(col, vec3(0.01, 0.025, 0.04), smoothstep(0.0, -0.5, y));
  float az = atan(vDir.z, vDir.x);
  float band = sin(az * 3.0 + uTime * 0.03 + sin(az * 7.0) * 0.4) * 0.5 + 0.5;
  float aur = exp(-pow((y - 0.28 - band * 0.12) * 7.0, 2.0));
  col += vec3(0.05, 0.22, 0.17) * aur * (0.35 + 0.35 * band);
  vec3 cell = floor(vDir * 300.0);
  float s = hash(cell);
  float star = step(0.9975, s) * smoothstep(0.02, 0.25, y);
  col += vec3(star) * (0.5 + 0.5 * sin(uTime * 1.5 + s * 80.0));
  gl_FragColor = vec4(col, 1.0);
}`;

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

    this.skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: { uTime: { value: 0 } }, side: THREE.BackSide, depthWrite: false });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(40000, 48, 32), this.skyMat);
    this.scene.add(this.sky);

    this.floor = new THREE.Group();
    this.scene.add(this.floor);

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

  buildFloor() {
    this.floor.clear();
    const D = this.D, y = -0.62 * D;
    const mat = (o) => new THREE.LineBasicMaterial({ color: 0x8fe3d6, transparent: true, opacity: o });
    for (let i = 1; i <= 8; i++) {
      const r = D * 0.5 * i, pts = [];
      for (let a = 0; a <= 128; a++) pts.push(new THREE.Vector3(Math.cos(a / 128 * Math.PI * 2) * r, y, Math.sin(a / 128 * Math.PI * 2) * r));
      this.floor.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat(i === 2 ? 0.32 : 0.12 / (1 + (i - 2) * 0.25))));
    }
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2;
      const pts = [new THREE.Vector3(Math.cos(a) * D * 0.5, y, Math.sin(a) * D * 0.5), new THREE.Vector3(Math.cos(a) * D * 4, y, Math.sin(a) * D * 4)];
      this.floor.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat(0.07)));
    }
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
    this.skyMat.uniforms.uTime.value = t;
    this.sky.position.copy(this.camera.position);
  }

  render() {
    this.gl.render(this.scene, this.camera);
    this.css.render(this.cssScene, this.camera);
  }
}
