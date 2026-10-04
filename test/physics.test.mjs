import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Body, step, contact, TUNING } from '../src/physics.js';

const run = (bodies, seconds, room) => { for (let t = 0; t < seconds; t += 1 / 60) step(bodies, 1 / 60, room); };
const momentum = (bs) => bs.reduce((m, b) => ({ x: m.x + b.mass * b.vx, z: m.z + b.mass * b.vz }), { x: 0, z: 0 });
const still = { ...TUNING, drag: 0, rollingStop: 0, spinDrag: 0, spinStop: 0 };

test('a window sliding on the floor slows and stops', () => {
  const b = new Body(); b.vx = 800;
  run([b], 4);
  assert.equal(b.vx, 0);
  assert.ok(b.x > 200 && b.x < 800, `came to rest at ${b.x}`);
});

test('a head-on hit between two windows keeps momentum and bounces', () => {
  // two slabs edge to edge along x, the left one moving right
  const a = new Body({ x: -500, yaw: 0 }), b = new Body({ x: 0, yaw: 0, hw: 200 });
  a.hw = 200; a.vx = 600;
  const before = momentum([a, b]);
  for (let i = 0; i < 60; i++) step([a, b], 1 / 60, null, still);
  const after = momentum([a, b]);
  assert.ok(Math.abs(after.x - before.x) < 1e-6 * Math.abs(before.x) + 1e-6, `${before.x} vs ${after.x}`);
  assert.ok(b.vx > 300, `the struck window moves off at ${b.vx}`);
  assert.ok(a.vx < b.vx, 'and the striker is left behind');
});

test('an off-center hit sets the struck window spinning', () => {
  // b stands across the path; a hits it near one end, through the face
  const b = new Body({ x: 0, z: -400, hw: 300 });
  const a = new Body({ x: 220, z: -100, hw: 60, yaw: 0 }); a.vz = -900;
  for (let i = 0; i < 60; i++) step([a, b], 1 / 60, null, still);
  assert.ok(Math.abs(b.w) > 0.2, `spin ${b.w}`);
  assert.ok(b.vz < -100, `pushed away ${b.vz}`);
});

test('a hand-held window is not moved by what it hits, and knocks it away', () => {
  const hand = new Body({ x: -420, hw: 200 }); hand.kinematic = true; hand.vx = 1200;
  const b = new Body({ x: 0, hw: 200 });
  for (let i = 0; i < 30; i++) step([hand, b], 1 / 60, null, still);
  assert.equal(hand.vx, 1200);
  assert.ok(b.vx > 1000, `knocked at ${b.vx}`);
});

test('the room walls bounce a window back in', () => {
  const b = new Body({ x: 0, z: -900, hw: 100 }); b.vz = -2000;
  const room = { near: 500, far: 1200 };
  run([b], 3, room);
  for (const p of b.ends()) assert.ok(Math.hypot(p.x, p.z) <= room.far + 2, 'stays inside the far wall');
  b.vz = 3000; run([b], 3, room);
  for (const p of b.ends()) assert.ok(Math.hypot(p.x, p.z) >= room.near - 2, 'stays outside the glass');
});

test('windows at different heights pass over each other', () => {
  assert.equal(contact(new Body({ y: 0 }), new Body({ y: 400 })), null);
});

test('nothing is left overlapping after a pile-up settles', () => {
  const bs = [new Body({ x: 0 }), new Body({ x: 30, z: 5, yaw: 0.3 }), new Body({ x: -40, z: -8, yaw: -0.2 })];
  run(bs, 3);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    const c = contact(bs[i], bs[j]);
    assert.ok(!c || c.depth < 2, `bodies ${i},${j} still overlap by ${c?.depth}`);
  }
});
