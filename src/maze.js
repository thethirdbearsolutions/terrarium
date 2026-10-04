// The level: a maze on a grid of square cells, carved by a recursive
// backtracker from a fixed seed so it is the same on every visit, with some
// walls knocked out for loops and a few open rooms. The starting room's
// middle cell is centered on the world origin. Units are CSS pixels; x runs
// across columns and z down rows.

import { Body, contact } from './physics.js';

/** Everything that decides the level. Change the seed or size here. */
export const MAZE = {
  seed: 1992,
  cols: 7, rows: 7,
  cell: 1600,          // a 900px window fits across a corridor with room to spare
  wall: 120,           // thickness
  loops: 0.08,         // share of the remaining inner walls knocked out
  start: { c: 2, r: 2, w: 3, h: 3 },   // the larger starting room
  rooms: 2,            // more open rooms, 2×2, placed by the seed, apart from the others
};

/** A small seeded generator (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS = [
  { dc: 0, dr: -1 }, // north
  { dc: 1, dr: 0 },  // east
  { dc: 0, dr: 1 },  // south
  { dc: -1, dr: 0 }, // west
];

/**
 * Build the maze. Walls are kept as two grids: east[r][c] is the wall
 * between (c, r) and (c + 1, r); south[r][c] between (c, r) and (c, r + 1).
 * The outer boundary is always closed.
 */
export function generate(opts = MAZE) {
  const o = { ...MAZE, ...opts };
  const { cols, rows } = o;
  const rand = rng(o.seed);
  const east = Array.from({ length: rows }, () => Array(cols).fill(true));
  const south = Array.from({ length: rows }, () => Array(cols).fill(true));
  const inside = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows;
  const knock = (c, r, d) => {
    const { dc, dr } = DIRS[d];
    if (dc === 1) east[r][c] = false; else if (dc === -1) east[r][c - 1] = false;
    else if (dr === 1) south[r][c] = false; else south[r - 1][c] = false;
  };

  // recursive backtracker, without the recursion
  const seen = Array.from({ length: rows }, () => Array(cols).fill(false));
  const s = o.start;
  const stack = [{ c: s.c + (s.w >> 1), r: s.r + (s.h >> 1) }];
  seen[stack[0].r][stack[0].c] = true;
  while (stack.length) {
    const { c, r } = stack.at(-1);
    const next = [0, 1, 2, 3].filter(d => inside(c + DIRS[d].dc, r + DIRS[d].dr) && !seen[r + DIRS[d].dr][c + DIRS[d].dc]);
    if (!next.length) { stack.pop(); continue; }
    const d = next[Math.floor(rand() * next.length)];
    knock(c, r, d);
    const n = { c: c + DIRS[d].dc, r: r + DIRS[d].dr };
    seen[n.r][n.c] = true;
    stack.push(n);
  }

  // rooms: the start, then a few 2×2s that don't touch it or each other
  const rooms = [{ ...s }];
  const touches = (a, b) => a.c < b.c + b.w && b.c < a.c + a.w && a.r < b.r + b.h && b.r < a.r + a.h;
  for (let tries = 0; rooms.length < 1 + o.rooms && tries < 200; tries++) {
    const room = { c: Math.floor(rand() * (cols - 1)), r: Math.floor(rand() * (rows - 1)), w: 2, h: 2 };
    if (!rooms.some(q => touches(room, q))) rooms.push(room);
  }
  for (const q of rooms) {
    for (let r = q.r; r < q.r + q.h; r++) for (let c = q.c; c < q.c + q.w; c++) {
      if (c < q.c + q.w - 1) east[r][c] = false;
      if (r < q.r + q.h - 1) south[r][c] = false;
    }
  }

  // loops: knock out a share of what's left inside
  const inner = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (c < cols - 1 && east[r][c]) inner.push(['e', r, c]);
    if (r < rows - 1 && south[r][c]) inner.push(['s', r, c]);
  }
  const n = Math.round(inner.length * o.loops);
  for (let i = 0; i < n && inner.length; i++) {
    const [k, r, c] = inner.splice(Math.floor(rand() * inner.length), 1)[0];
    (k === 'e' ? east : south)[r][c] = false;
  }

  return {
    seed: o.seed, cols, rows, cell: o.cell, wall: o.wall, east, south, rooms, start: s,
    // world x of column 0's left edge, z of row 0's top edge: the start room's middle cell sits on the origin
    ox: -(s.c + (s.w >> 1) + 0.5) * o.cell,
    oz: -(s.r + (s.h >> 1) + 0.5) * o.cell,
  };
}

/** Is there a way from cell (c, r) in direction d (0 n, 1 e, 2 s, 3 w)? */
export function open(m, c, r, d) {
  const { dc, dr } = DIRS[d], nc = c + dc, nr = r + dr;
  if (nc < 0 || nr < 0 || nc >= m.cols || nr >= m.rows) return false;
  if (dc === 1) return !m.east[r][c];
  if (dc === -1) return !m.east[r][nc];
  if (dr === 1) return !m.south[r][c];
  return !m.south[nr][c];
}

export const cellCenter = (m, c, r) => ({ x: m.ox + (c + 0.5) * m.cell, z: m.oz + (r + 0.5) * m.cell });

/** The cell a point is in, clamped to the grid. */
export function cellAt(m, x, z) {
  const c = Math.max(0, Math.min(m.cols - 1, Math.floor((x - m.ox) / m.cell)));
  const r = Math.max(0, Math.min(m.rows - 1, Math.floor((z - m.oz) / m.cell)));
  return { c, r };
}

/** The floor inside the outer wall: { x0, z0, x1, z1 }. */
export function bounds(m) {
  const t = m.wall / 2;
  return { x0: m.ox + t, z0: m.oz + t, x1: m.ox + m.cols * m.cell - t, z1: m.oz + m.rows * m.cell - t };
}

/**
 * The walls as axis-aligned boxes { x, z, hw, hd }: runs of wall along each
 * grid line merged into one long box, each reaching half a thickness past
 * its ends so corners are closed.
 */
export function wallBoxes(m) {
  const t = m.wall / 2, boxes = [];
  // horizontal lines: line j runs between row j - 1 and row j
  for (let j = 0; j <= m.rows; j++) {
    const z = m.oz + j * m.cell;
    let run = -1;
    for (let c = 0; c <= m.cols; c++) {
      const wall = c < m.cols && (j === 0 || j === m.rows || m.south[j - 1][c]);
      if (wall && run < 0) run = c;
      if (!wall && run >= 0) {
        const x0 = m.ox + run * m.cell - t, x1 = m.ox + c * m.cell + t;
        boxes.push({ x: (x0 + x1) / 2, z, hw: (x1 - x0) / 2, hd: t });
        run = -1;
      }
    }
  }
  // vertical lines: line i runs between column i - 1 and column i
  for (let i = 0; i <= m.cols; i++) {
    const x = m.ox + i * m.cell;
    let run = -1;
    for (let r = 0; r <= m.rows; r++) {
      const wall = r < m.rows && (i === 0 || i === m.cols || m.east[r][i - 1]);
      if (wall && run < 0) run = r;
      if (!wall && run >= 0) {
        const z0 = m.oz + run * m.cell - t, z1 = m.oz + r * m.cell + t;
        boxes.push({ x, z: (z0 + z1) / 2, hw: t, hd: (z1 - z0) / 2 });
        run = -1;
      }
    }
  }
  return boxes;
}

/**
 * The walls as fixed bodies for the physics: tall enough that nothing passes
 * over, and turned so the body's long axis runs along the wall, which is
 * where the physics looks for the point of contact.
 */
export function wallBodies(boxes) {
  return boxes.map(b => {
    const along = b.hw >= b.hd;
    const body = new Body({ x: b.x, z: b.z, yaw: along ? 0 : Math.PI / 2, hw: along ? b.hw : b.hd, ht: along ? b.hd : b.hw, hh: 1e6, y: 0 });
    body.kinematic = true;
    body.fixed = true;
    return body;
  });
}

/** Cells from a to b ({ c, r } each), both included, by breadth-first search; null if there's no way. */
export function path(m, a, b) {
  const key = (c, r) => r * m.cols + c;
  const prev = new Map([[key(a.c, a.r), null]]);
  const q = [a];
  while (q.length) {
    const cur = q.shift();
    if (cur.c === b.c && cur.r === b.r) {
      const out = [];
      for (let k = key(cur.c, cur.r); k !== null; k = prev.get(k)) out.unshift({ c: k % m.cols, r: Math.floor(k / m.cols) });
      return out;
    }
    for (let d = 0; d < 4; d++) {
      if (!open(m, cur.c, cur.r, d)) continue;
      const n = { c: cur.c + DIRS[d].dc, r: cur.r + DIRS[d].dr }, k = key(n.c, n.r);
      if (prev.has(k)) continue;
      prev.set(k, key(cur.c, cur.r));
      q.push(n);
    }
  }
  return null;
}

/** Where the ray from (ox, oz) along (dx, dz) first meets a box, as a multiple of (dx, dz); Infinity if never. pad grows the boxes. */
export function rayHit(boxes, ox, oz, dx, dz, pad = 0) {
  let best = Infinity;
  for (const b of boxes) {
    let t0 = 0, t1 = Infinity;
    for (const [o, d, lo, hi] of [[ox, dx, b.x - b.hw - pad, b.x + b.hw + pad], [oz, dz, b.z - b.hd - pad, b.z + b.hd + pad]]) {
      if (Math.abs(d) < 1e-12) { if (o < lo || o > hi) { t0 = Infinity; break; } continue; }
      let a = (lo - o) / d, c = (hi - o) / d;
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 < best) best = t0;
  }
  return best;
}

/** Can something pad wide go straight from a to b without touching a wall? */
export const clearLine = (boxes, a, b, pad = 0) => rayHit(boxes, a.x, a.z, b.x - a.x, b.z - a.z, pad) > 1;

/** Does a body stand clear of every wall, with margin to spare, and inside the maze? */
export function clearOf(m, walls, body, margin = 0) {
  const probe = new Body({ x: body.x, z: body.z, yaw: body.yaw, y: body.y, hh: body.hh, hw: body.hw + margin, ht: body.ht + margin });
  const bd = bounds(m);
  if (body.x < bd.x0 || body.x > bd.x1 || body.z < bd.z0 || body.z > bd.z1) return false;
  const reach = probe.hw + probe.ht;
  for (const w of walls) {
    if (Math.abs(w.x - body.x) > w.hw + w.ht + reach || Math.abs(w.z - body.z) > w.hw + w.ht + reach) continue;
    if (contact(probe, w)) return false;
  }
  return true;
}

/**
 * The nearest place to body's (x, z) where it stands clear of the walls,
 * keeping its yaw, searched in rings step px apart. Returns { x, z }.
 */
export function nearestClear(m, walls, body, { step = 40, max = 4000, margin = 8 } = {}) {
  const at = (x, z) => new Body({ x, z, yaw: body.yaw, y: body.y, hh: body.hh, hw: body.hw, ht: body.ht });
  if (clearOf(m, walls, body, margin)) return { x: body.x, z: body.z };
  for (let r = step; r <= max; r += step) {
    const n = Math.ceil(2 * Math.PI * r / step);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 2 * Math.PI, x = body.x + r * Math.cos(a), z = body.z + r * Math.sin(a);
      if (clearOf(m, walls, at(x, z), margin)) return { x, z };
    }
  }
  // nowhere near: the middle of the nearest cell
  const c = cellAt(m, body.x, body.z);
  return cellCenter(m, c.c, c.r);
}
