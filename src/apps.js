// What Program Manager can start. An app with a url lives in its own deploy
// and runs in a frame; a builtin one is drawn by the shell. Served by
// tools/dev.mjs, every sibling repo is one origin, so local copies are used.

import { art } from './icons.js';
import { gameAppById } from './games.js';

const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const at = (local, deployed) => (LOCAL ? local : deployed);

const icon = (draw) => art(32, 32, draw);

// a window, as drawn on several icons
const pane = (a, x, y, w, h, fill = 'w') => { a.rect(x, y, w, h, fill); a.box(x, y, w, h, 'k'); a.rect(x + 1, y + 1, w - 2, 3, 'n'); a.line(x, y + 4, x + w - 1, y + 4, 'k'); };

// a monitor on a stand
const monitor = (a, screen) => {
  a.rect(4, 3, 24, 19, 's'); a.box(4, 3, 24, 19, 'k'); a.line(5, 4, 26, 4, 'w'); a.line(5, 4, 5, 20, 'w');
  a.rect(7, 6, 18, 13, 'k'); screen(8, 7, 16, 11);
  a.rect(12, 22, 8, 2, 'd'); a.rect(8, 24, 16, 4, 's'); a.box(8, 24, 16, 4, 'k');
};

export const APPS = [
  {
    id: 'files', title: 'File Manager', w: 620, h: 420, builtin: 'files',
    icon: icon((a) => {
      a.rect(7, 2, 20, 28, 'd'); a.rect(6, 1, 20, 28, 's'); a.box(6, 1, 20, 28, 'k'); a.line(7, 2, 24, 2, 'w'); a.line(7, 2, 7, 27, 'w');
      for (const y of [4, 16]) {
        a.rect(9, y, 14, 10, 's'); a.box(9, y, 14, 10, 'k'); a.line(10, y + 1, 21, y + 1, 'w');
        a.rect(13, y + 6, 6, 2, 'k'); a.px(13, y + 5, 'k'); a.px(18, y + 5, 'k');
      }
      // a folder sticking up out of the top drawer
      a.rect(11, 1, 9, 4, 'Y'); a.box(11, 1, 9, 4, 'k'); a.rect(11, 0, 4, 1, 'k');
    }),
  },
  {
    id: 'control', title: 'Control Panel', w: 300, h: 190, builtin: 'control',
    icon: icon((a) => {
      monitor(a, (x, y, w, h) => { a.rect(x, y, w, h, 't'); a.rect(x + 2, y + 2, 7, 5, 'w'); a.rect(x + 2, y + 2, 7, 1, 'n'); });
      // the sliders in front
      a.rect(18, 15, 13, 15, 's'); a.box(18, 15, 13, 15, 'k');
      for (const [x, k] of [[21, 19], [24, 23], [27, 21]]) { a.line(x, 17, x, 28, 'd'); a.rect(x - 1, k, 3, 2, 'n'); }
    }),
  },
  {
    id: 'clock', title: 'Clock', w: 230, h: 250, builtin: 'clock',
    icon: icon((a) => {
      a.disc(16, 16, 14, 'k'); a.disc(16, 16, 13, 's'); a.disc(16, 16, 11, 'w');
      for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2; a.px(16 + Math.round(Math.sin(t) * 9), 16 - Math.round(Math.cos(t) * 9), i % 3 ? 'd' : 'n'); }
      a.line(16, 16, 16, 8, 'k'); a.line(16, 16, 21, 19, 'k'); a.line(15, 16, 15, 9, 'k'); a.line(16, 16, 12, 22, 'R');
    }),
  },
  {
    id: 'hardreturn', title: 'Hard Return', w: 820, h: 560,
    url: at('/hardreturn/', 'https://hardreturn.vercel.app/'), accepts: ['.hr', '.txt'],
    icon: icon((a) => {
      a.rect(7, 3, 20, 28, 'd'); a.rect(5, 1, 20, 28, 'n'); a.box(5, 1, 20, 28, 'k');
      for (const [y, w] of [[5, 14], [8, 11], [11, 14], [14, 8], [17, 13]]) a.line(8, y, 7 + w, y, 's');
      a.rect(6, 25, 18, 3, 's');
      // the return arrow
      a.map(13, 18, ['.......YY', '.......YY', '..Y....YY', '.YY....YY', 'YYYYYYYYY', '.YY......', '..Y......']);
    }),
  },
  {
    id: 'hardreturn-win', title: 'Hard Return for Windows', w: 800, h: 628,
    url: at('/hardreturn/win/', 'https://hardreturn.vercel.app/win/'), accepts: ['.hr', '.txt'],
    icon: icon((a) => {
      a.rect(2, 4, 28, 24, 's'); a.box(2, 4, 28, 24, 'k'); a.rect(3, 5, 26, 4, 'n'); a.rect(3, 5, 4, 4, 's'); a.line(4, 7, 6, 7, 'w');
      a.line(2, 9, 29, 9, 'k'); a.rect(5, 12, 22, 14, 'w'); a.box(5, 12, 22, 14, 'd');
      for (const [y, w] of [[15, 16], [18, 13], [21, 16], [24, 8]]) a.line(8, y, 7 + w, y, 'n');
    }),
  },
  {
    id: 'magnimarbles', title: 'Magnimarbles', w: 900, h: 580,
    url: at('/magnimarbles/', 'https://magnimarbles.vercel.app/'), accepts: ['.level'],
    // a level is a link; the file holds the fragment
    urlFor: (base, file) => base + (file.content.trim().startsWith('#') ? file.content.trim() : '#' + file.content.trim()),
    icon: icon((a) => {
      a.rect(1, 6, 30, 22, 'o'); a.box(1, 6, 30, 22, 'k'); a.rect(3, 8, 26, 18, 's');
      a.disc(11, 15, 5, 'k'); a.disc(11, 15, 4, 'R'); a.rect(9, 13, 2, 2, 'w'); a.px(13, 18, 'r'); a.px(14, 17, 'r');
      a.disc(21, 20, 4, 'k'); a.disc(21, 20, 3, 'B'); a.rect(20, 18, 2, 1, 'w'); a.px(23, 22, 'n');
      a.disc(22, 11, 2, 'k'); a.disc(22, 11, 1, 'w');
    }),
  },
  {
    id: 'bingleball', title: 'Bingleball', w: 640, h: 508,
    url: at('/bingleball/', 'https://bingleball.vercel.app/'),
    icon: icon((a) => {
      a.rect(1, 4, 30, 24, 'k'); a.box(1, 4, 30, 24, 'd');
      a.disc(16, 16, 6, 'o'); a.disc(15, 15, 5, 'Y'); a.rect(13, 12, 2, 2, 'w');
      a.disc(7, 9, 2, 'R'); a.disc(25, 23, 2, 'B'); a.disc(25, 9, 1, 'G');
    }),
  },
  {
    id: 'turtlebloom', title: 'Turtle Bloom', w: 900, h: 600,
    url: at('/turtlebloom/', 'https://turtlebloom.vercel.app/'), accepts: ['.logo'],
    icon: icon((a) => {
      a.rect(0, 27, 32, 5, 'g'); a.line(0, 27, 31, 27, 'G');
      // the turtle
      a.map(6, 14, [
        '....kkkkkkkk.......', '...kgGgGgGgGk......', '..kgGkGgGkGgGk..kk.', '.kgGgGkkkkGgGgk.kGGk', '.kgGgk.GG.kgGgkkGkGk',
        'kgGgGkGGGGkgGgGkGGGk', 'kkkkkkkkkkkkkkkkkkk.', '.kGGk......kGGk.....', '.kGGk......kGGk.....', '..kk........kk......']);
      // the flower
      a.line(5, 12, 5, 26, 'g'); a.px(4, 20, 'g'); a.px(3, 19, 'g');
      a.disc(5, 6, 4, 'M'); a.disc(5, 6, 1, 'Y'); a.px(5, 6, 'o');
    }),
  },
  {
    id: 'webturtles', title: 'WebTurtles', w: 760, h: 560,
    url: at('/webturtles/', null), accepts: ['.logo'],
    icon: icon((a) => {
      a.rect(2, 2, 28, 28, 'w'); a.box(2, 2, 28, 28, 'k');
      for (const v of [9, 16, 23]) { a.line(v, 3, v, 28, 's'); a.line(3, v, 28, v, 's'); }
      a.rect(24, 3, 6, 6, 'k');
      a.line(5, 27, 15, 17, 'g'); a.line(6, 27, 16, 17, 'g');
      a.map(14, 10, ['....k....', '...kGk...', '..kGGGk..', '.kGgGgGk.', 'kGGGGGGGk', '.kkk.kkk.']);
    }),
  },
  {
    id: 'rgg', title: 'Retro Game Generator', w: 640, h: 470, builtin: 'rgg',
    icon: icon((a) => {
      // a stack of boxes, the front one standing
      a.rect(16, 3, 14, 20, 'd'); a.box(16, 3, 14, 20, 'k'); a.rect(17, 4, 12, 5, 'n');
      a.rect(4, 7, 16, 23, 'w'); a.box(4, 7, 16, 23, 'k'); a.rect(5, 8, 14, 7, 'R');
      a.line(7, 10, 16, 10, 'Y'); a.line(7, 12, 13, 12, 'Y');
      a.rect(6, 17, 12, 7, 'B'); a.rect(6, 22, 12, 2, 'g'); a.rect(11, 19, 2, 3, 'Y');
      a.rect(5, 26, 14, 3, 'k');
    }),
  },
  {
    id: 'progman', title: 'Program Manager', w: 480, h: 330, builtin: 'progman', system: true,
    icon: icon((a) => { pane(a, 2, 3, 18, 14); pane(a, 8, 9, 18, 14); pane(a, 13, 15, 18, 14, 's'); a.rect(16, 22, 4, 4, 'Y'); a.rect(22, 22, 4, 4, 'R'); }),
  },
].filter(a => a.builtin || a.url);

export const appById = (id) => APPS.find(a => a.id === id) || gameAppById(id);

/** The app that opens a file of this name, if any. */
export const appForName = (name) => {
  const e = name.slice(name.lastIndexOf('.')).toLowerCase();
  return APPS.find(a => a.accepts?.includes(e));
};

/** The Desktop icon in Control Panel, and a program group's icon. */
export const DESKTOP_ICON = icon((a) => monitor(a, (x, y, w, h) => {
  a.rect(x, y, w, h, 't');
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if ((i * 3 + j * 5) % 8 === 0) a.px(x + i, y + j, 'k');
}));
export const GROUP_ICON = icon((a) => {
  pane(a, 3, 5, 26, 22);
  for (const x of [7, 14, 21]) for (const y of [12, 19]) { a.rect(x, y, 4, 4, ['R', 'Y', 'B', 'G', 't', 'M'][(x + y) % 6]); a.box(x, y, 4, 4, 'k'); }
});
