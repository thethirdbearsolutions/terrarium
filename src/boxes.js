// A game brought home: its box, standing on the floor of the maze. It's as
// solid as a window, so you can carry it, throw it, knock it over with a
// window (well, across the floor) and bounce the marble off it. Double-click
// it to play; right-click it for its menu.

import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { Body } from './physics.js';
import { FLOOR_Y, CEIL_Y } from './space.js';
import { carryDrag } from './carry.js';
import { popup, closeMenus } from './menu.js';
import { coverArt, spineArt, backArt, titleOf } from './games.js';

export const BOX = { w: 280, h: 360, d: 80 };
const KEY = 'terrarium.boxes';
const SHADE = 0.14;

let nextId = 1;

export class GameBox {
  constructor(shell, game, s = {}) {
    this.shell = shell; this.game = game;
    this.id = s.id || `b${Date.now().toString(36)}${nextId++}`;
    this.x = s.x ?? 0; this.z = s.z ?? 0; this.yaw = s.yaw ?? 0;
    this.y = s.y ?? FLOOR_Y + BOX.h / 2 + 1;
    this.cur = null;

    const { w, h, d } = BOX, el = document.createElement('div');
    el.className = 'gbox';
    el.style.width = w + 'px'; el.style.height = h + 'px';
    const face = (cls, img, fw, fh, transform) => `<div class="gf ${cls}" style="width:${fw}px;height:${fh}px;left:${(w - fw) / 2}px;top:${(h - fh) / 2}px;transform:${transform};background-image:url(${img})"></div>`;
    const spine = spineArt(game, d, h);
    el.innerHTML = face('front', coverArt(game, w, h), w, h, `translateZ(${d / 2}px)`)
      + face('back', backArt(game, w, h), w, h, `rotateY(180deg) translateZ(${d / 2}px)`)
      + face('side', spine, d, h, `rotateY(-90deg) translateZ(${w / 2}px)`)
      + face('side', spine, d, h, `rotateY(90deg) translateZ(${w / 2}px)`)
      + face('lid', '', w, d, `rotateX(90deg) translateZ(${h / 2}px)`)
      + face('lid', '', w, d, `rotateX(-90deg) translateZ(${h / 2}px)`);
    this.el = el; el.box = this;
    this.front = el.querySelector('.front');
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('dblclick', (e) => { e.stopPropagation(); closeMenus(); this.play(); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    this.obj = new CSS3DObject(el);
    shell.space.cssScene.add(this.obj);
    this.occluder = shell.space.occluder();
  }

  down(e) {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault(); e.stopPropagation();
    closeMenus();
    const turning = e.button === 2 || e.altKey;
    // a right-click that doesn't turn it is for the menu
    carryDrag(this.shell, this, e, { turning, onClick: e.button === 2 ? () => this.menu(e) : null });
  }

  menu(e) {
    const r = this.front.getBoundingClientRect();
    const fx = Math.max(0, Math.min(BOX.w - 120, (e.clientX - r.left) / r.width * BOX.w));
    const fy = Math.max(0, Math.min(BOX.h - 60, (e.clientY - r.top) / r.height * BOX.h));
    popup(this.front, fx, fy, [
      { t: '&Play', bold: true, run: () => this.play() },
      '-',
      { t: 'Put &Away', run: () => this.shell.putAway(this) },
    ]);
  }

  play() { this.shell.play(this.game); }

  // ---- what carry.js and the shell's physics need -----------------------------

  hold() { this.dragging = true; this.hand = { x: this.x, z: this.z, yaw: this.yaw, y: this.y }; }
  letGo(thrown = true) {
    this.dragging = false; this.hand = null; this.carry = null;
    if (!thrown) { this.trail = null; this.resync = true; }
  }
  lift(dy) {
    this.y = Math.max(FLOOR_Y + BOX.h / 2 + 1, Math.min(CEIL_Y - BOX.h / 2 - 2, this.y + dy));
    if (this.hand) this.hand.y = this.y;
  }
  makeSlab() { return new Body({ x: this.x, z: this.z, yaw: this.yaw, y: this.y, hw: BOX.w / 2, hh: BOX.h / 2, ht: BOX.d / 2 }); }
  fitSlab(b) { b.hw = BOX.w / 2; b.hh = BOX.h / 2; b.ht = BOX.d / 2; b.y = this.y; }

  // ---- each frame ---------------------------------------------------------------

  update(dt) {
    const sp = this.shell.space, k = 1 - Math.exp(-dt * 8);
    // it arrives from above, as if set down
    if (!this.cur) this.cur = { y: this.y + 900 };
    this.cur.y += (this.y - this.cur.y) * (Math.abs(this.y - this.cur.y) > 1 ? k : 1);
    const c = { x: this.x, y: this.cur.y, z: this.z, yaw: this.yaw };
    this.obj.position.set(c.x, c.y, c.z);
    this.obj.rotation.set(0, c.yaw, 0, 'YXZ');

    // nothing to draw when it's all behind the eye
    const R = Math.hypot(BOX.w, BOX.d) / 2, ahead = sp.toView(c).ahead;
    const shown = ahead > -R;
    this.el.classList.toggle('unseen', !shown);
    const o = this.occluder;
    o.visible = shown;
    o.position.copy(this.obj.position); o.quaternion.copy(this.obj.quaternion); o.scale.set(1, 1, 1);
    o.slab.scale.set(BOX.w, BOX.h, BOX.d);
    if (shown) sp.shadowOf(o, c, BOX.w, BOX.h, 1); else o.shadow.visible = false;

    // in the same light as the windows and the walls
    const off = Math.hypot(c.x - sp.cam.x, c.z - sp.cam.z) / sp.D;
    const fog = shown ? sp.fogAt(c) : 0, shade = SHADE * Math.cos(c.yaw) ** 2 * Math.max(0, Math.min(1, (off - 1.3) / 1.3));
    const col = sp.scene.fog.color, rgb = `${Math.round(col.r * 255)} ${Math.round(col.g * 255)} ${Math.round(col.b * 255)}`;
    const key = `${fog.toFixed(3)} ${shade.toFixed(3)} ${rgb}`;
    if (key !== this.tinted) {
      this.tinted = key;
      this.el.style.setProperty('--fog', fog.toFixed(3)); this.el.style.setProperty('--shade', shade.toFixed(3)); this.el.style.setProperty('--fogc', rgb);
    }
  }

  drop() { this.shell.space.cssScene.remove(this.obj); this.shell.space.dropOccluder(this.occluder); }

  state() { const { id, x, z, yaw, y } = this, g = this.game; return { id, x, z, yaw, y, game: { name: g.name, url: g.url, created: g.created } }; }
}

export function saveBoxes(boxes) {
  try { localStorage.setItem(KEY, JSON.stringify(boxes.map(b => b.state()))); } catch {}
}

export function loadBoxes() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}

export { titleOf };
