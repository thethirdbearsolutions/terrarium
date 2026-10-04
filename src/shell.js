// The shell: windows, focus, minimizing and maximizing, the overview,
// dialogs, files, and the terrarium/1 conversation with every framed app.

import * as fs from './fs.js';
import { APPS, appById, appForName } from './apps.js';
import { Win, THICK, CHROME } from './window.js';
import { Body, step } from './physics.js';
import { closeMenus } from './menu.js';
import { mountFiles, fileDialog, importFiles, exportFile } from './files.js';
import { mountClock } from './clock.js';
import { mountProgman } from './progman.js';
import { mountControl } from './control.js';
import { ask, message, taskList } from './dialogs.js';

const LAYOUT_KEY = 'terrarium.layout';
const LAYOUT_V = 2;   // layouts from before Program Manager get one on restore
const BUILTIN = { files: mountFiles, clock: mountClock, progman: mountProgman, control: mountControl };
const ROOM = { near: 0.55, far: 2.8 };   // the walls, as multiples of the ring's radius
const MAX_MARGIN = 10;                    // around a maximized window, in screen px
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** A dialog rides in front of the window that asked for it, or of the eye. */
export class Dialog extends Win {
  constructor(shell, owner, app) {
    super(shell, app);
    this.owner = owner;
    this.el.classList.add('dialog');
    this.el.querySelectorAll('.wb, .rz').forEach(b => b.remove());
  }
  size(w, h) { this.w = Math.max(120, Math.round(w)); this.h = Math.max(60, Math.round(h)); this.el.style.width = this.w + 'px'; this.el.style.height = this.h + 'px'; }
  menuItems() { return [{ t: '&Move', gray: true }, '-', { t: '&Close', acc: 'Alt+F4', run: () => this.act('close') }]; }
  act(a) { if (a === 'close') { this.onCancel ? this.onCancel() : this.shell.closeDialog(this); } else if (a === 'menu') this.toggleMenu(); }
  barDown(e) { if (!e.target.closest('button')) e.stopPropagation(); }
  target() {
    const o = this.owner, sp = this.shell.space;
    if (o && !o.minimized && (this.shell.wins.includes(o) || this.shell.dialogs.includes(o))) {
      const oc = o.cur || o.target(0), r = oc.r - 140;
      return { theta: oc.theta, y: oc.y + 20, r, turn: oc.turn, flip: 0, scale: r / oc.r * (oc.scale ?? 1) };
    }
    const r = sp.D - 140;
    return { theta: sp.pan, y: 20, r, turn: 0, flip: 0, scale: r / sp.D };
  }
  /** Shrink to fit what was put in it. */
  fit() {
    const c = this.body.firstElementChild;
    this.size(c.offsetWidth + CHROME.w, c.offsetHeight + CHROME.h);
  }
}

export class Shell {
  constructor(space) {
    this.space = space;
    this.wins = [];
    this.order = [];      // focus order, most recent first
    this.dialogs = [];
    this.pending = new Map();
    addEventListener('message', (e) => this.onMessage(e));
    // a click inside a frame never reaches us; the page losing focus to it does
    addEventListener('blur', () => setTimeout(() => {
      const f = document.activeElement;
      if (f?.tagName !== 'IFRAME') return;
      const w = this.wins.find(w => w.frame === f);
      if (!w) return;
      // an app that grabs the focus as it loads doesn't get to take it from the window you're using
      if (performance.now() - w.born < 2500 && this.order[0] !== w) { f.blur(); this.order[0]?.frame?.focus(); return; }
      this.focus(w, true);
    }));
    addEventListener('resize', () => {
      for (const w of this.wins) if (w.maximized && !w.minimized) { const th = w.theta; this.fitMax(w); w.theta = th; }
    });
  }

  // ---- windows -------------------------------------------------------------

  launch(app, s = {}) {
    if (BUILTIN[app.builtin]) app = { ...app, mount: BUILTIN[app.builtin] };
    const sp = this.space, placed = s.theta !== undefined;
    const w = new Win(this, app, { y: -30, ...s, ...(placed ? {} : this.freeSpot(s.w ?? app.w, s.h ?? app.h, s.y ?? -30)) });
    this.wins.push(w);
    sp.cssScene.add(w.obj);
    if (!w.minimized) this.focus(w);
    if (!placed) this.bring(w);
    this.saveLayout();
    this.onWindows?.();
    return w;
  }

  /** The nearest place to the one in front where a window this big stands clear of the others. */
  freeSpot(ww, hh, y) {
    const sp = this.space, D = sp.D, gap = 16;
    const others = this.wins.filter(o => !o.minimized && !o.maximized && Math.abs(o.y - y) < (o.h + hh) / 2);
    const clear = (th) => others.every(o => {
      const d = Math.abs(wrap(o.theta - th)) * D;
      return d > (o.w * D / (D + o.depth) + ww) / 2 + gap;
    });
    const steps = Math.ceil(Math.PI * D / 20) * 2;
    for (let k = 0; k < steps; k++) {
      const th = sp.panTarget + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 20 / D;
      if (clear(th)) return { theta: th };
    }
    // a full ring: in front of the one you're looking at
    return { theta: sp.panTarget, depth: -160 };
  }

  focus(w, fromFrame = false) {
    if (w instanceof Dialog || !this.wins.includes(w)) return;
    this.order = [w, ...this.order.filter(o => o !== w)];
    this.wins.forEach(o => o.el.classList.toggle('focused', o === w));
    if (!fromFrame) w.frame?.focus();
    for (const o of this.wins) o.frame?.contentWindow?.postMessage({ terrarium: 1, type: o === w ? 'focus' : 'blur' }, '*');
  }

  get progmanApp() { return appById('progman'); }

  get top() { return this.order.find(w => !w.minimized); }

  minimize(w) {
    closeMenus();
    w.minimized = true;
    this.order = [...this.order.filter(o => o !== w), w];
    w.el.classList.remove('focused');
    const next = this.top;
    if (next) this.focus(next);
    this.saveLayout();
    this.onWindows?.();
  }

  /** Back from an icon, or from maximized. */
  restore(w) {
    closeMenus();
    if (w.minimized) {
      w.minimized = false;
      if (w.maximized) this.fitMax(w);
      else { w.theta = this.space.panTarget; w.y = -30; w.turn = 0; w.depth = 0; }
      w.resync = true;
    } else if (w.maximized) {
      w.maximized = false;
      const n = w.normal || { w: w.app.w, h: w.app.h, theta: w.theta, y: -30, depth: 0, turn: 0 };
      w.size(n.w, n.h);
      Object.assign(w, { theta: n.theta, y: n.y, depth: n.depth, turn: n.turn });
      w.normal = null; w.resync = true;
      w.resized();
    }
    this.focus(w);
    this.saveLayout();
    this.onWindows?.();
  }

  maximize(w) {
    closeMenus();
    if (!w.maximized) w.normal = { w: w.w, h: w.h, theta: w.theta, y: w.y, depth: w.depth, turn: w.turn };
    w.maximized = true;
    w.minimized = false;
    this.fitMax(w);
    this.focus(w);
    this.saveLayout();
    this.onWindows?.();
  }

  /** Face the eye, as big as the view. */
  fitMax(w) {
    w.theta = this.space.panTarget; w.y = 0; w.depth = 0; w.turn = 0;
    w.size(innerWidth - MAX_MARGIN * 2, innerHeight - MAX_MARGIN * 2);
    w.resync = true;
    w.resized();
  }

  /** Turn to face a window. */
  bring(w) {
    if (w.minimized) return this.restore(w);
    const sp = this.space, d = w.theta - sp.panTarget;
    sp.panTarget += Math.atan2(Math.sin(d), Math.cos(d));
    this.focus(w);
  }

  /** What Program Manager and the Task List do: bring the one you have, or start one. */
  start(app, another = false) {
    if (this.space.overTarget) this.setOverview(false);
    const mine = this.order.concat(this.wins.filter(w => !this.order.includes(w))).filter(w => w.app.id === app.id);
    if (mine[0] && !another) { this.bring(mine[0]); return mine[0]; }
    return this.launch(app);
  }

  async close(w, force = false) {
    closeMenus();
    if (w.dirty && !force && !(await ask(this, w, `${w.title} has changes that aren't saved.\n\nClose it anyway?`, { yes: 'Close', icon: 'exclamation' }))) return;
    this.dialogs.filter(d => d.owner === w).forEach(d => this.closeDialog(d));
    w.onClose?.();
    this.space.cssScene.remove(w.obj);
    this.wins = this.wins.filter(o => o !== w);
    this.order = this.order.filter(o => o !== w);
    if (this.top) this.focus(this.top);
    this.saveLayout();
    this.onWindows?.();
  }

  shieldClick(w) {
    if (this.space.overTarget > 0) { this.setOverview(false); this.bring(w); }
  }

  setOverview(on) {
    this.space.overTarget = on ? 1 : 0;
    this.onWindows?.();
  }

  turn(dir) {
    this.space.panTarget += dir * this.space.hfov * 0.6;
    this.saveLayout();
  }

  // ---- arranging -----------------------------------------------------------

  /** The windows that are up, focused first. */
  get standing() { return this.order.filter(w => !w.minimized).concat(this.wins.filter(w => !w.minimized && !this.order.includes(w))); }

  unmax(w) {
    if (!w.maximized) return;
    w.maximized = false;
    if (w.normal) w.size(w.normal.w, w.normal.h);
    w.normal = null;
  }

  /** Stacked, each one a title bar further down and to the right, and further back. */
  cascade() {
    const ws = this.standing.reverse(), D = this.space.D, n = ws.length;
    ws.forEach((w, i) => {
      this.unmax(w);
      const k = n - 1 - i;   // how far back
      w.depth = k * 60; w.turn = 0;
      const r = D + w.depth;
      w.theta = this.space.panTarget + (i - (n - 1) / 2) * 26 / r;
      w.y = 60 - i * 26 + (k * 60) * 0.1;
      w.resync = true;
    });
    if (ws.length) this.focus(ws[n - 1]);
    this.saveLayout();
  }

  /** Side by side along the ring, centered on the view. */
  tile() {
    const ws = this.standing, D = this.space.D, gap = 24;
    ws.forEach(w => this.unmax(w));
    // the focused one in the middle, the rest alternating out to either side
    const row = [];
    ws.forEach((w, i) => (i % 2 ? row.unshift(w) : row.push(w)));
    const total = row.reduce((s, w) => s + w.w + gap, -gap);
    let x = -total / 2;
    for (const w of row) {
      w.theta = this.space.panTarget + (x + w.w / 2) / D;
      w.depth = 0; w.turn = 0; w.y = 0;
      w.resync = true;
      x += w.w + gap;
    }
    this.saveLayout();
  }

  /** Icons in title order. */
  arrangeIcons() {
    const icons = this.wins.filter(w => w.minimized).sort((a, b) => a.title.localeCompare(b.title));
    this.wins = this.wins.filter(w => !w.minimized).concat(icons);
    this.saveLayout();
  }

  taskList() { closeMenus(); return taskList(this); }

  // ---- dialogs -------------------------------------------------------------

  dialog(owner, app) {
    const d = new Dialog(this, owner, app);
    this.dialogs.push(d);
    this.space.cssScene.add(d.obj);
    if (owner && !owner.minimized && this.wins.includes(owner)) this.bring(owner);
    if (this.space.overTarget) this.setOverview(false);
    return d;
  }

  closeDialog(d) {
    if (!this.dialogs.includes(d)) return;
    closeMenus();
    this.dialogs = this.dialogs.filter(o => o !== d);
    this.space.cssScene.remove(d.obj);
    d.onClose?.();
    d.owner?.frame?.focus();
  }

  update(dt) {
    const sp = this.space, D = sp.D;
    const icons = this.wins.filter(w => w.minimized);
    // a maximized window stands out of the ring, in front of it, and out of the world
    const live = this.wins.filter(w => !w.minimized && !w.maximized);

    for (const w of live) {
      const hand = this.handPose(w);
      if (!w.slab || w.resync) {
        w.slab = new Body(hand);
        w.resync = false;
      }
      const b = w.slab;
      b.hw = w.w / 2; b.hh = w.h / 2; b.ht = THICK / 2; b.y = w.y;
      if (w.dragging) {
        // held: it goes where the hand puts it, at whatever speed that takes
        b.kinematic = true;
        b.vx = (hand.x - b.x) / dt; b.vz = (hand.z - b.z) / dt; b.w = wrap(hand.yaw - b.yaw) / dt;
        const a = 0.35;
        w.fling = w.fling
          ? { vx: w.fling.vx + (b.vx - w.fling.vx) * a, vz: w.fling.vz + (b.vz - w.fling.vz) * a, w: w.fling.w + (b.w - w.fling.w) * a }
          : { vx: b.vx, vz: b.vz, w: b.w };
      } else if (b.kinematic) {
        // let go: thrown with the hand's recent speed
        b.kinematic = false;
        Object.assign(b, w.fling || { vx: 0, vz: 0, w: 0 });
        w.fling = null;
      }
    }

    step(live.map(w => w.slab), dt, { near: ROOM.near * D, far: ROOM.far * D });

    let moving = false;
    for (const w of live) {
      const b = w.slab;
      if (w.dragging) continue;
      w.theta = Math.atan2(b.x, -b.z);
      w.depth = Math.hypot(b.x, b.z) - D;
      w.turn = wrap(-b.yaw - w.theta);
      moving ||= b.moving;
    }
    if (moving) this.saveLayout();

    for (const w of this.wins) w.update(dt, w.target(icons.indexOf(w)));
    for (const d of this.dialogs) d.update(dt, d.target());
  }

  /** Where a window's own numbers put it on the floor. */
  handPose(w) {
    const r = this.space.D + w.depth;
    return { x: r * Math.sin(w.theta), z: -r * Math.cos(w.theta), yaw: -w.theta - w.turn, y: w.y };
  }

  // ---- files ---------------------------------------------------------------

  async openFile(f, from = null) {
    const app = appForName(f.name);
    if (!app) {
      if (fs.ext(f.name) === '.pdf' || !/^text\//.test(f.mime || '')) return exportFile(await fs.read(f.path));
      return message(this, from, `No application is associated with this file.\n\n${fs.dosPath(f.path)}`, { title: 'File Manager', icon: 'exclamation' });
    }
    const file = await fs.read(f.path);
    const w = this.launch(app, { file });
    w.setTitle(`${app.title} - ${f.name.toLowerCase()}`);
  }

  // ---- terrarium/1 ---------------------------------------------------------

  send(w, msg) { w.frame?.contentWindow?.postMessage({ terrarium: 1, ...msg }, '*'); }

  async onMessage(e) {
    const m = e.data;
    if (!m || m.terrarium !== 1) return;
    const w = this.wins.find(o => o.frame && o.frame.contentWindow === e.source);
    if (!w) return;
    const reply = (ok, rest) => this.send(w, { type: 'reply', id: m.id, ok, ...rest });
    try {
      switch (m.type) {
        case 'hello':
          w.hello = true;
          w.accepts = m.accepts || [];
          if (m.title && !w.file) w.setTitle(m.title);
          this.send(w, { type: 'welcome', windowId: w.id, file: w.app.urlFor ? null : w.file });
          return;
        case 'title': return w.setTitle(String(m.title || ''));
        case 'dirty': return w.setDirty(m.dirty);
        case 'close': return this.close(w, true);
        case 'resize': return w.maximized || w.size(m.w + CHROME.w, (m.h || 0) + CHROME.h);
        case 'open': {
          const path = await fileDialog(this, w, { mode: 'open', accept: m.accept });
          if (!path) return reply(false, { error: 'cancelled' });
          const file = await fs.read(path);
          w.file = file; this.saveLayout();
          return reply(true, { file });
        }
        case 'save': {
          let path = m.path;
          if (!path) {
            path = await fileDialog(this, w, { mode: 'save', name: m.name || 'untitled' });
            if (!path) return reply(false, { error: 'cancelled' });
          }
          const file = await fs.write(path, m.content ?? '', m.mime);
          if (appForName(file.name) === w.app) { w.file = { path: file.path, name: file.name }; this.saveLayout(); }
          return reply(true, { path: file.path });
        }
        case 'read': return reply(true, { file: await fs.read(m.path) });
        case 'list': return reply(true, { entries: await fs.list(m.dir || '/Documents') });
        default: if (m.id != null) reply(false, { error: `unknown request ${m.type}` });
      }
    } catch (err) {
      reply(false, { error: err.message });
    }
  }

  // ---- layout --------------------------------------------------------------

  saveLayout() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify({ v: LAYOUT_V, pan: this.space.panTarget, focus: this.order[0]?.id, windows: this.wins.map(w => w.state()) }));
      } catch {}
    }, 200);
  }

  async restoreLayout() {
    let layout = null;
    try { layout = JSON.parse(localStorage.getItem(LAYOUT_KEY)); } catch {}
    const sp = this.space;
    if (!layout?.windows) {
      const welcome = await fs.stat('/Documents/Welcome.txt');
      if (welcome && appForName('Welcome.txt')) {
        await this.openFile(welcome);
        Object.assign(this.wins.at(-1), { theta: -0.95, y: -20, turn: 0.2 });
      }
      this.launch(appById('clock'), { theta: 0.62, y: -150, turn: -0.15 });
      this.launch(appById('progman'), { theta: 0, y: -10 });
      sp.pan = sp.panTarget = 0;
      return;
    }
    sp.pan = sp.panTarget = layout.pan || 0;
    let focus = null;
    for (const s of layout.windows) {
      const app = appById(s.app);
      if (!app) continue;
      let file = null;
      if (s.file?.path) { try { file = await fs.read(s.file.path); } catch {} }
      const w = this.launch(app, { ...s, file });
      if (file) w.setTitle(`${app.title} - ${file.name.toLowerCase()}`);
      if (s.id === layout.focus) focus = w;
    }
    if ((layout.v || 1) < LAYOUT_V && !this.wins.some(w => w.app.id === 'progman')) focus = this.launch(appById('progman'), { y: -10 });
    if (focus && !focus.minimized) this.focus(focus);
  }

  async drop(files) { await importFiles(files, '/Documents'); }
}

export { APPS };
