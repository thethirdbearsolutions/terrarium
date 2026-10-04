// Saved layouts. Version 3 keeps each window's world pose (x, z, yaw, y) and
// where you stood. Older layouts kept windows on a ring around a fixed eye
// (theta, depth, turn); they are read as that ring standing at the origin,
// and whatever lands in a wall is moved to the nearest open floor.

import { Body } from './physics.js';
import { nearestClear } from './maze.js';

export const LAYOUT_V = 3;

/** A ring pose to a world pose, with the ring of radius D at the origin. */
export function ringToWorld({ theta = 0, depth = 0, turn = 0 }, D) {
  const r = D + depth;
  return { x: r * Math.sin(theta), z: -r * Math.cos(theta), yaw: -theta - turn };
}

/** Move a window standing in a wall to the nearest place it doesn't. */
export function settle(s, maze, walls, thick = 14) {
  const body = new Body({ x: s.x, z: s.z, yaw: s.yaw, y: s.y ?? 0, hw: (s.w ?? 400) / 2, hh: (s.h ?? 300) / 2, ht: thick / 2 });
  const p = nearestClear(maze, walls, body);
  return { ...s, x: p.x, z: p.z };
}

/** Any saved layout, made current. D is the old ring's radius; apps gives each app's size, for windows saved without one. */
export function migrate(layout, { D, maze, walls, apps = {}, thick = 14 }) {
  if (!layout?.windows) return null;
  const v = layout.v || 1;
  let out = layout;
  if (v < 3) {
    out = {
      ...layout,
      player: { x: 0, z: 0, yaw: -(layout.pan || 0) },
      windows: layout.windows.map((s) => {
        const { theta, depth, turn, ...rest } = s;
        const w = { ...rest, ...ringToWorld(s, D) };
        if (s.normal) {
          const { theta: t2, depth: d2, turn: u2, ...n } = s.normal;
          w.normal = { ...n, ...ringToWorld(s.normal, D) };
        }
        return w;
      }),
    };
    delete out.pan;
  }
  // whatever the maze, nothing stands in a wall
  out.windows = out.windows.map((s) => {
    const size = apps[s.app] || {};
    const w = settle({ w: size.w, h: size.h, ...s }, maze, walls, thick);
    if (w.normal) w.normal = settle({ w: size.w, h: size.h, ...w.normal }, maze, walls, thick);
    return w;
  });
  out.v = LAYOUT_V;
  out.maze = { seed: maze.seed, cols: maze.cols, rows: maze.rows };
  out.from = v;
  return out;
}
