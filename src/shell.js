// The shell: windows, focus, minimizing and maximizing, the overview,
// dialogs, files, and the terrarium/1 conversation with every framed app.

import * as fs from './fs.js';
import { APPS, appById, appForName } from './apps.js';
import { Win, THICK, CHROME } from './window.js';
import { Body, step, contact } from './physics.js';
import { cellAt, cellCenter, path, clearOf, clearLine, nearestClear } from './maze.js';
import { migrate, ringToWorld, settle, LAYOUT_V } from './layout.js';
import { closeMenus } from './menu.js';
import { mountFiles, fileDialog, importFiles, exportFile } from './files.js';
import { mountClock } from './clock.js';
import { mountProgman } from './progman.js';
import { mountControl } from './control.js';
import { ask, message, taskList } from './dialogs.js';

const LAYOUT_KEY = 'terrarium.layout';
const BUILTIN = { files: mountFiles, clock: mountClock, progman: mountProgman, control: mountControl };
const MAX_MARGIN = 10;                    // around a maximized window, in screen px
const MAX_NEAR = 0.6;                     // a maximized window's distance, as a share of D
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const THROW_WINDOW = 90;                  // ms of a held window's travel that a throw takes its speed from

/** The speed a window leaves the hand with: its travel over the last moment. */
function throwOf(trail) {
  const still = { vx: 0, vz: 0, w: 0 };
  if (!trail || trail.length < 2) return still;
  const a = trail[0], z = trail[trail.length - 1], dt = (z.t - a.t) / 1000;
  // held still a moment before letting go: set down
  if (dt <= 0 || performance.now() - z.t > THROW_WINDOW) return still;
  return { vx: (z.x - a.x) / dt, vz: (z.z - a.z) / dt, w: wrap(z.yaw - a.yaw) / dt };
}

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
    if (o && !o.minimized && o.cur && (this.shell.wins.includes(o) || this.shell.dialogs.includes(o))) {
      // a little in front of the side of the owner you can see, shrunk so it looks the size it is
      const oc = o.cur, yaw = oc.yaw + oc.flip, n = { x: Math.sin(yaw), z: Math.cos(yaw) };
      const cam = sp.camera.position, away = Math.max(200, n.x * (cam.x - oc.x) + n.z * (cam.z - oc.z));
      const k = (away - 140) / away;
      return { x: oc.x + n.x * 140, z: oc.z + n.z * 140, y: oc.y + 20 * oc.scale, yaw, flip: 0, scale: k * (oc.scale ?? 1), punch: true };
    }
    const r = sp.D - 140;
    return { local: { x: 0, y: 20 * r / sp.D, z: -r }, flip: 0, scale: r / sp.D, punch: true };
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
      for (const w of this.wins) if (w.maximized && !w.minimized) this.fitMax(w);
    });
  }

  // ---- windows -------------------------------------------------------------

  launch(app, s = {}) {
    if (BUILTIN[app.builtin]) app = { ...app, mount: BUILTIN[app.builtin] };
    const sp = this.space, placed = s.x !== undefined;
    const w = new Win(this, app, { y: -30, ...s, ...(placed ? {} : this.freeSpot(s.w ?? app.w, s.h ?? app.h, s.y ?? -30)) });
    this.wins.push(w);
    sp.cssScene.add(w.obj);
    if (w.maximized) this.fitMax(w);
    if (!w.minimized) this.focus(w);
    if (!placed) this.bring(w);
    this.saveLayout();
    this.onWindows?.();
    return w;
  }

  /** A body standing where pose says, the size of a window ww × hh, grown by pad all round. */
  slabAt(pose, ww, hh, pad = 0) {
    return new Body({ x: pose.x, z: pose.z, yaw: pose.yaw, y: pose.y ?? 0, hw: ww / 2 + pad, hh: hh / 2, ht: THICK / 2 + pad });
  }

  /**
   * In front of you, facing you: the nearest place to straight ahead where a
   * window this big stands clear of the walls and the others, in plain view.
   */
  freeSpot(ww, hh, y) {
    const sp = this.space, D = sp.D, gap = 16, p = sp.player;
    const others = this.wins.filter(o => !o.minimized && !o.maximized).map(o => o.slab || this.slabAt(o, o.w, o.h));
    const ok = (pose) => {
      if (!clearOf(sp.maze, sp.walls, this.slabAt(pose, ww, hh), 8)) return false;
      if (!clearLine(sp.boxes, p, pose, 8)) return false;
      const me = this.slabAt(pose, ww, hh, gap);
      return others.every(o => !contact(me, o));
    };
    const steps = Math.ceil(Math.PI * D / 20) * 2;
    for (let k = 0; k < steps; k++) {
      const pose = sp.inFront((k % 2 ? 1 : -1) * Math.ceil(k / 2) * 20 / D, D, y);
      if (ok(pose)) return pose;
    }
    // nowhere clear: straight ahead and a little nearer, out of any wall
    return this.settle({ ...sp.inFront(0, D - 160, y), w: ww, h: hh });
  }

  /** x, z moved out of any wall, for a window of its size. */
  settle(s) {
    const { x, z } = settle(s, this.space.maze, this.space.walls, THICK);
    return { x, z, yaw: s.yaw, y: s.y };
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
      else Object.assign(w, this.settle({ ...this.space.inFront(0, this.space.D, -30), w: w.w, h: w.h }));
      w.resync = true;
    } else if (w.maximized) {
      w.maximized = false;
      const n = w.normal || { w: w.app.w, h: w.app.h, ...this.space.inFront(0, this.space.D, -30) };
      w.size(n.w, n.h);
      Object.assign(w, { x: n.x, z: n.z, y: n.y, yaw: n.yaw });
      w.normal = null; w.resync = true;
      w.resized();
    }
    this.focus(w);
    this.saveLayout();
    this.onWindows?.();
  }

  maximize(w) {
    closeMenus();
    if (!w.maximized) w.normal = { w: w.w, h: w.h, x: w.x, z: w.z, y: w.y, yaw: w.yaw };
    w.maximized = true;
    w.minimized = false;
    this.fitMax(w);
    this.focus(w);
    this.saveLayout();
    this.onWindows?.();
  }

  /** In front of you, as big as the view. */
  fitMax(w) {
    const sp = this.space;
    sp.player.pitch = 0;   // square in front of level eyes
    Object.assign(w, sp.inFront(0, (sp.D + THICK / 2) * MAX_NEAR, 0));   // the front face, not the middle, at true size
    w.size(innerWidth - MAX_MARGIN * 2, innerHeight - MAX_MARGIN * 2);
    w.resync = true;
    w.resized();
  }

  /** Where a window is from where you stand: { side, ahead, turn }, to carry it there. */
  carryFrom(w) {
    const p = this.space.player, F = p.forward, R = p.right, dx = w.x - p.x, dz = w.z - p.z;
    return { side: dx * R.x + dz * R.z, ahead: Math.max(this.space.D * 0.4, dx * F.x + dz * F.z), turn: wrap(w.yaw - p.yaw) };
  }

  /** Go and stand square in front of a window, where it's sharp. */
  /** Windows standing in the maze: not minimized, not maximized. */
  inMaze() { return this.wins.filter(w => w.cur && !w.minimized && !w.maximized); }

  /** The window whose footprint is nearest a floor point, if one is close. */
  windowAt(pt, reach = 260) {
    let best = null, bd = reach;
    for (const w of this.inMaze()) {
      const ux = Math.cos(w.cur.yaw), uz = -Math.sin(w.cur.yaw);
      const dx = pt.x - w.cur.x, dz = pt.z - w.cur.z;
      const along = Math.max(-w.w / 2, Math.min(w.w / 2, dx * ux + dz * uz));
      const d = Math.hypot(dx - ux * along, dz - uz * along);
      if (d < bd) { bd = d; best = w; }
    }
    return best;
  }

  bring(w) {
    if (w.minimized) return this.restore(w);
    this.focus(w);
    if (w.maximized) return;
    this.walkTo(() => this.standFor(w));
  }

  /** Where to stand to see w square: its face D away, on the side that's showing, or nearer if a wall's in the way. */
  standFor(w) {
    if (!this.wins.includes(w) || w.minimized || w.maximized) return null;
    const sp = this.space, D = sp.D, side = w.flipped ? -1 : 1, n = w.facing;
    const yaw = w.yaw + (w.flipped ? Math.PI : 0), p = sp.player.body;
    const me = (d) => new Body({ x: w.x + n.x * side * d, z: w.z + n.z * side * d, hw: p.hw, ht: p.ht, hh: p.hh, y: p.y });
    let best = null;
    for (let d = D + THICK / 2; d >= D * 0.3; d -= 30) {
      const at = me(d);
      if (clearOf(sp.maze, sp.walls, at, 2) && clearLine(sp.boxes, w, at)) { best = { x: at.x, z: at.z }; break; }
    }
    // facing a wall: as near to in front of it as there's floor
    best ||= nearestClear(sp.maze, sp.walls, me(D * 0.3));
    return { ...best, yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)) };
  }

  /** Walk to where goal() says, around the walls by way of the cells between. */
  walkTo(goal) {
    const sp = this.space, p = sp.player, g = goal();
    if (!g) return;
    const cells = path(sp.maze, cellAt(sp.maze, p.x, p.z), cellAt(sp.maze, g.x, g.z)) || [];
    const way = cells.slice(1, -1).map(c => cellCenter(sp.maze, c.c, c.r));
    p.glideTo(way, goal, sp.boxes, () => this.saveLayout());
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
    this.space.dropOccluder(w.occluder);
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

  /** A quarter turn, left (-1) or right (1). */
  turn(dir) {
    const p = this.space.player, at = { x: p.x, z: p.z, yaw: Math.atan2(Math.sin(p.yaw - dir * Math.PI / 2), Math.cos(p.yaw - dir * Math.PI / 2)) };
    if (this.space.overTarget) this.setOverview(false);
    p.glideTo([], () => at, this.space.boxes, () => this.saveLayout());
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

  /** Stacked in front of you, each one a title bar further down and to the right, and further back. */
  cascade() {
    const ws = this.standing.reverse(), sp = this.space, D = sp.D, n = ws.length;
    ws.forEach((w, i) => {
      this.unmax(w);
      const k = n - 1 - i, r = D + k * 60;   // how far back
      const pose = sp.inFront((i - (n - 1) / 2) * 26 / r, r, 60 - i * 26 + k * 6);
      Object.assign(w, this.settle({ ...pose, w: w.w, h: w.h }));
      w.resync = true;
    });
    if (ws.length) this.focus(ws[n - 1]);
    this.saveLayout();
  }

  /** Side by side around you, centered on the view. */
  tile() {
    const ws = this.standing, sp = this.space, D = sp.D, gap = 24;
    ws.forEach(w => this.unmax(w));
    // the focused one in the middle, the rest alternating out to either side
    const row = [];
    ws.forEach((w, i) => (i % 2 ? row.unshift(w) : row.push(w)));
    const total = row.reduce((s, w) => s + w.w + gap, -gap);
    let x = -total / 2;
    for (const w of row) {
      Object.assign(w, this.settle({ ...sp.inFront((x + w.w / 2) / D, D, 0), w: w.w, h: w.h }));
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
    this.space.dropOccluder(d.occluder);
    d.onClose?.();
    d.owner?.frame?.focus();
  }

  update(dt) {
    const sp = this.space, p = sp.player;
    const icons = this.wins.filter(w => w.minimized);
    // a maximized window stands in front of you, out of the world
    const live = this.wins.filter(w => !w.minimized && !w.maximized);

    for (const w of live) {
      if (!w.slab || w.resync) {
        w.slab = this.slabAt(w, w.w, w.h);
        w.resync = false;
      }
      const b = w.slab;
      b.hw = w.w / 2; b.hh = w.h / 2; b.ht = THICK / 2; b.y = w.y;
      if (w.carry) {
        // carried: where it is from you, so it comes along as you walk
        const c = w.carry, F = p.forward, R = p.right;
        w.hand.x = p.x + R.x * c.side + F.x * c.ahead;
        w.hand.z = p.z + R.z * c.side + F.z * c.ahead;
        w.hand.yaw = p.yaw + c.turn;
      }
      if (w.hand) {
        // held: it goes where the hand puts it, at whatever speed that takes, unless a wall's in the way
        const hand = w.hand;
        b.kinematic = true;
        b.vx = (hand.x - b.x) / dt; b.vz = (hand.z - b.z) / dt; b.w = wrap(hand.yaw - b.yaw) / dt;
      } else if (b.kinematic) {
        // let go: thrown with how it moved over the last moment, or set down if it was still
        b.kinematic = false;
        Object.assign(b, throwOf(w.trail));
        w.trail = null;
      }
    }

    p.update(dt);
    step([p.body, ...live.map(w => w.slab)], dt, sp.walls);
    if (p.walking || p.glide) this.saveLayout();

    let moving = false;
    const now = performance.now();
    for (const w of live) {
      const b = w.slab;
      w.x = b.x; w.z = b.z; w.yaw = wrap(b.yaw);
      if (!w.hand) moving ||= b.moving;
      else if (w.dragging) {
        // where it's really been, walls and all, for the throw
        (w.trail ||= []).push({ t: now, x: b.x, z: b.z, yaw: b.yaw });
        while (w.trail.length > 2 && now - w.trail[1].t > THROW_WINDOW) w.trail.shift();
      }
    }
    if (moving) this.saveLayout();

    sp.update(dt);
    for (const w of this.wins) w.update(dt, w.target(icons.indexOf(w)));
    if (sp.mapness > 0) sp.setFootprints(this.inMaze().map(w => ({ x: w.cur.x, z: w.cur.z, yaw: w.cur.yaw, w: w.w })));
    for (const d of this.dialogs) d.update(dt, d.target());
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
      const m = this.space.maze, p = this.space.player;
      try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify({
          v: LAYOUT_V, maze: { seed: m.seed, cols: m.cols, rows: m.rows },
          player: { x: p.x, z: p.z, yaw: p.yaw }, focus: this.order[0]?.id, windows: this.wins.map(w => w.state()),
        }));
      } catch {}
    }, 200);
  }

  async restoreLayout() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LAYOUT_KEY)); } catch {}
    const sp = this.space, D = sp.D;
    const sizes = Object.fromEntries(APPS.map(a => [a.id, { w: a.w, h: a.h }]));
    const layout = migrate(saved, { D, maze: sp.maze, walls: sp.walls, apps: sizes, thick: THICK });
    if (!layout) {
      // the first visit: a ring of windows in the starting room, as it always was
      sp.player.place({ x: 0, z: 0, yaw: 0 });
      const welcome = await fs.stat('/Documents/Welcome.txt');
      if (welcome && appForName('Welcome.txt')) {
        await this.openFile(welcome);
        const w = this.wins.at(-1);
        Object.assign(w, ringToWorld({ theta: -0.95, turn: 0.2 }, D), { y: -20 }); w.resync = true;
      }
      this.launch(appById('clock'), { ...ringToWorld({ theta: 0.62, turn: -0.15 }, D), y: -150 });
      this.launch(appById('progman'), { ...ringToWorld({ theta: 0 }, D), y: -10 });
      sp.player.place({ x: 0, z: 0, yaw: 0 });
      return;
    }
    const at = layout.player || { x: 0, z: 0, yaw: 0 };
    const pb = sp.player.body, me = new Body({ x: at.x, z: at.z, hw: pb.hw, ht: pb.ht, hh: pb.hh, y: pb.y });
    sp.player.place(clearOf(sp.maze, sp.walls, me) ? at : { ...nearestClear(sp.maze, sp.walls, me), yaw: at.yaw });
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
    // layouts from before Program Manager get one
    if (layout.from < 2 && !this.wins.some(w => w.app.id === 'progman')) focus = this.launch(appById('progman'), { y: -10 });
    if (focus && !focus.minimized) this.focus(focus);
    this.saveLayout();
  }

  async drop(files) { await importFiles(files, '/Documents'); }
}

export { APPS };
