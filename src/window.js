// A window is a slab: a front face, a back face you can write on, and four
// edges. It stands on the ring at angle theta, height y, and depth (how far
// past the ring it has been pushed). Everything eases toward its target.

import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

const THICK = 14;
const STACK = 70;          // how far back each window behind the focused one sits
const SHELF_TURN = 1.25;   // radians a shelved window turns to show its edge

let nextId = 1;

export class Win {
  constructor(shell, app, s = {}) {
    this.shell = shell;
    this.app = app;
    this.id = s.id || `w${nextId++}`;
    const n = parseInt(this.id.slice(1), 10);
    if (n >= nextId) nextId = n + 1;
    this.w = s.w ?? app.w; this.h = s.h ?? app.h;
    this.theta = s.theta ?? 0; this.y = s.y ?? 0; this.depth = s.depth ?? 0;
    this.turn = s.turn ?? 0; this.flipped = !!s.flipped; this.parked = !!s.parked;
    this.notes = s.notes ?? '';
    this.title = app.title;
    this.file = s.file || null;   // what it was opened with, if anything
    this.dirty = false;
    this.rank = 0;
    this.cur = null;              // eased state, set on first update

    const el = document.createElement('div');
    el.className = 'win';
    el.innerHTML = `
      <div class="face front">
        <div class="bar"><span class="icon">${app.icon}</span><span class="title"></span><span class="dirty">●</span><span class="spacer"></span>
          <button data-act="flip" title="Back">⇄</button><button data-act="park" title="Shelf">▭</button><button data-act="close" class="close" title="Close">×</button></div>
        <div class="body"></div><div class="grip"></div>
      </div>
      <div class="face back">
        <div class="bar"><span class="title"></span><span class="spacer"></span><button data-act="flip" title="Front">⇄</button></div>
        <div class="body"><textarea placeholder="Write on the back."></textarea></div>
      </div>
      <div class="edge l"></div><div class="edge r"></div><div class="edge t"></div><div class="edge b"></div>
      <div class="shield"></div>`;
    this.el = el;
    this.front = el.querySelector('.front');
    this.back = el.querySelector('.back');
    this.body = this.front.querySelector('.body');
    const ta = this.back.querySelector('textarea');
    ta.value = this.notes;
    ta.addEventListener('input', () => { this.notes = ta.value; shell.saveLayout(); });
    el.style.setProperty('--thick', THICK + 'px');
    el.style.setProperty('--half', THICK / 2 + 'px');
    this.setTitle(app.title);
    this.size(this.w, this.h);

    for (const face of [this.front, this.back]) {
      const bar = face.querySelector('.bar');
      bar.addEventListener('pointerdown', (e) => this.barDown(e));
      bar.addEventListener('wheel', (e) => { e.preventDefault(); this.depth = Math.max(-200, Math.min(2400, this.depth + e.deltaY * 1.2)); shell.saveLayout(); }, { passive: false });
      bar.addEventListener('contextmenu', (e) => e.preventDefault());
      face.querySelectorAll('button').forEach(b => {
        b.addEventListener('pointerdown', (e) => e.stopPropagation());
        b.addEventListener('click', (e) => { e.stopPropagation(); this.act(b.dataset.act); });
      });
      face.addEventListener('pointerdown', () => shell.focus(this));
    }
    this.front.querySelector('.grip').addEventListener('pointerdown', (e) => this.gripDown(e));
    el.querySelector('.shield').addEventListener('click', (e) => { e.stopPropagation(); shell.shieldClick(this); });

    this.obj = new CSS3DObject(el);
    app.mount ? app.mount(this) : this.mountFrame();
  }

  mountFrame() {
    const f = document.createElement('iframe');
    f.src = this.app.urlFor && this.file ? this.app.urlFor(this.app.url, this.file) : this.app.url;
    f.title = this.app.title;
    f.allow = 'fullscreen; clipboard-read; clipboard-write; autoplay';
    this.frame = f;
    this.body.appendChild(f);
  }

  setTitle(t) {
    this.title = t || this.app.title;
    this.front.querySelector('.title').textContent = this.title;
    this.back.querySelector('.title').textContent = this.title;
  }

  setDirty(d) { this.dirty = !!d; this.el.classList.toggle('dirty', this.dirty); }

  size(w, h) {
    this.w = Math.max(220, Math.round(w)); this.h = Math.max(120, Math.round(h));
    this.el.style.width = this.w + 'px'; this.el.style.height = this.h + 'px';
  }

  act(a) {
    if (a === 'flip') { this.flipped = !this.flipped; this.shell.focus(this); }
    else if (a === 'park') this.shell.park(this);
    else if (a === 'close') this.shell.close(this);
    this.shell.saveLayout();
  }

  /** Screen pixels to ring units at this window's distance. */
  get scale() { return (this.shell.space.D + this.depth + this.rank * STACK) / this.shell.space.D; }

  barDown(e) {
    if (e.target.tagName === 'BUTTON' || this.parked) return;
    e.preventDefault(); e.stopPropagation();
    this.shell.focus(this);
    const turning = e.button === 2 || e.altKey;
    const sx = e.clientX, sy = e.clientY;
    const start = { theta: this.theta, y: this.y, turn: this.turn };
    const D = this.shell.space.D;
    document.body.classList.add('dragging');
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (turning) {
        this.turn = Math.max(-1.3, Math.min(1.3, start.turn + dx / 220));
      } else {
        const r = D + this.depth;
        this.theta = start.theta + dx * this.scale / r;
        this.y = start.y - dy * this.scale;
      }
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      document.body.classList.remove('dragging');
      this.shell.saveLayout();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  gripDown(e) {
    e.preventDefault(); e.stopPropagation();
    this.shell.focus(this);
    const sx = e.clientX, sy = e.clientY, w0 = this.w, h0 = this.h, th0 = this.theta, y0 = this.y;
    const D = this.shell.space.D;
    document.body.classList.add('dragging');
    const move = (ev) => {
      const s = this.scale;
      this.size(w0 + (ev.clientX - sx) * s, h0 + (ev.clientY - sy) * s);
      // grow from the top-left corner, not the middle
      this.theta = th0 + (this.w - w0) / 2 / (D + this.depth);
      this.y = y0 - (this.h - h0) / 2;
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      document.body.classList.remove('dragging');
      this.frame?.contentWindow?.postMessage({ terrarium: 1, type: 'resized', w: this.w, h: this.h - 28 }, '*');
      this.shell.saveLayout();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  /** Where this window wants to be right now. */
  target(shelfIndex) {
    const sp = this.shell.space;
    if (this.parked) {
      const edge = sp.pan - sp.hfov / 2;
      return { theta: edge + 0.1 + shelfIndex * 0.06, y: -40, r: sp.D + 700, turn: SHELF_TURN, flip: 0 };
    }
    return { theta: this.theta, y: this.y, r: sp.D + this.depth + this.rank * STACK, turn: this.turn, flip: this.flipped ? Math.PI : 0 };
  }

  update(dt, shelfIndex) {
    const t = this.target(shelfIndex);
    if (!this.cur) this.cur = { ...t, r: t.r + 900, flip: t.flip };
    const k = 1 - Math.exp(-dt * 10);
    for (const key of ['theta', 'y', 'r', 'turn', 'flip']) this.cur[key] += (t[key] - this.cur[key]) * k;
    const c = this.cur, sp = this.shell.space;
    this.obj.position.copy(sp.ringPos(c.theta, c.y, c.r));
    this.obj.rotation.set(0, -c.theta - c.turn - c.flip, 0);

    // CSS backface culling is not dependable through these transforms: show
    // the face that points at the camera and hide the other
    const yaw = -c.theta - c.turn - c.flip;
    const nx = -Math.sin(-yaw), nz = Math.cos(yaw);
    const cam = sp.camera.position, p = this.obj.position;
    const facing = nx * (cam.x - p.x) + nz * (cam.z - p.z) > 0;
    this.front.style.visibility = facing ? '' : 'hidden';
    this.back.style.visibility = facing ? 'hidden' : '';

    // a window behind the camera has no business being drawn
    const ahead = Math.cos(c.theta - sp.pan);
    this.el.style.display = sp.over < 0.05 && ahead < 0.05 ? 'none' : '';
  }

  state() {
    const { id, w, h, theta, y, depth, turn, flipped, parked, notes, file } = this;
    return { id, app: this.app.id, w, h, theta, y, depth, turn, flipped, parked, notes, file: file && { path: file.path, name: file.name } };
  }
}
