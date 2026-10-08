// Retro Game Generator: every game it has made, from its feed. Pick one to
// see its box; Play opens it in a window, Bring Home sets its box down in
// the maze in front of you. Making a game happens on its own site, which
// doesn't let itself be framed, so that opens in a tab of its own.

import { menuBar } from './menu.js';
import { listBox, button, message } from './dialogs.js';
import { feed, coverArt, titleOf, RGG } from './games.js';

const COVER = { w: 168, h: 216 };

export function mountRgg(win) {
  const shell = win.shell;
  win.body.innerHTML = `<div class="app rgg"><div class="mb"></div>
    <div class="rgg-main">
      <div class="rgg-left"><input class="field" type="search" placeholder="Find a game" spellcheck="false"><div class="rgg-count"></div></div>
      <div class="rgg-right"><img class="rgg-cover" alt="" width="${COVER.w}" height="${COVER.h}"><div class="rgg-name"></div><div class="rgg-made"></div>
        <div class="rgg-buttons">${button('&Play', { def: true, data: 'play' })}${button('&Bring Home', { data: 'home' })}</div></div>
    </div></div>`;
  const root = win.body.firstElementChild, find = root.querySelector('input'), count = root.querySelector('.rgg-count');
  const cover = root.querySelector('.rgg-cover'), name = root.querySelector('.rgg-name'), made = root.querySelector('.rgg-made');
  const buttons = root.querySelectorAll('.rgg-buttons button');
  let games = [];

  const show = (g) => {
    buttons.forEach(b => { b.disabled = !g; });
    if (!g) { cover.removeAttribute('src'); name.textContent = ''; made.textContent = ''; return; }
    cover.src = coverArt(g, COVER.w, COVER.h);
    name.textContent = titleOf(g);
    made.textContent = g.created ? new Date(g.created).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  };
  const list = listBox([], { cls: 'rgg-list', onSelect: (it) => show(it.game), onActivate: (it) => shell.play(it.game) });
  root.querySelector('.rgg-left').insertBefore(list.el, count);
  const current = () => list.value?.game;

  const fill = () => {
    const q = find.value.trim().toLowerCase(), shown = games.filter(g => !q || g.name.toLowerCase().includes(q));
    const was = current();
    list.set(shown.map(g => ({ text: titleOf(g), game: g })));
    count.textContent = `${shown.length} of ${games.length} games`;
    const i = Math.max(0, shown.indexOf(was));
    if (shown.length) list.select(i); else show(null);
  };
  const load = async (fresh = false) => {
    count.textContent = 'Asking Retro Game Generator...';
    try {
      games = await feed(fresh);
      fill();
    } catch (err) {
      count.textContent = 'No games: the feed didn’t answer.';
      show(null);
    }
  };

  find.addEventListener('input', fill);
  find.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { list.el.focus(); list.select(list.index + (e.key === 'ArrowDown' ? 1 : -1)); e.preventDefault(); }
    else if (e.key === 'Enter' && current()) shell.play(current());
    e.stopPropagation();
  });
  root.querySelector('.rgg-buttons').addEventListener('click', (e) => {
    const b = e.target.closest('button'), g = current();
    if (!b || !g) return;
    if (b.dataset.b === 'play') shell.play(g);
    else bringHome(g);
  });

  const bringHome = (g) => {
    shell.bringHome(g);
    // so you see it arrive
    if (!win.maximized) shell.space.player.pitch = Math.min(shell.space.player.pitch, -0.35);
  };
  const make = () => {
    const w = open(RGG, '_blank', 'noopener');
    if (!w) message(shell, win, `Making a game happens on Retro Game Generator's own site:\n\n${RGG}`, { title: 'Retro Game Generator' });
  };

  menuBar(root.querySelector('.mb'), win.front, [
    { t: '&File', items: () => [
      { t: '&Play', acc: 'Enter', gray: !current(), run: () => shell.play(current()) },
      { t: '&Bring Home', gray: !current(), run: () => bringHome(current()) }, '-',
      { t: '&Make a Game...', run: make }, '-',
      { t: 'E&xit', run: () => shell.close(win) },
    ] },
    { t: '&View', items: () => [{ t: '&Refresh', acc: 'F5', run: () => load(true) }] },
  ]);
  win.onKey = (e) => {
    if (e.key === 'F5') { load(true); return true; }
    return false;
  };

  load();
  setTimeout(() => find.focus({ preventScroll: true }), 50);
}
