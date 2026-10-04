// A window is a slab: a front face, a back face you can write on, and four
// edges. It stands on the ring at angle theta, height y, and depth (how far
// past the ring it has been pushed). Everything eases toward its target.
// Minimized, it is an icon in a row along the bottom of the view.

import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { GLYPH } from './icons.js';
import { popup, closeMenus, menuBar, offsetIn } from './menu.js';

export const THICK = 14;
export const FRAME = 5;    // the sizing border, outline to outline
export const BAR = 20;     // the title bar
export const CHROME = { w: FRAME * 2, h: FRAME * 2 + BAR };
export const ICON = { w: 76, h: 58 };   // one minimized window's slot
const ICON_NEAR = 0.4;     // the icons' distance, as a fraction of the ring's
const MAX_NEAR = 0.6;      // a maximized window's
const CORNER = 20;         // how far along an edge the corner's sizing reaches

let nextId = 1;

const bar = () => `<div class="bar"><button class="sys" data-act="menu" tabindex="-1" aria-label="Control menu">${GLYPH.sys}</button><span class="title"></span>`
  + `<button class="wb" data-act="min" tabindex="-1" aria-label="Minimize">${GLYPH.min}</button><button class="wb" data-act="max" tabindex="-1" aria-label="Maximize"><span class="g-max">${GLYPH.max}</span><span class="g-res">${GLYPH.restore}</span></button></div>`;

// the sizing border: four edges and four L-shaped corners
const HANDLES = [
  ['n', `left:${CORNER}px;right:${CORNER}px;top:-1px;height:${FRAME}px`],
  ['s', `left:${CORNER}px;right:${CORNER}px;bottom:-1px;height:${FRAME}px`],
  ['w', `top:${CORNER}px;bottom:${CORNER}px;left:-1px;width:${FRAME}px`],
  ['e', `top:${CORNER}px;bottom:${CORNER}px;right:-1px;width:${FRAME}px`],
  ['nw', `left:-1px;top:-1px;width:${CORNER + 1}px;height:${FRAME}px`], ['nw', `left:-1px;top:-1px;width:${FRAME}px;height:${CORNER + 1}px`],
  ['ne', `right:-1px;top:-1px;width:${CORNER + 1}px;height:${FRAME}px`], ['ne', `right:-1px;top:-1px;width:${FRAME}px;height:${CORNER + 1}px`],
  ['sw', `left:-1px;bottom:-1px;width:${CORNER + 1}px;height:${FRAME}px`], ['sw', `left:-1px;bottom:-1px;width:${FRAME}px;height:${CORNER + 1}px`],
  ['se', `right:-1px;bottom:-1px;width:${CORNER + 1}px;height:${FRAME}px`], ['se', `right:-1px;bottom:-1px;width:${FRAME}px;height:${CORNER + 1}px`],
];

export class Win {
  constructor(shell, app, s = {}) {
    this.shell = shell;
    this.app = app;
    this.id = s.id || `w${nextId++}`;
    const n = parseInt(this.id.slice(1), 10);
    if (n >= nextId) nextId = n + 1;
    this.w = s.w ?? app.w; this.h = s.h ?? app.h;
    this.theta = s.theta ?? 0; this.y = s.y ?? 0; this.depth = s.depth ?? 0;
    this.turn = s.turn ?? 0; this.flipped = !!s.flipped;
    this.minimized = !!(s.minimized ?? s.parked);
    this.maximized = !!s.maximized;
    this.normal = s.normal || null;   // where Restore puts a maximized window back
    this.notes = s.notes ?? '';
    this.title = app.title;
    this.file = s.file || null;   // what it was opened with, if anything
    this.dirty = false;
    this.cur = null;              // eased state, set on first update
    this.born = performance.now();

    const el = document.createElement('div');
    el.className = 'win';
    el.innerHTML = `
      <div class="face front"><div class="frame">${bar()}<div class="body"></div></div>
        ${HANDLES.map(([d, css]) => `<div class="rz ${d.length === 1 ? 'edge-' + d : 'corner'}" data-rz="${d}" style="${css}"></div>`).join('')}</div>
      <div class="face back"><div class="frame">${bar()}<div class="mb"></div>
        <div class="body"><textarea spellcheck="false"></textarea></div></div></div>
      <div class="edge l"></div><div class="edge r"></div><div class="edge t"></div><div class="edge b"></div>
      <div class="shield"></div>
      <div class="icon"><div class="img">${app.icon}</div><div class="label"></div></div>`;
    this.el = el;
    this.front = el.querySelector('.front');
    this.back = el.querySelector('.back');
    this.body = this.front.querySelector('.body');
    this.iconEl = el.querySelector('.icon');
    const ta = this.ta = this.back.querySelector('textarea');
    ta.value = this.notes;
    ta.addEventListener('input', () => { this.notes = ta.value; shell.saveLayout(); });
    ta.addEventListener('keydown', (e) => { if (e.key === 'F5') { e.preventDefault(); this.stamp(); } });
    el.style.setProperty('--thick', THICK + 'px');
    el.style.setProperty('--half', THICK / 2 + 'px');

    for (const face of [this.front, this.back]) {
      const b = face.querySelector('.bar');
      b.addEventListener('pointerdown', (e) => this.barDown(e));
      b.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) this.act('max'); });
      b.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (this.maximized) return;
        this.depth = Math.max(-200, Math.min(2400, this.depth + e.deltaY * 1.2)); this.resync = true; shell.saveLayout();
      }, { passive: false });
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      b.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); shell.focus(this); if (btn.dataset.act === 'menu') this.toggleMenu(); });
        if (btn.dataset.act !== 'menu') btn.addEventListener('click', (e) => { e.stopPropagation(); this.act(btn.dataset.act); });
      });
      b.querySelector('.sys').addEventListener('dblclick', (e) => { e.stopPropagation(); closeMenus(); this.act('close'); });
      face.addEventListener('pointerdown', () => shell.focus(this));
    }
    this.front.querySelectorAll('.rz').forEach(h => h.addEventListener('pointerdown', (e) => this.sizeDown(e, h.dataset.rz)));
    el.querySelector('.shield').addEventListener('click', (e) => { e.stopPropagation(); shell.shieldClick(this); });

    // minimized: one click for the control menu, two to restore
    this.iconEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.iconEl.addEventListener('click', (e) => { e.stopPropagation(); if (e.detail === 1) this.toggleMenu(); });
    this.iconEl.addEventListener('dblclick', (e) => { e.stopPropagation(); closeMenus(); shell.restore(this); });

    menuBar(this.back.querySelector('.mb'), this.back, [
      { t: '&File', items: () => [{ t: '&Turn Around', run: () => this.act('flip') }] },
      { t: '&Edit', items: () => [
        { t: 'Select &All', run: () => { ta.focus(); ta.select(); } },
        { t: 'Time/&Date', acc: 'F5', run: () => this.stamp() }, '-',
        { t: '&Word Wrap', check: !ta.classList.contains('nowrap'), run: () => ta.classList.toggle('nowrap') },
      ] },
    ]);

    this.setTitle(app.title);
    this.size(this.w, this.h);
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
    this.el.querySelectorAll('.title').forEach(e => { e.textContent = this.title; });
    this.iconEl.querySelector('.label').textContent = this.title;
    this.shell.onWindows?.();
  }

  setDirty(d) { this.dirty = !!d; this.el.classList.toggle('dirty', this.dirty); }

  size(w, h) {
    this.w = Math.max(220, Math.round(w)); this.h = Math.max(120, Math.round(h));
    this.el.style.width = this.w + 'px'; this.el.style.height = this.h + 'px';
  }

  stamp() {
    const ta = this.ta, n = new Date();
    const s = `${n.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} ${n.toLocaleDateString()}`;
    ta.focus();
    ta.setRangeText(s, ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input'));
  }

  act(a) {
    const s = this.shell;
    if (a === 'flip') { this.flipped = !this.flipped; s.focus(this); }
    else if (a === 'min') s.minimize(this);
    else if (a === 'max') this.maximized ? s.restore(this) : s.maximize(this);
    else if (a === 'close') s.close(this);
    else if (a === 'menu') this.toggleMenu();
    s.saveLayout();
  }

  /** The control menu. */
  menuItems() {
    const s = this.shell, m = this.minimized, x = this.maximized;
    return [
      { t: '&Restore', gray: !m && !x, run: () => s.restore(this) },
      { t: '&Move', gray: m || x, run: () => this.keyMode('move') },
      { t: '&Size', gray: m || x, run: () => this.keyMode('size') },
      { t: 'Mi&nimize', gray: m, run: () => s.minimize(this) },
      { t: 'Ma&ximize', gray: x && !m, run: () => s.maximize(this) },
      '-',
      { t: '&Close', acc: 'Ctrl+F4', run: () => s.close(this) },
      '-',
      { t: 'S&witch To...', acc: 'Ctrl+Esc', run: () => s.taskList() },
      { t: '&Turn Around', gray: m, run: () => this.act('flip') },
    ];
  }

  toggleMenu() {
    if (this.menuEl?.isConnected) return closeMenus();
    const onClose = () => { this.menuEl = null; this.el.classList.remove('menu'); };
    if (this.minimized) {
      this.menuEl = popup(this.iconEl, 0, 0, this.menuItems(), { up: true, onClose });
    } else {
      const face = this.flipped ? this.back : this.front, sys = face.querySelector('.sys'), at = offsetIn(sys, face);
      this.menuEl = popup(face, at.x, at.y + sys.offsetHeight, this.menuItems(), { onClose, focus: sys });
    }
    this.el.classList.add('menu');
  }

  /** Move or Size from the control menu: the arrow keys do it, Enter keeps it, Esc puts it back. */
  keyMode(mode) {
    const s = this.shell, start = { theta: this.theta, y: this.y, w: this.w, h: this.h };
    const face = this.flipped ? this.back : this.front;
    face.querySelector('.sys').focus({ preventScroll: true });
    this.dragging = true;
    this.el.classList.add(mode === 'move' ? 'moving' : 'sizing');
    const D = s.space.D;
    const onKey = (e) => {
      const step = e.ctrlKey ? 1 : 8;
      const dx = { ArrowLeft: -step, ArrowRight: step }[e.key] || 0, dy = { ArrowUp: -step, ArrowDown: step }[e.key] || 0;
      if (dx || dy) {
        if (mode === 'move') { this.theta += dx / (D + this.depth); this.y -= dy; }
        else {
          const w0 = this.w, h0 = this.h;
          this.size(this.w + dx, this.h + dy);
          this.theta += (this.w - w0) / 2 / (D + this.depth); this.y -= (this.h - h0) / 2;
        }
      } else if (e.key === 'Enter' || e.key === 'Escape') {
        if (e.key === 'Escape') { this.size(start.w, start.h); this.theta = start.theta; this.y = start.y; }
        removeEventListener('keydown', onKey, true);
        this.el.classList.remove('moving', 'sizing');
        // set down where the keys put it, not thrown
        this.dragging = false; this.fling = null; this.resync = true;
        this.resized();
        s.saveLayout();
      } else return;
      e.preventDefault(); e.stopImmediatePropagation();
    };
    addEventListener('keydown', onKey, true);
  }

  /** Screen pixels to ring units at this window's distance. */
  get scale() { const D = this.shell.space.D; return (this.cur?.r ?? D + this.depth) / D; }

  barDown(e) {
    if (e.target.closest('button') || this.minimized) return;
    e.preventDefault(); e.stopPropagation();
    this.shell.focus(this);
    if (this.maximized) return;
    const turning = e.button === 2 || e.altKey;
    this.dragging = true;
    const sx = e.clientX, sy = e.clientY;
    const start = { theta: this.theta, y: this.y, turn: this.turn };
    const D = this.shell.space.D;
    document.body.classList.add('dragging');
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (turning) {
        this.turn = start.turn + dx / 220;
      } else {
        const r = D + this.depth;
        this.theta = start.theta + dx * this.scale / r;
        this.y = start.y - dy * this.scale;
      }
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      document.body.classList.remove('dragging');
      this.dragging = false;
      this.shell.saveLayout();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  /** Drag the sizing border; dir is the edge or corner, as compass points. */
  sizeDown(e, dir) {
    if (this.maximized || this.minimized) return;
    e.preventDefault(); e.stopPropagation();
    this.shell.focus(this);
    this.dragging = true;
    const ex = dir.includes('e') ? 1 : dir.includes('w') ? -1 : 0, ey = dir.includes('s') ? 1 : dir.includes('n') ? -1 : 0;
    const sx = e.clientX, sy = e.clientY, w0 = this.w, h0 = this.h, th0 = this.theta, y0 = this.y;
    const D = this.shell.space.D;
    document.body.classList.add('dragging');
    const move = (ev) => {
      const s = this.scale;
      this.size(w0 + ex * (ev.clientX - sx) * s, h0 + ey * (ev.clientY - sy) * s);
      // the opposite edge stays put
      this.theta = th0 + ex * (this.w - w0) / 2 / (D + this.depth);
      this.y = y0 - ey * (this.h - h0) / 2;
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      document.body.classList.remove('dragging');
      this.dragging = false;
      this.resized();
      this.shell.saveLayout();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  resized() {
    this.frame?.contentWindow?.postMessage({ terrarium: 1, type: 'resized', w: this.w - CHROME.w, h: this.h - CHROME.h }, '*');
  }

  /** Where this window would stand if nothing were in its way. */
  target(iconIndex) {
    const sp = this.shell.space;
    if (this.minimized) {
      // a row along the bottom-left of the view, in front of the ring so no
      // window can cover it, facing the eye square and drawn at true size
      const per = Math.max(1, Math.floor((innerWidth - 16) / ICON.w));
      const col = iconIndex % per, row = Math.floor(iconIndex / per);
      const sx = -innerWidth / 2 + 8 + ICON.w / 2 + col * ICON.w;
      const sy = innerHeight / 2 - 6 - ICON.h / 2 - row * ICON.h;
      const phi = Math.atan(sx / sp.D), r = sp.D * ICON_NEAR, along = r * Math.cos(phi);
      return { theta: sp.pan + phi, y: -sy * along / sp.D, r, turn: -phi, flip: 0, scale: along / sp.D };
    }
    if (this.maximized) {
      // nearer than any window in the ring can reach, and shrunk to match
      return { theta: this.theta, y: this.y * MAX_NEAR, r: sp.D * MAX_NEAR, turn: 0, flip: this.flipped ? Math.PI : 0, scale: MAX_NEAR };
    }
    return { theta: this.theta, y: this.y, r: sp.D + this.depth, turn: this.turn, flip: this.flipped ? Math.PI : 0 };
  }

  /** Ease toward t, where the shell has decided this window goes. */
  update(dt, target) {
    const t = { scale: 1, ...target };
    if (!this.cur) this.cur = { ...t, r: t.r + 900, flip: t.flip };
    // glide in from wherever it was (opening, minimized); once there, the
    // world moves it, so follow exactly or the eye sees it lag its collisions
    const k = 1 - Math.exp(-dt * 10);
    const far = Math.abs(t.theta - this.cur.theta) > 0.02 || Math.abs(t.r - this.cur.r) > 20 || Math.abs(t.y - this.cur.y) > 20;
    if (far || this.minimized) this.gliding = true;
    else this.gliding = false;
    for (const key of ['theta', 'y', 'r', 'turn']) this.cur[key] += (t[key] - this.cur[key]) * (this.gliding ? k : 1);
    for (const key of ['flip', 'scale']) this.cur[key] += (t[key] - this.cur[key]) * k;
    const c = this.cur, sp = this.shell.space;
    this.el.classList.toggle('minimized', this.minimized);
    this.el.classList.toggle('maximized', this.maximized && !this.minimized);
    this.el.classList.toggle('overview', sp.overTarget > 0);
    this.obj.position.copy(sp.ringPos(c.theta, c.y, c.r));
    this.obj.scale.setScalar(c.scale);
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
    const { id, w, h, theta, y, depth, turn, flipped, minimized, maximized, normal, notes, file } = this;
    return { id, app: this.app.id, w, h, theta, y, depth, turn, flipped, minimized, maximized, normal, notes, file: file && { path: file.path, name: file.name } };
  }
}
