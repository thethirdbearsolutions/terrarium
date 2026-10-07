// You: a small box on the floor with the eye on top. The keys walk, turn and
// strafe it with a little run-up and slow-down; a glide walks it by itself
// along a path to somewhere and turns it to face a given way. It is a
// kinematic body: the physics moves it at its speed, walls stop it, and
// windows in its way get knocked.
//
// Yaw is the camera's: 0 looks down -z, and it grows turning left.

import { Body } from './physics.js';
import { clearLine } from './maze.js';

export const MOVE = {
  walk: 1200,        // px/s
  strafe: 950,
  turn: 2.2,         // rad/s
  accel: 7,          // how fast speed reaches what the keys ask, per second
  turnAccel: 11,
  lookUp: 0.35, lookDown: 0.8,   // rad, as far as the eyes go
  glide: 1700,       // px/s, walking by itself
  glideTurn: 3.4,    // rad/s
  size: 60,          // the box, px across
  eyeOverFloor: 600,
};

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const KEYS = {
  ArrowUp: 'fwd', KeyW: 'fwd', ArrowDown: 'back', KeyS: 'back',
  KeyA: 'left', KeyD: 'right', ArrowLeft: 'turnL', ArrowRight: 'turnR',
};
// with Shift or Alt held, the turning keys step sideways instead
const SIDESTEP = { turnL: 'left', turnR: 'right' };

export class Player {
  constructor({ x = 0, z = 0, yaw = 0 } = {}) {
    const half = MOVE.size / 2;
    this.body = new Body({ x, z, yaw: 0, hw: half, ht: half, hh: MOVE.eyeOverFloor / 2 + 25, y: -MOVE.eyeOverFloor / 2 + 25 });
    this.body.kinematic = true;
    this.yaw = yaw;
    this.pitch = 0;                       // looking up (+) or down (-)
    this.f = 0; this.s = 0; this.t = 0;   // forward, rightward and turning speeds
    this.held = new Map();                // key code -> action
    this.side = false;                    // Shift or Alt: turning keys step sideways
    this.push = 0;                        // px still to walk from the wheel
    this.glide = null;
  }

  get x() { return this.body.x; }
  get z() { return this.body.z; }
  /** Unit vectors forward and to the right. */
  get forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }
  get right() { return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }; }

  place({ x, z, yaw }) {
    this.body.x = x; this.body.z = z;
    if (yaw !== undefined) this.yaw = yaw;
    this.f = this.s = this.t = 0; this.body.vx = this.body.vz = 0;
    this.glide = null;
  }

  /** A key went down; true if it was one of ours. */
  keyDown(e) {
    this.side = e.shiftKey || e.altKey;
    const a = KEYS[e.code];
    if (!a || e.ctrlKey || e.metaKey) return false;
    this.held.set(e.code, a);
    this.glide = null;
    return true;
  }
  keyUp(e) { this.side = e.shiftKey || e.altKey; this.held.delete(e.code); }
  release() { this.held.clear(); this.side = false; }
  get walking() { return this.held.size > 0; }

  /** Walk this far forward (negative: back), a bit at a time. */
  nudge(px) { this.push += px; this.glide = null; }

  /**
   * Walk by itself through waypoints [{ x, z }] and then to where goal()
   * says ({ x, z, yaw }, asked every frame so it can follow a moving target).
   * walls are the maze's boxes, for cutting corners where nothing is in the way.
   */
  glideTo(waypoints, goal, walls, onArrive) {
    this.glide = { waypoints: [...waypoints], goal, walls, onArrive };
  }

  /** Set the body's velocity for the coming step and turn. */
  update(dt) {
    const act = new Set([...this.held.values()].map(a => (this.side && SIDESTEP[a]) || a));
    const has = (a) => act.has(a);
    const k = 1 - Math.exp(-dt * MOVE.accel), kt = 1 - Math.exp(-dt * MOVE.turnAccel);
    if (this.glide) return this.steer(dt);

    const wantF = (has('fwd') - has('back')) * MOVE.walk, wantS = (has('right') - has('left')) * MOVE.strafe;
    const wantT = (has('turnL') - has('turnR')) * MOVE.turn;
    this.f += (wantF - this.f) * k; this.s += (wantS - this.s) * k; this.t += (wantT - this.t) * kt;
    if (!wantF && Math.abs(this.f) < 2) this.f = 0;
    if (!wantS && Math.abs(this.s) < 2) this.s = 0;
    if (!wantT && Math.abs(this.t) < 0.002) this.t = 0;
    this.yaw = wrap(this.yaw + this.t * dt);

    // the wheel: walk off what's owed, quickly at first
    let wheel = 0;
    if (this.push) {
      const d = this.push * (1 - Math.exp(-dt * 10));
      wheel = d / dt; this.push -= d;
      if (Math.abs(this.push) < 0.5) this.push = 0;
    }
    const F = this.forward, R = this.right, f = this.f + wheel;
    this.body.vx = F.x * f + R.x * this.s;
    this.body.vz = F.z * f + R.z * this.s;
  }

  steer(dt) {
    const g = this.glide, b = this.body, goal = g.goal();
    if (!goal) { this.glide = null; b.vx = b.vz = 0; return; }
    // cut a corner when the next-but-one point is in plain view
    const pad = MOVE.size / 2 + 12;
    while (g.waypoints.length && clearLine(g.walls, b, g.waypoints[1] || goal, pad)) g.waypoints.shift();
    const to = g.waypoints[0] || goal, last = !g.waypoints.length;
    const dx = to.x - b.x, dz = to.z - b.z, d = Math.hypot(dx, dz);
    if (!last && d < 80) { g.waypoints.shift(); return this.steer(dt); }

    // speed: full along the way, easing into the last stop
    const speed = last ? Math.min(MOVE.glide, d * 4.5) : MOVE.glide;
    const want = d > 1e-6 ? { x: dx / d * speed, z: dz / d * speed } : { x: 0, z: 0 };
    const k = 1 - Math.exp(-dt * 8);
    b.vx += (want.x - b.vx) * k; b.vz += (want.z - b.vz) * k;
    if (last && d * 4.5 < MOVE.glide) { b.vx = want.x; b.vz = want.z; }
    if (last && d < 2) { b.vx = dx / dt; b.vz = dz / dt; }

    // facing: where it's going, and the goal's way on the last stretch
    const heading = Math.atan2(-dx, -dz);
    const wantYaw = last && d < 1600 ? goal.yaw : d > 1 ? heading : goal.yaw;
    this.pitch *= Math.exp(-dt * 6);       // eyes level again, to see the window square
    const dy = wrap(wantYaw - this.yaw), turn = Math.sign(dy) * Math.min(Math.abs(dy), Math.max(Math.abs(dy) * 7, 0.15) * dt, MOVE.glideTurn * dt);
    this.yaw = wrap(this.yaw + turn);
    this.f = this.s = this.t = 0;

    if (last && d < 0.5 && Math.abs(wrap(goal.yaw - this.yaw)) < 0.0015) {
      // there: exactly there
      b.x = goal.x; b.z = goal.z; b.vx = b.vz = 0; this.yaw = goal.yaw; this.pitch = 0;
      this.glide = null;
      g.onArrive?.();
    }
  }
}
