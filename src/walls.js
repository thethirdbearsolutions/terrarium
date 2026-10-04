// What the maze walls are made of, drawn on a canvas one texel to a world
// pixel. Each tile repeats seamlessly: TILE.w across, TILE.h up.

import { rng } from './maze.js';

export const TILE = { w: 400, h: 450 };

const canvas = () => {
  const c = document.createElement('canvas');
  c.width = TILE.w; c.height = TILE.h;
  return [c, c.getContext('2d')];
};

/** Raised gray panels, like the face of a dialog: white light up and left, gray and black shade down and right. */
function panels() {
  const [c, g] = canvas(), W = TILE.w, H = TILE.h;
  g.fillStyle = '#c0c0c0'; g.fillRect(0, 0, W, H);
  const raised = (x, y, w, h, b) => {
    g.fillStyle = '#ffffff'; g.fillRect(x, y, w, b); g.fillRect(x, y, b, h);
    g.fillStyle = '#808080'; g.fillRect(x, y + h - b, w, b); g.fillRect(x + w - b, y, b, h);
    g.fillStyle = '#000000'; g.fillRect(x, y + h - 2, w, 2); g.fillRect(x + w - 2, y, 2, h);
  };
  const sunken = (x, y, w, h, b) => {
    g.fillStyle = '#808080'; g.fillRect(x, y, w, b); g.fillRect(x, y, b, h);
    g.fillStyle = '#ffffff'; g.fillRect(x, y + h - b, w, b); g.fillRect(x + w - b, y, b, h);
  };
  raised(0, 0, W, H, 6);
  // a sunken field inside, and a raised plate in it, as on a group box
  sunken(34, 34, W - 68, H - 68, 3);
  g.fillStyle = '#c0c0c0'; g.fillRect(37, 37, W - 74, H - 74);
  // a screw in each corner
  for (const x of [18, W - 22]) for (const y of [18, H - 22]) { g.fillStyle = '#808080'; g.fillRect(x, y, 4, 4); g.fillStyle = '#ffffff'; g.fillRect(x, y, 2, 2); }
  return c;
}

/** Red brick in running bond, every brick a little different. */
function brick() {
  const [c, g] = canvas(), W = TILE.w, H = TILE.h, rand = rng(1991);
  const rows = 10, bh = H / rows, bw = W / 4, m = 6;
  g.fillStyle = '#9a9a8c'; g.fillRect(0, 0, W, H);
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bw / 2 : 0;
    for (let k = -1; k < 4; k++) {
      const x = k * bw + off, y = r * bh;
      const shade = 0.82 + rand() * 0.3;
      const col = (v) => Math.round(Math.min(255, v * shade));
      const draw = (dx) => {
        g.fillStyle = `rgb(${col(168)},${col(52)},${col(36)})`;
        g.fillRect(x + dx + m / 2, y + m / 2, bw - m, bh - m);
        // a little light along the top, shade along the bottom
        g.fillStyle = 'rgba(255,220,200,0.18)'; g.fillRect(x + dx + m / 2, y + m / 2, bw - m, 3);
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + dx + m / 2, y + bh - m / 2 - 3, bw - m, 3);
      };
      draw(0); if (x + bw > W) draw(-W);
    }
  }
  // speckle
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)';
    g.fillRect(Math.floor(rand() * W), Math.floor(rand() * H), 2, 2);
  }
  return c;
}

/** Gray blocks of a few widths, each with its own light and shade. */
function stone() {
  const [c, g] = canvas(), W = TILE.w, H = TILE.h, rand = rng(1987);
  const rows = 5, bh = H / rows, m = 5;
  g.fillStyle = '#3c3c3c'; g.fillRect(0, 0, W, H);
  for (let r = 0; r < rows; r++) {
    const y = r * bh;
    // widths that sum to W, starting somewhere along the row
    const widths = [];
    let left = W;
    while (left > 0) { const w = Math.min(left, [100, 130, 170][Math.floor(rand() * 3)]); widths.push(left - w < 60 ? left : w); left -= widths.at(-1); }
    let x = Math.floor(rand() * W);
    for (const w of widths) {
      const v = Math.round(118 + rand() * 40);
      const draw = (dx) => {
        const X = x + dx + m / 2, Y = y + m / 2, ww = w - m, hh = bh - m;
        g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(X, Y, ww, hh);
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(X, Y, ww, 4); g.fillRect(X, Y, 4, hh);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(X, Y + hh - 5, ww, 5); g.fillRect(X + ww - 5, Y, 5, hh);
      };
      draw(0); if (x + w > W) draw(-W);
      x = (x + w) % W;
    }
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.07)';
    g.fillRect(Math.floor(rand() * W), Math.floor(rand() * H), 2, 2);
  }
  return c;
}

const DRAW = { Panels: panels, Brick: brick, Stone: stone };
const cache = new Map();

/** The tile canvas for a kind of wall. */
export function wallTile(kind) {
  const k = DRAW[kind] ? kind : 'Panels';
  if (!cache.has(k)) cache.set(k, DRAW[k]());
  return cache.get(k);
}
