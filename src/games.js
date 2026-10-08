// Games from Retro Game Generator: its public feed, the box art, and the
// app that runs one in a window. The feed is fetched through this origin
// (tools/dev.mjs locally, a rewrite in vercel.json deployed), since it
// doesn't allow other origins to read it.

import { art } from './icons.js';

export const RGG = 'https://retro-game-generator.fly.dev/games/';
const FEED = '/rgg/feed.json';
const KEY = 'terrarium.games';

/** "snail garden hop" -> "Snail Garden Hop" */
export const titleOf = (g) => g.name.replace(/\b[a-z]/g, c => c.toUpperCase());

let feedCache = null;
/** Every game in the feed, newest first: [{ name, url, created }]. */
export async function feed(fresh = false) {
  if (feedCache && !fresh) return feedCache;
  const r = await fetch(FEED, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`The feed answered ${r.status}.`);
  const list = await r.json();
  feedCache = list.filter(g => g.vercel_url && g.display_name).map(g => ({ name: g.display_name, url: g.vercel_url, created: g.created_at }));
  setTimeout(() => { feedCache = null; }, 5 * 60 * 1000);
  return feedCache;
}

// games you've played or brought home, so their windows come back by name
const known = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
export function remember(g) {
  if (known[g.url]?.name === g.name) return;
  known[g.url] = { name: g.name, url: g.url, created: g.created };
  try { localStorage.setItem(KEY, JSON.stringify(known)); } catch {}
}

/** The app that plays a game in a window. Its id carries the url, so a window can come back without the feed. */
export function gameApp(g) {
  remember(g);
  return { id: 'game:' + g.url, title: titleOf(g), url: g.url, w: 820, h: 640, icon: boxIcon(g), game: g };
}

export function gameAppById(id) {
  if (!id?.startsWith('game:')) return null;
  const url = id.slice(5);
  return gameApp(known[url] || { name: new URL(url).hostname.split('.')[0].replace(/-\d+.*$/, '').replace(/-/g, ' '), url });
}

// ---- box art --------------------------------------------------------------------

/** A small seeded generator from a string. */
function seeded(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

// the colors a box is printed in: band, ink, sky, ground, hero
const SCHEMES = [
  ['#c8102e', '#ffffff', '#1d2b8f', '#2e7d32', '#ffd23f'],
  ['#0b3d91', '#ffd23f', '#6ec6ff', '#8d6e63', '#e53935'],
  ['#111111', '#00e5ff', '#311b92', '#4a148c', '#76ff03'],
  ['#ff6f00', '#111111', '#ffe0b2', '#33691e', '#1565c0'],
  ['#2e7d32', '#ffffff', '#b3e5fc', '#795548', '#d81b60'],
  ['#6a1b9a', '#ffeb3b', '#000033', '#263238', '#ff9100'],
  ['#00897b', '#ffffff', '#fff59d', '#5d4037', '#3949ab'],
  ['#ad1457', '#ffffff', '#ffccbc', '#1b5e20', '#00acc1'],
];

/** What a game's box looks like, decided by its name: colors, a hero sprite, a little scene. */
function look(g) {
  const r = seeded(g.name), scheme = SCHEMES[Math.floor(r() * SCHEMES.length)];
  // a 7×7 hero, mirrored down the middle like an old sprite
  const hero = [];
  for (let y = 0; y < 7; y++) { const row = []; for (let x = 0; x < 4; x++) row.push(r() < (y === 0 || y === 6 ? 0.35 : 0.6)); hero.push([...row, ...row.slice(0, 3).reverse()]); }
  const coins = Array.from({ length: 2 + Math.floor(r() * 3) }, () => ({ x: 2 + Math.floor(r() * 20), y: 2 + Math.floor(r() * 6) }));
  const hills = Array.from({ length: 24 }, (_, i) => Math.round(2 + Math.sin(i / 3 + r() * 6) * 1.2 + r()));
  return { scheme, hero, coins, hills, tilt: r() < 0.5 };
}

/** The pixel scene on the front of the box, 24×16, drawn at px per pixel into ctx at (x, y). */
function scene(ctx, x, y, px, L) {
  const [band, , sky, ground, hero] = L.scheme;
  const P = (i, j, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(x + i * px, y + j * px, w * px, h * px); };
  P(0, 0, sky, 24, 16);
  for (let i = 0; i < 24; i++) P(i, 16 - L.hills[i] - 2, ground, 1, L.hills[i] + 2);
  for (let i = 0; i < 24; i += 2) P(i, 14, band, 1, 1);
  for (const c of L.coins) { P(c.x, c.y, '#ffd700'); P(c.x, c.y + 1, '#b8860b'); }
  L.hero.forEach((row, j) => row.forEach((on, i) => { if (on) P(8 + i, 6 + j, hero); }));
  P(10, 8, '#ffffff'); P(12, 8, '#ffffff');
}

function wrapLines(ctx, text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const t = line ? line + ' ' + word : word;
    if (ctx.measureText(t).width > width && line) { lines.push(line); line = word; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

const canvas = (w, h, k) => { const c = document.createElement('canvas'); c.width = w * k; c.height = h * k; const x = c.getContext('2d'); x.scale(k, k); x.imageSmoothingEnabled = false; return [c, x]; };

/** The front of the box, w×h CSS px, as a data URL. */
export function coverArt(g, w, h, k = 2) {
  const L = look(g), [band, ink] = L.scheme, [c, x] = canvas(w, h, k);
  x.fillStyle = '#f4f1e8'; x.fillRect(0, 0, w, h);
  // the band across the top with the title in it
  const bandH = h * 0.36;
  x.fillStyle = band; x.fillRect(0, 0, w, bandH);
  x.fillStyle = 'rgba(255,255,255,.18)';
  for (let i = -h; i < w; i += 18) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 8, 0); x.lineTo(i + 8 + bandH * 0.4, bandH); x.lineTo(i + bandH * 0.4, bandH); x.fill(); }
  let size = Math.round(w * 0.15), lines;
  do { x.font = `900 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`; lines = wrapLines(x, titleOf(g).toUpperCase(), w - 24); size -= 2; }
  while ((lines.length * size * 1.05 > bandH - 20 || lines.some(l => x.measureText(l).width > w - 24)) && size > 10);
  size += 2;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const top = (bandH - lines.length * size * 1.05) / 2 + size * 0.55;
  lines.forEach((l, i) => {
    x.fillStyle = 'rgba(0,0,0,.55)'; x.fillText(l, w / 2 + 2, top + i * size * 1.05 + 2);
    x.fillStyle = ink; x.fillText(l, w / 2, top + i * size * 1.05);
  });
  // the screenshot
  const px = Math.floor((w - 40) / 24), sw = px * 24, sh = px * 16, sx = (w - sw) / 2, sy = bandH + 14;
  x.fillStyle = '#000'; x.fillRect(sx - 4, sy - 4, sw + 8, sh + 8);
  scene(x, sx, sy, px, L);
  // the strip along the bottom
  const fy = sy + sh + 14;
  x.fillStyle = '#222'; x.fillRect(0, fy, w, h - fy);
  x.fillStyle = '#fff'; x.textAlign = 'left';
  let fs = Math.round(w * 0.045);
  do { x.font = `bold ${fs}px Arial, sans-serif`; fs--; } while (x.measureText('RETRO GAME GENERATOR').width > w - 88 && fs > 5);
  x.fillText('RETRO GAME GENERATOR', 12, fy + (h - fy) / 2);
  x.textAlign = 'right'; x.fillStyle = band === '#111111' ? '#00e5ff' : band;
  x.fillRect(w - 64, fy + 6, 52, h - fy - 12);
  x.fillStyle = '#fff'; x.font = `bold ${Math.round(w * 0.035)}px Arial, sans-serif`; x.textAlign = 'center';
  x.fillText('3½" DISK', w - 38, fy + (h - fy) / 2);
  return c.toDataURL();
}

/** The spine: the band color and the title running up it. */
export function spineArt(g, w, h, k = 2) {
  const L = look(g), [band, ink] = L.scheme, [c, x] = canvas(w, h, k);
  x.fillStyle = band; x.fillRect(0, 0, w, h);
  x.fillStyle = '#222'; x.fillRect(0, h - w, w, w);
  x.save(); x.translate(w / 2, h / 2 - w / 2); x.rotate(-Math.PI / 2);
  x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle';
  let size = Math.round(w * 0.42);
  do { x.font = `900 ${size}px "Arial Black", Arial, sans-serif`; size--; } while (x.measureText(titleOf(g).toUpperCase()).width > h - w - 16 && size > 8);
  x.fillText(titleOf(g).toUpperCase(), 0, 0);
  x.restore();
  return c.toDataURL();
}

/** The back: what it is and how to play it. */
export function backArt(g, w, h, k = 2) {
  const L = look(g), [band] = L.scheme, [c, x] = canvas(w, h, k);
  x.fillStyle = '#f4f1e8'; x.fillRect(0, 0, w, h);
  x.fillStyle = band; x.fillRect(0, 0, w, 10); x.fillRect(0, h - 10, w, 10);
  x.fillStyle = '#111'; x.font = `900 ${Math.round(w * 0.08)}px "Arial Black", Arial, sans-serif`; x.textAlign = 'left'; x.textBaseline = 'top';
  wrapLines(x, titleOf(g), w - 32).forEach((l, i) => x.fillText(l, 16, 26 + i * w * 0.09));
  const px = Math.floor((w - 32) / 2 / 24);
  scene(x, 16, h * 0.36, px, { ...L, tilt: !L.tilt });
  scene(x, w / 2 + 4, h * 0.36, px, { ...L, coins: L.coins.slice(1) });
  x.font = `${Math.round(w * 0.045)}px Arial, sans-serif`; x.fillStyle = '#333';
  const made = g.created ? new Date(g.created).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const lines = ['Double-click the box to play.', made && `Made ${made}.`, new URL(g.url).hostname].filter(Boolean);
  lines.forEach((l, i) => x.fillText(l, 16, h * 0.62 + i * w * 0.07));
  return c.toDataURL();
}

/** A 32×32 icon for the window: the box, standing, in its band color. */
export function boxIcon(g) {
  const L = look(g), keys = { '#c8102e': 'R', '#0b3d91': 'n', '#111111': 'k', '#ff6f00': 'Y', '#2e7d32': 'g', '#6a1b9a': 'p', '#00897b': 't', '#ad1457': 'M' };
  const b = keys[L.scheme[0]] || 'R';
  return art(32, 32, (a) => {
    a.rect(9, 2, 18, 27, 'd'); a.rect(6, 4, 18, 27, 'w'); a.box(6, 4, 18, 27, 'k');
    a.rect(7, 5, 16, 9, b); a.line(9, 8, 20, 8, 'w'); a.line(9, 10, 17, 10, 'w');
    a.rect(9, 16, 12, 8, 'B'); a.rect(9, 21, 12, 3, 'g'); a.rect(14, 18, 2, 3, 'Y');
    a.rect(7, 26, 16, 4, 'k');
    a.line(24, 5, 26, 3, 'k'); a.line(24, 30, 26, 28, 'k'); a.line(26, 3, 26, 28, 'k'); a.line(8, 3, 26, 3, 'k');
  });
}
