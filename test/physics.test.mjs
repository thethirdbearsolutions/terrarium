import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Body, step, contact, TUNING } from '../src/physics.js';

const run = (bodies, seconds, walls) => { for (let t = 0; t < seconds; t += 1 / 60) step(bodies, 1 / 60, walls); };
const wall = (x, z, hw, ht) => Object.assign(new Body({ x, z, hw, ht, hh: 1e6 }), { kinematic: true, fixed: true });
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
  for (let i = 0; i < 60; i++) step([a, b], 1 / 60, [], still);
  const after = momentum([a, b]);
  assert.ok(Math.abs(after.x - before.x) < 1e-6 * Math.abs(before.x) + 1e-6, `${before.x} vs ${after.x}`);
  assert.ok(b.vx > 300, `the struck window moves off at ${b.vx}`);
  assert.ok(a.vx < b.vx, 'and the striker is left behind');
});

test('an off-center hit sets the struck window spinning', () => {
  // b stands across the path; a hits it near one end, through the face
  const b = new Body({ x: 0, z: -400, hw: 300 });
  const a = new Body({ x: 220, z: -100, hw: 60, yaw: 0 }); a.vz = -900;
  for (let i = 0; i < 60; i++) step([a, b], 1 / 60, [], still);
  assert.ok(Math.abs(b.w) > 0.2, `spin ${b.w}`);
  assert.ok(b.vz < -100, `pushed away ${b.vz}`);
});

test('a hand-held window is not moved by what it hits, and knocks it away', () => {
  const hand = new Body({ x: -420, hw: 200 }); hand.kinematic = true; hand.vx = 1200;
  const b = new Body({ x: 0, hw: 200 });
  for (let i = 0; i < 30; i++) step([hand, b], 1 / 60, [], still);
  assert.equal(hand.vx, 1200);
  assert.ok(b.vx > 1000, `knocked at ${b.vx}`);
});

test('a window thrown at a wall bounces back off it', () => {
  const walls = [wall(0, -1000, 2000, 60)];
  const b = new Body({ x: 0, z: -400, hw: 300 }); b.vz = -2500;
  let back = false;
  for (let t = 0; t < 3; t += 1 / 60) {
    step([b], 1 / 60, walls);
    for (const p of b.ends()) assert.ok(p.z > -940 - 2 - b.ht, `inside the wall at ${p.z}`);
    if (b.vz > 0) back = true;
  }
  assert.ok(back, 'it came back');
});

test('a flat hit on a wall does not set a window spinning', () => {
  const walls = [wall(0, -1000, 2000, 60)];
  const b = new Body({ x: 0, z: -700, hw: 300 }); b.vz = -1500;
  run([b], 1, walls);
  assert.ok(Math.abs(b.w) < 0.05, `spin ${b.w}`);
});

test('a walker walks into a window and knocks it, and is stopped by a wall', () => {
  const walker = new Body({ x: 0, z: 0, hw: 30, ht: 30, hh: 325, y: -275 }); walker.kinematic = true;
  const win = new Body({ x: 0, z: -500, hw: 300, hh: 280, y: -30 });
  const walls = [wall(0, -2000, 2000, 60)];
  for (let t = 0; t < 1; t += 1 / 60) { walker.vz = -1200; step([walker, win], 1 / 60, walls); }
  assert.ok(win.vz < -300 || win.z < -900, `the window was knocked: vz ${win.vz} z ${win.z}`);
  assert.equal(walker.x, 0);
  for (let t = 0; t < 3; t += 1 / 60) { walker.vz = -1200; step([walker, win], 1 / 60, walls); }
  assert.ok(walker.z >= -2000 + 60 + 30 - 0.01, `the wall stopped the walker at ${walker.z}`);
  for (const p of win.ends()) assert.ok(p.z > -1940 - 10, 'and the window stays out of the wall');
});

test('a walker slides along a wall it walks into at an angle', () => {
  const walker = new Body({ x: 0, z: 0, hw: 30, ht: 30 }); walker.kinematic = true;
  const walls = [wall(0, -200, 2000, 60)];
  for (let t = 0; t < 1; t += 1 / 60) { walker.vx = 600; walker.vz = -600; step([walker], 1 / 60, walls); }
  assert.ok(walker.x > 500, `slid to ${walker.x}`);
  assert.ok(walker.z >= -200 + 90 - 0.01);
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
