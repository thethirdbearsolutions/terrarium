// The shell: windows, focus, the shelf, the overview, dialogs, files, and the
// terrarium/1 conversation with every framed app.

import * as fs from './fs.js';
import { APPS, appById, appForName } from './apps.js';
import { Win } from './window.js';
import { mountFiles, mountClock, fileDialog, ask, importFiles, exportFile } from './files.js';

const LAYOUT_KEY = 'terrarium.layout';
const BUILTIN = { files: mountFiles, clock: mountClock };

/** A dialog rides in front of the window that asked for it. */
class Dialog extends Win {
  constructor(shell, owner, app) {
    super(shell, app);
    this.owner = owner;
    this.el.classList.add('dialog');
    this.front.querySelectorAll('[data-act="flip"],[data-act="park"]').forEach(b => b.remove());
    this.front.querySelector('.grip').remove();
  }
  act(a) { if (a === 'close') this.shell.closeDialog(this); }
  target() {
    const o = this.owner, oc = o.cur || o.target(0);
    return { theta: oc.theta, y: oc.y - 10, r: oc.r - 140, turn: oc.turn, flip: 0 };
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
      if (f?.tagName === 'IFRAME') { const w = this.wins.find(w => w.frame === f); if (w) this.focus(w, true); }
    }));
  }

  // ---- windows -------------------------------------------------------------

  launch(app, s = {}) {
    if (BUILTIN[app.builtin]) app = { ...app, mount: BUILTIN[app.builtin] };
    const sp = this.space;
    const w = new Win(this, app, {
      theta: sp.pan + (Math.random() - 0.5) * 0.12, y: -30 + (Math.random() - 0.5) * 40, ...s,
    });
    this.wins.push(w);
    sp.cssScene.add(w.obj);
    this.focus(w);
    this.saveLayout();
    this.onWindows?.();
    return w;
  }

  focus(w, fromFrame = false) {
    if (w instanceof Dialog) return;
    this.order = [w, ...this.order.filter(o => o !== w)];
    this.wins.forEach(o => o.el.classList.toggle('focused', o === w));
    if (!fromFrame) w.frame?.focus();
    for (const o of this.wins) o.frame?.contentWindow?.postMessage({ terrarium: 1, type: o === w ? 'focus' : 'blur' }, '*');
  }

  park(w) {
    w.parked = true;
    this.order = this.order.filter(o => o !== w);
    const next = this.order.find(o => !o.parked);
    if (next) this.focus(next);
    this.saveLayout();
  }

  unpark(w) {
    w.parked = false;
    w.theta = this.space.pan; w.y = -30; w.turn = 0;
    this.focus(w);
    this.saveLayout();
  }

  /** Turn to face a window. */
  bring(w) {
    if (w.parked) return this.unpark(w);
    const sp = this.space, d = w.theta - sp.panTarget;
    sp.panTarget += Math.atan2(Math.sin(d), Math.cos(d));
    this.focus(w);
  }

  async close(w, force = false) {
    if (w.dirty && !force && !(await ask(this, w, `${w.title} has changes that aren't saved. Close it anyway?`, 'Close'))) return;
    this.dialogs.filter(d => d.owner === w).forEach(d => this.closeDialog(d));
    w.onClose?.();
    this.space.cssScene.remove(w.obj);
    this.wins = this.wins.filter(o => o !== w);
    this.order = this.order.filter(o => o !== w);
    if (this.order[0]) this.focus(this.order[0]);
    this.saveLayout();
    this.onWindows?.();
  }

  shieldClick(w) {
    if (this.space.overTarget > 0) { this.setOverview(false); this.bring(w); }
    else if (w.parked) this.unpark(w);
  }

  setOverview(on) {
    this.space.overTarget = on ? 1 : 0;
    this.wins.forEach(w => w.el.classList.toggle('overview', on));
    this.onWindows?.();
  }

  dialog(owner, app) {
    const d = new Dialog(this, owner, app);
    this.dialogs.push(d);
    this.space.cssScene.add(d.obj);
    if (!owner.parked) this.bring(owner);
    return d;
  }

  closeDialog(d) {
    if (!this.dialogs.includes(d)) return;
    this.dialogs = this.dialogs.filter(o => o !== d);
    this.space.cssScene.remove(d.obj);
    d.onClose?.();
    d.owner.frame?.focus();
  }

  update(dt) {
    // rank: 0 for the focused window, then back in focus order
    const live = this.order.filter(w => !w.parked);
    this.wins.forEach(w => { w.rank = live.indexOf(w); if (w.rank < 0) w.rank = live.length; });
    const shelf = this.wins.filter(w => w.parked);
    for (const w of this.wins) w.update(dt, shelf.indexOf(w));
    for (const d of this.dialogs) d.update(dt, 0);
  }

  // ---- files ---------------------------------------------------------------

  async openFile(f) {
    const app = appForName(f.name);
    if (!app) {
      if (fs.ext(f.name) === '.pdf' || !/^text\//.test(f.mime || '')) return exportFile(await fs.read(f.path));
      return alert(`Nothing here opens ${f.name}.`);
    }
    const file = await fs.read(f.path);
    const w = this.launch(app, { file });
    w.setTitle(`${f.name} — ${app.title}`);
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
        case 'resize': return w.size(m.w, (m.h || 0) + 28);
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
            path = await fileDialog(this, w, { mode: 'save', name: m.name || 'Untitled' });
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
        localStorage.setItem(LAYOUT_KEY, JSON.stringify({ pan: this.space.panTarget, focus: this.order[0]?.id, windows: this.wins.map(w => w.state()) }));
      } catch {}
    }, 200);
  }

  async restore() {
    let layout = null;
    try { layout = JSON.parse(localStorage.getItem(LAYOUT_KEY)); } catch {}
    if (!layout?.windows) {
      const sp = this.space;
      this.launch(appById('files'), { theta: -0.28, y: 10 });
      this.launch(appById('clock'), { theta: 0.42, y: -170, turn: -0.25 });
      const welcome = await fs.stat('/Documents/Welcome.txt');
      if (welcome && appForName('Welcome.txt')) await this.openFile(welcome);
      sp.pan = sp.panTarget = 0;
      return;
    }
    this.space.pan = this.space.panTarget = layout.pan || 0;
    let focus = null;
    for (const s of layout.windows) {
      const app = appById(s.app);
      if (!app) continue;
      let file = null;
      if (s.file?.path) { try { file = await fs.read(s.file.path); } catch {} }
      const w = this.launch(app, { ...s, file });
      if (file) w.setTitle(`${file.name} — ${app.title}`);
      if (s.id === layout.focus) focus = w;
    }
    if (focus) this.focus(focus);
  }

  async drop(files) { await importFiles(files, '/Documents'); }
}

export { APPS };
