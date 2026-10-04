import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAZE, generate, open, path, wallBoxes, wallBodies, cellAt, cellCenter, clearLine, clearOf, nearestClear, rayHit } from '../src/maze.js';
import { Body } from '../src/physics.js';

test('the same seed carves the same maze, and another seed a different one', () => {
  const a = generate(), b = generate();
  assert.deepEqual(a.east, b.east);
  assert.deepEqual(a.south, b.south);
  const c = generate({ seed: MAZE.seed + 1 });
  assert.notDeepEqual([a.east, a.south], [c.east, c.south]);
});

test('every cell can be reached from the start', () => {
  for (const seed of [MAZE.seed, 1, 2, 3, 42, 31337]) {
    const m = generate({ seed });
    const from = cellAt(m, 0, 0);
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
      assert.ok(path(m, from, { c, r }), `seed ${seed}: no way to ${c},${r}`);
    }
  }
});

test('the start room is open and centered on the origin', () => {
  const m = generate(), s = m.start;
  const mid = cellCenter(m, s.c + (s.w >> 1), s.r + (s.h >> 1));
  assert.deepEqual([mid.x, mid.z], [0, 0]);
  for (let r = s.r; r < s.r + s.h; r++) for (let c = s.c; c < s.c + s.w; c++) {
    if (c < s.c + s.w - 1) assert.ok(open(m, c, r, 1));
    if (r < s.r + s.h - 1) assert.ok(open(m, c, r, 2));
  }
});

test('the outer boundary is closed', () => {
  const m = generate();
  for (let c = 0; c < m.cols; c++) { assert.ok(!open(m, c, 0, 0)); assert.ok(!open(m, c, m.rows - 1, 2)); }
  for (let r = 0; r < m.rows; r++) { assert.ok(!open(m, 0, r, 3)); assert.ok(!open(m, m.cols - 1, r, 1)); }
});

test('it has loops: more openings than a perfect maze', () => {
  const m = generate();
  let openings = 0;
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) { if (open(m, c, r, 1)) openings++; if (open(m, c, r, 2)) openings++; }
  assert.ok(openings > m.cols * m.rows - 1 + 4, `${openings} openings`);
});

test('a path steps one open side at a time', () => {
  const m = generate();
  const p = path(m, { c: 0, r: 0 }, { c: m.cols - 1, r: m.rows - 1 });
  assert.deepEqual(p[0], { c: 0, r: 0 });
  assert.deepEqual(p.at(-1), { c: m.cols - 1, r: m.rows - 1 });
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    assert.equal(Math.abs(a.c - b.c) + Math.abs(a.r - b.r), 1);
    const d = b.r < a.r ? 0 : b.c > a.c ? 1 : b.r > a.r ? 2 : 3;
    assert.ok(open(m, a.c, a.r, d), `step ${i} goes through a wall`);
  }
  assert.equal(path(m, { c: 1, r: 1 }, { c: 1, r: 1 }).length, 1);
});

test('the walls wall off what the grid says, and leave the openings open', () => {
  const m = generate(), boxes = wallBoxes(m);
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols - 1; c++) {
    const a = cellCenter(m, c, r), b = cellCenter(m, c + 1, r);
    assert.equal(clearLine(boxes, a, b), open(m, c, r, 1), `between ${c},${r} and ${c + 1},${r}`);
  }
});

test('a ray finds the nearest wall', () => {
  const boxes = [{ x: 0, z: -500, hw: 400, hd: 50 }, { x: 0, z: -900, hw: 400, hd: 50 }];
  assert.equal(rayHit(boxes, 0, 0, 0, -1), 450);
  assert.equal(rayHit(boxes, 1000, 0, 0, -1), Infinity);
});

test('a window inside a wall is moved to the nearest open floor', () => {
  const m = generate(), boxes = wallBoxes(m), walls = wallBodies(boxes);
  // straddling the first wall found
  const w0 = boxes.find(b => b.hw > b.hd && Math.abs(b.z) > 100);
  const win = new Body({ x: w0.x, z: w0.z, yaw: 0, hw: 400, hh: 280, ht: 7 });
  assert.ok(!clearOf(m, walls, win));
  const p = nearestClear(m, walls, win);
  assert.ok(clearOf(m, walls, new Body({ ...win, x: p.x, z: p.z, hw: 400, ht: 7 })));
  assert.ok(Math.hypot(p.x - win.x, p.z - win.z) < 600, 'and not far');
});
