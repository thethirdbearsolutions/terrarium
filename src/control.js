// Control Panel, and the one setting it has: the desktop.

import { DESKTOP_ICON } from './apps.js';
import { menuBar } from './menu.js';
import { modal, button, listBox, message } from './dialogs.js';
import * as desktop from './desktop.js';

export function mountControl(win) {
  const shell = win.shell;
  win.body.innerHTML = `<div class="app control"><div class="mb"></div>
    <div class="client icons" tabindex="0"><div class="ic on" data-i="0"><div class="img">${DESKTOP_ICON}</div><div class="label">Desktop</div></div></div>
    <div class="status">Changes the desktop's color and pattern</div></div>`;
  const client = win.body.querySelector('.client');
  const open = () => desktopDialog(win);
  client.addEventListener('dblclick', (e) => { if (e.target.closest('.ic')) open(); });
  client.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); open(); } });
  client.addEventListener('focus', () => client.classList.add('active'));
  client.addEventListener('blur', () => client.classList.remove('active'));
  menuBar(win.body.querySelector('.mb'), win.front, [
    { t: '&Settings', items: () => [{ t: '&Desktop...', run: open }, '-', { t: 'E&xit', run: () => shell.close(win) }] },
    { t: '&Help', items: () => [{ t: '&About Control Panel...', run: () => message(shell, win, 'Terrarium\nControl Panel', { title: 'About Control Panel', icon: 'info' }) }] },
  ]);
}

/** Pick a color and a pattern; the room changes as you pick, and Cancel puts it back. */
export function desktopDialog(win) {
  const shell = win.shell, space = shell.space, was = { ...space.desktop };
  let cur = { ...was };
  const show = () => space.setDesktop(cur);
  return modal(shell, win, 'Desktop', (root, finish) => {
    root.innerHTML = `<div class="dcontent">
      <div class="dmain">
        <fieldset class="group"><legend>Pattern</legend><div class="row top"><div class="pl"><div class="lbl"><u>N</u>ame:</div></div><div class="preview"></div></div></fieldset>
        <fieldset class="group"><legend>Color</legend><div class="swatches">${desktop.COLORS.map(c => `<button type="button" class="sw" data-c="${c.color}" title="${c.name}" style="background:${c.color}"></button>`).join('')}</div></fieldset>
      </div>
      <div class="dbuttons">${button('OK', { def: true })}${button('Cancel')}</div></div>`;
    const preview = root.querySelector('.preview');
    const paint = () => {
      preview.style.backgroundImage = `url(${desktop.tile(cur, 2).toDataURL()})`;
      root.querySelectorAll('.sw').forEach(s => s.classList.toggle('on', s.dataset.c === cur.color));
      show();
    };
    const names = desktop.PATTERNS.map(p => ({ text: p.name, value: p.name }));
    const lb = listBox(names, { onSelect: (it) => { cur.pattern = it.value; paint(); }, onActivate: () => done(true) });
    lb.el.classList.add('patterns');
    root.querySelector('.pl').appendChild(lb.el);
    lb.select(Math.max(0, names.findIndex(n => n.value === cur.pattern)), true);
    lb.el.setAttribute('autofocus', '');
    root.querySelector('.swatches').addEventListener('click', (e) => { const s = e.target.closest('.sw'); if (s) { cur.color = s.dataset.c; paint(); } });
    const done = (ok) => {
      if (ok) desktop.save(cur); else { cur = was; show(); }
      finish(ok);
    };
    root.querySelector('.dbuttons').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) done(b.dataset.b === 'OK'); });
    paint();
  }, { cancel: false, cls: 'desktopdlg' }).then((ok) => { if (!ok) space.setDesktop(was); return ok; });
}
