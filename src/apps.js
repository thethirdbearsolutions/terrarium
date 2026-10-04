// What the dock can start. An app with a url lives in its own deploy and
// runs in a frame; a builtin one is drawn by the shell. Served by
// tools/dev.mjs, every sibling repo is one origin, so local copies are used.

const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const at = (local, deployed) => (LOCAL ? local : deployed);

const icon = (body) => `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export const APPS = [
  {
    id: 'hardreturn', title: 'Hard Return', w: 820, h: 560,
    url: at('/hardreturn/', 'https://hardreturn.vercel.app/'), accepts: ['.hr', '.txt'],
    icon: icon(`<rect x="8" y="5" width="32" height="38" rx="2" fill="#1d2fa6"/><rect x="8" y="38" width="32" height="5" fill="#9aa4b8"/>
      <path d="M13 13h22M13 18h18M13 23h22M13 28h12" stroke="#c9cfdf" stroke-width="2.4"/><path d="M33 26v6h-7l2.5-2.5M26 32l2.5 2.5" stroke="#fff" stroke-width="2.2" fill="none"/>`),
  },
  {
    id: 'files', title: 'Files', w: 600, h: 400, builtin: 'files',
    icon: icon(`<path d="M5 13a3 3 0 0 1 3-3h11l4 4h17a3 3 0 0 1 3 3v19a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" fill="#e3b552"/><path d="M5 19h38v17a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" fill="#f2cf74"/>`),
  },
  {
    id: 'magnimarbles', title: 'Magnimarbles', w: 900, h: 580,
    url: at('/magnimarbles/', 'https://magnimarbles.vercel.app/'), accepts: ['.level'],
    // a level is a link; the file holds the fragment
    urlFor: (base, file) => base + (file.content.trim().startsWith('#') ? file.content.trim() : '#' + file.content.trim()),
    icon: icon(`<rect x="4" y="8" width="40" height="32" rx="5" fill="#f2ead8"/><circle cx="17" cy="21" r="7" fill="#c8412f"/><circle cx="31" cy="28" r="6" fill="#2f5fc8"/><circle cx="25" cy="16" r="3" fill="#ddd" stroke="#888"/>`),
  },
  {
    id: 'bingleball', title: 'Bingleball', w: 640, h: 508,
    url: at('/bingleball/', 'https://bingleball.vercel.app/'),
    icon: icon(`<rect x="4" y="8" width="40" height="32" rx="3" fill="#111"/><circle cx="24" cy="24" r="8" fill="#e8e14b"/><circle cx="12" cy="16" r="3" fill="#e04848"/><circle cx="36" cy="32" r="3" fill="#4890e0"/>`),
  },
  {
    id: 'turtlebloom', title: 'Turtle Bloom', w: 900, h: 600,
    url: at('/turtlebloom/', 'https://turtlebloom.vercel.app/'), accepts: ['.logo'],
    icon: icon(`<ellipse cx="24" cy="38" rx="18" ry="5" fill="#5bb06a"/><ellipse cx="22" cy="26" rx="12" ry="9" fill="#3f8a4f"/><path d="M14 24l8-6 8 6M18 30l4-5 4 5" stroke="#2b6036" stroke-width="1.6" fill="none"/><circle cx="36" cy="24" r="4" fill="#8bd07a"/><circle cx="12" cy="12" r="4" fill="#f27fb2"/><circle cx="12" cy="12" r="1.6" fill="#ffe36b"/>`),
  },
  {
    id: 'webturtles', title: 'WebTurtles', w: 760, h: 560,
    url: at('/webturtles/', null), accepts: ['.logo'],
    icon: icon(`<rect x="5" y="5" width="38" height="38" fill="#fff" stroke="#999"/><path d="M5 17.7h38M5 30.3h38M17.7 5v38M30.3 5v38" stroke="#ccc"/><rect x="30.3" y="5" width="12.7" height="12.7" fill="#222"/><path d="M11 36l13-13" stroke="#2a2" stroke-width="2.5"/><path d="M24 17l6 6-8 2z" fill="#2a2"/>`),
  },
  {
    id: 'clock', title: 'Clock', w: 300, h: 180, builtin: 'clock',
    icon: icon(`<circle cx="24" cy="24" r="18" fill="#eef3f2" stroke="#285068" stroke-width="3"/><path d="M24 12v12l8 5" stroke="#1f3644" stroke-width="3" fill="none" stroke-linecap="round"/>`),
  },
].filter(a => a.builtin || a.url);

export const appById = (id) => APPS.find(a => a.id === id);

/** The app that opens a file of this name, if any. */
export const appForName = (name) => {
  const e = name.slice(name.lastIndexOf('.')).toLowerCase();
  return APPS.find(a => a.accepts?.includes(e));
};
