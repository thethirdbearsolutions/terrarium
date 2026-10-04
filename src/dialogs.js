// Dialogs: message boxes, a one-line question, the Task List, and the parts
// they are built from (push buttons, list boxes).

import { MSG } from './icons.js';
import { label, popup, offsetIn, closeMenus } from './menu.js';

export const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const button = (t, { def = false, data = '' } = {}) => `<button type="button" class="push${def ? ' default' : ''}" data-b="${data || t}">${label(t)}</button>`;

/**
 * A dialog in front of owner (or of the eye, with no owner). build(root,
 * finish, dlg) fills root; finish(v) closes it and resolves to v. Closing
 * it any other way resolves to cancel.
 */
export function modal(shell, owner, title, build, { cancel = null, cls = '' } = {}) {
  return new Promise((resolve) => {
    const dlg = shell.dialog(owner, { id: 'dialog', title, w: 640, h: 480, icon: '', mount: () => {} });
    const root = document.createElement('div');
    root.className = `dlg ${cls}`;
    dlg.body.appendChild(root);
    let done = false;
    const finish = (v) => { if (done) return; done = true; shell.closeDialog(dlg); resolve(v); };
    dlg.onCancel = () => finish(cancel);
    dlg.onClose = () => { if (!done) { done = true; resolve(cancel); } };
    build(root, finish, dlg);
    // measured off-stage, before the room has drawn it
    const loose = !dlg.el.isConnected;
    if (loose) { dlg.el.style.visibility = 'hidden'; document.body.appendChild(dlg.el); }
    dlg.fit();
    if (loose) { dlg.el.remove(); dlg.el.style.visibility = ''; }
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(cancel); }
      else if (e.key === 'Enter' && !e.target.closest('.listbox, button')) {
        const d = root.querySelector('button.default'); if (d) { e.preventDefault(); d.click(); }
      }
    });
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
    const first = root.querySelector('[autofocus]') || root.querySelector('input') || root.querySelector('button.default');
    setTimeout(() => { first?.focus({ preventScroll: true }); first?.select?.(); }, 30);
  });
}

/** A Windows message box. Resolves to the label of the button pressed, or null. */
export function message(shell, owner, text, { title, icon = 'info', buttons = ['OK'] } = {}) {
  return modal(shell, owner, title || owner?.title || 'Terrarium', (root, finish) => {
    root.innerHTML = `<div class="msgbox"><div class="msgicon">${MSG[icon] || ''}</div><div class="msgtext"></div></div>
      <div class="dbuttons bottom">${buttons.map((b, i) => button(b, { def: i === 0 })).join('')}</div>`;
    root.querySelector('.msgtext').textContent = text;
    root.querySelector('.dbuttons').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) finish(b.dataset.b); });
  });
}

/** Yes or no. */
export async function ask(shell, owner, text, { yes = 'OK', no = 'Cancel', icon = 'question', title } = {}) {
  return (await message(shell, owner, text, { title, icon, buttons: [yes, no] })) === yes;
}

/** One line of text, or null. note is shown above it. */
export function promptBox(shell, owner, { title, text, value = '', note = '' }) {
  return modal(shell, owner, title, (root, finish) => {
    root.innerHTML = `<div class="dcontent"><div class="dmain"><div class="note"></div><label class="lbl"></label><input class="field" spellcheck="false" style="width:230px;display:block;margin-top:3px"></div>
      <div class="dbuttons">${button('OK', { def: true })}${button('Cancel')}</div></div>`;
    root.querySelector('.note').textContent = note;
    root.querySelector('.lbl').innerHTML = label(text);
    const input = root.querySelector('input');
    input.value = value;
    root.querySelector('.dbuttons').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      finish(b.dataset.b === 'OK' ? input.value.trim() || null : null);
    });
  });
}

/**
 * A Windows list box. items: [{ text, value, icon, cls }]. Click selects,
 * double-click or Enter activates, arrows and letters move.
 */
export function listBox(items, { onSelect, onActivate, cls = '' } = {}) {
  const el = document.createElement('div');
  el.className = `listbox ${cls}`;
  el.tabIndex = 0;
  const lb = {
    el, items: [], index: -1,
    set(list, index = -1) {
      lb.items = list; lb.index = index;
      el.innerHTML = list.map((it, i) => `<div class="opt ${it.cls || ''}${i === index ? ' on' : ''}" data-i="${i}">${it.icon || ''}<span>${esc(it.text)}</span></div>`).join('');
    },
    select(i, quiet = false) {
      if (!lb.items.length) return;
      lb.index = Math.max(0, Math.min(lb.items.length - 1, i));
      el.querySelectorAll('.opt').forEach(o => o.classList.toggle('on', +o.dataset.i === lb.index));
      el.querySelector('.opt.on')?.scrollIntoView({ block: 'nearest' });
      if (!quiet) onSelect?.(lb.items[lb.index], lb.index);
    },
    get value() { return lb.items[lb.index]; },
  };
  el.addEventListener('pointerdown', (e) => { const o = e.target.closest('.opt'); el.focus({ preventScroll: true }); if (o) lb.select(+o.dataset.i); });
  el.addEventListener('dblclick', (e) => { const o = e.target.closest('.opt'); if (o) onActivate?.(lb.items[+o.dataset.i]); });
  el.addEventListener('keydown', (e) => {
    const n = lb.items.length, i = lb.index;
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: n - 1, PageDown: i + 8, PageUp: i - 8 }[e.key];
    if (to !== undefined) lb.select(to);
    else if (e.key === 'Enter') { if (lb.value) onActivate?.(lb.value); }
    else if (e.key.length === 1) {
      const k = e.key.toLowerCase(), j = lb.items.findIndex((it, x) => x > i && it.text.toLowerCase().startsWith(k));
      const m = j >= 0 ? j : lb.items.findIndex(it => it.text.toLowerCase().startsWith(k));
      if (m >= 0) lb.select(m); else return;
    } else return;
    e.preventDefault(); e.stopPropagation();
  });
  lb.set(items);
  return lb;
}

/**
 * A drop-down combo box. options: [{ text, value }]. host is the face the
 * list drops into.
 */
export function combo(options, value, { host, onChange, width = 140, disabled = false } = {}) {
  const el = document.createElement('div');
  el.className = 'combo' + (disabled ? ' disabled' : '');
  el.tabIndex = disabled ? -1 : 0;
  el.style.width = width + 'px';
  el.innerHTML = `<span class="v"></span><span class="arrow"></span>`;
  const c = { el, options, value };
  const show = () => { el.querySelector('.v').textContent = options.find(o => o.value === c.value)?.text ?? ''; };
  c.set = (v) => { c.value = v; show(); onChange?.(v); };
  const drop = () => {
    if (disabled) return;
    const at = offsetIn(el, host());
    c.open = popup(host(), at.x, at.y + el.offsetHeight, options.map(o => ({ t: o.text.replace(/&/g, '&&'), run: () => c.set(o.value), bold: o.value === c.value })),
      { cls: 'drop', width: el.offsetWidth, focus: el });
  };
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); el.focus({ preventScroll: true }); if (c.open?.isConnected) closeMenus(); else drop(); });
  el.addEventListener('keydown', (e) => {
    const i = options.findIndex(o => o.value === c.value);
    if (e.key === 'ArrowDown' && e.altKey) drop();
    else if (e.key === 'ArrowDown' && i < options.length - 1) c.set(options[i + 1].value);
    else if (e.key === 'ArrowUp' && i > 0) c.set(options[i - 1].value);
    else return;
    e.preventDefault(); e.stopPropagation();
  });
  show();
  return c;
}

/** The Task List: what's running, and what to do with it. */
export function taskList(shell) {
  if (shell.tasks) return shell.tasks;
  shell.tasks = modal(shell, null, 'Task List', (root, finish) => {
    const pm = shell.wins.find(w => w.app.id === 'progman');
    const rest = shell.order.concat(shell.wins.filter(w => !shell.order.includes(w))).filter(w => w !== pm);
    // Program Manager is always on the list, so a closed one can come back
    const entries = [{ text: 'Program Manager', w: pm || null }, ...rest.map(w => ({ text: w.title, w }))];
    const focused = shell.top;
    const lb = listBox(entries, { onActivate: () => act('Switch To') });
    root.innerHTML = `<div class="tasklist"></div>
      <div class="dbuttons bottom">${button('&Switch To', { def: true, data: 'Switch To' })}${button('&End Task', { data: 'End Task' })}${button('Cancel')}</div>
      <hr><div class="dbuttons bottom">${button('&Cascade', { data: 'Cascade' })}${button('&Tile', { data: 'Tile' })}${button('&Arrange Icons', { data: 'Arrange Icons' })}</div>`;
    root.querySelector('.tasklist').appendChild(lb.el);
    lb.select(Math.max(0, entries.findIndex(e => e.w && e.w === focused)), true);
    lb.el.setAttribute('autofocus', '');
    const act = (b) => {
      const it = lb.value;
      finish(b);
      if (b === 'Switch To') { if (it?.w) shell.bring(it.w); else shell.start(shell.progmanApp); }
      else if (b === 'End Task') { if (it?.w) shell.close(it.w); }
      else if (b === 'Cascade') shell.cascade();
      else if (b === 'Tile') shell.tile();
      else if (b === 'Arrange Icons') shell.arrangeIcons();
    };
    root.querySelectorAll('.dbuttons').forEach(d => d.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) act(b.dataset.b); }));
    root.addEventListener('keydown', (e) => {
      const k = e.altKey || !e.target.closest('input') ? e.key.toLowerCase() : '';
      const b = { s: 'Switch To', e: 'End Task', c: 'Cascade', t: 'Tile', a: 'Arrange Icons' }[k];
      if (b && e.target.closest('button')) { e.preventDefault(); act(b); }
    });
  }, { cls: 'tasks' }).finally(() => { shell.tasks = null; });
  return shell.tasks;
}
