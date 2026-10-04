// Drop-down menus: the control menu, menu bars, and the menus on icons. A
// menu is drawn inside the face (or icon) it belongs to, so it stands in the
// room with its window.
//
// An item is '-' for a separator, or { t: '&Restore', acc: 'Ctrl+F4', run,
// gray, check, bold }. The & marks the access key.

const CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="7" height="7" shape-rendering="crispEdges"><path d="M6 0h1v3H6v1H5v1H4v1H3v1H2V6H1V5H0V2h1v1h1v1h1V3h1V2h1V1h1z" fill="currentColor"/></svg>`;

let open = null;   // { el, items, at, bar, onClose }

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Menu text to HTML: &x underlines x, && is an ampersand. */
export const label = (t) => esc(String(t).replace(/&&/g, '\0')).replace(/&amp;([^&])/g, '<u>$1</u>').replace(/\0/g, '&amp;');
const key = (t) => (/&(.)/.exec(t)?.[1] || '').toLowerCase();

/** Where el sits inside host, in host's own pixels (offsets survive 3D transforms; rects don't). */
export function offsetIn(el, host) {
  let x = 0, y = 0;
  for (let e = el; e && e !== host; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; if (e.offsetParent === null) break; }
  return { x, y };
}

export function closeMenus() {
  if (!open) return;
  const o = open; open = null;
  o.el.remove();
  o.bar?.titles.forEach(t => t.classList.remove('on'));
  o.onClose?.();
}

export const menuOpen = () => !!open;

/** The open menu's element, if any. */
export const openMenu = () => open?.el || null;

/**
 * Show items in host at (x, y) in host pixels. { up: true } puts the menu's
 * bottom at y instead of its top.
 */
export function popup(host, x, y, items, { up = false, bar = null, onClose = null, focus = null, cls = '', width = 0 } = {}) {
  closeMenus();
  const el = document.createElement('div');
  el.className = `popup ${cls}`;
  if (width) el.style.width = width + 'px';
  el.innerHTML = items.map((it, i) => it === '-' ? '<div class="sep"></div>'
    : `<div class="mi${it.gray ? ' gray' : ''}${it.bold ? ' bold' : ''}" data-i="${i}"><span class="chk">${it.check ? CHECK : ''}</span><span class="lab">${label(it.t)}</span><span class="acc">${it.acc || ''}</span></div>`).join('');
  el.style.left = x + 'px';
  if (up) el.style.bottom = `calc(100% - ${y}px)`; else el.style.top = y + 'px';
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
  el.addEventListener('pointerover', (e) => { const mi = e.target.closest('.mi'); if (mi) hilite(+mi.dataset.i); });
  el.addEventListener('click', (e) => { e.stopPropagation(); const mi = e.target.closest('.mi'); if (mi) choose(+mi.dataset.i); });
  el.addEventListener('dblclick', (e) => e.stopPropagation());
  host.appendChild(el);
  open = { el, items, at: -1, bar, onClose };
  // keep the keys here, not in some app's frame
  (focus || document.body).focus?.({ preventScroll: true });
  if (document.activeElement?.tagName === 'IFRAME') document.activeElement.blur();
  return el;
}

function hilite(i) {
  if (!open) return;
  open.at = i;
  open.el.querySelectorAll('.mi').forEach(m => m.classList.toggle('on', +m.dataset.i === i));
}

function choose(i) {
  const it = open?.items[i];
  if (!it || it === '-' || it.gray) return;
  closeMenus();
  it.run?.();
}

function move(d) {
  const { items } = open;
  let i = open.at;
  for (let n = 0; n < items.length; n++) {
    i = (i + d + items.length) % items.length;
    if (items[i] !== '-') return hilite(i);
  }
}

/**
 * A menu bar. menus: [{ t: '&File', items: () => [...] }]. host is the
 * element the drop-downs are drawn in (the window's face).
 */
export function menuBar(el, host, menus) {
  el.classList.add('menubar');
  el.innerHTML = menus.map((m, i) => `<span class="mt" data-m="${i}">${label(m.t)}</span>`).join('');
  const bar = { titles: [...el.querySelectorAll('.mt')], menus, host, show };
  function show(i) {
    const t = bar.titles[i], at = offsetIn(t, host);
    popup(host, at.x, at.y + t.offsetHeight, menus[i].items(), { bar });
    t.classList.add('on');
    open.barIndex = i;
  }
  el.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.mt'); if (!t) return;
    e.stopPropagation(); e.preventDefault();
    if (open?.bar === bar && open.barIndex === +t.dataset.m) closeMenus();
    else show(+t.dataset.m);
  });
  el.addEventListener('pointerover', (e) => {
    const t = e.target.closest('.mt');
    if (t && open?.bar === bar && open.barIndex !== +t.dataset.m) show(+t.dataset.m);
  });
  return bar;
}

// one set of listeners for whichever menu is open
addEventListener('pointerdown', () => closeMenus());
addEventListener('blur', () => closeMenus());
addEventListener('keydown', (e) => {
  if (!open) return;
  const k = e.key;
  if (k === 'Escape') closeMenus();
  else if (k === 'ArrowDown') move(1);
  else if (k === 'ArrowUp') move(-1);
  else if ((k === 'ArrowLeft' || k === 'ArrowRight') && open.bar) {
    const b = open.bar, n = b.menus.length;
    b.show((open.barIndex + (k === 'ArrowLeft' ? n - 1 : 1)) % n);
  } else if (k === 'Enter') { if (open.at >= 0) choose(open.at); }
  else if (k.length === 1 && !e.ctrlKey && !e.metaKey) {
    const i = open.items.findIndex(it => it !== '-' && key(it.t) === k.toLowerCase());
    if (i >= 0) choose(i); else return;
  } else return;
  e.preventDefault(); e.stopImmediatePropagation();
}, true);
