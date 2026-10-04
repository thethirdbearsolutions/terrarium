import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, separation } from '../src/collide.js';

const box = (o) => ({ x: 0, z: 0, y: 0, hw: 400, hh: 300, ht: 7, yaw: 0, ...o });

test('boxes apart do not move', () => {
  const [a, b] = resolve([box(), box({ x: 1000 })]);
  assert.equal(b.x, 1000); assert.equal(b.z, 0);
});

test('boxes at different heights pass over each other', () => {
  assert.equal(separation(box(), box({ y: 700 })), null);
});

test('two flat boxes in the same place stack through the face, and only the second moves', () => {
  const [a, b] = resolve([box(), box({ x: 100, z: -2 })], { gap: 30 });
  assert.equal(a.x, 0); assert.equal(a.z, 0);
  assert.equal(b.x, 100);
  assert.ok(Math.abs(b.z - -44) < 1e-9, `z ${b.z}`);   // 7 + 7 + 30 back
});

test('a turned box pushes the one behind it out of its way', () => {
  const a = box({ yaw: 0.4 }), b = box({ x: 500, z: -60 });
  assert.ok(separation(a, b), 'they start out overlapping');
  resolve([a, b]);
  assert.equal(separation(a, b), null);
});

test('a chain of three settles with nothing overlapping', () => {
  const bs = resolve([box(), box({ x: 50, z: -1 }), box({ x: -50, z: -3, yaw: 0.2 })], { gap: 20 });
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.equal(separation(bs[i], bs[j]), null);
});

test('with an eye, a window is pushed back rather than toward it', () => {
  // a turned window on the ring ahead; the other is crossed by its receding edge
  const a = box({ z: -1000, yaw: 0.4 }), b = box({ x: 300, z: -1080 });
  const free = separation(a, b);
  assert.ok(free, 'they start out overlapping');
  const shy = separation(a, b, 0, { x: 0, z: 0 });
  const away = shy.x * b.x + shy.z * b.z;   // > 0 means away from the eye at the origin
  assert.ok(away > 0, `pushed away from the eye: ${JSON.stringify(shy)} (without an eye: ${JSON.stringify(free)})`);
  resolve([a, b], { eye: { x: 0, z: 0 } });
  assert.equal(separation(a, b), null);
});
