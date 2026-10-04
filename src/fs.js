// The shared filesystem. One IndexedDB store keyed by absolute path; a folder
// is a record with dir: true. Content is a string.

const DB = 'terrarium', STORE = 'files';
export const ROOTS = ['/Documents', '/Levels', '/Programs'];

const MIME = {
  '.hr': 'application/x-hardreturn+json', '.txt': 'text/plain', '.level': 'text/x-magnimarbles-level',
  '.logo': 'text/x-logo', '.pdf': 'application/pdf', '.json': 'application/json', '.html': 'text/html',
};

let dbp = null;
function db() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'path' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => rej(t.error);
  });
}

export const ext = (name) => { const i = name.lastIndexOf('.'); return i > 0 ? name.slice(i).toLowerCase() : ''; };
export const basename = (path) => path.slice(path.lastIndexOf('/') + 1);
export const dirname = (path) => path.slice(0, path.lastIndexOf('/')) || '/';
/** How a path reads on the c: drive: /Documents/Letter.hr is c:\\documents\\letter.hr */
export const dosPath = (path) => ('c:' + (path === '/' ? '\\' : path.replace(/\//g, '\\'))).toLowerCase();
export const mimeFor = (name) => MIME[ext(name)] || 'text/plain';

function norm(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) throw new Error('paths are absolute');
  const parts = [];
  for (const p of path.split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') parts.pop(); else parts.push(p);
  }
  return '/' + parts.join('/');
}

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const changed = (path) => listeners.forEach(fn => fn(path));

export async function stat(path) {
  path = norm(path);
  return tx('readonly', s => s.get(path));
}

export async function read(path) {
  const f = await stat(path);
  if (!f || f.dir) throw new Error(`no such file: ${path}`);
  return f;
}

export async function write(path, content, mime) {
  path = norm(path);
  const dir = dirname(path);
  if (dir !== '/') {
    const d = await stat(dir);
    if (!d?.dir) throw new Error(`no such folder: ${dir}`);
  }
  const existing = await stat(path);
  if (existing?.dir) throw new Error(`${path} is a folder`);
  const name = basename(path);
  if (!name) throw new Error('a file needs a name');
  const f = { path, name, dir: false, mime: mime || mimeFor(name), content: String(content), size: String(content).length, mtime: Date.now() };
  await tx('readwrite', s => s.put(f));
  changed(path);
  return f;
}

export async function mkdir(path) {
  path = norm(path);
  const existing = await stat(path);
  if (existing) { if (existing.dir) return existing; throw new Error(`${path} is a file`); }
  const f = { path, name: basename(path), dir: true, size: 0, mtime: Date.now() };
  await tx('readwrite', s => s.put(f));
  changed(path);
  return f;
}

export async function list(dir) {
  dir = norm(dir);
  const all = await tx('readonly', s => s.getAll());
  const prefix = dir === '/' ? '/' : dir + '/';
  return all
    .filter(f => f.path.startsWith(prefix) && f.path !== dir && !f.path.slice(prefix.length).includes('/'))
    .map(({ path, name, dir, size, mtime, mime }) => ({ path, name, dir, size, mtime, mime }))
    .sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
}

export async function remove(path) {
  path = norm(path);
  const all = await tx('readonly', s => s.getAll());
  const doomed = all.filter(f => f.path === path || f.path.startsWith(path + '/')).map(f => f.path);
  await tx('readwrite', s => doomed.forEach(p => s.delete(p)));
  changed(path);
}

export async function rename(from, to) {
  from = norm(from); to = norm(to);
  if (await stat(to)) throw new Error(`${to} already exists`);
  const all = await tx('readonly', s => s.getAll());
  const moving = all.filter(f => f.path === from || f.path.startsWith(from + '/'));
  await tx('readwrite', s => {
    for (const f of moving) {
      s.delete(f.path);
      const path = to + f.path.slice(from.length);
      s.put({ ...f, path, name: basename(path) });
    }
  });
  changed(to);
}

/** The record at path, matching names in any case, or null. */
export async function find(path) {
  const p = norm('/' + path.replace(/^\/+/, '')).toLowerCase();
  const all = await tx('readonly', s => s.getAll());
  return all.find(f => f.path.toLowerCase() === p) || null;
}

/** A name in dir that doesn't collide: "letter.hr", "letter 2.hr", ... */
export async function freeName(dir, name) {
  const e = ext(name), stem = e ? name.slice(0, -e.length) : name;
  for (let i = 1; ; i++) {
    const n = i === 1 ? name : `${stem} ${i}${e}`;
    if (!(await stat(`${dir === '/' ? '' : dir}/${n}`))) return n;
  }
}

export async function seed() {
  for (const r of ROOTS) await mkdir(r);
  if (localStorage.getItem('terrarium.seeded')) return;
  await write('/Documents/Welcome.txt', [
    'Terrarium',
    '',
    'Walk with the arrow keys or W A S D; Alt+arrows step sideways. Drag the',
    'floor to turn, scroll to walk. Click the floor first if an app has the',
    'keys, or press Esc in one of the built-in ones.',
    '',
    'Program Manager starts things: double-click an icon. Double-click the',
    'floor, or press Ctrl+Esc, for the Task List.',
    '',
    'Drag a window by its title bar, or by its border to size it. Scroll on the',
    'title bar to push it away or pull it near; right-drag the bar to turn it.',
    'Click a title bar to walk up to its window. The box at the left of the',
    'title bar opens the control menu; Turn Around shows the back, which you',
    'can write on.',
    '',
    'Step Back, in Program Manager\'s Window menu (or O), shows the map.',
    '',
    'Files dropped onto the floor land in c:\\documents.',
  ].join('\n'));
  try { localStorage.setItem('terrarium.seeded', '1'); } catch {}
}
