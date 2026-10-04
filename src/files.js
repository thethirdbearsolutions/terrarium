// File Manager, and the common Open and Save As dialog.

import * as fs from './fs.js';
import { appForName } from './apps.js';
import { SMALL, GLYPH } from './icons.js';
import { menuBar } from './menu.js';
import { esc, modal, button, listBox, combo, message, ask, promptBox } from './dialogs.js';

const PREFS = 'terrarium.fileman';
const UP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 12" width="16" height="12" shape-rendering="crispEdges"><path d="M7 1h2v1h1v1h1v1h1v1H9v6H7V5H4V4h1V3h1V2h1z"/></svg>`;
const commas = (n) => n.toLocaleString('en-US');
const glyph = (f) => f.up ? UP : f.dir ? SMALL.folder : appForName(f.name) ? SMALL.doc : SMALL.file;
const dosDate = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`; };
const dosTime = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).replace(' ', '').toLowerCase();

/** Every folder under dir, depth first: [{ path, depth }]. */
async function tree(dir = '/', depth = 0, out = []) {
  for (const f of await fs.list(dir)) if (f.dir) { out.push({ path: f.path, depth }); await tree(f.path, depth + 1, out); }
  return out;
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

// ---- File Manager ---------------------------------------------------------------

export function mountFiles(win) {
  const shell = win.shell;
  let prefs = { view: 'name', sort: 'name', panes: 'both', status: true, minimizeOnUse: false };
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS)) }; } catch {}
  const save = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch {} };
  win.body.innerHTML = `<div class="app fileman"><div class="mb"></div>
    <div class="drives"><span class="drive on">${SMALL.drive}<span>c:</span></span><span class="vol">C: [TERRARIUM]</span></div>
    <div class="split"><div class="tree pane" tabindex="0"></div><div class="files pane" tabindex="0"></div></div>
    <div class="status"><span class="cell l"></span><span class="cell r"></span></div></div>`;
  const root = win.body.firstElementChild;
  const treeEl = root.querySelector('.tree'), listEl = root.querySelector('.files');
  const st = { dir: '/Documents', entries: [], sel: -1, collapsed: new Set(), focus: listEl };

  const shown = () => {
    const s = [...st.entries];
    const by = { name: (a, b) => a.name.localeCompare(b.name), type: (a, b) => fs.ext(a.name).localeCompare(fs.ext(b.name)) || a.name.localeCompare(b.name),
      size: (a, b) => b.size - a.size, date: (a, b) => b.mtime - a.mtime }[prefs.sort];
    return s.sort((a, b) => (b.dir - a.dir) || by(a, b));
  };

  async function render() {
    root.classList.toggle('details', prefs.view === 'details');
    root.classList.toggle('nostatus', !prefs.status);
    root.dataset.panes = prefs.panes;
    win.setTitle(`File Manager - [${fs.dosPath(st.dir).toUpperCase()}${st.dir === '/' ? '' : '\\'}*.*]`);
    // the tree
    const dirs = await tree();
    const hidden = (p) => [...st.collapsed].some(c => p.startsWith(c + '/'));
    treeEl.innerHTML = `<div class="node${st.dir === '/' ? ' on' : ''}" data-path="/" style="--d:0">${SMALL.open}<span>c:\\</span></div>`
      + dirs.filter(d => !hidden(d.path)).map(d => {
        const open = st.dir === d.path || st.dir.startsWith(d.path + '/');
        return `<div class="node${st.dir === d.path ? ' on' : ''}" data-path="${esc(d.path)}" style="--d:${d.depth + 1}">${open ? SMALL.open : SMALL.folder}<span>${esc(d.path.slice(d.path.lastIndexOf('/') + 1).toLowerCase())}</span></div>`;
      }).join('');
    // the files
    const list = shown();
    const rows = (st.dir === '/' ? [] : [{ up: true, name: '..', path: fs.dirname(st.dir), dir: true }]).concat(list);
    st.rows = rows;
    listEl.innerHTML = rows.map((f, i) => `<div class="row${i === st.sel ? ' on' : ''}" data-i="${i}">${glyph(f)}<span class="n">${esc(f.name.toLowerCase())}</span>`
      + (f.up ? '' : `<span class="sz">${f.dir ? '' : commas(f.size)}</span><span class="dt">${dosDate(f.mtime)}</span><span class="tm">${dosTime(f.mtime)}</span>`) + `</div>`).join('');
    status();
  }

  function status() {
    const files = st.entries.filter(f => !f.dir), bytes = files.reduce((s, f) => s + f.size, 0);
    const sel = st.rows?.[st.sel];
    root.querySelector('.status .l').textContent = sel && !sel.up && !sel.dir ? `Selected 1 file(s) (${commas(sel.size)} bytes)` : `C: ${files.length} file(s)`;
    root.querySelector('.status .r').textContent = `Total ${files.length} file(s) (${commas(bytes)} bytes)`;
  }

  async function go(dir) {
    if (!(await fs.stat(dir)) && dir !== '/') dir = '/Documents';
    st.dir = dir; st.sel = -1;
    st.entries = await fs.list(dir);
    await render();
  }
  const refresh = () => go(st.dir).then(() => {});

  const select = (i) => {
    st.sel = Math.max(0, Math.min((st.rows?.length || 1) - 1, i));
    listEl.querySelectorAll('.row').forEach(r => r.classList.toggle('on', +r.dataset.i === st.sel));
    listEl.querySelector('.row.on')?.scrollIntoView({ block: 'nearest' });
    status();
  };
  const current = () => { const f = st.rows?.[st.sel]; return f && !f.up ? f : null; };
  const open = (f = st.rows?.[st.sel]) => {
    if (!f) return;
    if (f.dir) return go(f.path);
    shell.openFile(f, win);
    if (prefs.minimizeOnUse) shell.minimize(win);
  };

  listEl.addEventListener('pointerdown', (e) => { const r = e.target.closest('.row'); listEl.focus({ preventScroll: true }); if (r) select(+r.dataset.i); });
  listEl.addEventListener('dblclick', (e) => { const r = e.target.closest('.row'); if (r) open(st.rows[+r.dataset.i]); });
  listEl.addEventListener('keydown', (e) => {
    const to = { ArrowDown: st.sel + 1, ArrowUp: st.sel - 1, Home: 0, End: (st.rows?.length || 1) - 1 }[e.key];
    if (to !== undefined) select(to);
    else if (e.key === 'Enter') open();
    else if (e.key === 'Delete') del();
    else if (e.key === 'Backspace') { if (st.dir !== '/') go(fs.dirname(st.dir)); }
    else return;
    e.preventDefault(); e.stopPropagation();
  });
  treeEl.addEventListener('pointerdown', (e) => { const n = e.target.closest('.node'); treeEl.focus({ preventScroll: true }); if (n) go(n.dataset.path); });
  treeEl.addEventListener('keydown', (e) => {
    const nodes = [...treeEl.querySelectorAll('.node')], i = nodes.findIndex(n => n.classList.contains('on'));
    const to = { ArrowDown: i + 1, ArrowUp: i - 1 }[e.key];
    if (to !== undefined && nodes[to]) go(nodes[to].dataset.path);
    else if (e.key === '-') collapse(); else if (e.key === '+' || e.key === '*') expand();
    else return;
    e.preventDefault(); e.stopPropagation();
  });
  root.querySelector('.drive').addEventListener('click', () => go('/'));
  for (const p of [treeEl, listEl]) { p.addEventListener('focus', () => p.classList.add('active')); p.addEventListener('blur', () => p.classList.remove('active')); }

  const oops = (err) => message(shell, win, err.message, { title: 'File Manager', icon: 'stop' });

  async function del() {
    const f = current(); if (!f) return;
    const what = f.dir ? 'directory' : 'file';
    if (await ask(shell, win, `Delete ${what} ${fs.dosPath(f.path)}${f.dir ? ' and everything in it' : ''}?`, { yes: 'Yes', no: 'No', title: `Confirm ${f.dir ? 'Directory' : 'File'} Delete` })) {
      try { await fs.remove(f.path); } catch (err) { oops(err); }
    }
  }
  async function rename() {
    const f = current(); if (!f) return;
    const name = await promptBox(shell, win, { title: 'Rename', note: `Current Directory: ${fs.dosPath(st.dir)}\nFrom: ${f.name.toLowerCase()}`, text: '&To:', value: f.name });
    if (name && name !== f.name) { try { await fs.rename(f.path, `${fs.dirname(f.path) === '/' ? '' : fs.dirname(f.path)}/${name}`); } catch (err) { oops(err); } }
  }
  async function mkdir() {
    const name = await promptBox(shell, win, { title: 'Create Directory', note: `Current Directory: ${fs.dosPath(st.dir)}`, text: '&Name:', value: '' });
    if (name) { try { await fs.mkdir(`${st.dir === '/' ? '' : st.dir}/${name}`); } catch (err) { oops(err); } }
  }
  function importIn() {
    if (st.dir === '/') return message(shell, win, 'Choose a directory to import into.', { title: 'File Manager', icon: 'exclamation' });
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true;
    input.onchange = () => importFiles([...input.files], st.dir).catch(oops);
    input.click();
  }
  async function exportSel() { const f = current(); if (f && !f.dir) exportFile(await fs.read(f.path)); }
  const collapse = () => { if (st.dir !== '/') st.collapsed.add(st.dir); render(); };
  const expand = (all) => { if (all) st.collapsed.clear(); else st.collapsed.forEach(c => { if (c === st.dir || c.startsWith(st.dir + '/') || st.dir === '/') st.collapsed.delete(c); }); render(); };
  const set = (k, v) => { prefs[k] = v; save(); render(); };

  menuBar(root.querySelector('.mb'), win.front, [
    { t: '&File', items: () => {
      const f = current();
      return [
        { t: '&Open', acc: 'Enter', gray: !st.rows?.[st.sel], run: () => open() },
        { t: '&Delete...', acc: 'Del', gray: !f, run: del },
        { t: 'Re&name...', gray: !f, run: rename }, '-',
        { t: 'Cr&eate Directory...', gray: st.dir === '/', run: mkdir }, '-',
        { t: '&Import...', run: importIn },
        { t: 'E&xport...', gray: !f || f.dir, run: exportSel }, '-',
        { t: 'E&xit', run: () => shell.close(win) },
      ];
    } },
    { t: '&Disk', items: () => [{ t: '&Select Drive...', run: () => go('/') }] },
    { t: '&Tree', items: () => [
      { t: 'Expand &One Level', acc: '+', run: () => expand() },
      { t: 'Expand &All', acc: 'Ctrl+*', run: () => expand(true) },
      { t: '&Collapse Branch', acc: '-', gray: st.dir === '/', run: collapse },
    ] },
    { t: '&View', items: () => [
      { t: 'Tr&ee and Directory', check: prefs.panes === 'both', run: () => set('panes', 'both') },
      { t: 'Tree &Only', check: prefs.panes === 'tree', run: () => set('panes', 'tree') },
      { t: 'Directory O&nly', check: prefs.panes === 'dir', run: () => set('panes', 'dir') }, '-',
      { t: '&Name', check: prefs.view === 'name', run: () => set('view', 'name') },
      { t: '&All File Details', check: prefs.view === 'details', run: () => set('view', 'details') }, '-',
      { t: '&Sort by Name', check: prefs.sort === 'name', run: () => set('sort', 'name') },
      { t: 'Sort &by Type', check: prefs.sort === 'type', run: () => set('sort', 'type') },
      { t: 'Sort by Si&ze', check: prefs.sort === 'size', run: () => set('sort', 'size') },
      { t: 'Sort by &Date', check: prefs.sort === 'date', run: () => set('sort', 'date') },
    ] },
    { t: '&Options', items: () => [
      { t: '&Status Bar', check: prefs.status, run: () => set('status', !prefs.status) },
      { t: '&Minimize on Use', check: prefs.minimizeOnUse, run: () => set('minimizeOnUse', !prefs.minimizeOnUse) },
    ] },
    { t: '&Window', items: () => [
      { t: '&Cascade', acc: 'Shift+F5', run: () => shell.cascade() },
      { t: '&Tile', acc: 'Shift+F4', run: () => shell.tile() }, '-',
      { t: '&Refresh', acc: 'F5', run: refresh },
    ] },
    { t: '&Help', items: () => [{ t: '&About File Manager...', run: () => message(shell, win, 'Terrarium\nFile Manager', { title: 'About File Manager', icon: 'info' }) }] },
  ]);

  const unsub = fs.onChange(() => refresh());
  win.onClose = () => unsub();
  win.onKey = (e) => { if (e.key === 'F5' && !e.shiftKey) { refresh(); return true; } return false; };
  go(st.dir);
}

// ---- Open and Save As ------------------------------------------------------------

const glob = (pat) => new RegExp('^' + pat.toLowerCase().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');

/** Open and Save As. Resolves to a path, or null if cancelled. */
export function fileDialog(shell, owner, { mode, accept, name }) {
  const save = mode === 'save';
  const startDir = name?.startsWith('/') ? fs.dirname(name) : '/Documents';
  const exts = save ? [fs.ext(name || '')].filter(Boolean) : (accept || []);
  const types = exts.map(e => ({ text: `${e.slice(1).toUpperCase()} Files (*${e})`, value: `*${e}` })).concat({ text: 'All Files (*.*)', value: '*.*' });
  return modal(shell, owner, save ? 'Save As' : 'Open', (root, finish, dlg) => {
    root.innerHTML = `<div class="dcontent filedlg">
      <div class="col"><label class="lbl">File <u>N</u>ame:</label><input class="field name" spellcheck="false"><div class="flist"></div>
        <label class="lbl">${save ? 'Save File as <u>T</u>ype:' : 'List Files of <u>T</u>ype:'}</label><div class="types"></div></div>
      <div class="col"><label class="lbl"><u>D</u>irectories:</label><div class="path"></div><div class="dlist"></div>
        <label class="lbl">Dri<u>v</u>es:</label><div class="drv"></div></div>
      <div class="dbuttons">${button('OK', { def: true })}${button('Cancel')}</div></div>`;
    const input = root.querySelector('.name');
    let dir = startDir, filter = types[0].value;
    const host = () => dlg.front;
    const files = listBox([], { cls: 'files', onSelect: (it) => { input.value = it.text; }, onActivate: () => ok() });
    const dirs = listBox([], { cls: 'dirs', onActivate: (it) => go(it.value) });
    root.querySelector('.flist').appendChild(files.el);
    root.querySelector('.dlist').appendChild(dirs.el);
    const typeBox = combo(types, filter, { host, width: 150, onChange: (v) => { filter = v; if (!save || input.value.includes('*')) input.value = v; go(dir); } });
    root.querySelector('.types').appendChild(typeBox.el);
    root.querySelector('.drv').appendChild(combo([{ text: 'c: terrarium', value: 'c' }], 'c', { host, width: 150 }).el);
    input.value = save ? (name ? fs.basename(name) : 'untitled') : filter;

    async function go(d) {
      dir = d;
      root.querySelector('.path').textContent = fs.dosPath(dir);
      const all = await fs.list(dir), re = glob(filter);
      files.set(all.filter(f => !f.dir && re.test(f.name.toLowerCase())).map(f => ({ text: f.name.toLowerCase(), value: f.path })));
      // c:\, then the way down to here, then what's in here
      const parts = dir === '/' ? [] : dir.slice(1).split('/');
      const items = [{ text: 'c:\\', value: '/', icon: SMALL.open, cls: 'd0' }];
      parts.forEach((p, i) => items.push({ text: p.toLowerCase(), value: '/' + parts.slice(0, i + 1).join('/'), icon: SMALL.open, cls: `d${i + 1}` }));
      const here = items.length - 1;
      for (const f of all) if (f.dir) items.push({ text: f.name.toLowerCase(), value: f.path, icon: SMALL.folder, cls: `d${parts.length + 1}` });
      dirs.set(items, here);
    }

    async function ok() {
      const typed = input.value.trim();
      if (!typed) return;
      if (/[*?]/.test(typed)) { filter = typed; go(dir); return; }
      // a path, or a name here
      let path = /[\\/]/.test(typed) ? typed.replace(/^c:/i, '').replace(/\\/g, '/') : `${dir === '/' ? '' : dir}/${typed}`;
      if (!path.startsWith('/')) path = `${dir === '/' ? '' : dir}/${path}`;
      const hit = await fs.find(path);
      if (hit?.dir) { input.value = save ? '' : filter; return go(hit.path); }
      if (!save) {
        if (hit) return finish(hit.path);
        return message(shell, dlg, `${fs.dosPath(path)}\nFile not found.\nPlease verify the correct file name was given.`, { title: 'Open', icon: 'exclamation' });
      }
      if (hit) {
        if (!(await ask(shell, dlg, `${fs.dosPath(hit.path)} already exists.\nDo you want to replace it?`, { yes: 'Yes', no: 'No', icon: 'exclamation', title: 'Save As' }))) return;
        return finish(hit.path);
      }
      if (!(await fs.stat(fs.dirname(path)))) return message(shell, dlg, `${fs.dosPath(fs.dirname(path))}\nPath not found.`, { title: 'Save As', icon: 'exclamation' });
      finish(path);
    }

    root.querySelector('.dbuttons').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) b.dataset.b === 'OK' ? ok() : finish(null); });
    root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === input) { e.preventDefault(); e.stopPropagation(); ok(); } }, true);
    input.setAttribute('autofocus', '');
    go(dir);
  });
}
