// A window is a slab: a front face, a back face you can write on, and four
// edges. It stands on the floor at (x, z), its middle at height y, turned to
// yaw (0 faces +z). Everything eases toward its target. Minimized, it is an
// icon in a row along the bottom of the view, riding along with the eye.

import { Vector3, Quaternion } from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { GLYPH } from './icons.js';
import { FLOOR_Y, CEIL_Y } from './space.js';
import { popup, closeMenus, menuBar, offsetIn, openMenu } from './menu.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const UP = new Vector3(0, 1, 0);

export const THICK = 14;
export const FRAME = 5;    // the sizing border, outline to outline
export const BAR = 20;     // the title bar
export const CHROME = { w: FRAME * 2, h: FRAME * 2 + BAR };
export const ICON = { w: 76, h: 58 };   // one minimized window's slot
const ICON_NEAR = 0.05;    // the icons' distance, as a fraction of D: nearer than you can get to a window
const MAX_NEAR = 0.6;      // a maximized window's
const CORNER = 20;         // how far along an edge the corner's sizing reaches
const SHADE = 0.14;        // how much darker a window square to z is than one square to x, as with the walls
export const CARRY = {
  push: 260,               // screen px dragged up to carry a window e times further off
  near: 0.4, far: 12,      // how near and far you can hold one, as shares of D
};

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
    this.x = s.x ?? 0; this.z = s.z ?? 0; this.yaw = s.yaw ?? 0; this.y = s.y ?? 0;
    this.flipped = !!s.flipped;
    this.minimized = !!(s.minimized ?? s.parked);
    this.maximized = !!s.maximized;
    this.normal = s.normal || null;   // where Restore puts a maximized window back
    this.hand = null;                 // where a hand (or the keys) is putting it, while held
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
        // raise it or lower it
        this.y = Math.max(FLOOR_Y + this.h / 2 + 2, Math.min(CEIL_Y - this.h / 2 - 2, this.y - e.deltaY * 0.6));
        if (this.hand) this.hand.y = this.y;
        shell.saveLayout();
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
    el.win = this;
    this.occluder = shell.space.occluder();
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
    const s = this.shell, start = { x: this.x, z: this.z, y: this.y, w: this.w, h: this.h };
    const face = this.flipped ? this.back : this.front;
    face.querySelector('.sys').focus({ preventScroll: true });
    this.hold();
    this.el.classList.add(mode === 'move' ? 'moving' : 'sizing');
    const R = s.space.player.right, A = this.across;
    const onKey = (e) => {
      const step = e.ctrlKey ? 1 : 8;
      const dx = { ArrowLeft: -step, ArrowRight: step }[e.key] || 0, dy = { ArrowUp: -step, ArrowDown: step }[e.key] || 0;
      if (dx || dy) {
        if (mode === 'move') { this.hand.x += R.x * dx; this.hand.z += R.z * dx; this.hand.y -= dy; }
        else {
          const w0 = this.w, h0 = this.h;
          this.size(this.w + dx, this.h + dy);
          this.hand.x += A.x * (this.w - w0) / 2; this.hand.z += A.z * (this.w - w0) / 2; this.hand.y -= (this.h - h0) / 2;
        }
        this.y = this.hand.y;
      } else if (e.key === 'Enter' || e.key === 'Escape') {
        if (e.key === 'Escape') { this.size(start.w, start.h); Object.assign(this, { x: start.x, z: start.z, y: start.y }); this.resync = true; }
        removeEventListener('keydown', onKey, true);
        this.el.classList.remove('moving', 'sizing');
        // set down where the keys put it, not thrown
        this.letGo(false);
        this.resized();
        s.saveLayout();
      } else return;
      e.preventDefault(); e.stopImmediatePropagation();
    };
    addEventListener('keydown', onKey, true);
  }

  /** Take hold: from now the hand says where it goes. */
  hold() {
    this.dragging = true;
    this.hand = { x: this.x, z: this.z, yaw: this.yaw, y: this.y };
  }

  /** Let go, thrown with the hand's speed or just set down. */
  letGo(thrown = true) {
    this.dragging = false;
    this.hand = null;
    this.carry = null;
    if (!thrown) { this.trail = null; this.resync = true; }
  }

  /** Across the face, left to right as you look at the front. */
  get across() { return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }; }

  /** Which way the front faces. */
  get facing() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }

  /** World px per screen px at this window, from where you stand. */
  get scale() {
    const sp = this.shell.space, p = sp.player, F = p.forward;
    if (this.maximized || this.minimized) return this.cur?.scale ?? 1;
    const ahead = (this.x - p.x) * F.x + (this.z - p.z) * F.z;
    return Math.max(0.05, ahead / sp.D);
  }

  /**
   * Pick it up by the bar. It's held where it is relative to you, so it comes
   * along as you walk; across moves it across, up pushes it away and down
   * pulls it near. Let go while it's moving and it's thrown.
   */
  barDown(e) {
    if (e.target.closest('button') || this.minimized) return;
    e.preventDefault(); e.stopPropagation();
    this.shell.focus(this);
    if (this.maximized) return;
    const turning = e.button === 2 || e.altKey, sp = this.shell.space;
    this.hold();
    const c = this.carry = this.shell.carryFrom(this);
    let px = e.clientX, py = e.clientY, moved = false;
    const sx = px, sy = py;
    document.body.classList.add('dragging');
    const move = (ev) => {
      const dx = ev.clientX - px, dy = ev.clientY - py;
      px = ev.clientX; py = ev.clientY;
      if (Math.abs(px - sx) + Math.abs(py - sy) > 3) moved = true;
      if (turning) c.turn -= dx / 220;
      else {
        c.side += dx * Math.max(0.05, c.ahead / sp.D);
        c.ahead = Math.max(sp.D * CARRY.near, Math.min(sp.D * CARRY.far, c.ahead * Math.exp(-dy / CARRY.push)));
      }
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      document.body.classList.remove('dragging');
      this.letGo(moved);
      // a click on the bar, not a drag: go and stand square in front of it
      if (!moved && !turning) this.shell.bring(this);
      this.shell.saveLayout();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  /** Drag the sizing border; dir is the edge or corner, as compass points. */
  sizeDown(e, dir) {
    if (this.maximized || this.minimized) return;
    e.preventDefault(); e.stopPropagation();
    this.shell.focus(this);
    this.hold();
    const ex = dir.includes('e') ? 1 : dir.includes('w') ? -1 : 0, ey = dir.includes('s') ? 1 : dir.includes('n') ? -1 : 0;
    const sx = e.clientX, sy = e.clientY, w0 = this.w, h0 = this.h, start = { ...this.hand }, k = this.scale, A = this.across;
    // seen from behind, the window's left is your right
    const side = this.flipped ? -1 : 1;
    document.body.classList.add('dragging');
    const move = (ev) => {
      this.size(w0 + ex * (ev.clientX - sx) * k, h0 + ey * (ev.clientY - sy) * k);
      // the opposite edge stays put
      const m = side * ex * (this.w - w0) / 2;
      this.hand.x = start.x + A.x * m; this.hand.z = start.z + A.z * m;
      this.hand.y = this.y = start.y - ey * (this.h - h0) / 2;
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      document.body.classList.remove('dragging');
      this.letGo(false);
      this.resized();
      this.shell.saveLayout();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  resized() {
    this.frame?.contentWindow?.postMessage({ terrarium: 1, type: 'resized', w: this.w - CHROME.w, h: this.h - CHROME.h }, '*');
  }

  /**
   * Where this window goes: { x, y, z, yaw, flip, scale }, or { local } for
   * a place in the eye's own frame that rides along with it. punch: nothing
   * in the maze covers it.
   */
  target(iconIndex) {
    const sp = this.shell.space;
    if (this.minimized) {
      // a row along the bottom-left of the view, nearer than anything else,
      // facing the eye square and drawn at true size
      const per = Math.max(1, Math.floor((innerWidth - 16) / ICON.w));
      const col = iconIndex % per, row = Math.floor(iconIndex / per);
      const sx = -innerWidth / 2 + 8 + ICON.w / 2 + col * ICON.w;
      const sy = innerHeight / 2 - 6 - ICON.h / 2 - row * ICON.h;
      const along = sp.D * ICON_NEAR, k = along / sp.D;
      return { local: { x: sx * k, y: -sy * k, z: -along }, flip: 0, scale: k, punch: true };
    }
    if (this.maximized) {
      // nearer than anything else can reach, and shrunk to match
      return { x: this.x, z: this.z, y: this.y * MAX_NEAR, yaw: this.yaw, flip: this.flipped ? Math.PI : 0, scale: MAX_NEAR };
    }
    return { x: this.x, z: this.z, y: this.y, yaw: this.yaw, flip: this.flipped ? Math.PI : 0 };
  }

  /** Ease toward t, where the shell has decided this window goes. */
  update(dt, target) {
    const t = { scale: 1, ...target }, sp = this.shell.space, cam = sp.camera;
    const k = 1 - Math.exp(-dt * 10);
    if (!this.cur) {
      // come in from further off
      const p = t.local ? cam.localToWorld(new Vector3(t.local.x, t.local.y, t.local.z * 3)) : null;
      const at = p ? { x: p.x, y: p.y, z: p.z, yaw: sp.cam.yaw } : { x: t.x, y: t.y, z: t.z, yaw: t.yaw };
      const dx = at.x - sp.cam.x, dz = at.z - sp.cam.z, d = Math.hypot(dx, dz) || 1;
      this.cur = { ...at, x: at.x + dx / d * 900, z: at.z + dz / d * 900, flip: t.flip, scale: t.scale };
    }
    const c = this.cur;
    if (t.local) {
      // riding with the eye: ease in the eye's own frame
      if (!c.local) { c.local = cam.worldToLocal(new Vector3(c.x, c.y, c.z)); c.turn = wrap(c.yaw - sp.cam.yaw); }
      c.local.x += (t.local.x - c.local.x) * k; c.local.y += (t.local.y - c.local.y) * k; c.local.z += (t.local.z - c.local.z) * k;
      c.turn += (0 - c.turn) * k;
      const p = cam.localToWorld(c.local.clone());
      c.x = p.x; c.y = p.y; c.z = p.z; c.yaw = sp.cam.yaw + c.turn;
      this.gliding = true;
    } else {
      c.local = null;
      // glide in from wherever it was (opening, minimized); once there, the
      // world moves it, so follow exactly or the eye sees it lag its collisions
      const far = Math.hypot(t.x - c.x, t.z - c.z) > 20 || Math.abs(t.y - c.y) > 20 || Math.abs(wrap(t.yaw - c.yaw)) > 0.02;
      this.gliding = far;
      const g = far ? k : 1;
      c.x += (t.x - c.x) * g; c.z += (t.z - c.z) * g; c.y += (t.y - c.y) * g;
      c.yaw += wrap(t.yaw - c.yaw) * g;
    }
    for (const key of ['flip', 'scale']) c[key] += (t[key] - c[key]) * k;

    this.el.classList.toggle('minimized', this.minimized);
    this.el.classList.toggle('maximized', this.maximized && !this.minimized);
    this.el.classList.toggle('overview', sp.overTarget > 0);
    let yaw = c.yaw + c.flip;
    this.obj.position.set(c.x, c.y, c.z);
    this.obj.scale.setScalar(c.scale);
    if (c.local) this.obj.quaternion.copy(cam.quaternion).multiply(new Quaternion().setFromAxisAngle(UP, c.turn + c.flip));
    else this.obj.rotation.set(0, yaw, 0, 'YXZ');

    // CSS backface culling is not dependable through these transforms: show
    // the face that points at the camera and hide the other
    const eye = cam.position;
    const facing = Math.sin(yaw) * (eye.x - c.x) + Math.cos(yaw) * (eye.z - c.z) > 0;
    this.front.style.visibility = facing ? '' : 'hidden';
    this.back.style.visibility = facing ? 'hidden' : '';

    // a window wholly behind the eye has no business being drawn, nor one wholly behind a wall
    const shown = this.minimized || this.inView(sp);
    // hidden, not taken out of the layout: an app loading in a frame that isn't laid out thinks it has no size
    this.el.classList.toggle('unseen', !shown);

    // its occluder, the same size and in the same place
    const o = this.occluder;
    o.visible = shown;
    o.position.copy(this.obj.position);
    o.quaternion.copy(this.obj.quaternion);
    o.scale.copy(this.obj.scale);
    const w = this.minimized ? ICON.w : this.w, h = this.minimized ? ICON.h : this.h;
    o.slab.scale.set(w, h, this.minimized ? 1 : THICK);
    sp.punch(o, !!t.punch);
    this.menuOccluder();

    // standing in the maze it's in the same light as the walls: a shadow under
    // it, a little shade turned the way the walls are shaded, and the fog
    const inWorld = shown && !this.minimized && !this.maximized && !t.punch;
    if (inWorld) sp.shadowOf(o, c, this.w, this.h, c.scale);
    else o.shadow.visible = false;
    let fog = 0, shade = 0;
    if (inWorld) {
      fog = sp.fogAt(c);
      // none where you'd read it, all of it a few steps further off
      const off = Math.hypot(c.x - eye.x, c.z - eye.z) / sp.D;
      shade = SHADE * Math.cos(yaw) ** 2 * Math.max(0, Math.min(1, (off - 1.3) / 1.3));
    }
    this.tint(fog, shade, sp.scene.fog.color);
  }

  /** Lay the fog and the shade over its faces and edges. */
  tint(fog, shade, color) {
    const f = fog.toFixed(3), s = shade.toFixed(3), rgb = `${Math.round(color.r * 255)} ${Math.round(color.g * 255)} ${Math.round(color.b * 255)}`;
    if (f === this.tinted?.f && s === this.tinted.s && rgb === this.tinted.rgb) return;
    this.tinted = { f, s, rgb };
    this.el.style.setProperty('--fog', f);
    this.el.style.setProperty('--shade', s);
    this.el.style.setProperty('--fogc', rgb);
  }

  /** Is any of it in front of the eye and not behind a wall? */
  inView(sp) {
    const c = this.cur, A = { x: Math.cos(c.yaw), z: -Math.sin(c.yaw) }, hw = this.w / 2 * c.scale;
    const ends = [-1, -0.5, 0, 0.5, 1].map(f => ({ x: c.x + A.x * hw * f, z: c.z + A.z * hw * f }));
    const ahead = ends.map(p => sp.toView(p).ahead);
    if (ahead.every(a => a < 1)) return false;
    if (sp.over > 0.02 || this.dragging) return true;
    // walls run floor to ceiling, so seen from the eye only x and z matter
    const e = sp.cam;
    return ends.some(p => sp.wallDistance(e.x, e.z, p.x - e.x, p.z - e.z) >= 1);
  }

  /** An open menu that hangs past the window's edge still shows over the maze. */
  menuOccluder() {
    const m = this.occluder.menu, el = openMenu();
    if (!el || el.closest('.win') !== this.el) { m.visible = false; return; }
    const at = offsetIn(el, this.el), w = this.minimized ? ICON.w : this.w, h = this.minimized ? ICON.h : this.h;
    const ow = el.offsetWidth + 4, oh = el.offsetHeight + 4;
    const front = this.flipped ? -1 : 1;
    m.visible = true;
    m.position.set((at.x + ow / 2 - w / 2) * front, h / 2 - (at.y + oh / 2), THICK);
    m.scale.set(ow, oh, 1);
  }

  state() {
    const { id, w, h, x, z, yaw, y, flipped, minimized, maximized, normal, notes, file } = this;
    return { id, app: this.app.id, w, h, x, z, yaw, y, flipped, minimized, maximized, normal, notes, file: file && { path: file.path, name: file.name } };
  }
}
