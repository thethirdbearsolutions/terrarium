// The file browser, used three ways: as the Files app, as the Open dialog,
// and as the Save As dialog.

import * as fs from './fs.js';

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const when = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const size = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const glyph = (f) => f.dir ? '📁' : ({ '.hr': '📄', '.txt': '📃', '.level': '🔮', '.logo': '🐢', '.pdf': '🖨' }[fs.ext(f.name)] || '📄');

export class Browser {
  /** opts: { dir, accept: ['.hr'], tools: bool, onOpen(file), onSelect(entry) } */
  constructor(root, opts = {}) {
    this.opts = opts;
    this.dir = opts.dir || '/Documents';
    this.sel = null;
    root.innerHTML = `
      <div class="files">
        <div class="side"></div>
        <div class="main">
          <div class="tools"></div>
          <div class="list"></div>
        </div>
      </div>`;
    this.side = root.querySelector('.side');
    this.tools = root.querySelector('.tools');
    this.listEl = root.querySelector('.list');
    this.side.innerHTML = fs.ROOTS.map(r => `<div data-dir="${r}">📁 ${r.slice(1)}</div>`).join('');
    this.side.addEventListener('click', (e) => { const d = e.target.closest('[data-dir]'); if (d) this.go(d.dataset.dir); });
    if (opts.tools) {
      this.tools.innerHTML = `<button data-t="up">↑</button><button data-t="new">New folder</button><button data-t="import">Import…</button>
        <button data-t="export" disabled>Export</button><button data-t="rename" disabled>Rename</button><button data-t="delete" disabled>Delete</button><span class="where"></span>`;
      this.tools.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.tool(b.dataset.t); });
    } else {
      this.tools.innerHTML = `<button data-t="up">↑</button><span class="where"></span>`;
      this.tools.addEventListener('click', (e) => { if (e.target.closest('button')) this.go(fs.dirname(this.dir)); });
    }
    this.listEl.addEventListener('click', (e) => {
      const tr = e.target.closest('tr.f'); if (!tr) return;
      this.select(this.entries.find(x => x.path === tr.dataset.path));
    });
    this.listEl.addEventListener('dblclick', (e) => {
      const tr = e.target.closest('tr.f'); if (!tr) return;
      const f = this.entries.find(x => x.path === tr.dataset.path);
      if (f.dir) this.go(f.path); else this.opts.onOpen?.(f);
    });
    this.unsub = fs.onChange(() => this.refresh());
    this.go(this.dir);
  }

  destroy() { this.unsub(); }

  async go(dir) {
    if (dir === '/') dir = fs.ROOTS[0];
    this.dir = dir; this.sel = null;
    this.side.querySelectorAll('[data-dir]').forEach(d => d.classList.toggle('on', dir === d.dataset.dir || dir.startsWith(d.dataset.dir + '/')));
    await this.refresh();
  }

  async refresh() {
    let entries = await fs.list(this.dir);
    if (this.opts.accept) entries = entries.filter(f => f.dir || this.opts.accept.includes(fs.ext(f.name)));
    this.entries = entries;
    this.tools.querySelector('.where').textContent = this.dir;
    this.listEl.innerHTML = entries.length
      ? `<table><tr><th></th><th>Name</th><th>Size</th><th>Modified</th></tr>${entries.map(f => `
          <tr class="f${this.sel?.path === f.path ? ' sel' : ''}" data-path="${esc(f.path)}"><td>${glyph(f)}</td><td class="n">${esc(f.name)}</td>
          <td class="s">${f.dir ? '' : size(f.size)}</td><td class="d">${when(f.mtime)}</td></tr>`).join('')}</table>`
      : `<div class="empty">Nothing here yet.</div>`;
    this.updateTools();
  }

  select(f) {
    this.sel = f;
    this.listEl.querySelectorAll('tr.f').forEach(tr => tr.classList.toggle('sel', tr.dataset.path === f?.path));
    this.updateTools();
    this.opts.onSelect?.(f);
  }

  updateTools() {
    for (const t of ['export', 'rename', 'delete']) {
      const b = this.tools.querySelector(`[data-t="${t}"]`);
      if (b) b.disabled = !this.sel || (t === 'export' && this.sel.dir);
    }
  }

  async tool(t) {
    try {
      if (t === 'up') return this.go(fs.dirname(this.dir));
      if (t === 'new') {
        const name = prompt('Folder name', await fs.freeName(this.dir, 'New folder'));
        if (name) await fs.mkdir(`${this.dir}/${name}`);
      } else if (t === 'import') {
        const input = document.createElement('input');
        input.type = 'file'; input.multiple = true;
        input.onchange = () => importFiles([...input.files], this.dir);
        input.click();
      } else if (t === 'export') {
        exportFile(await fs.read(this.sel.path));
      } else if (t === 'rename') {
        const name = prompt('Rename to', this.sel.name);
        if (name && name !== this.sel.name) await fs.rename(this.sel.path, `${fs.dirname(this.sel.path)}/${name}`);
      } else if (t === 'delete') {
        if (confirm(`Delete ${this.sel.name}${this.sel.dir ? ' and everything in it' : ''}?`)) await fs.remove(this.sel.path);
      }
    } catch (err) { alert(err.message); }
  }
}

export async function importFiles(files, dir = '/Documents') {
  for (const file of files) {
    const binary = !/^text\/|json|xml|javascript/.test(file.type) && !/\.(hr|txt|level|logo|md|csv)$/i.test(file.name);
    let content;
    if (binary) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      content = ''; for (let i = 0; i < bytes.length; i += 8192) content += String.fromCharCode(...bytes.subarray(i, i + 8192));
    } else content = await file.text();
    await fs.write(`${dir}/${await fs.freeName(dir, file.name)}`, content, file.type || undefined);
  }
}

export function exportFile(f) {
  const isText = /^text\/|json/.test(f.mime);
  const data = isText ? f.content : Uint8Array.from(f.content, c => c.charCodeAt(0) & 255);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: f.mime }));
  a.download = f.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** The Files app. */
export function mountFiles(win) {
  const host = document.createElement('div');
  host.style.cssText = 'flex:1;display:flex;min-width:0';
  win.body.appendChild(host);
  const b = new Browser(host, { tools: true, onOpen: (f) => win.shell.openFile(f) });
  win.onClose = () => b.destroy();
}

export function mountClock(win) {
  const c = document.createElement('div');
  c.className = 'clockface';
  c.innerHTML = `<div class="t"></div><div class="d"></div>`;
  win.body.appendChild(c);
  const tick = () => {
    const n = new Date();
    c.querySelector('.t').textContent = n.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    c.querySelector('.d').textContent = n.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  };
  tick(); setInterval(tick, 1000);
}

/** Open and Save As. Resolves to a path, or null if cancelled. */
export function fileDialog(shell, owner, { mode, accept, name }) {
  return new Promise((resolve) => {
    const app = { id: 'dialog', title: mode === 'save' ? 'Save As' : 'Open', w: 520, h: 360, icon: owner.app.icon, mount: () => {} };
    const dlg = shell.dialog(owner, app);
    const host = document.createElement('div');
    host.style.cssText = 'flex:1;display:flex;flex-direction:column;min-width:0';
    dlg.body.appendChild(host);
    const top = document.createElement('div');
    top.style.cssText = 'flex:1;display:flex;min-height:0';
    host.appendChild(top);
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = mode === 'save'
      ? `<input value="" spellcheck="false"><button data-b="cancel">Cancel</button><button data-b="ok" class="primary">Save</button>`
      : `<span class="msg"></span><button data-b="cancel">Cancel</button><button data-b="ok" class="primary">Open</button>`;
    host.appendChild(row);
    const input = row.querySelector('input');
    if (input) input.value = name || 'Untitled';
    const startDir = name?.startsWith('/') ? fs.dirname(name) : '/Documents';
    if (input && name?.startsWith('/')) input.value = fs.basename(name);
    let done = false;
    const finish = async (path) => {
      if (done) return;
      if (path && mode === 'save' && (await fs.stat(path)) && !confirm(`${fs.basename(path)} exists. Replace it?`)) return;
      done = true; b.destroy(); shell.closeDialog(dlg); resolve(path);
    };
    const b = new Browser(top, {
      dir: startDir, accept: mode === 'open' ? accept : null,
      onSelect: (f) => { if (f && !f.dir && input) input.value = f.name; if (!input) row.querySelector('.msg').textContent = f?.dir ? '' : (f?.name || ''); },
      onOpen: (f) => finish(f.path),
    });
    const ok = () => {
      if (mode === 'save') { const n = input.value.trim(); if (n) finish(`${b.dir}/${n}`); }
      else if (b.sel && !b.sel.dir) finish(b.sel.path);
    };
    row.addEventListener('click', (e) => { const x = e.target.closest('button'); if (!x) return; x.dataset.b === 'ok' ? ok() : finish(null); });
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') finish(null); });
    dlg.onClose = () => { if (!done) { done = true; b.destroy(); resolve(null); } };
    setTimeout(() => { input?.focus(); input?.select(); }, 50);
  });
}

/** A yes/no question in front of a window. */
export function ask(shell, owner, text, yes, no = 'Cancel') {
  return new Promise((resolve) => {
    const dlg = shell.dialog(owner, { id: 'dialog', title: owner.title, w: 380, h: 170, icon: owner.app.icon, mount: () => {} });
    dlg.body.style.flexDirection = 'column';
    dlg.body.innerHTML = `<div class="ask"></div><div class="row"><span class="msg"></span><button data-b="no">${no}</button><button data-b="yes" class="primary">${yes}</button></div>`;
    dlg.body.querySelector('.ask').textContent = text;
    let done = false;
    const finish = (v) => { if (done) return; done = true; shell.closeDialog(dlg); resolve(v); };
    dlg.body.querySelector('.row').addEventListener('click', (e) => { const x = e.target.closest('button'); if (x) finish(x.dataset.b === 'yes'); });
    dlg.onClose = () => finish(false);
  });
}
