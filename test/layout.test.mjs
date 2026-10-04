import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, ringToWorld, LAYOUT_V } from '../src/layout.js';
import { generate, wallBoxes, wallBodies, clearOf } from '../src/maze.js';
import { Body } from '../src/physics.js';

const maze = generate(), walls = wallBodies(wallBoxes(maze)), D = 965;
const clear = (s) => clearOf(maze, walls, new Body({ x: s.x, z: s.z, yaw: s.yaw, y: s.y, hw: s.w / 2, hh: s.h / 2, ht: 7 }));

test('a ring pose is a point on the ring at the origin, facing in', () => {
  const p = ringToWorld({ theta: 0, depth: 0, turn: 0 }, D);
  assert.deepEqual([Math.round(p.x), Math.round(p.z), p.yaw], [0, -D, -0]);
  const q = ringToWorld({ theta: Math.PI / 2, depth: 100, turn: 0.2 }, D);
  assert.ok(Math.abs(q.x - (D + 100)) < 1e-6 && Math.abs(q.z) < 1e-6);
  assert.equal(q.yaw, -Math.PI / 2 - 0.2);
  // facing in: the face's normal (sin yaw, cos yaw) points back at the origin
  assert.ok(Math.sin(q.yaw) * -q.x + Math.cos(q.yaw) * -q.z > 0);
});

test('an old ring layout comes back in world coordinates, out of the walls', () => {
  const old = {
    v: 2, pan: 0.4, focus: 'w2',
    windows: [
      { id: 'w1', app: 'progman', w: 480, h: 330, theta: 0, y: -10, depth: 0, turn: 0, notes: 'hi' },
      { id: 'w2', app: 'clock', w: 230, h: 250, theta: 0.62, y: -150, depth: 0, turn: -0.15 },
      // pushed far back, through where the start room's wall now stands
      { id: 'w3', app: 'hardreturn', w: 820, h: 560, theta: 0.1, y: -30, depth: 1500, turn: 0 },
      { id: 'w4', app: 'bingleball', w: 640, h: 508, theta: 2, y: 0, depth: 0, turn: 0, maximized: true,
        normal: { w: 640, h: 508, theta: -2.5, y: -30, depth: 2000, turn: 0.1 } },
    ],
  };
  const l = migrate(old, { D, maze, walls });
  assert.equal(l.v, LAYOUT_V);
  assert.deepEqual(l.maze, { seed: maze.seed, cols: maze.cols, rows: maze.rows });
  assert.equal(l.player.yaw, -0.4);
  assert.equal(l.focus, 'w2');
  assert.equal(l.windows[0].notes, 'hi');
  for (const s of l.windows) {
    assert.equal(s.theta, undefined); assert.equal(s.depth, undefined); assert.equal(s.turn, undefined);
    assert.ok(clear(s), `${s.id} is in a wall at ${s.x},${s.z}`);
  }
  // the ones that were clear stay where the ring put them
  assert.ok(Math.abs(l.windows[0].x) < 1e-6 && Math.abs(l.windows[0].z + D) < 1e-6);
  assert.ok(Math.abs(l.windows[1].yaw - (-0.62 + 0.15)) < 1e-9);
  // the one in a wall moves only as far as it must
  const want = ringToWorld(old.windows[2], D), got = l.windows[2];
  assert.ok(Math.hypot(got.x - want.x, got.z - want.z) > 1, 'it moved');
  assert.ok(Math.hypot(got.x - want.x, got.z - want.z) < 900, 'but not far');
  // a maximized window's place to go back to comes along too
  assert.ok(clear(l.windows[3].normal));
  assert.equal(l.windows[3].normal.theta, undefined);
});

test('a current layout passes through, still kept out of the walls', () => {
  const l = { v: 3, player: { x: 10, z: 20, yaw: 1 }, windows: [{ id: 'w1', app: 'clock', w: 230, h: 250, x: 0, z: -900, yaw: 0, y: 0 }] };
  const m = migrate(l, { D, maze, walls });
  assert.deepEqual(m.player, { x: 10, z: 20, yaw: 1 });
  assert.equal(m.windows[0].x, 0); assert.equal(m.windows[0].z, -900);
});
