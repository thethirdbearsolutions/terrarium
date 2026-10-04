// Program Manager: a window with a menu bar and one program group, Main,
// holding everything the shell can start.

import { APPS, GROUP_ICON } from './apps.js';
import { GLYPH } from './icons.js';
import { menuBar, popup, offsetIn, closeMenus } from './menu.js';
import { esc, message, promptBox } from './dialogs.js';
import * as fs from './fs.js';

const PREFS = 'terrarium.progman';
const load = () => { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch { return {}; } };
const save = (p) => { try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch {} };

export function mountProgman(win) {
  const shell = win.shell, space = shell.space, prefs = { group: 'normal', ...load() };
  const apps = APPS.filter(a => !a.system);
  win.body.innerHTML = `<div class="app progman"><div class="mb"></div><div class="mdi">
      <div class="child">
        <div class="cbar"><button class="sys" tabindex="-1">${GLYPH.sys}</button><span class="title">Main</span>
          <button class="wb min" tabindex="-1">${GLYPH.min}</button><button class="wb max" tabindex="-1">${GLYPH.max}</button></div>
        <div class="client icons" tabindex="0">${apps.map((a, i) => `<div class="ic" data-i="${i}"><div class="img">${a.icon}</div><div class="label">${esc(a.title)}</div></div>`).join('')}</div>
      </div>
      <div class="gicon" tabindex="0"><div class="img">${GROUP_ICON}</div><div class="label">Main</div></div>
    </div></div>`;
  const root = win.body.firstElementChild, child = root.querySelector('.child'), client = root.querySelector('.client'), gicon = root.querySelector('.gicon');
  let sel = 0;

  const run = (app, another) => {
    shell.start(app, another);
    if (prefs.minimizeOnUse) shell.minimize(win);
  };
  const select = (i) => {
    sel = Math.max(0, Math.min(apps.length - 1, i));
    client.querySelectorAll('.ic').forEach(ic => ic.classList.toggle('on', +ic.dataset.i === sel));
  };
  const group = (state) => {
    prefs.group = state; save(prefs);
    root.classList.toggle('gmin', state === 'min');
    root.classList.toggle('gmax', state === 'max');
    child.querySelector('.max').innerHTML = state === 'max' ? GLYPH.restore : GLYPH.max;
  };

  client.addEventListener('pointerdown', (e) => {
    const ic = e.target.closest('.ic');
    if (ic) select(+ic.dataset.i);
    client.classList.add('active');
  });
  client.addEventListener('dblclick', (e) => { const ic = e.target.closest('.ic'); if (ic) run(apps[+ic.dataset.i], e.shiftKey); });
  client.addEventListener('keydown', (e) => {
    const per = Math.max(1, Math.floor(client.clientWidth / 75));
    const to = { ArrowRight: sel + 1, ArrowLeft: sel - 1, ArrowDown: sel + per, ArrowUp: sel - per, Home: 0, End: apps.length - 1 }[e.key];
    if (to !== undefined) select(to);
    else if (e.key === 'Enter') run(apps[sel], e.shiftKey);
    else return;
    e.preventDefault(); e.stopPropagation();
  });
  client.addEventListener('focus', () => client.classList.add('active'));
  client.addEventListener('blur', () => client.classList.remove('active'));
  select(0);

  // the group window's own buttons
  const cbar = child.querySelector('.cbar');
  cbar.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    e.stopPropagation();
    if (b.classList.contains('sys')) {
      const at = offsetIn(b, win.front);
      popup(win.front, at.x, at.y + b.offsetHeight, [
        { t: '&Restore', gray: prefs.group === 'normal', run: () => group('normal') },
        { t: '&Move', gray: true }, { t: '&Size', gray: true },
        { t: 'Mi&nimize', run: () => group('min') },
        { t: 'Ma&ximize', gray: prefs.group === 'max', run: () => group('max') }, '-',
        { t: '&Close', acc: 'Ctrl+F4', run: () => group('min') },
      ]);
    }
  });
  cbar.addEventListener('click', (e) => {
    const b = e.target.closest('.wb'); if (!b) return;
    if (b.classList.contains('min')) group('min'); else group(prefs.group === 'max' ? 'normal' : 'max');
  });
  cbar.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) group(prefs.group === 'max' ? 'normal' : 'max'); });
  gicon.addEventListener('dblclick', () => group('normal'));
  gicon.addEventListener('keydown', (e) => { if (e.key === 'Enter') group('normal'); });
  group(prefs.group);

  menuBar(root.querySelector('.mb'), win.front, [
    { t: '&File', items: () => [
      { t: '&Open', acc: 'Enter', run: () => run(apps[sel]) },
      { t: '&Run...', run: () => runBox(win) }, '-',
      { t: 'E&xit', run: () => shell.close(win) },
    ] },
    { t: '&Options', items: () => [
      { t: '&Minimize on Use', check: !!prefs.minimizeOnUse, run: () => { prefs.minimizeOnUse = !prefs.minimizeOnUse; save(prefs); } },
    ] },
    { t: '&Window', items: () => [
      { t: '&Cascade', acc: 'Shift+F5', run: () => shell.cascade() },
      { t: '&Tile', acc: 'Shift+F4', run: () => shell.tile() },
      { t: '&Arrange Icons', run: () => shell.arrangeIcons() }, '-',
      { t: 'Turn &Left', acc: '←', run: () => shell.turn(-1) },
      { t: 'Turn &Right', acc: '→', run: () => shell.turn(1) },
      { t: 'Step &Back', acc: 'O', check: space.overTarget > 0, run: () => shell.setOverview(!space.overTarget) }, '-',
      { t: '&1 Main', check: true, run: () => { group(prefs.group === 'min' ? 'normal' : prefs.group); client.focus({ preventScroll: true }); } },
    ] },
    { t: '&Help', items: () => [
      { t: '&About Program Manager...', run: () => message(shell, win, `Terrarium\nProgram Manager\n\n${shell.wins.length} window(s) open.`, { title: 'About Program Manager', icon: 'info' }) },
    ] },
  ]);

  win.onKey = (e) => { if (e.key === 'F5' && e.shiftKey) shell.cascade(); else if (e.key === 'F4' && e.shiftKey) shell.tile(); else return false; return true; };
  win.onClose = () => closeMenus();
}

/** File > Run: an app by name, or a file by its c: path. */
async function runBox(win) {
  const shell = win.shell;
  const line = await promptBox(shell, win, { title: 'Run', text: '&Command Line:' });
  if (!line) return;
  const q = line.trim().toLowerCase();
  const app = APPS.find(a => !a.system && (a.title.toLowerCase() === q || a.id === q)) || APPS.find(a => !a.system && a.title.toLowerCase().startsWith(q));
  if (app) return shell.start(app, true);
  const path = q.replace(/^c:/, '').replace(/\\/g, '/');
  const all = await fs.find(path);
  if (all && !all.dir) return shell.openFile(all, win);
  message(shell, win, `Cannot find file '${line}'.\n\nCheck that the name is right.`, { title: 'Program Manager', icon: 'stop' });
}
